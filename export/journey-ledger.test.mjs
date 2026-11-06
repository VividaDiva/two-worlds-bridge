import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildJourney,journeyFrame} from './journey-playback.mjs';
import {ledgerFrame} from './journey-ledger.mjs';
const archive=JSON.parse(fs.readFileSync(new URL('./eight-paths.json',import.meta.url),'utf8'));
const fixture=transcript=>({path:'all',see:{A:{hears:true,echo:true},B:{hears:true,echo:true}},transcript,outcome:{has:['steady'],world:{water:true},name:'Bridge'}});
const ledger=(model,index)=>ledgerFrame(model,journeyFrame(model,index));
const at=(view,index)=>view.events.filter(e=>e.columnIndex===index);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};

test('default weather-protection loss is recorded at both actual handoffs',()=>{
 const session=archive.sessions.find(s=>s.path==='all'&&s.scenario==='pairs'&&s.pair===0),model=buildJourney(session),view=ledger(model,2);
 assert.deepEqual(at(view,0).map(e=>[e.key,e.status]),[['grip','expressed'],['sheltered','expressed']]);
 for(const index of [1,2]){
  const events=at(view,index);assert.deepEqual(events.map(e=>[e.key,e.status]),[['grip','retained'],['sheltered','missing']]);
  const loss=events[1];assert.equal(loss.sourceIndex,0);assert.equal(loss.entry,null);assert.deepEqual(loss.sourceEntry,{key:'sheltered',refused:false});
 }
 assert.equal(at(view,1)[0].polarityKnown,true);assert.equal(at(view,2)[0].polarityKnown,false);
 assert.deepEqual(view.groups[0],{start:0,end:2,line:1,label:'Line 1',sourceRole:'A'});
});

test('a later reappearance does not erase an earlier handoff miss',()=>{
 const model=buildJourney(fixture([{who:'A',text:'Weather protection',meant:['sheltered'],taken:[]},{who:'B',text:'Weather protection too',meant:['sheltered'],taken:['sheltered']}]));
 const early=ledger(model,1),done=ledger(model,model.columns.length-1);
 assert.deepEqual(done.events.find(e=>e.columnIndex===1&&e.key==='sheltered'),early.events.find(e=>e.columnIndex===1&&e.key==='sheltered'));
 assert.equal(done.events.find(e=>e.columnIndex===3&&e.key==='sheltered').status,'retained');
 assert.deepEqual(ledger(model,1),early);
});

test('a known reversal creates one changed event, not both missing and added',()=>{
 for(const [before,after] of [[true,false],[false,true]]){
  const model=buildJourney(fixture([{who:'A',text:'Rail stance',meant:['guarded'],meantRefuses:before?['guarded']:[],taken:['guarded'],takenRefuses:after?['guarded']:[]}])),events=at(ledger(model,1),1);
  assert.equal(events.length,1);assert.equal(events[0].status,'changed');assert.equal(events[0].sourceEntry.refused,before);assert.equal(events[0].entry.refused,after);assert.equal(events[0].polarityKnown,true);
 }
});

test('private and route-excluded expressions remain visible without inventing an AI reading',()=>{
 for(const [path,phase] of [['confer','confer'],['chain',undefined]]){
  const session={...fixture([{who:'A',phase,text:'Private rail request',meant:['guarded'],taken:['guarded']},{who:'B',text:'I heard a rail',heard:['guarded'],meant:['steady'],taken:['steady']}]),path};
  if(path==='chain')session.see={A:{hears:false},B:{hears:true}};
  const model=buildJourney(session),view=ledger(model,model.columns.length-1),source=model.columns.find(c=>c.kind==='meant'&&c.role==='A');
  assert.ok(view.events.some(e=>e.columnIndex===source.index&&e.status==='expressed'));
  assert.ok(!view.events.some(e=>e.sourceIndex===source.index&&model.columns[e.columnIndex].kind==='ai'));
  const heard=model.columns.find(c=>c.kind==='heard');assert.equal(at(view,heard.index)[0].status,'retained');assert.equal(at(view,heard.index)[0].polarityKnown,false);
 }
});

test('unverified listener readings never receive a source or added/missing claims',()=>{
 const session={...fixture([{who:'A',text:'Not available to B',meant:['steady'],taken:['steady']},{who:'B',text:'Response',heard:['grip'],meant:['guarded'],taken:['guarded']}]),path:'both',see:{A:{hears:false},B:{hears:false}}};
 const model=buildJourney(session),heard=model.columns.find(c=>c.kind==='heard'),view=ledger(model,heard.index),event=at(view,heard.index)[0];
 assert.equal(event.status,'reading');assert.equal(event.sourceIndex,null);assert.equal(event.sourceEntry,null);assert.equal(event.entry.refused,null);assert.equal(event.polarityKnown,false);
 assert.equal(view.groups.find(g=>g.start<=heard.index&&g.end>=heard.index).sourceRole,null);
});

