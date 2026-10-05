import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./feedback.js',import.meta.url),'utf8');
function harness(){const ctx=vm.createContext({draft:{ratings:{},added:[],strokes:[]},undo:[[],[],[]],redo:[[],[],[]],step:0,beforeAction:null,pointer:null,original:false,preview:null,hover:null,fields:['ratings','added','strokes'],clone:x=>JSON.parse(JSON.stringify(x)),localSave(){},render(){},status(){}});vm.runInContext(source.slice(source.indexOf('function beginAction()'),source.indexOf('function distance')),ctx);return ctx;}
test('undo and redo restore a whole gesture; no-op keeps redo, new edit clears it',()=>{const c=harness();vm.runInContext("beginAction();draft.ratings={a:'red',b:'blue'};commitAction('ratings');historyAction('undo');",c);assert.equal(Object.keys(c.draft.ratings).length,0);assert.equal(c.redo[0].length,1);vm.runInContext("beginAction();commitAction('empty click');",c);assert.equal(c.redo[0].length,1);vm.runInContext("historyAction('redo');",c);assert.equal(c.draft.ratings.b,'blue');vm.runInContext("historyAction('undo');beginAction();draft.ratings.c='neutral';commitAction('new rating');",c);assert.equal(c.redo[0].length,0);});
test('undo history is isolated per step; redo rebuild does not alter ratings',()=>{const c=harness();vm.runInContext("beginAction();draft.ratings.a='red';commitAction('rating');step=1;beginAction();draft.added.push({x1:50,y1:50,x2:150,y2:50});commitAction('placement');historyAction('undo');",c);assert.equal(c.draft.added.length,0);assert.equal(c.draft.ratings.a,'red');vm.runInContext("historyAction('redo');",c);assert.equal(c.draft.added.length,1);vm.runInContext("step=0;historyAction('undo');",c);assert.equal(c.draft.added.length,1);assert.equal(Object.keys(c.draft.ratings).length,0);});
test('grid pieces snap to intersections, rotate and cannot extend outside the canvas',()=>{const c=vm.createContext({orientation:'horizontal',pieceLength:100,pieces:{horizontal:[1,0],vertical:[0,1],rising:[1,-1],falling:[1,1]}});vm.runInContext(source.slice(source.indexOf('function stamp('),source.indexOf('function paint(')),c);assert.equal(vm.runInContext('stamp({x:128,y:74}).x1',c),150);assert.equal(vm.runInContext('stamp({x:1199,y:100})',c),null);vm.runInContext("orientation='rising'",c);assert.equal(vm.runInContext('stamp({x:100,y:50})',c),null);assert.equal(vm.runInContext('stamp({x:100,y:150}).y2',c),50);});

test('removing and restoring originals preserves ratings and is undoable with added sticks',()=>{const c=harness();vm.runInContext("draft.ratings={a:'blue',b:'red'};step=1;beginAction();draft.rebuildRemoved=['a'];commitAction('remove');historyAction('undo');",c);assert.equal(c.draft.rebuildRemoved.length,0);assert.equal(c.draft.ratings.a,'blue');vm.runInContext("historyAction('redo');beginAction();draft.rebuildRestored=['b'];commitAction('restore');historyAction('undo');",c);assert.equal(c.draft.rebuildRemoved[0],'a');assert.equal(c.draft.rebuildRestored.length,0);assert.equal(c.draft.ratings.b,'red');});
test('rebuild removals depend only on explicit choices, never rating colors',()=>{const c=vm.createContext({draft:{ratings:{a:'red',b:'blue',c:'red'},rebuildRemoved:['b'],rebuildRestored:['a']}});vm.runInContext(source.slice(source.indexOf('function removedIds()'),source.indexOf('const palette=')),c);assert.equal(vm.runInContext('removedIds().sort().join(",")',c),'b');vm.runInContext('draft.rebuildRemoved=[]',c);assert.equal(vm.runInContext('removedIds().length',c),0);});

test('comment edits and deletion undo as a unit without affecting bridge ratings',()=>{const c=harness();vm.runInContext("fields[2]='annotations';step=2;draft.annotations=[];draft.ratings={a:'blue'};beginAction();draft.annotations=[{id:'pin',x:120,y:240,color:'red',text:'Needs a railing'}];commitAction('comment');beginAction();draft.annotations[0].color='some';draft.annotations[0].text='Railing needs to be higher';commitAction('edit');historyAction('undo');",c);assert.equal(c.draft.annotations[0].text,'Needs a railing');assert.equal(c.draft.annotations[0].color,'red');vm.runInContext("historyAction('redo');beginAction();draft.annotations=[];commitAction('delete');historyAction('undo');",c);assert.equal(c.draft.annotations[0].text,'Railing needs to be higher');assert.equal(c.draft.ratings.a,'blue');});

