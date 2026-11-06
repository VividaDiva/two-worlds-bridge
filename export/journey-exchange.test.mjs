import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildJourney,journeyFrame} from './journey-playback.mjs';
import {KEY_NAMES,exchangeFrame,keywordTrace} from './journey-exchange.mjs';
const archive=JSON.parse(fs.readFileSync(new URL('./eight-paths.json',import.meta.url),'utf8'));
const fixture=transcript=>({path:'all',see:{A:{hears:true,echo:true},B:{hears:true,echo:true}},transcript,outcome:{has:['steady'],world:{water:true},name:'Bridge'}});
const exchange=(model,index)=>exchangeFrame(model,journeyFrame(model,index));

test('default grip/sheltered handoff shows the retained key and this extraction omission without inventing a roof request',()=>{
 const session=archive.sessions.find(s=>s.path==='all'&&s.scenario==='pairs'&&s.pair===0),model=buildJourney(session),ai=model.columns.find(c=>c.kind==='ai');
 const view=exchange(model,ai.index);
 assert.equal(view.kind,'handoff');assert.equal(view.source.text,session.transcript[0].text);assert.equal(view.current,ai);
 assert.deepEqual(view.rows.map(r=>[r.key,r.status]),[['grip','retained'],['sheltered','missing']]);
 assert.equal(view.rows[1].target,null);assert.deepEqual(view.history.A.map(e=>e.key),['grip']);assert.deepEqual(view.history.B,[]);
 assert.equal(KEY_NAMES.grip,'Wet-weather grip');assert.equal(KEY_NAMES.sheltered,'Weather protection');assert.equal(Object.keys(KEY_NAMES).length,17);
});

test('source-only steps contain no recipient reading and future-only keys cannot enter history or trace',()=>{
 const model=buildJourney(fixture([{who:'A',text:'Steady',meant:['steady'],taken:['steady']},{who:'machine'},{who:'B',text:'Guarded',meant:['guarded'],taken:['guarded']}]));
 const start=exchange(model,0);assert.equal(start.kind,'source');assert.equal(start.target,null);assert.ok(start.rows.every(r=>r.status==='recorded'&&r.target===null));assert.deepEqual(start.history,{A:[],B:[]});
 const early=journeyFrame(model,1);assert.deepEqual(keywordTrace(model,early,'guarded'),[]);assert.deepEqual(keywordTrace(model,early,'steady'),[0,1]);assert.deepEqual(exchangeFrame(model,early).history.B,[]);
 assert.equal(exchange(model,-1).kind,'empty');assert.deepEqual(keywordTrace(model,{index:-1},'steady'),[]);
});

test('private and excluded inputs never become AI extraction history',()=>{
 const s={...fixture([{who:'A',phase:'confer',text:'Private',meant:['grip'],taken:['grip']},{who:'B',text:'Summary',meant:['steady'],taken:['steady']}]),path:'confer'};
 const model=buildJourney(s);assert.deepEqual(exchange(model,0).history,{A:[],B:[]});
 const done=exchange(model,model.columns.length-1);assert.deepEqual(done.history.A,[]);assert.deepEqual(done.history.B.map(e=>e.key),['steady']);
 const relay={...fixture([{who:'A',text:'Only to B',meant:['guarded'],taken:['guarded']},{who:'B',text:'To AI',meant:['heavy'],taken:['heavy']}]),path:'chain',see:{A:{hears:false},B:{hears:true}}};
 const rm=buildJourney(relay);assert.deepEqual(exchange(rm,rm.columns.length-1).history.A,[]);
});

