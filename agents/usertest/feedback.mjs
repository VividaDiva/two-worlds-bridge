import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export function feedbackFiles(sessions,room){
  if(!/^[a-z0-9]+$/.test(room))return [];
  const dir=path.join(sessions,'feedback',room);
  return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>path.join(dir,f)):[];
}
export function readFeedback(sessions,room){
  return feedbackFiles(sessions,room).map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).sort((a,b)=>b.at.localeCompare(a.at));
}
export async function feedbackHandler({req,res,url,here,sessions,rooms,body,view,json}) {
  const p=url.pathname;
  if(p==='/feedback' || p==='/feedback.js') {
    res.writeHead(200,{'content-type':p.endsWith('.js')?'text/javascript':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(fs.readFileSync(path.join(here,p.endsWith('.js')?'feedback.js':'feedback.html'))); return true;
  }
  if(p!=='/api/feedback') return false;
  const data=req.method==='POST'?await body(req):Object.fromEntries(url.searchParams);
  const room=rooms.get(data.room);
  if(!room){json(res,404,{error:'Session not found'});return true;}
  const dir=path.join(sessions,'feedback',data.room);
  if(req.method==='GET') {
    const records=readFeedback(sessions,data.room);
    if(data.summary==='1'){json(res,200,{summaries:records.map(r=>({id:r.id,role:r.draft.role,complete:r.draft.visited?.length===3&&r.draft.visited.every(Boolean)}))});return true;}
    json(res,200,{records});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true;}
  const d=data.draft;
  if(!d || !['A','B'].includes(d.role) || !d.source || !Array.isArray(d.added) || !Array.isArray(d.strokes) || !Array.isArray(data.images) || data.images.length!==3 || JSON.stringify(data).length>18000000 || data.images.some(x=>x!==null && (typeof x!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(x)))) {
    json(res,400,{error:'Invalid feedback record'});return true;
  }
  const record={id:randomUUID(),at:new Date().toISOString(),room:data.room,argument:room.argument,route:room.route,agent:room.agent||'legacy',draft:d,images:data.images};
  try {
    fs.mkdirSync(dir,{recursive:true});
    const dest=path.join(dir,record.id+'.json');
    fs.writeFileSync(dest+'.tmp',JSON.stringify(record));
    fs.renameSync(dest+'.tmp',dest);
    json(res,200,{id:record.id,at:record.at,imagesReceived:record.images.filter(Boolean).length,role:d.role,room:data.room});
  } catch { json(res,500,{error:'Could not store feedback. Your submission was not confirmed; please retry.'}); }
  return true;
}
