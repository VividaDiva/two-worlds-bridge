import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
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
    const records=fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>x.endsWith('.json')).map(x=>JSON.parse(fs.readFileSync(path.join(dir,x),'utf8'))).sort((a,b)=>b.at.localeCompare(a.at)):[];
    json(res,200,{records});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return true;}
  const d=data.draft;
  if(!d || !['A','B'].includes(d.role) || !d.source || !Array.isArray(d.added) || !Array.isArray(d.strokes) || !Array.isArray(data.images) || data.images.length!==3 || JSON.stringify(data).length>18000000 || data.images.some(x=>x!==null && (typeof x!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(x)))) {
    json(res,400,{error:'Invalid feedback record'});return true;
  }
  const record={id:randomUUID(),at:new Date().toISOString(),room:data.room,argument:room.argument,route:room.route,agent:room.agent||'legacy',draft:d,images:data.images};
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,record.id+'.json'),JSON.stringify(record));
  json(res,200,{id:record.id,at:record.at});return true;
}