test('empty stick ratings require an explicit opt-out; selected tools alone do not count',()=>{
 const c=vm.createContext({draft:{ratings:{}},color:'veryRed'});
 vm.runInContext(source.slice(source.indexOf('function allowRatingProgress()'),source.indexOf('function requireRatingProgress()')),c);
 assert.equal(vm.runInContext('allowRatingProgress()',c),false);
 vm.runInContext('draft.unratedConfirmed=true',c);assert.equal(vm.runInContext('allowRatingProgress()',c),true);
 vm.runInContext("draft.unratedConfirmed=false;draft.ratings.a='veryBlue'",c);assert.equal(vm.runInContext('allowRatingProgress()',c),true);
});

test('finishing a comment reads visible text even if the input event did not update the draft',()=>{
 const elements={'comment-text':{value:'A safe walkway is important'},'comment-color':{value:'blue'},'comment-bubble':{hidden:false}};
 const c=vm.createContext({draft:{annotations:[{id:'pin',text:'',color:'red'}]},commentEdit:{index:0,before:[]},undo:[[],[],[]],redo:[[],[],[]],step:2,clone:x=>JSON.parse(JSON.stringify(x)),$:id=>elements[id],localSave(){},render(){}});
 vm.runInContext(source.slice(source.indexOf('function finishComment('),source.indexOf('function positionComment(')),c);
 vm.runInContext('finishComment()',c);
 assert.equal(c.draft.annotations.length,1);assert.equal(c.draft.annotations[0].text,elements['comment-text'].value);assert.equal(c.draft.annotations[0].color,'blue');assert.equal(c.undo[2].length,1);
});

test('cloud confirmation rejects loss of any step, note, score or image',()=>{
 const c=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function sameSubmission('),source.indexOf('if(connection){try{await connection.ready;}')),c);
 const draft={role:'B',ratings:{a:'veryRed',b:'veryBlue'},removed:['c'],added:[{x1:0,y1:0,x2:50,y2:0}],annotations:[{text:'Keep railing',color:'blue'}],notes:['one','two','three'],overallScores:[-3,0,3]};
 const images=['rated PNG','rebuilt PNG','sketch PNG'];c.payload=draft;c.images=images;c.saved={draft:structuredClone(draft),images:[...images]};
 assert.equal(vm.runInContext('sameSubmission(saved,payload,images)',c),true);
 for(const field of ['ratings','removed','added','annotations','notes','overallScores']){c.saved={draft:structuredClone(draft),images:[...images]};delete c.saved.draft[field];assert.equal(vm.runInContext('sameSubmission(saved,payload,images)',c),false,field);}
 c.saved={draft:structuredClone(draft),images:[images[0],null,images[2]]};assert.equal(vm.runInContext('sameSubmission(saved,payload,images)',c),false);
});
test('unconfirmed submission retains full backup; failed storage still leaves downloadable memory copy',async()=>{
 const store=new Map(),pending=new Map();let fail=false;
 const c=vm.createContext({pendingCopies:pending,renderRecovery(){},recoveryStore:async(action,value)=>{if(fail)throw Error('quota');if(action==='put')store.set(value.submissionId,structuredClone(value));else store.delete(value);}});
 vm.runInContext(source.slice(source.indexOf('async function retainSubmission('),source.indexOf("recoveryStore('list').then")),c);
 const attempt={submissionId:'test',room:'qa',draft:{ratings:{a:'red'},annotations:[{text:'reason'}]},images:['one','two','three']};
 c.attempt=attempt;assert.equal(await vm.runInContext('retainSubmission(attempt)',c),true);assert.deepEqual(store.get('test'),attempt);assert.equal(pending.size,1);
 fail=true;await vm.runInContext("releaseSubmission('test')",c);assert.equal(pending.size,1);
 c.attempt={...attempt,submissionId:'quota-test'};assert.equal(await vm.runInContext('retainSubmission(attempt)',c),false);assert.equal(pending.size,2);
 fail=false;await vm.runInContext("releaseSubmission('test')",c);assert.equal(store.has('test'),false);assert.equal(pending.has('test'),false);
});
