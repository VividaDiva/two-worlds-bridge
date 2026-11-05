import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PATHS,SCENARIOS,recipients,selectSession,needState,interpretationFrame,routeMessages} from './flow-model.mjs';
const data=JSON.parse(fs.readFileSync(new URL('./eight-paths.json',import.meta.url),'utf8'));
const key=s=>`${s.path}:${s.scenario}:${s.pair}`;

test('all 160 archived route/scenario/run combinations resolve uniquely and retain their data',()=>{
 assert.equal(data.sessions.length,160);assert.equal(new Set(data.sessions.map(key)).size,160);
 for(const s of data.sessions){const selected=selectSession(data,`#path=${s.path}&scen=${s.scenario}&pair=${s.pair}`);assert.equal(selected,s);assert.ok(PATHS[s.path]);assert.ok(SCENARIOS[s.scenario]);assert.ok(s.transcript.length);assert.ok(s.outcome.shape);}
 for(const path of Object.keys(PATHS))for(const scen of Object.keys(SCENARIOS))for(let pair=0;pair<4;pair++)assert.equal(key(selectSession(data,`path=${path}&scen=${scen}&pair=${pair}`)),`${path}:${scen}:${pair}`);
});

test('malformed, partial, and unknown hash selections fall back to a known session',()=>{
 for(const hash of ['', '#', '#path=unknown&scen=places&pair=0','#path=all&scen=missing&pair=0','#path=all&scen=places&pair=999','#path=all&scen=places','#path=all&scen=places&pair=NaN','#path=%3Cscript%3E&scen=places&pair=0'])assert.equal(selectSession(data,hash),data.sessions[0]);
 assert.equal(selectSession(data,'#pair=3&scen=refs&path=only-2'),data.sessions.find(s=>s.path==='only-2'&&s.scenario==='refs'&&s.pair===3));
});

test('human visibility follows the recorded simulation route for every turn',()=>{
 for(const s of data.sessions)for(const t of s.transcript){if(t.who==='machine')continue;
  let expected;const other=t.who==='A'?'B':'A';
  if(s.path==='all')expected=[other,'M'];
  else if(s.path==='confer')expected=t.phase==='confer'?[other]:[other,'M'];
  else if(s.path==='chain')expected=t.who==='A'?['B']:['M'];
  else expected=['M'];
  assert.deepEqual(recipients(s,t),expected,`${key(s)} ${t.who} ${t.phase}`);
 }
});

test('builder output follows echo permissions rather than broadcasting to every role',()=>{
 const expected={all:['A','B'],confer:['A','B'],both:[],chain:[],'via-1':['B'],'via-2':['A'],'only-1':[],'only-2':[]};
 for(const s of data.sessions)for(const t of s.transcript.filter(t=>t.who==='machine'))assert.deepEqual(recipients(s,t),expected[s.path],key(s));
});

test('rewinding reconstructs need state without leaking later expressed or extracted keys',()=>{
 const s={path:'all',see:{A:{hears:true,echo:true},B:{hears:true,echo:true}},transcript:[{who:'A',meant:['safe'],taken:['guarded']},{who:'machine'},{who:'B',meant:['wide'],taken:['wide','smooth']},{who:'machine'}]};
 const final=needState(s,3);assert.deepEqual([...final.voiced],['A:safe','B:wide']);assert.deepEqual([...final.heard],['A:guarded','B:wide','B:smooth']);assert.equal(final.done,true);
 const first=needState(s,0);assert.deepEqual([...first.voiced],['A:safe']);assert.deepEqual([...first.heard],['A:guarded']);assert.equal(first.done,false);
 assert.deepEqual([...needState(s,-1).voiced],[]);assert.deepEqual([...needState(s,-1).heard],[]);
 assert.deepEqual([...needState(s,3).heard],[...final.heard]);
});

test('private discussion and human relay never count excluded words as builder extraction',()=>{
 for(const s of [{path:'confer',see:{A:{hears:true},B:{hears:true}},transcript:[{who:'A',phase:'confer',meant:['safe'],taken:['guarded']},{who:'B',meant:['wide'],taken:['wide']}]},{path:'chain',see:{A:{hears:false},B:{hears:true}},transcript:[{who:'A',meant:['safe'],taken:['guarded']},{who:'B',meant:['wide'],taken:['wide']}]}]){
 const n=needState(s,1);assert.deepEqual([...n.voiced],['A:safe','B:wide']);assert.deepEqual([...n.heard],['B:wide']);
 }
});

