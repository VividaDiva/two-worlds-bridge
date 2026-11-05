import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PATHS,SCENARIOS,recipients,selectSession,needState} from './flow-model.mjs';
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
