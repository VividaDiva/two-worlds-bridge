import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildJourney,journeyFrame} from './journey-playback.mjs';
import {recipients} from './flow-model.mjs';
const archive=JSON.parse(fs.readFileSync(new URL('./eight-paths.json',import.meta.url),'utf8'));
const id=s=>`${s.path}/${s.scenario}/${s.pair}`;
const fixture=transcript=>({path:'all',see:{A:{hears:true,echo:true},B:{hears:true,echo:true}},transcript,outcome:{has:['steady'],world:{water:true},name:'Bridge'}});

test('playback separates source and extraction, then reveals the output only on its final frame',()=>{
 const model=buildJourney(fixture([{who:'A',text:'Hold steady',meant:['steady'],taken:['steady']},{who:'machine'}]));
 assert.deepEqual(model.columns.map(c=>c.kind),['meant','ai','built']);
 assert.equal(journeyFrame(model,-1).current,null);assert.deepEqual(journeyFrame(model,-1).lanes,[]);
 assert.equal(journeyFrame(model,0).links.length,0);assert.equal(journeyFrame(model,0).done,false);
 assert.deepEqual(journeyFrame(model,1).links,[{from:0,to:1,key:'steady',refused:false,kind:'handoff'}]);
 assert.equal(journeyFrame(model,2).done,true);assert.equal(journeyFrame(model,2).current.kind,'built');
 assert.equal(journeyFrame(model,999).index,2);
});

test('private, relayed, and unread empty turns never create an AI extraction column',()=>{
 const privateSession={...fixture([{who:'A',phase:'confer',text:'Private',meant:['grip'],taken:['grip']},{who:'B',text:'Summary',meant:['steady'],taken:['steady']}]),path:'confer'};
 assert.deepEqual(buildJourney(privateSession).columns.filter(c=>c.kind==='ai').map(c=>c.sourceTurnIndex),[1]);
 const relay={...fixture([{who:'A',text:'Tell them',meant:['grip'],taken:['grip']},{who:'B',text:'Relaying',meant:['steady'],taken:['steady']}]),path:'chain',see:{A:{hears:false},B:{hears:true}}};
 assert.deepEqual(buildJourney(relay).columns.filter(c=>c.kind==='ai').map(c=>c.sourceTurnIndex),[1]);
 const unread=fixture([{who:'A',text:'',unread:true,meant:[],taken:[]}]);assert.equal(buildJourney(unread).columns.some(c=>c.kind==='ai'),false);
});

test('a later repeated key cannot erase an earlier miss or reveal a future-only lane',()=>{
 const s=fixture([{who:'A',text:'Steady',meant:['steady'],taken:[]},{who:'machine'},{who:'B',text:'Steady and wide',meant:['steady','wide'],taken:['steady','wide']}]);
 const model=buildJourney(s),first=journeyFrame(model,1);
 assert.deepEqual(first.drops,[{from:0,to:1,key:'steady',refused:false}]);assert.deepEqual(first.lanes,['steady']);
 const final=journeyFrame(model,model.columns.length-1);assert.ok(final.drops.some(d=>d.from===0&&d.to===1&&d.key==='steady'));assert.deepEqual(journeyFrame(model,1),first);
});

test('heard provenance reaches the last receivable other-person line across consecutive same-role turns',()=>{
 const s=fixture([{who:'A',text:'A need',meant:['grip'],taken:['grip']},{who:'B',text:'First answer',meant:['steady'],taken:['steady'],heard:['grip']},{who:'B',text:'Final summary',meant:['grip'],taken:['grip'],heard:['grip']}]);
 const heard=buildJourney(s).columns.filter(c=>c.kind==='heard');assert.equal(heard.length,2);
 assert.deepEqual(heard.map(c=>c.sourceTurnIndex),[0,0]);assert.deepEqual(heard.map(c=>c.contextTurnIndex),[1,2]);assert.ok(heard.every(c=>!c.unknownSource));
});

test('unverified listener readings are kept without invented handoff, missing, or extra claims',()=>{
 const s={...fixture([{who:'A',text:'Hidden from B',meant:['guarded'],taken:['guarded']},{who:'B',text:'Unverifiable reading',heard:['high'],meant:[],taken:[]}]),path:'both',see:{A:{hears:false,echo:false},B:{hears:false,echo:false}}};
 const model=buildJourney(s),heard=model.columns.find(c=>c.kind==='heard'),frame=journeyFrame(model,heard.index);
 assert.equal(heard.unknownSource,true);assert.deepEqual(heard.sources,[]);assert.equal(heard.text,'');assert.equal(heard.contextText,'Unverifiable reading');
 assert.ok(!frame.links.some(e=>e.to===heard.index));assert.ok(!frame.drops.some(e=>e.to===heard.index));assert.ok(!frame.added.some(e=>e.at===heard.index));
});

