// Named parts: what the kit cannot make stays in the speaker's word, is placed
// with a primitive, drawn at once as a proposal, and confirmed by its owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));

test('draw.js places a named part in the owner\'s colour, dashed until confirmed, labelled with their word',()=>{
  const ctx=vm.createContext({window:{}});ctx.window=ctx;
  vm.runInContext(fs.readFileSync(path.join(here,'draw.js'),'utf8'),ctx);
  const shape={level:'at',hand:'rail',middle:'none',width:'two',bracing:'none',surface:'bare',ends:'rested',cover:'open'};
  const named=[{id:'s1',label:'dog passage',primitive:'band',position:'beside',who:'B',status:'proposed'},
               {id:'s2',label:'lights for night walks',primitive:'post',position:'along',who:'B',status:'confirmed'},
               {id:'s3',label:'No trucks',primitive:'sign',position:'ends',who:'A',status:'proposed',kind:'rule'},
               {id:'s4',label:'upper deck for bikes',primitive:'deck',position:'above',who:'A',status:'objected'}];
  const L=vm.runInContext('crossingLayers',ctx)(shape,{water:true},{named});
  const band=L.strokes.filter(s=>s.who==='B'&&s.dash&&!s.dot);assert.ok(band.length>=6,'a band is two edges and ties, dashed while proposed');
  assert.ok(L.strokes.some(s=>s.dot&&s.who==='B'&&!s.dash),'confirmed posts are solid and have heads');
  assert.ok(L.strokes.some(s=>s.plate&&s.who==='A'),'a rule is a sign plate');
  const texts=L.labels.map(l=>l.text);for(const t of ['dog passage','lights for night walks','No trucks','upper deck for bikes'])assert.ok(texts.includes(t),t);
  assert.equal(L.labels.find(l=>l.text==='upper deck for bikes').status,'objected');
  // nothing of the kit changed: the sticks are the same with or without the layer
  assert.equal(L.list.length,vm.runInContext('crossingLayers',ctx)(shape,{water:true},null).list.length);
  // the older layer still draws
  const old=vm.runInContext('crossingLayers',ctx)(shape,{},{footway:true,gate:true});assert.ok(old.strokes.length>0);assert.equal(old.labels.length,0);
});

