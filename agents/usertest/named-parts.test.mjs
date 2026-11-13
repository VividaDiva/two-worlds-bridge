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

test('draw.js builds a named part out of the same matchsticks, ghosted until settled, with a numbered marker in the owner\'s colour',()=>{
  const ctx=vm.createContext({window:{}});ctx.window=ctx;
  vm.runInContext(fs.readFileSync(path.join(here,'draw.js'),'utf8'),ctx);
  const shape={level:'at',hand:'rail',middle:'none',width:'two',bracing:'none',surface:'bare',ends:'rested',cover:'open'};
  const named=[{id:'s1',label:'dog passage',primitive:'band',position:'beside',who:'B',status:'proposed'},
               {id:'s2',label:'lights for night walks',primitive:'post',position:'along',who:'B',status:'confirmed'},
               {id:'s3',label:'No trucks',primitive:'sign',position:'ends',who:'A',status:'proposed',kind:'rule'},
               {id:'s4',label:'upper deck for bikes',primitive:'deck',position:'above',who:'A',status:'objected'},
               {id:'s5',label:'smooth cement',primitive:'wash',position:'onwalk',who:'A',status:'placed'}];
  const layers=vm.runInContext('crossingLayers',ctx);
  const kit=layers(shape,{water:true},null).list, L=layers(shape,{water:true},{named});
  // the kit's own sticks come first, the same sticks (the oblique opens wider with parts beside the walk, so positions shift; identity does not); the named parts are sticks after them
  assert.equal(L.list.slice(0,kit.length).filter(m=>m.part).length,0);assert.ok(L.list.length>kit.length);
  const again=layers(shape,{water:true},null).list;assert.deepEqual(again.map(m=>[m.x1,m.y1,m.x2,m.y2]),kit.map(m=>[m.x1,m.y1,m.x2,m.y2]),'without named parts the picture is exactly what it was');
  const added=L.list.slice(kit.length);assert.ok(added.length>10);assert.ok(added.every(m=>m.part&&m.who));
  assert.ok(added.filter(m=>m.part==='s1').every(m=>m.ghost),'a proposal is ghosted');
  assert.ok(added.filter(m=>m.part==='s2').every(m=>!m.ghost&&m.head==='p2'),'confirmed lights are solid sticks with their heads up');
  assert.ok(added.filter(m=>m.part==='s4').every(m=>m.ghost),'an objected part stays a proposal');
  assert.ok(added.some(m=>m.part==='s3'),'a sign is a post and a plate of sticks');
  assert.ok(L.strokes.some(st=>st.poly&&st.who==='A'),'a wash is a surface, not sticks');
  const texts=L.labels.map(l=>l.text);for(const t of ['dog passage','lights for night walks','No trucks','upper deck for bikes','smooth cement'])assert.ok(texts.includes(t),t);
  assert.equal(JSON.stringify(L.labels.map(l=>l.n)),'[1,2,3,4,5]');
  // a span that opens: two raised leaves, and nothing else stays across the opening
  const withLift=[...named,{id:'s6',label:'splits and raises',primitive:'lift',position:'onwalk',who:'A',status:'placed'}];
  const LL=layers(shape,{water:true},{named:withLift}),leaves=LL.list.filter(m=>m.part==='s6');
  assert.ok(leaves.length>=12&&leaves.every(m=>!m.ghost),'a span that opens is two raised leaves of sticks');
  assert.ok(leaves.some(m=>Math.min(m.y1,m.y2)<Math.min(...kit.map(k=>Math.min(k.y1,k.y2)))),'the leaves stand above the deck');
  const midX=(Math.min(...kit.map(k=>Math.min(k.x1,k.x2)))+Math.max(...kit.map(k=>Math.max(k.x1,k.x2))))/2;
  assert.ok(LL.list.filter(m=>m.part!=='s6').every(m=>!(Math.min(m.x1,m.x2)<midX-2&&Math.max(m.x1,m.x2)>midX+2)),'nothing but the leaves crosses the middle of the opening');assert.equal(L.labels.find(l=>l.text==='upper deck for bikes').status,'objected');
  // the feedback page gets the named sticks too, after the kit's, so they can be rated and removed like any other
  const ids=vm.runInContext('crossingMatches',ctx)(shape,{water:true},{named}).map(m=>m.id);assert.equal(ids.length,L.list.length);
  // the older layer still draws
  const old=layers(shape,{},{footway:true,gate:true});assert.ok(old.strokes.length>0);assert.equal(old.labels.length,0);
});

