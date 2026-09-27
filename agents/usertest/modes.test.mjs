import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
test('exclusive pipelines: real prompts, corrections, images, restart, and legacy preservation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-modes-'));
 const sock=net.createServer();sock.listen(0,'127.0.0.1');await once(sock,'listening');const port=sock.address().port;await new Promise(r=>sock.close(r));
 const log=path.join(dir,'calls.jsonl');fs.writeFileSync(log,'');
 const sdk=`import fs from 'node:fs';export class GoogleGenAI { models={generateContent:async req=>{
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({system:req.config.systemInstruction,contents:req.contents,schema:req.config.responseJsonSchema})+'\\n');
 const p=req.config.responseJsonSchema.properties;let out={};
 if(p.cards){out={cards:[{who:JSON.stringify(req.contents).includes('Role 2 said')?'Role 2':'Role 1',via:'direct',quote:'Please add an edge',need:'Protection while crossing',why:'hypothesis: reassurance',keys:['guarded'],rulesOut:[],theme:'Safety',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[{tool:'laddering',why:'Separate the named edge from its purpose'}],ask:''};}
 else if(p.decisions)out={decisions:[],conflicts:[],checks:null};
 else if(p.asks)out={asks:['guarded'],refuses:[],beyond:''};
 else if(p.build)out={build:'A braced walkway',why:'Addresses the contribution',alt:'',altWhy:''};
 else if(p.description)out={description:'A low crossing with a handrail'};
 else if(p.say)out={say:'KEY RESPONSE'};
 else if(p.text)out={text:'TOOLKIT RESPONSE'};
 else {for(const [k,v] of Object.entries(p))out[k]=v.enum?.[0]||'A crossing';}
 return {text:JSON.stringify(out)};
 }};}`;
 const hook=path.join(dir,'hook.mjs');fs.writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){return s==='@google/genai'?{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(sdk))},shortCircuit:true}:next(s,c)}})`);
 let child;
 async function start(){child=spawn(process.execPath,['--import',hook,path.join(here,'server.mjs')],{env:{...process.env,PORT:String(port),ANTHROPIC_API_KEY:'test',GOOGLE_API_KEY:'test',SESSIONS_DIR:path.join(dir,'sessions'),UPLOADS_DIR:path.join(dir,'uploads'),PUBLIC_URL:`http://localhost:${port}`},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(out)),4000);child.stdout.on('data',x=>{out+=x;if(out.includes('Facilitator console:')){clearTimeout(timer);resolve()}});child.stderr.on('data',x=>out+=x);child.once('exit',()=>{clearTimeout(timer);reject(Error(out))})})}
 async function stop(){if(child?.exitCode===null){const done=once(child,'exit');child.kill();await done}}
 const get=async u=>(await fetch(`http://localhost:${port}${u}`)).json();
 async function post(u,b){const res=await fetch(`http://localhost:${port}${u}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const j=await res.json();assert.equal(res.status,200,JSON.stringify(j));return j}
 async function settled(room){for(let i=0;i<100;i++){const h=await get(`/api/state?room=${room}&role=host`);if(!h.thinking){assert.ok(!h.lines.some(x=>x.failed),JSON.stringify(h.lines));return h}await new Promise(r=>setTimeout(r,10))}throw Error('did not settle')}
 const calls=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 const ids=[];
 try{await start();
 for(const agent of ['toolkit','keys']){
  const begin=calls().length;
  const {room}=await post('/api/create',{argument:'pairs',route:'develop',agent});ids.push(room);
  await post('/api/say',{room,role:'A',text:'Please add an edge'});await settled(room);
  await post('/api/say',{room,role:'B',text:'I also need protection'});let h=await settled(room);
  assert.equal(h.agent,agent);assert.equal(h.control,null);assert.equal(h.lines.at(-1).text,agent==='toolkit'?'TOOLKIT RESPONSE':'KEY RESPONSE');
  assert.ok(h.shape);
  await post('/api/correct',{room,role:'A',index:0,text:'I mean a rail'});h=await settled(room);assert.equal(h.lines[0].corrected,'I mean a rail');
  const trace=calls().slice(begin);
  if(agent==='toolkit'){
   assert.ok(trace.some(c=>c.schema.properties.cards));assert.ok(trace.some(c=>c.schema.properties.decisions));assert.ok(!trace.some(c=>c.schema.properties.asks));
   const hearings=trace.filter(c=>c.schema.properties.cards);assert.ok(hearings.every(c=>!c.schema.properties.cards.items.properties.keys));assert.ok(hearings.every(c=>!c.system.includes('guarded')));
   assert.ok(h.wall.cards.every(c=>c.keys.length===0));assert.ok(!h.lines.some(l=>l.keysRead));
  }else{assert.equal(h.wall,null);assert.ok(trace.some(c=>c.schema.properties.asks));assert.ok(!trace.some(c=>c.schema.properties.cards||c.schema.properties.decisions));}
  const chain=await post('/api/create',{argument:'pairs',route:'chain',agent});
  const chainStart=calls().length;
  await post('/api/say',{room:chain.room,role:'A',text:'PRIVATE_ORIGINAL_MUST_NOT_REACH_AI'});await settled(chain.room);
  assert.equal(calls().length,chainStart);
  await post('/api/say',{room:chain.room,role:'B',text:'Only this paraphrase is shared with AI'});await settled(chain.room);
  assert.ok(!JSON.stringify(calls().slice(chainStart)).includes('PRIVATE_ORIGINAL_MUST_NOT_REACH_AI'));
  const imageStart=calls().length;
  const img=await post('/api/create',{argument:'refs',route:'both',agent});
  for(const role of ['A','B']){await post('/api/upload',{room:img.room,role,dataUrl:'data:image/png;base64,ZmFrZQ=='});await settled(img.room)}
  const imageCalls=calls().slice(imageStart);assert.equal(imageCalls.some(c=>c.schema.properties.description),agent==='toolkit');assert.equal(imageCalls.some(c=>c.schema.properties.saw),agent==='keys');
  for(const route of ['via-1','all']){
   const startIndex=calls().length;const rr=await post('/api/create',{argument:'pairs',route,agent});
   for(const role of ['A','B']){await post('/api/say',{room:rr.room,role,text:'Please add an edge',...(route==='all'?{mode:'build'}:{})});await settled(rr.room)}
   const sequence=calls().slice(startIndex);
   assert.ok(agent==='toolkit' ? !sequence.some(c=>c.schema.properties.asks) : !sequence.some(c=>c.schema.properties.cards||c.schema.properties.decisions));
  }

 }
 await stop();await start();
 for(let i=0;i<ids.length;i++){const h=await settled(ids[i]);assert.equal(h.agent,['toolkit','keys'][i]);assert.equal(h.control,null);assert.ok(h.lines.some(l=>l.corrected))}
 // A historical record without a mode stays explicitly legacy, never relabeled.
 await stop();const f=path.join(dir,'sessions',ids[0]+'.json');const old=JSON.parse(fs.readFileSync(f));delete old.agent;fs.writeFileSync(f,JSON.stringify(old));await start();assert.equal((await settled(ids[0])).agent,'both');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}
});