test('the toolkit names, places and draws what the kit cannot make; the owner confirms the position',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-named-'));
 const sock=net.createServer();sock.listen(0,'127.0.0.1');await once(sock,'listening');const port=sock.address().port;await new Promise(r=>sock.close(r));
 const log=path.join(dir,'calls.jsonl');fs.writeFileSync(log,'');
 const sdk=`import fs from 'node:fs';export class GoogleGenAI { models={generateContent:async req=>{
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({system:req.config.systemInstruction,contents:req.contents,schema:req.config.responseJsonSchema})+'\\n');
 const p=req.config.responseJsonSchema.properties;let out={};
 const text=typeof req.contents==='string'?req.contents:JSON.stringify(req.contents);
 if(p.cards){const b=text.includes('Role 2 said');out={cards:[b?{who:'Role 2',via:'direct',quote:'a dedicated passage for walking dogs, separate from people',need:'a dog passage separate from pedestrians',why:'',theme:'dog walking',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}
   :{who:'Role 1',via:'direct',quote:'no trucks on the bridge',need:'no trucks allowed',why:'',theme:'traffic',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[],ask:'',answeredQuestion:false,clarificationNeeded:false};}
 else if(p.decisions){const ids=[...text.matchAll(/\\[(n\\d+)\\] ([AB]) \\(/g)].map(m=>[m[1],m[2]]);out={decisions:ids.map(([id,who])=>who==='B'?{id,response:'new',what:'a dog passage beside the walk',uncertainty:'',label:'dog passage',primitive:'band',position:'beside'}:{id,response:'rule',what:'no trucks',uncertainty:'',label:'no trucks on the bridge',primitive:'',position:''}),conflicts:[],checks:{nothingLost:true,inferencesLabelled:true,noFalseConflicts:true,defaultsChecked:true,buildNotConsent:true,kindsDistinct:true}};}
 else if(p.build)out={build:'A crossing with a rail and two abreast',why:'wide and guarded',alt:'',altWhy:''};
 else if(p.text)out={text:'REPLY'};
 else if(p.say)out={say:'SAY'};
 else {for(const [k,v] of Object.entries(p))out[k]=v.enum?.[0]||'x';}
 return {text:JSON.stringify(out)};}};}`;
 const hook=path.join(dir,'hook.mjs');fs.writeFileSync(hook,`import {registerHooks} from 'node:module';registerHooks({resolve(s,c,next){return s==='@google/genai'?{url:${JSON.stringify('data:text/javascript,'+encodeURIComponent(sdk))},shortCircuit:true}:next(s,c)}})`);
 let child;
 async function start(){child=spawn(process.execPath,['--import',hook,path.join(here,'server.mjs')],{env:{...process.env,PORT:String(port),ANTHROPIC_API_KEY:'test',GOOGLE_API_KEY:'test',SESSIONS_DIR:path.join(dir,'sessions'),UPLOADS_DIR:path.join(dir,'uploads'),PUBLIC_URL:`http://localhost:${port}`},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error(out)),5000);child.stdout.on('data',x=>{out+=x;if(out.includes('Facilitator console:')){clearTimeout(timer);resolve()}});child.stderr.on('data',x=>out+=x);child.once('exit',()=>{clearTimeout(timer);reject(Error('server exited: '+out))})})}
 async function stop(){if(!child)return;child.kill();await once(child,'exit');child=null}
 const get=async u=>(await fetch(`http://localhost:${port}${u}`)).json();
 async function post(u,b,expect=200){const res=await fetch(`http://localhost:${port}${u}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const j=await res.json();assert.equal(res.status,expect,JSON.stringify(j));return j}
 async function settled(room){for(let i=0;i<200;i++){const h=await get(`/api/state?room=${room}&role=host`);if(!h.thinking){assert.ok(!h.lines.some(x=>x.failed),JSON.stringify(h.lines));return h}await new Promise(r=>setTimeout(r,10))}throw Error('did not settle')}
 const calls=()=>fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 try{await start();
  const {room}=await post('/api/create',{argument:'pairs',route:'develop',agent:'toolkit'});
  await post('/api/say',{room,role:'A',text:'no trucks on the bridge'});await settled(room);
  await post('/api/say',{room,role:'B',text:'a dedicated passage for walking dogs, separate from people'});let h=await settled(room);
  assert.ok(h.shape,'something was built');
  // the decision prompt asks for a name and a place, in their terms
  const decide=calls().filter(c=>c.schema.properties.decisions).at(-1);
  assert.ok(decide.system.includes('Then name it'));assert.ok(decide.system.includes('"primitive"'));assert.ok(decide.system.includes('one car'));
  assert.ok(decide.schema.properties.decisions.items.properties.label);
  // the sheet carries the word, the primitive, the place and the owner
  const dog=h.sheet.find(p=>p.label==='dog passage');assert.ok(dog,JSON.stringify(h.sheet));
  assert.equal(dog.owner,'B');assert.equal(dog.primitive,'band');assert.equal(dog.position,'beside');assert.equal(dog.kind,'new');
  const trucks=h.sheet.find(p=>p.kind==='rule');assert.equal(trucks.primitive,'sign');assert.equal(trucks.position,'ends');assert.equal(trucks.owner,'A');
  // drawn at once, as a proposal, before anyone has said yes
  assert.equal(h.sheetDrawn.named.length,2);assert.ok(h.sheetDrawn.named.every(n=>n.status==='proposed'));
  assert.ok(h.wall.cards.every(c=>c.met==='proposed'));
  // the reply was told what to read back, and to whom
  const reply=calls().filter(c=>c.schema.properties.text).at(-1);const sent=JSON.parse(reply.contents);
  assert.equal(sent.named.length,2);assert.ok(sent.named.some(n=>n.label==='dog passage'&&n.owner==='Role 2'&&n.canHear===true));
  assert.ok(reply.system.includes('do NOT ask that in your text'),'the question is a card, not a sentence');
  // the read-back is data for a card: the owner sees their own unconfirmed parts, numbered as drawn; the other sees none of them
  const vb=await get(`/api/state?room=${room}&role=B`), va=await get(`/api/state?room=${room}&role=A`);
  assert.deepEqual(vb.readback.map(i=>[i.id,i.n,i.label]),[[dog.id,2,'dog passage']]);
  assert.deepEqual(va.readback.map(i=>i.id),[trucks.id]);
  // the owner may move it, which confirms it at the new place; the other may not
  await post('/api/accept',{room,role:'A',item:dog.id,position:'above'},403);
  await post('/api/accept',{room,role:'B',item:dog.id,position:'nowhere'},400);
  // the other person agreeing does not confirm it; the owner's yes does
  await post('/api/accept',{room,role:'A',item:dog.id,ok:true});h=await settled(room);
  assert.equal(h.sheetDrawn.named.find(n=>n.id===dog.id).status,'proposed');
  await post('/api/accept',{room,role:'B',item:dog.id,ok:true});h=await settled(room);
  assert.equal(h.sheetDrawn.named.find(n=>n.id===dog.id).status,'confirmed');
  assert.equal(h.wall.cards.find(c=>c.who==='B').met,'confirmed');
  assert.deepEqual((await get(`/api/state?room=${room}&role=B`)).readback,[]);
  // only the owner renames; the word stays theirs through the next decision
  await post('/api/accept',{room,role:'A',item:dog.id,label:'sidewalk'},403);
  await post('/api/accept',{room,role:'B',item:dog.id,label:'dog lane'});h=await settled(room);
  assert.equal(h.sheet.find(p=>p.id===dog.id).label,'dog lane');assert.equal(h.sheetDrawn.named.find(n=>n.id===dog.id).label,'dog lane');
  assert.ok(h.lines.some(l=>l.who==='B'&&l.text==='Call it: dog lane.'));
  await post('/api/say',{room,role:'A',text:'no trucks on the bridge'});h=await settled(room);
  assert.equal(h.sheet.find(p=>p.id===dog.id).label,'dog lane','a new decision record does not overwrite a renamed word');
  // the other person's no is an objection, kept and drawn; the owner's no takes it off
  await post('/api/accept',{room,role:'B',item:trucks.id,ok:false});h=await settled(room);
  const t=h.sheetDrawn.named.find(n=>n.id===trucks.id);assert.equal(t.status,'objected');assert.equal(t.objection.by,'B');
  assert.equal(h.wall.cards.find(c=>c.who==='A').met,'objected');
  await post('/api/accept',{room,role:'A',item:trucks.id,ok:false});h=await settled(room);
  assert.ok(!h.sheetDrawn.named.some(n=>n.id===trucks.id));assert.equal(h.wall.cards.find(c=>c.who==='A').met,'unverified');
  // the keys builder is untouched: no wall, no sheet, nothing named
  const keys=await post('/api/create',{argument:'pairs',route:'develop',agent:'keys'});
  await post('/api/say',{room:keys.room,role:'A',text:'no trucks on the bridge'});await settled(keys.room);
  await post('/api/say',{room:keys.room,role:'B',text:'a dedicated passage for walking dogs, separate from people'});const hk=await settled(keys.room);
  assert.equal(hk.sheet,null);assert.equal(hk.sheetDrawn,null);assert.ok(hk.shape);
  // on the route where the AI is in the room for all of it, the picture moves
  // with the talk once both have spoken; before that, nothing is built
  const all=await post('/api/create',{argument:'pairs',route:'all',agent:'toolkit'});
  await post('/api/say',{room:all.room,role:'A',text:'no trucks on the bridge'});let ha=await settled(all.room);
  assert.ok(!ha.shape,'one voice is not enough');
  await post('/api/say',{room:all.room,role:'B',text:'a dedicated passage for walking dogs, separate from people'});ha=await settled(all.room);
  assert.ok(ha.shape,'both have spoken: it builds without a Confirm');assert.ok(ha.sheetDrawn.named.some(n=>n.label==='dog passage'));
  assert.ok(!ha.lines.some(l=>l.decision),'nothing was confirmed as a decision');
  const builds=ha.lines.filter(l=>l.who==='builder'&&l.built).length;
  await post('/api/say',{room:all.room,role:'A',text:'no trucks on the bridge'});ha=await settled(all.room);
  assert.equal(ha.lines.filter(l=>l.who==='builder'&&l.built).length,builds+1,'every heard line revises');
  // the private route still waits for a Confirm
  const conf=await post('/api/create',{argument:'pairs',route:'confer',agent:'toolkit'});
  await post('/api/say',{room:conf.room,role:'A',text:'no trucks on the bridge'});await post('/api/say',{room:conf.room,role:'B',text:'a dedicated passage for walking dogs, separate from people'});
  const hc=await settled(conf.room);assert.ok(!hc.shape,'the AI heard none of it');
  // it survives a restart
  await stop();await start();h=await settled(room);
  assert.equal(h.sheet.find(p=>p.id===dog.id).label,'dog lane');assert.equal(h.sheetDrawn.named.find(n=>n.id===dog.id).status,'confirmed');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}
});