test('polarity changes are not shown as successful handoffs and terrain is not builder achievement',()=>{
 const s=fixture([{who:'A',text:'No rail',meant:['guarded'],meantRefuses:['guarded'],taken:['guarded'],takenRefuses:[]}]);s.outcome.has=['guarded'];
 const model=buildJourney(s),frame=journeyFrame(model,1);
 assert.deepEqual(frame.links,[]);assert.deepEqual(frame.drops,[{from:0,to:1,key:'guarded',refused:true}]);assert.deepEqual(frame.added,[{at:1,key:'guarded',refused:false}]);
 const final=journeyFrame(model,2);assert.ok(final.current.keys.find(k=>k.key==='water').world);assert.ok(!final.links.some(e=>e.key==='water'));assert.ok(!final.drops.some(e=>e.to===2));assert.ok(!final.added.some(e=>e.at===2));
});

test('all archive turns, listener readings, visibility and polarity survive the playback model without mutation or future events',()=>{
 for(const s of archive.sessions){const before=JSON.stringify(s),model=buildJourney(s),humans=s.transcript.filter(t=>['A','B'].includes(t.who));
  assert.equal(model.columns.filter(c=>c.kind==='meant').length,humans.length,id(s));
  assert.equal(model.columns.filter(c=>c.kind==='heard').length,humans.filter(t=>(t.heard||[]).length).length,id(s));
  assert.equal(model.columns.filter(c=>c.kind==='built').length,1,id(s));assert.equal(model.columns.at(-1).kind,'built');
  for(let ci=0;ci<model.columns.length;ci++){
   const c=model.columns[ci];if(ci)assert.ok(c.at>=model.columns[ci-1].at,id(s));assert.ok(c.sources.every(i=>i<ci),id(s));
   if(c.kind==='ai'){const t=s.transcript[c.sourceTurnIndex];assert.equal(Boolean(t.unread),false);assert.ok(recipients(s,t).includes('M'));assert.deepEqual(c.keys.filter(k=>k.refused).map(k=>k.key),t.takenRefuses||[]);}
   if(c.kind==='heard'&&!c.unknownSource){const t=s.transcript[c.sourceTurnIndex];assert.ok(c.sourceTurnIndex<c.contextTurnIndex);assert.notEqual(t.who,c.role);assert.ok(recipients(s,t).includes(c.role));}
   const frame=journeyFrame(model,ci);assert.equal(frame.done,ci===model.columns.length-1);
   for(const e of frame.links){assert.ok(e.from<e.to&&e.to<=ci);assert.ok(model.columns[e.from].keys.some(k=>k.key===e.key&&(e.polarityKnown===false||k.refused===e.refused)));assert.ok(model.columns[e.to].keys.some(k=>k.key===e.key&&k.refused===e.refused));if(e.polarityKnown===false)assert.equal(e.refused,null);}
   for(const e of frame.drops){assert.ok(e.from<e.to&&e.to<=ci);assert.ok(!model.columns[e.to].keys.some(k=>k.key===e.key&&(model.columns[e.to].kind==='heard'||k.refused===e.refused)));}
   for(const e of frame.added)assert.ok(e.at<=ci);
   const visibleKeys=new Set(frame.columns.flatMap(c=>c.keys.map(k=>k.key)));assert.deepEqual(new Set(frame.lanes),visibleKeys);
  }
  const start=journeyFrame(model,0);journeyFrame(model,model.columns.length-1);assert.deepEqual(journeyFrame(model,0),start);assert.equal(JSON.stringify(s),before,id(s));
 }
});


test('listener key readings preserve unknown stance rather than inventing acceptance of a refusal',()=>{
 const s=fixture([{who:'A',text:'No rail',meant:['guarded','high'],meantRefuses:['guarded'],taken:['guarded'],takenRefuses:['guarded']},{who:'B',text:'I heard you',heard:['guarded','grip'],meant:[],taken:[]}]);
 const model=buildJourney(s),heard=model.columns.find(c=>c.kind==='heard'),frame=journeyFrame(model,heard.index);
 assert.equal(heard.polarityKnown,false);assert.deepEqual(heard.keys,[{key:'guarded',refused:null},{key:'grip',refused:null}]);
 assert.deepEqual(frame.links.filter(e=>e.to===heard.index),[{from:0,to:heard.index,key:'guarded',refused:null,kind:'handoff',polarityKnown:false}]);
 assert.deepEqual(frame.drops.filter(e=>e.to===heard.index),[{from:0,to:heard.index,key:'high',refused:false}]);
 assert.deepEqual(frame.added.filter(e=>e.at===heard.index),[{at:heard.index,key:'grip',refused:null}]);
});
