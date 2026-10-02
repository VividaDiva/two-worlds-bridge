import fs from 'node:fs';import path from 'node:path';import {get,put} from '@vercel/blob';import {hash} from './protocol.mjs';
const local=process.env.STUDY_LOCAL_URL||'http://localhost:8780',root=path.resolve('agents/usertest/sessions');
const audit={startedAt:new Date().toISOString(),sketches:0,feedback:0,rooms:[],failed:[]};
async function read(key){const r=await get(key,{access:'private',useCache:false});return r?Buffer.from(await new Response(r.stream).arrayBuffer()):null;}
async function save(key,b,type='application/json'){b=Buffer.isBuffer(b)?b:Buffer.from(JSON.stringify(b));const old=await read(key);if(old){if(!old.equals(b))throw Error('Existing cloud object differs: '+key);return;}try{await put(key,b,{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:type});}catch(e){const prior=await read(key);if(!prior?.equals(b))throw e;}const back=await read(key);if(!back?.equals(b))throw Error('Cloud readback failed: '+key);}
async function localJSON(route){const r=await fetch(local+route);if(!r.ok)throw Error('Local snapshot unavailable: '+route);return r.json();}
async function image(src){if(!src)return null;const b=Buffer.from(src.split(',')[1],'base64'),parts=[];for(let i=0;i<b.length;i+=750000){const piece=b.subarray(i,i+750000),h=hash(piece);await save('chunks/'+h,piece,'application/octet-stream');parts.push(h);}return {kind:'bridge-image-v1',bytes:b.length,sha256:hash(b),parts};}
const [users,options,sessions]=await Promise.all(['/api/users','/api/options','/api/sessions'].map(localJSON));
await save('snapshot/users.json',users);await save('snapshot/options.json',{...options,cloudFeedbackOnly:true});
async function migrate(s){
 const state=await localJSON('/api/state?room='+s.room+'&role=host');
 const record=JSON.parse(fs.readFileSync(path.join(root,s.room+'.json'),'utf8'));delete record.feedback;
 await save('snapshot/state/'+s.room+'.json',state);await save('snapshot/export/'+s.room+'.json',record);
 for(const pic of state.sketches||[]){const r=await fetch(local+'/sketch/'+s.room+'/'+pic.n+'.png');if(!r.ok)throw Error('Missing sketch '+s.room+'/'+pic.n);await save('snapshot/sketch/'+s.room+'/'+pic.n+'.png',Buffer.from(await r.arrayBuffer()),'image/png');audit.sketches++;}
 const folder=path.join(root,'feedback',s.room);if(fs.existsSync(folder))for(const file of fs.readdirSync(folder).filter(x=>x.endsWith('.json'))){const rec=JSON.parse(fs.readFileSync(path.join(folder,file),'utf8'));rec.images=await Promise.all(rec.images.map(image));await save('feedback/'+s.room+'/'+rec.id+'.json',rec);await save('feedback-backups/'+s.room+'/'+rec.id+'.json',rec);audit.feedback++;}
 audit.rooms.push(s.room);if(audit.rooms.length%10===0)console.log(JSON.stringify({rooms:audit.rooms.length,sketches:audit.sketches,feedback:audit.feedback}));
}
for(let i=0;i<sessions.length;i+=4){const batch=sessions.slice(i,i+4);await Promise.all(batch.map(s=>migrate(s).catch(e=>{audit.failed.push({room:s.room,error:e.message});console.log('Failed',s.room,e.message);})));fs.writeFileSync('/tmp/bridge-cloud-migration-audit.json',JSON.stringify(audit,null,2));}
if(audit.failed.length)throw Error('Migration incomplete; inspect audit');
await save('snapshot/sessions.json',sessions.map(s=>({...s,live:false})));audit.finishedAt=new Date().toISOString();fs.writeFileSync('/tmp/bridge-cloud-migration-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify({complete:true,rooms:audit.rooms.length,sketches:audit.sketches,feedback:audit.feedback}));
