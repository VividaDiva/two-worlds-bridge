import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {feedbackHandler} from './feedback.mjs';
test('feedback appends immutable records, preserves source and separates participants',async()=>{
 const sessions=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-feedback-test-'));
 const room={argument:'pairs',route:'all',agent:'keys',transcript:[{text:'original'}]};const before=JSON.stringify(room);
 const rooms=new Map([['abc',room]]);let out,code;
 const run=async(method,data)=>feedbackHandler({req:{method},res:{},url:new URL('http://local/api/feedback?room=abc'),here:'.',sessions,rooms,body:async()=>data,json:(_r,c,d)=>{code=c;out=d;}});
 try{const draft={role:'A',source:{shape:{hand:'rail'}},ratings:{0:'red'},added:[{x1:0,y1:0,x2:100,y2:0}],strokes:[]};
 await run('POST',{room:'abc',draft,images:[null,null,null]});assert.equal(code,200);const first=out.id;
 await run('POST',{room:'abc',draft:{...draft,role:'B'},images:[null,null,null]});assert.notEqual(out.id,first);
 await run('GET');assert.equal(out.records.length,2);assert.equal(out.records.find(x=>x.id===first).draft.ratings[0],'red');assert.equal(JSON.stringify(room),before);
 await run('POST',{room:'../oops',draft,images:[]});assert.equal(code,404);
 await run('POST',{room:'abc',draft,images:['https://external.test',null,null]});assert.equal(code,400);
 }finally{fs.rmSync(sessions,{recursive:true,force:true});}
});
