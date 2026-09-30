import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('./feedback.js',import.meta.url),'utf8');
test('Both conditions keep distinct paths and historical Control, excluding paused Two references, empty and mistaken Toolkit runs',()=>{
 const c=vm.createContext({routeOrder:['all','confer','both','chain','via-1','via-2','only-1','only-2']});vm.runInContext(source.slice(source.indexOf('function feedbackPaths('),source.indexOf('function completedSummary(')),c);
 const sessions=[{room:'wrong',agent:'toolkit',argument:'pairs',route:'all',hasContent:true,historical:true},{room:'control',historical:true,agent:'keys',argument:'pairs',route:'all',hasContent:true},{room:'empty',agent:'toolkit',argument:'refs',route:'all',hasContent:false},{room:'both',agent:'toolkit',argument:'pairs',route:'both',hasContent:true},{room:'all',agent:'toolkit',argument:'pairs',route:'all',hasContent:true},{room:'dupe',agent:'toolkit',argument:'pairs',route:'all',hasContent:true},{room:'refs-control',agent:'keys',argument:'refs',route:'all',hasContent:true},{room:'refs',agent:'toolkit',argument:'refs',route:'all',hasContent:true}];
 c.sessions=sessions;assert.equal(vm.runInContext('feedbackPaths(sessions).map(x=>x.room).join(",")',c),'control,all,both');
});

test('replayed Control source wins over duplicate runs without collapsing conditions',()=>{
 const c=vm.createContext({routeOrder:['all']});vm.runInContext(source.slice(source.indexOf('function feedbackPaths('),source.indexOf('function completedSummary(')),c);
 c.sessions=[{room:'other',agent:'keys',argument:'pairs',route:'all',hasContent:true},{room:'original',agent:'keys',argument:'pairs',route:'all',hasContent:true,historical:true},{room:'replay',agent:'toolkit',argument:'pairs',route:'all',hasContent:true,replay:{sourceRoom:'original'}}];
 assert.equal(vm.runInContext('feedbackPaths(sessions).map(x=>x.room).join(",")',c),'original,replay');
});


test('shared room progress counts only this browser receipts, never another participant or legacy records',()=>{
 const c=vm.createContext({respondentId:'browser-a',ownReceipts:new Set(['own-receipt'])});
 vm.runInContext(source.slice(source.indexOf('function completedSummary('),source.indexOf('function renderPaths(')),c);
 c.summaries=[{id:'legacy',role:'B',complete:true},{id:'other',respondentId:'browser-b',role:'B',complete:true},{id:'own-receipt',role:'B',complete:true}];
 assert.equal(vm.runInContext('summaries.filter(completedSummary).length',c),1);
 c.ownReceipts=new Set();assert.equal(vm.runInContext('summaries.some(completedSummary)',c),false);
});

test('browser identity and confirmed receipts survive reopening; separate storage starts clean',()=>{
 const memory=new Map();let serial=0;
 function open(storage){const c=vm.createContext({localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:{randomUUID:()=>`browser-${++serial}`}});vm.runInContext(source.slice(source.indexOf("const identityKey="),source.indexOf('const colors=')),c);return c;}
 const first=open(memory);vm.runInContext("rememberReceipt('saved-a')",first);
 const reopened=open(memory);assert.equal(vm.runInContext("ownFeedback({id:'saved-a'})",reopened),true);
 const other=open(new Map());assert.equal(vm.runInContext("ownFeedback({id:'saved-a'})",other),false);
 assert.equal(vm.runInContext("ownFeedback({id:'legacy',draft:{role:'B'}})",reopened),false);
});