test('every recorded run stays unfinished before its final turn and marks completion exactly at the end',()=>{
 for(const s of data.sessions){for(let i=0;i<s.transcript.length;i++)assert.equal(needState(s,i).done,i===s.transcript.length-1,key(s));const before=needState(s,0);needState(s,s.transcript.length-1);const after=needState(s,0);assert.deepEqual([...after.voiced],[...before.voiced]);assert.deepEqual([...after.heard],[...before.heard]);}
});


test('interpretation frame keeps both roles but selects only the latest input on a deferred builder reply',()=>{
 const s={path:'both',see:{A:{hears:false,echo:false},B:{hears:false,echo:false}},transcript:[{who:'A',meant:['high'],taken:['high']},{who:'B',meant:['wide'],taken:['many']},{who:'machine'}]};
 const f=interpretationFrame(s,2);assert.equal(f.source,s.transcript[1]);assert.equal(f.sourceIndex,1);assert.equal(f.receivesAI,true);assert.deepEqual(f.roles,{A:{turn:s.transcript[0],index:0},B:{turn:s.transcript[1],index:1}});
 const first=interpretationFrame(s,0);assert.equal(first.source,s.transcript[0]);assert.equal(first.roles.B,null);
});

test('current private messages remain visible but are not AI inputs; builder frame skips private history',()=>{
 const s={path:'confer',see:{A:{hears:true},B:{hears:true}},transcript:[{who:'A',meant:['high'],taken:['high']},{who:'B',phase:'confer',meant:['wide'],taken:['wide']},{who:'machine'}]};
 const privateFrame=interpretationFrame(s,1);assert.equal(privateFrame.source,s.transcript[1]);assert.equal(privateFrame.receivesAI,false);
 const builderFrame=interpretationFrame(s,2);assert.equal(builderFrame.source,s.transcript[0]);assert.equal(builderFrame.sourceIndex,0);assert.equal(builderFrame.roles.B.turn,s.transcript[1]);
 const noInput={path:'chain',see:{A:{hears:false},B:{hears:true}},transcript:[{who:'A',meant:['safe'],taken:['guarded']},{who:'machine'}]};
 const empty=interpretationFrame(noInput,1);assert.equal(empty.source,null);assert.equal(empty.sourceIndex,-1);assert.equal(empty.receivesAI,false);assert.equal(empty.roles.A.turn,noInput.transcript[0]);
});

test('empty recorded participant messages and absent keys remain literal without inferred content',()=>{
 const s=data.sessions.find(s=>s.path==='all'&&s.scenario==='refs'&&s.pair===1),f=interpretationFrame(s,0);
 assert.equal(f.source,s.transcript[0]);assert.equal(f.source.text,'');assert.deepEqual(f.source.meant,[]);assert.deepEqual(f.source.taken,[]);assert.equal(f.roles.B,null);
 const empty=interpretationFrame({path:'all',see:{},transcript:[]},0);assert.deepEqual(empty,{sourceIndex:-1,source:null,receivesAI:false,roles:{A:null,B:null}});
 const before=interpretationFrame(s,-1);assert.deepEqual(before,{sourceIndex:-1,source:null,receivesAI:false,roles:{A:null,B:null}});
});

test('every archive frame has no future or private builder source and survives rewinding without mutation',()=>{
 for(const s of data.sessions){const snapshot=JSON.stringify(s);for(let i=0;i<s.transcript.length;i++){
  const f=interpretationFrame(s,i),t=s.transcript[i];
  for(const r of ['A','B']){const candidates=s.transcript.slice(0,i+1).map((turn,index)=>({turn,index})).filter(x=>x.turn.who===r),last=candidates.at(-1);assert.equal(f.roles[r]?.index,last?.index,key(s));assert.equal(f.roles[r]?.turn,last?.turn,key(s));}
  if(t.who==='machine'){const candidates=s.transcript.slice(0,i).map((turn,index)=>({turn,index})).filter(x=>['A','B'].includes(x.turn.who)&&recipients(s,x.turn).includes('M')),last=candidates.at(-1);assert.equal(f.sourceIndex,last?.index??-1,key(s));assert.equal(f.source,last?.turn??null,key(s));if(f.source){assert.ok(f.sourceIndex<i);assert.equal(f.receivesAI,true);assert.notEqual(f.source.phase,'confer');}}
  else {assert.equal(f.source,t);assert.equal(f.sourceIndex,i);assert.equal(f.receivesAI,recipients(s,t).includes('M'));}
 }
 const start=interpretationFrame(s,0);interpretationFrame(s,s.transcript.length-1);assert.deepEqual(interpretationFrame(s,0),start);assert.equal(JSON.stringify(s),snapshot);}
});