test('groups preserve chronological order when the same original line returns later',()=>{
 const model=buildJourney(fixture([{who:'A',text:'First',meant:['grip'],taken:['grip']},{who:'B',text:'First reply',heard:['grip'],meant:['steady'],taken:['steady']},{who:'B',text:'Second reply to A',heard:['grip'],meant:['guarded'],taken:['guarded']}]));
 const view=ledger(model,model.columns.length-1);
 assert.deepEqual(view.groups.map(g=>g.line),[1,2,1,3,null]);
 assert.deepEqual(view.groups.filter(g=>g.line===1).map(g=>g.sourceRole),['A','A']);
 assert.deepEqual(view.groups.flatMap(g=>Array.from({length:g.end-g.start+1},(_,i)=>g.start+i)),model.columns.map(c=>c.index));
 assert.equal(view.groups.at(-1).label,'Bridge');assert.equal(view.groups.at(-1).sourceRole,null);
});

test('revealed needs keep stable row indices, hide future evidence, and final properties imply no losses',()=>{
 const session=fixture([{who:'A',text:'First',meant:['grip'],taken:['grip']},{who:'B',text:'Future',meant:['guarded'],taken:['guarded']}]);session.outcome.has=['steady','sheltered'];
 const model=buildJourney(session),early=ledgerFrame(model,{index:1,current:model.columns.at(-1),lanes:model.lanes});
 assert.deepEqual(early.needs,['grip']);assert.ok(early.events.every(e=>e.columnIndex<=1));assert.equal(early.current.index,1);
 let prior=[];for(let index=0;index<model.columns.length;index++){const view=ledger(model,index);assert.deepEqual(view.needs.slice(0,prior.length),prior);prior=view.needs;}
 const final=at(ledger(model,model.columns.length-1),model.columns.length-1);
 assert.deepEqual(final.map(e=>[e.key,e.status]),[['water','setting'],['steady','built'],['sheltered','built']]);assert.ok(final.every(e=>e.sourceIndex===null&&e.sourceEntry===null));
 const empty=ledger(model,-1);assert.equal(empty.current,null);assert.deepEqual(empty.needs,[]);assert.deepEqual(empty.events,[]);assert.equal(empty.groups.length,3);
});

test('all 160 archived runs preserve target records and independently justified handoff changes without mutation',()=>{
 assert.equal(archive.sessions.length,160);
 for(const session of archive.sessions){const before=JSON.stringify(session),model=freeze(buildJourney(session)),initial=ledger(model,0);let rows=[];
  for(let index=0;index<model.columns.length;index++){
   const frame=journeyFrame(model,index),view=ledgerFrame(model,frame);assert.equal(view.index,index);assert.equal(view.current,model.columns[index]);assert.deepEqual(view.columns,frame.columns);assert.deepEqual(view.needs,frame.lanes);assert.deepEqual(view.needs.slice(0,rows.length),rows);rows=view.needs;
   const cellIds=view.events.map(e=>`${e.columnIndex}:${e.key}`);assert.equal(new Set(cellIds).size,cellIds.length);
   for(const c of frame.columns){const events=at(view,c.index),recorded=events.filter(e=>e.entry).map(e=>e.key);assert.deepEqual(new Set(recorded),new Set(c.keys.map(e=>e.key)));
    for(const event of events){assert.ok(view.needs.includes(event.key));if(event.entry)assert.ok(c.keys.includes(event.entry));
     if(event.sourceIndex!==null){assert.ok(event.sourceIndex<c.index);assert.ok(c.sources.includes(event.sourceIndex));const source=model.columns[event.sourceIndex];assert.equal(source.kind,'meant');assert.ok(!c.unknownSource);if(event.sourceEntry)assert.ok(source.keys.includes(event.sourceEntry));}
     if(event.status==='missing'){assert.equal(event.entry,null);assert.ok(event.sourceEntry);assert.ok(!c.keys.some(e=>e.key===event.key));}
     if(event.status==='added'){assert.equal(event.sourceEntry,null);assert.ok(event.entry);assert.ok(!model.columns[event.sourceIndex].keys.some(e=>e.key===event.key));}
     if(event.status==='changed'){assert.equal(event.polarityKnown,true);assert.notEqual(event.entry.refused,event.sourceEntry.refused);}
     if(['expressed','reading','built','setting'].includes(event.status)){assert.equal(event.sourceIndex,null);assert.equal(event.sourceEntry,null);}
    }
   }
  }
  assert.deepEqual(ledger(model,0),initial);assert.equal(JSON.stringify(session),before);
 }
});
