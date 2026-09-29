import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('./feedback.js',import.meta.url),'utf8');
test('Toolkit path list excludes control, empty and mistaken archived runs; deduplicates per scenario',()=>{
 const c=vm.createContext({routeOrder:['all','confer','both','chain','via-1','via-2','only-1','only-2']});vm.runInContext(source.slice(source.indexOf('function feedbackPaths('),source.indexOf('function completedSummary(')),c);
 const sessions=[{room:'wrong',agent:'toolkit',argument:'pairs',route:'all',hasContent:true,historical:true},{room:'control',agent:'keys',argument:'pairs',route:'all',hasContent:true},{room:'empty',agent:'toolkit',argument:'refs',route:'all',hasContent:false},{room:'both',agent:'toolkit',argument:'pairs',route:'both',hasContent:true},{room:'all',agent:'toolkit',argument:'pairs',route:'all',hasContent:true},{room:'dupe',agent:'toolkit',argument:'pairs',route:'all',hasContent:true},{room:'refs',agent:'toolkit',argument:'refs',route:'all',hasContent:true}];
 c.sessions=sessions;assert.equal(vm.runInContext('feedbackPaths(sessions).map(x=>x.room).join(",")',c),'all,both,refs');
});