test('route edge labels distinguish coded peer input from AI extraction and preserve recorded order',()=>{
 const s={path:'all',see:{A:{hears:true,echo:true},B:{hears:true,echo:true}},transcript:[{who:'A',meant:['grip','guarded'],taken:['grip','water']},{who:'machine',meant:['fake'],taken:['fake']}]};
 assert.deepEqual(routeMessages(s,0),[
  {from:'A',to:'B',kind:'coded',words:[{text:'grip',status:'coded'},{text:'guarded',status:'coded'}]},
  {from:'A',to:'M',kind:'extracted',words:[{text:'grip',status:'kept'},{text:'water',status:'extra'},{text:'guarded',status:'lost'}]}
 ]);
 assert.deepEqual(routeMessages(s,1),['A','B'].map(to=>({from:'M',to,kind:'reply',words:[{text:'Reply',status:'reply'}]})));
});

test('private and human-relayed inputs never label an AI edge, even if excluded extraction fields exist',()=>{
 for(const [path,phase] of [['confer','confer'],['chain',null]]){
  const s={path,see:{A:{hears:false},B:{hears:true}},transcript:[{who:'A',phase,meant:['guarded'],taken:['private-key']}]};
  assert.deepEqual(routeMessages(s,0),[{from:'A',to:'B',kind:'coded',words:[{text:'guarded',status:'coded'}]}]);
 }
});

test('missing keywords stay empty and absent or unrelayed turns have no route messages',()=>{
 const s={path:'both',see:{A:{hears:false,echo:false},B:{hears:false,echo:false}},transcript:[{who:'A'},{who:'B',meant:[],taken:[]},{who:'machine'}]};
 assert.deepEqual(routeMessages(s,0),[{from:'A',to:'M',kind:'extracted',words:[]}]);
 assert.deepEqual(routeMessages(s,1),[{from:'B',to:'M',kind:'extracted',words:[]}]);
 for(const i of [-1,2,3])assert.deepEqual(routeMessages(s,i),[]);
 assert.deepEqual(routeMessages({transcript:[]},0),[]);
});

test('all archive route messages use only the current permitted payload and never borrow input keys for replies',()=>{
 for(const s of data.sessions){const snapshot=JSON.stringify(s);for(let i=0;i<s.transcript.length;i++){
  const t=s.transcript[i],edges=routeMessages(s,i),from=t.who==='machine'?'M':t.who;
  assert.deepEqual(edges.map(e=>e.to),recipients(s,t),key(s));
  for(const edge of edges){assert.equal(edge.from,from,key(s));
   if(from==='M'){assert.equal(edge.kind,'reply');assert.deepEqual(edge.words,[{text:'Reply',status:'reply'}]);continue;}
   if(edge.to!=='M'){assert.equal(edge.kind,'coded');assert.deepEqual(edge.words,(t.meant||[]).map(text=>({text,status:'coded'})));continue;}
   assert.notEqual(t.phase,'confer');assert.ok(!(s.path==='chain'&&t.who==='A'));assert.equal(edge.kind,'extracted');
   const kept=edge.words.filter(w=>w.status==='kept').map(w=>w.text),extra=edge.words.filter(w=>w.status==='extra').map(w=>w.text),lost=edge.words.filter(w=>w.status==='lost').map(w=>w.text);
   assert.deepEqual(kept,(t.taken||[]).filter(w=>(t.meant||[]).includes(w)));assert.deepEqual(extra,(t.taken||[]).filter(w=>!(t.meant||[]).includes(w)));assert.deepEqual(lost,(t.meant||[]).filter(w=>!(t.taken||[]).includes(w)));
  }
 }
 assert.equal(JSON.stringify(s),snapshot,key(s));
 const first=routeMessages(s,0);routeMessages(s,s.transcript.length-1);assert.deepEqual(routeMessages(s,0),first);
 }
});

test('six-chip stress case preserves all three extractions and all three missed coded keys',()=>{
 const s=data.sessions.find(s=>s.path==='only-1'&&s.scenario==='places'&&s.pair===1),edges=routeMessages(s,0);
 assert.deepEqual(edges,[{from:'A',to:'M',kind:'extracted',words:[{text:'water',status:'extra'},{text:'high',status:'extra'},{text:'guarded',status:'extra'},{text:'steady',status:'lost'},{text:'minimal',status:'lost'},{text:'low',status:'lost'}]}]);
});
