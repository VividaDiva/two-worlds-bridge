import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {ROUTES} from './kit.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
test('automatic replay: all paths, separate AI process, image prompt, persistence and deduplication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-modes-'));
 const sock=net.createServer();sock.listen(0,'127.0.0.1');await once(sock,'listening');const port=sock.address().port;await new Promise(r=>sock.close(r));
 const log=path.join(dir,'calls.jsonl');fs.writeFileSync(log,'');
 const sdk=`import fs from 'node:fs';export class GoogleGenAI { models={generateContent:async req=>{
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({system:req.config.systemInstruction,contents:req.contents,schema:req.config.responseJsonSchema})+'\\n');
 if(req.config.responseModalities)return {candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='}}]}}]};
 const p=req.config.responseJsonSchema.properties;let out={};
 if(p.cards){out={cards:[{who:JSON.stringify(req.contents).includes('Role 2 said')?'Role 2':'Role 1',via:'direct',quote:'Please add an edge',need:'Protection while crossing',why:'hypothesis: reassurance',keys:['guarded'],rulesOut:[],theme:'Safety',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[{tool:'laddering',why:'Separate the named edge from its purpose'}],ask:''};}
 else if(p.decisions)out={decisions:[],conflicts:[],checks:null};
 else if(p.asks)out={asks:['guarded'],refuses:[],beyond:''};
 else if(p.build)out={build:'A braced walkway',why:'Addresses the contribution',alt:'',altWhy:''};
 else if(p.description)out={description:'A low crossing with a handrail'};
 else if(p.say)out={say:'KEY RESPONSE'};
 else if(p.text)out={text:'TOOLKIT RESPONSE'};
 else {for(const [k,v] of Object.entries(p))out[k]=v.enum?.[0]||'A crossing';}
 if(p.cards && typeof req.contents==='string'){
  const line=req.contents.split(' said: "').at(-1).split('"')[0];
  if(line==='REV_START'){out.cards[0].need='Open all day';out.cards[0].quote='REV_START';out.ask='';out.clarificationNeeded=true;out.cards[0].concern='The exact opening hours are not specified';}
  if(['REV_OTHER','REV_OWNER','REV_BUILD'].includes(line)){
   out.cards=[];out.ask='';out.answeredQuestion=line==='REV_OWNER';
   out.updates=line==='REV_BUILD'?[]:[{id:'n1',action:'revise',explicit:true,evidence:line,need:'Open 07:00–23:00',change:'Change hours',why:'',concern:'',when:'07:00–23:00'}];
  }
 }
 return {text:JSON.stringify(out)};
 }};}`;
 const hook=path.join(dir,'hook.mjs');fs.writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){return s==='@google/genai'?{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(sdk))},shortCircuit:true}:next(s,c)}})`);
 let child;
 async function start(){child=spawn(process.execPath,['--import',hook,path.join(here,'server.mjs')],{env:{...process.env,PORT:String(port),AUTO_TOOLKIT_DELAY_MS:'20',ANTHROPIC_API_KEY:'test',GOOGLE_API_KEY:'test',SESSIONS_DIR:path.join(dir,'sessions'),UPLOADS_DIR:path.join(dir,'uploads'),PUBLIC_URL:`http://localhost:${port}`},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(out)),4000);child.stdout.on('data',x=>{out+=x;if(out.includes('Facilitator console:')){clearTimeout(timer);resolve()}});child.stderr.on('data',x=>out+=x);child.once('exit',()=>{clearTimeout(timer);reject(Error(out))})})}
 async function stop(){if(child?.exitCode===null){const done=once(child,'exit');child.kill();await done}}
 const get=async u=>(await fetch(`http://localhost:${port}${u}`)).json();
 async function post(u,b){const res=await fetch(`http://localhost:${port}${u}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const j=await res.json();assert.equal(res.status,200,JSON.stringify(j));return j}
 async function settled(room){for(let i=0;i<100;i++){const h=await get(`/api/state?room=${room}&role=host`);if(!h.thinking){assert.ok(!h.lines.some(x=>x.failed),JSON.stringify(h.lines));return h}await new Promise(r=>setTimeout(r,10))}throw Error('did not settle')}
 const calls=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);

 const completed=[];
 async function ready(id){for(let i=0;i<300;i++){const h=await get('/api/state?room='+id+'&role=host');if(h.autoToolkit?.status==='failed')throw Error(JSON.stringify(h.autoToolkit));if(h.autoToolkit?.status==='complete')return h;await new Promise(r=>setTimeout(r,20))}throw Error('Replay timed out')}
 try{await start();
 for(const route of ['all','confer','both','chain','via-1','via-2','only-1','only-2','develop']){
  const {room}=await post('/api/create',{argument:'pairs',route,agent:'keys'});
  const script=ROUTES[route].open?['A','B']:ROUTES[route].script;
  for(const role of script){await post('/api/say',{room,role,text:role+' original '+route});await settled(room);}
  if(ROUTES[route].open&&!ROUTES[route].develop){const before=await get('/api/state?room='+room);if(route!=='all')assert.equal(before.autoToolkit,null); /* on `all` both talk lines already built, so a replay is queued before any Confirm */await post('/api/say',{room,role:'B',mode:'build',text:'Build our protected crossing'});await settled(room)}
  if(['via-1','via-2'].includes(route)){await new Promise(r=>setTimeout(r,80));assert.equal((await get('/api/state?room='+room)).autoToolkit,null);continue;}
  const control=await ready(room);const target=control.autoToolkit.target;
  const tk=await get('/api/state?room='+target+'&role=host');
  assert.equal(tk.route,route);assert.equal(tk.agent,'toolkit');assert.ok(tk.shape);assert.equal(tk.sketches.length,1);assert.equal(tk.replayOf.room,room);
  assert.deepEqual(tk.lines.filter(l=>['A','B'].includes(l.who)).map(l=>[l.who,l.text,l.phase]),control.lines.filter(l=>['A','B'].includes(l.who)).map(l=>[l.who,l.text,l.phase]));
  assert.ok(tk.lines.filter(l=>l.interpretations).every(l=>l.interpretations.every(i=>i.kind==='toolkit')));
  const original=await get('/api/export?room='+target+'&format=json');assert.match(original.sketches[0].prompt,/as the Toolkit understood it/);assert.match(original.sketches[0].prompt,/What the toolkit understood/);assert.doesNotMatch(original.sketches[0].prompt,/"cards"/);
  if(route==='confer')assert.ok(!original.sketches[0].prompt.includes('A original confer'));
  if(route==='chain')assert.ok(!original.sketches[0].prompt.includes('A original chain'));
  const image=await fetch('http://localhost:'+port+'/sketch/'+target+'/1.png');assert.equal(image.status,200);assert.ok((await image.arrayBuffer()).byteLength>20);
  completed.push([room,target]);
 }
 await stop();await start();for(const [room,target]of completed){const h=await get('/api/state?room='+room);assert.equal(h.autoToolkit.status,'complete');assert.equal(h.autoToolkit.target,target);}
 // 8, not 7: on `all` the keys room now builds after both talk lines and again on Confirm, and each build state is its own replay job.
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'sessions','automation','toolkit-jobs.json'))).length,8);
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}
});