test('unknown-source listener readings are standalone records, and unknown stance never implies agreement',()=>{
 const unknown={...fixture([{who:'A',text:'Not audible to B',meant:['steady'],taken:['steady']},{who:'B',text:'My response',heard:['grip'],meant:[],taken:[]}]),path:'both',see:{A:{hears:false},B:{hears:false}}};
 const um=buildJourney(unknown),uc=um.columns.find(c=>c.kind==='heard'),u=exchange(um,uc.index);
 assert.equal(u.kind,'reading');assert.equal(u.source,null);assert.equal(u.rows[0].status,'recorded');assert.equal(u.rows[0].polarityKnown,false);assert.equal(u.rows[0].target.refused,null);
 const known=buildJourney(fixture([{who:'A',text:'No rail',meant:['guarded'],meantRefuses:['guarded'],taken:[],takenRefuses:[]},{who:'B',text:'I heard you',heard:['guarded'],meant:[],taken:[]}])),kc=known.columns.find(c=>c.kind==='heard'),k=exchange(known,kc.index);
 assert.equal(k.kind,'handoff');assert.equal(k.rows[0].status,'retained');assert.equal(k.rows[0].polarityKnown,false);assert.equal(k.rows[0].source.refused,true);assert.equal(k.rows[0].target.refused,null);
});

test('known polarity reversal is one changed row rather than duplicate missing and added rows',()=>{
 for(const [sourceRefused,targetRefused] of [[true,false],[false,true]]){
  const model=buildJourney(fixture([{who:'A',text:'Rail stance',meant:['guarded'],meantRefuses:sourceRefused?['guarded']:[],taken:['guarded'],takenRefuses:targetRefused?['guarded']:[]}]));
  const view=exchange(model,1);assert.equal(view.rows.length,1);assert.equal(view.rows[0].status,'changed');assert.equal(view.rows[0].polarityKnown,true);assert.equal(view.rows[0].source.refused,sourceRefused);assert.equal(view.rows[0].target.refused,targetRefused);
 }
});

test('AI extraction history keeps repetitions and reversals separated by originating role; final features are not success scores',()=>{
 const s=fixture([{who:'A',text:'Rail please',meant:['guarded'],taken:['guarded']},{who:'B',text:'No rail',meant:['guarded'],meantRefuses:['guarded'],taken:['guarded'],takenRefuses:['guarded']},{who:'A',text:'Now no rail',meant:['guarded'],meantRefuses:['guarded'],taken:['guarded'],takenRefuses:['guarded']}]);s.outcome.has=['guarded','sheltered'];
 const model=buildJourney(s),view=exchange(model,model.columns.length-1);
 assert.equal(view.kind,'built');assert.equal(view.source,null);assert.ok(view.rows.every(r=>r.status==='recorded'&&r.source===null));assert.equal(view.rows.find(r=>r.key==='water').target.world,true);
 assert.equal(view.historyKind,'recorded-extractions');assert.deepEqual(view.history.A.map(e=>e.refused),[false,true]);assert.deepEqual(view.history.B.map(e=>e.refused),[true]);assert.ok(view.history.A[0].columnIndex<view.history.A[1].columnIndex);
});

test('every archived exchange uses only revealed evidence, preserves source attribution, and survives rewind without mutation',()=>{
 for(const s of archive.sessions){const model=buildJourney(s),before=JSON.stringify(model),sourceBefore=JSON.stringify(s);
  for(let index=0;index<model.columns.length;index++){
   const frame=journeyFrame(model,index),view=exchangeFrame(model,frame);assert.equal(view.current,model.columns[index]);if(view.source&&view.kind==='handoff')assert.ok(view.source.index<index);
   for(const role of ['A','B'])for(const e of view.history[role]){assert.ok(e.columnIndex<=index);assert.ok(e.sourceIndex<e.columnIndex);assert.equal(model.columns[e.columnIndex].kind,'ai');assert.equal(model.columns[e.sourceIndex].role,role);assert.ok(model.columns[e.columnIndex].keys.some(k=>k.key===e.key&&k.refused===e.refused));}
   for(const key of model.lanes){const expected=frame.columns.filter(c=>c.keys.some(e=>e.key===key)).map(c=>c.index);assert.deepEqual(keywordTrace(model,frame,key),expected);}
   for(const row of view.rows){if(row.status==='changed'){assert.ok(row.polarityKnown);assert.notEqual(row.source.refused,row.target.refused);}if(view.kind==='built'||view.kind==='source'||view.kind==='reading')assert.equal(row.status,'recorded');}
  }
  const first=exchange(model,0);exchange(model,model.columns.length-1);assert.deepEqual(exchange(model,0),first);assert.equal(JSON.stringify(model),before);assert.equal(JSON.stringify(s),sourceBefore);
 }
});
