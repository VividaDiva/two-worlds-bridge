import {get,put,list} from '@vercel/blob';
import {timingSafeEqual} from 'node:crypto';
import {hash,uuid,roomId,imageManifest,validDraft,verifyImage} from '../cloud/protocol.mjs';
const opts={access:'private',addRandomSuffix:false};
async function read(key){const r=await get(key,{access:'private',useCache:false});if(!r)return null;return Buffer.from(await new Response(r.stream).arrayBuffer());}
async function jsonRead(key){const b=await read(key);return b?JSON.parse(b.toString()):null;}
async function writeOnce(key,value,type='application/json'){const b=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));try{await put(key,b,{...opts,contentType:type,allowOverwrite:false});}catch(e){const old=await read(key);if(!old||!old.equals(b))throw e;}const check=await read(key);if(!check||!check.equals(b))throw Error('Cloud write verification failed');}
async function paths(prefix){let cursor;const found=[];do{const r=await list({prefix,cursor,limit:1000});found.push(...r.blobs.map(b=>b.pathname));cursor=r.hasMore?r.cursor:undefined;}while(cursor);return found;}
async function records(room){return (await Promise.all((await paths('feedback/'+room+'/')).filter(p=>p.endsWith('.json')).map(jsonRead))).filter(Boolean).sort((a,b)=>b.at.localeCompare(a.at));}
async function draftRecords(room){const all=(await Promise.all((await paths('feedback-drafts/'+room+'/')).filter(p=>p.endsWith('.json')).map(jsonRead))).filter(Boolean),latest=new Map();for(const r of all)if(!latest.has(r.id)||latest.get(r.id).revision<r.revision)latest.set(r.id,r);return [...latest.values()].sort((a,b)=>b.at.localeCompare(a.at));}
function importOK(req){const expected=process.env.BRIDGE_IMPORT_TOKEN||'',provided=req.headers['x-bridge-import']||'';return expected.length>=32&&provided.length===expected.length&&timingSafeEqual(Buffer.from(provided),Buffer.from(expected));}
export default async function handler(req,res){
 const origin=req.headers.origin;
 if(origin==='https://vividadiva.github.io'||origin===`https://${req.headers.host}`){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 const send=(code,data)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 const u=new URL(req.url,'https://cloud.local'),route=req.query?.route||u.searchParams.get('route')||u.pathname.split('/').pop(),q={...Object.fromEntries(u.searchParams),...req.query};
 try{
  const b=req.method==='POST'?(typeof req.body==='string'?JSON.parse(req.body):req.body||{}):{};
  if(route==='health')return send(200,{ok:true,storage:!!(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID),mode:'cloud-feedback'});
  if(route==='import'&&req.method==='POST'){
   if(!importOK(req))return send(403,{error:'Import authorization required'});
   if(typeof b.key!=='string'||!/^snapshot\/[a-zA-Z0-9/_\.\-]+$/.test(b.key)||b.key.includes('..')||typeof b.base64!=='string'||b.base64.length>4000000)return send(400,{error:'Invalid snapshot'});
   await writeOnce(b.key,Buffer.from(b.base64,'base64'),b.key.endsWith('.png')?'image/png':'application/json');return send(200,{stored:b.key});
  }
  if(route==='chunk'){
   if(req.method==='GET'){if(!/^[a-f0-9]{64}$/.test(q.hash||''))return send(400,{error:'Invalid chunk'});const bytes=await read('chunks/'+q.hash);if(!bytes)return send(404,{error:'Image not found'});res.setHeader('Content-Type','application/octet-stream');return res.end(bytes);}
   if(req.method!=='POST'||!roomId(b.room)||!uuid(b.submissionId)||!uuid(b.respondentId)||typeof b.data!=='string'||b.data.length>1050000||!/^[A-Za-z0-9+/=]+$/.test(b.data))return send(400,{error:'Invalid image chunk'});
   if(!await jsonRead('snapshot/state/'+b.room+'.json'))return send(404,{error:'Unknown session'});
   const bytes=Buffer.from(b.data,'base64');if(hash(bytes)!==b.hash)return send(400,{error:'Chunk checksum mismatch'});
   await writeOnce('chunks/'+b.hash,bytes,'application/octet-stream');return send(200,{sha256:b.hash});
  }
  if(route==='drafts'){
   const room=req.method==='POST'?b.room:q.room;if(!roomId(room))return send(400,{error:'Invalid room'});
   if(!await jsonRead('snapshot/state/'+room+'.json'))return send(404,{error:'Unknown session'});
   if(req.method==='GET')return send(200,{records:await draftRecords(room)});
   if(req.method!=='POST'||!uuid(b.id)||!Number.isSafeInteger(b.revision)||b.revision<1||!validDraft(b.draft)||!uuid(b.draft.respondentId))return send(400,{error:'Invalid automatic draft'});
   const key='feedback-drafts/'+room+'/'+b.id+'/'+b.revision+'.json';let rec=await jsonRead(key);
   if(rec&&JSON.stringify(rec.draft)!==JSON.stringify(b.draft))return send(409,{error:'Draft revision differs'});
   if(!rec){rec={id:b.id,room,revision:b.revision,at:new Date().toISOString(),autosaved:true,draft:b.draft};await writeOnce(key,rec);}
   return send(200,{record:rec});
  }
  if(route==='feedback'){
   const room=req.method==='POST'?b.room:q.room;if(!roomId(room))return send(400,{error:'Invalid room'});
   const state=await jsonRead('snapshot/state/'+room+'.json');if(!state)return send(404,{error:'Session not found'});
   if(req.method==='GET'){const saved=await records(room);return send(200,q.summary==='1'?{summaries:saved.map(r=>({id:r.id,role:r.draft.role,respondentId:r.draft.respondentId,complete:r.draft.visited?.length===3&&r.draft.visited.every(Boolean)}))}:{records:saved});}
   if(req.method!=='POST'||!uuid(b.submissionId)||!validDraft(b.draft)||!Array.isArray(b.images)||b.images.length!==3||!b.images.every(imageManifest))return send(400,{error:'Invalid feedback'});
   // No success until every image is present, checked, and the immutable record is readable.
   for(const m of b.images)await verifyImage(m,h=>read('chunks/'+h));
   const key='feedback/'+room+'/'+b.submissionId+'.json';let rec=await jsonRead(key);
   if(rec&&(JSON.stringify(rec.draft)!==JSON.stringify(b.draft)||JSON.stringify(rec.images)!==JSON.stringify(b.images)))return send(409,{error:'Receipt already belongs to a different revision'});
   if(!rec){const imported=importOK(req)&&b.imported;rec={id:b.submissionId,at:imported?.at||new Date().toISOString(),room,argument:state.argument,route:state.route,agent:state.agent,draft:b.draft,images:b.images};await writeOnce(key,rec);}
   await writeOnce('feedback-backups/'+room+'/'+rec.id+'.json',rec);
   return send(200,{id:rec.id,at:rec.at,room,role:rec.draft.role,imagesReceived:rec.images.filter(Boolean).length});
  }
  if(route==='switch'&&req.method==='POST'){
   const users=await jsonRead('snapshot/users.json')||[],profile=users.find(u=>u.id===b.user);
   const desired=b.route||(b.room?profile?.sessions.find(s=>s.room===b.room)?.route:profile?.sessions.find(s=>s.argument===b.argument)?.route)||'all';
   const entry=profile?.sessions.find(s=>s.argument===b.argument&&s.agent===b.agent&&s.route===desired&&(!b.room||s.room===b.room));
   return send(entry?200:404,entry?{...entry,user:profile.id}:{error:'No saved experiment for this selection. New AI sessions are not enabled in the cloud feedback archive.'});
  }
  if(req.method!=='GET')return send(409,{error:'This cloud service collects feedback on saved experiments. Live AI building is not enabled here.'});
  if(route==='users'||route==='options')return send(200,await jsonRead('snapshot/'+route+'.json')||(route==='users'?[]:{}));
  if(route==='state'){if(!roomId(q.room))return send(400,{error:'Invalid room'});const seat=['A','B'].includes(q.role)?await jsonRead('snapshot/seat/'+q.room+'-'+q.role+'.json'):null;const s=seat||await jsonRead('snapshot/state/'+q.room+'.json');return send(s?200:404,s||{error:'Session not found'});}
  if(route==='sessions'){const sessions=await jsonRead('snapshot/sessions.json')||[],files=await paths('feedback/'),counts={},latest={};await Promise.all(files.map(async f=>{const r=f.split('/')[1];counts[r]=(counts[r]||0)+1;const record=await jsonRead(f);if(record?.at&&(!latest[r]||record.at>latest[r]))latest[r]=record.at;}));return send(200,sessions.map(s=>({...s,live:false,feedbackCount:counts[s.room]||0,latestFeedbackAt:latest[s.room]||null})));}
  if(route==='export'){if(!roomId(q.room))return send(400,{error:'Invalid room'});const record=await jsonRead('snapshot/export/'+q.room+'.json');if(!record)return send(404,{error:'Record not found'});if(q.format==='json'){record.feedback=await records(q.room);record.drafts=(await draftRecords(q.room)).filter(d=>!record.feedback.some(r=>r.draft.cloudDraftId===d.id));return send(200,record);}res.setHeader('Content-Type','text/markdown; charset=utf-8');return res.end((record.transcript||[]).map(l=>`**${l.who}**: ${l.text||''}`).join('\n\n'));}
  if(route==='sketch'){if(!roomId(q.room)||!/^\d+\.png$/.test(q.image||''))return send(400,{error:'Invalid sketch'});const img=await read('snapshot/sketch/'+q.room+'/'+q.image);if(!img)return send(404,{error:'Sketch not found'});res.setHeader('Content-Type','image/png');return res.end(img);}
  return send(404,{error:'Not found'});
 }catch(e){console.error('Cloud study request failed:',e.message);return send(503,{error:'Cloud storage could not confirm this request. Please retry; existing records are preserved.'});}
}