test('the toolkit names, places and draws what the kit cannot make; the owner confirms the position',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-named-'));
 const sock=net.createServer();sock.listen(0,'127.0.0.1');await once(sock,'listening');const port=sock.address().port;await new Promise(r=>sock.close(r));
 const log=path.join(dir,'calls.jsonl');fs.writeFileSync(log,'');
 const sdk=`import fs from 'node:fs';export class GoogleGenAI { models={generateContent:async req=>{
 fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({system:req.config.systemInstruction,contents:req.contents,schema:req.config.responseJsonSchema})+'\\n');
 if(!req.config.responseJsonSchema)return{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'iVBORw0KGgo='}}]}}]};
 const p=req.config.responseJsonSchema.properties;let out={};
 const text=typeof req.contents==='string'?req.contents:JSON.stringify(req.contents);
 if(p.ranks){const ids=[...text.matchAll(/\\[(n\\d+)\\] (Role [12]): ([^\\n]*)/g)];out={ranks:ids.map(m=>({id:m[1],kano:/dog|split/.test(m[3])?'must':'attractive',evidence:/split/.test(m[3])?'clarified when asked':'safety for the dog'}))};}
 else if(p.groups){const a=(text.match(/(s\\d+) · Role 2 · "dog lane"/)||[])[1],b=(text.match(/(s\\d+) · Role 2 · "path for dogs"/)||[])[1];out={groups:a&&b?[[a,b]]:[]};}
 else if(p.same){const nb=(text.match(/\\[(n\\d+)\\] Role 2: a dog passage/)||[])[1];const hit=text.includes('REPEAT_B')||text.includes('ALIAS_A');out={same:hit&&nb?[{index:0,id:nb}]:[]};}
 else if(p.cards&&text.includes('said: "SPLIT_A"')){out={cards:[{who:'Role 1',via:'direct',quote:'SPLIT_A',need:'the bridge splits and lifts for ships',why:'so ships can pass',theme:'opening',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[],ask:'',answeredQuestion:false,clarificationNeeded:false};}
 else if(p.cards&&text.includes('said: "TWIN_B"')){out={cards:[{who:'Role 2',via:'direct',quote:'TWIN_B',need:'a lane where dogs can walk',why:'',theme:'dog walking',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[],ask:'',answeredQuestion:false,clarificationNeeded:false};}
 else if(p.cards&&text.includes('said: "REPEAT_B"')){out={cards:[{who:'Role 2',via:'direct',quote:'REPEAT_B',need:'a dog passage separate from pedestrians',why:'',theme:'dog walking',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[],ask:'',answeredQuestion:false,clarificationNeeded:false};}
 else if(p.cards&&text.includes('said: "ALIAS_A"')){out={cards:[{who:'Role 1',via:'direct',quote:'ALIAS_A',need:'a lane for the dogs away from the cars',why:'',theme:'lanes',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[],ask:'',answeredQuestion:false,clarificationNeeded:false};}
 else if(p.cards){const b=text.includes('Role 2 said');out={cards:[b?{who:'Role 2',via:'direct',quote:'a dedicated passage for walking dogs, separate from people',need:'a dog passage separate from pedestrians',why:'',theme:'dog walking',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}
   :{who:'Role 1',via:'direct',quote:'no trucks on the bridge',need:'no trucks allowed',why:'',theme:'traffic',concern:'',when:'',readings:[],hmw:'',story:'',conflictsWith:[]}],updates:[],tools:[],ask:'',answeredQuestion:false,clarificationNeeded:false};}
 else if(p.decisions){const ids=[...text.matchAll(/\\[(n\\d+)\\] ([AB]) \\(/g)].map(m=>[m[1],m[2]]);const band=(text.match(/(s\\d+) · B · "[^"]*" · band/)||[])[1]||'';out={decisions:ids.map(([id,who])=>text.includes('['+id+'] A (direct): "SPLIT_A"')?{id,response:'none',what:'a must the drawing cannot show yet',uncertainty:'',label:'',primitive:'',position:'',sameAs:''}:text.includes('['+id+'] B (direct): "TWIN_B"')?{id,response:'new',what:'a path for dogs',uncertainty:'',label:'path for dogs',primitive:'band',position:'beside',sameAs:''}:text.includes('['+id+'] A (direct): "ALIAS_A"')?{id,response:'new',what:'the same lane',uncertainty:'',label:'lane for the dogs',primitive:'band',position:'beside',sameAs:band}:who==='B'?{id,response:'new',what:'a dog passage beside the walk',uncertainty:'',label:'dog passage',primitive:'band',position:'beside',sameAs:''}:{id,response:'rule',what:'no trucks',uncertainty:'',label:'no trucks on the bridge',primitive:'',position:'',sameAs:''}),conflicts:[],checks:{nothingLost:true,inferencesLabelled:true,noFalseConflicts:true,defaultsChecked:true,buildNotConsent:true,kindsDistinct:true}};}
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
  // Kano is read from the talk before the decision, and the decision sees it
  const kano=calls().filter(c=>c.schema.properties.ranks).at(-1);assert.ok(kano,'a Kano reading was asked for');
  assert.ok(String(kano.contents).includes('a dedicated passage for walking dogs'),'the Kano reading sees the conversation');
  assert.ok(String(kano.contents).includes('how would they feel if the bridge had it'));
  assert.ok(String(decide.contents).includes('Kano: must (safety for the dog)'),'the decision sees the priority');
  assert.ok(decide.system.includes('is never a sign'));
  // the sheet carries the word, the primitive, the place and the owner
  const dog=h.sheet.find(p=>p.label==='dog passage');assert.ok(dog,JSON.stringify(h.sheet));
  assert.equal(dog.owner,'B');assert.equal(dog.primitive,'band');assert.equal(dog.position,'beside');assert.equal(dog.kind,'new');
  assert.equal(dog.kano,'must');assert.equal(h.wall.cards.find(c=>c.who==='B').kano.level,'must');
  const trucks=h.sheet.find(p=>p.kind==='rule');assert.equal(trucks.kano,'attractive');
  assert.deepEqual(h.sheetDrawn.named.map(n=>n.kano),['must','attractive'],'most important first');assert.equal(trucks.primitive,'sign');assert.equal(trucks.position,'ends');assert.equal(trucks.owner,'A');
  // drawn at once, as a proposal, before anyone has said yes
  assert.equal(h.sheetDrawn.named.length,2);assert.ok(h.sheetDrawn.named.every(n=>n.status==='proposed'));
  assert.ok(h.wall.cards.every(c=>c.met==='proposed'));
  // the reply was told what to read back, and to whom
  const reply=calls().filter(c=>c.schema.properties.text).at(-1);const sent=JSON.parse(reply.contents);
  assert.equal(sent.named.length,2);assert.ok(sent.named.some(n=>n.label==='dog passage'&&n.owner==='Role 2'&&n.canHear===true));
  assert.ok(reply.system.includes('do NOT ask that in your text'),'the question is a card, not a sentence');
  // the read-back is data for a card: the owner sees their own unconfirmed parts, numbered as drawn; the other sees none of them
  const vb=await get(`/api/state?room=${room}&role=B`), va=await get(`/api/state?room=${room}&role=A`);
  assert.deepEqual(vb.readback.map(i=>[i.id,i.n,i.label]),[[dog.id,1,'dog passage']],'the must-have is numbered first');
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
  // a second word the line-by-line check missed is folded in after the build: one band, the new word hanging on it
  const bandsBefore=h.sheet.filter(p=>p.primitive==='band'&&!p.declined).length;
  await post('/api/say',{room,role:'B',text:'TWIN_B'});h=await settled(room);
  assert.equal(h.sheet.filter(p=>p.primitive==='band'&&!p.declined).length,bandsBefore,'consolidated into one band');
  const kept=h.sheet.find(p=>p.primitive==='band'&&!p.declined);assert.ok(kept.aliases.some(a=>a.label==='path for dogs'),JSON.stringify(kept.aliases));
  assert.ok(h.sheet.some(p=>p.mergedInto===kept.id));assert.equal(h.wall.cards.find(c=>c.quote==='TWIN_B').met,'confirmed');
  // direct placing: drawn solid at once, nobody asked, nothing to confirm
  const direct=await post('/api/create',{argument:'pairs',route:'develop',agent:'toolkit',place:'direct'});
  await post('/api/say',{room:direct.room,role:'A',text:'no trucks on the bridge'});await settled(direct.room);
  await post('/api/say',{room:direct.room,role:'B',text:'a dedicated passage for walking dogs, separate from people'});const hd=await settled(direct.room);
  assert.equal(hd.place,'direct');assert.ok(hd.sheetDrawn.named.length>=2);assert.ok(hd.sheetDrawn.named.every(n=>n.status==='placed'));
  assert.ok(hd.wall.cards.every(c=>c.met==='placed'));
  assert.deepEqual((await get(`/api/state?room=${direct.room}&role=B`)).readback,[]);
  const dreply=calls().filter(c=>c.schema.properties.text).at(-1);assert.ok(dreply.system.includes('nobody is asked to confirm'));
  await post('/api/create',{argument:'pairs',route:'develop',agent:'toolkit',place:'sideways'},400);
  // said again by the same person: a note on the card, not a second card; the other person's word for the same lane: one part, both words
  const before=h.wall.cards.length, bands=h.sheet.filter(p=>p.primitive==='band').length;
  await post('/api/say',{room,role:'B',text:'REPEAT_B'});h=await settled(room);
  assert.equal(h.wall.cards.length,before,'a repeated need adds no card');assert.ok(h.wall.cards.some(c=>c.changes.some(x=>/said again/.test(x.change))));
  await post('/api/say',{room,role:'A',text:'ALIAS_A'});h=await settled(room);
  assert.equal(h.sheet.filter(p=>p.primitive==='band').length,bands,'no second band for the same lane');
  const shared=h.sheet.find(p=>p.primitive==='band');assert.ok(shared.aliases.some(a=>a.who==='A'&&a.label==='lane for the dogs'),JSON.stringify(shared));
  assert.ok(h.sheetDrawn.named.find(n=>n.id===shared.id).aliases.some(a=>a.who==='A'&&a.label==='lane for the dogs'),'the other person\'s word shows on the drawn part');
  const aliasCard=h.wall.cards.find(c=>c.quote==='ALIAS_A');assert.equal(aliasCard.met,'confirmed','the alias takes the part\'s status');
  // a must-have the drawing cannot show is never silently gone: it is listed, and never a sign
  await post('/api/say',{room,role:'A',text:'SPLIT_A'});h=await settled(room);
  const split=h.wall.cards.find(c=>c.quote==='SPLIT_A');assert.equal(split.kano.level,'must');
  assert.ok(!h.sheet.some(p=>p.cardId===split.id&&!p.declined),'not turned into a part it is not');
  assert.deepEqual(h.sheetDrawn.mustOpen.map(m=>m.need),['the bridge splits and lifts for ships']);
  // the sketch is drawn from the toolkit's own understanding: musts first, no kit shape, no JSON, water from what was heard
  await post('/api/sketch',{room});for(let i=0;i<100&&!calls().some(c=>!c.schema);i++)await new Promise(r=>setTimeout(r,20));
  const sk=String(calls().filter(c=>!c.schema).at(-1).contents);
  assert.ok(sk.includes('MUST-HAVE'),sk);assert.ok(sk.indexOf('the bridge splits and lifts for ships')<sk.indexOf('Nice to have'),'the must comes first');
  assert.ok(!sk.includes('A crossing with a rail and two abreast'),'the kit shape is not handed to the sketch');
  assert.ok(!sk.includes('"cards"'),'no JSON dump');assert.ok(!sk.includes('[drawn as'),'no matchstick placing words');assert.ok(!sk.includes('What they said'),'the toolkit sketch reads one account of the bridge, not the transcript as well');assert.ok(sk.includes('a lane for the dogs away from the cars'),'a need folded into another part is still in the sketch, in its owner\'s words');assert.ok(sk.includes('banks: water'),'ships mean water');
  // it survives a restart
  await stop();await start();h=await settled(room);
  assert.equal(h.sheet.find(p=>p.id===dog.id).label,'dog lane');assert.equal(h.sheetDrawn.named.find(n=>n.id===dog.id).status,'confirmed');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true})}
});

test('a rule names a ban, a limit, a time or a turn; a width or a cover is a thing on the bridge',async()=>{
  const {looksLikeRule}=await import('./builder.mjs');
  for(const n of ['no trucks on the bridge','a predictable schedule for bridge closure','dogs go first in the morning','limit the size of vehicles'])assert.ok(looksLikeRule({need:n}),n);
  for(const n of ['wide enough for two cars to pass at the same time','sidewalks to have covers','each direction takes a level','stand lights on the bridge'])assert.ok(!looksLikeRule({need:n}),n);
});
