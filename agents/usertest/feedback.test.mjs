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

test('all images and rating geometry are retrieved exactly from disk by room and role',async()=>{
 const sessions=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-receipt-'));
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 const rooms=new Map([['control',{argument:'pairs',route:'both',agent:'keys'}],['toolkit',{argument:'pairs',route:'both',agent:'toolkit'}]]);
 const run=async(method,room,data)=>{let code,out;await feedbackHandler({req:{method},res:{},url:new URL('http://local/api/feedback?room='+room),here:'.',sessions,rooms:new Map(rooms),body:async()=>data,json:(_r,c,d)=>{code=c;out=d;}});return {code,out};};
 try{for(const room of rooms.keys())for(const role of ['A','B']){
  const draft={role,source:{agent:rooms.get(room).agent},ratings:{'1':'red','2':'blue'},removed:['1'],added:[{x1:50,y1:50,x2:150,y2:50}],strokes:[{color:'blue',width:22,points:[{x:1,y:2},{x:3,y:4}]}],notes:['rating','rebuild','sketch']};
  const images=[image,image,image];const saved=await run('POST',room,{room,draft,images});assert.equal(saved.code,200);assert.equal(saved.out.imagesReceived,3);
  const fetched=await run('GET',room);const record=fetched.out.records.find(r=>r.id===saved.out.id);assert.deepEqual(record.draft,draft);assert.deepEqual(record.images,images);assert.equal(record.agent,rooms.get(room).agent);assert.equal(record.route,'both');
 }
 assert.equal((await run('GET','control')).out.records.length,2);assert.equal((await run('GET','toolkit')).out.records.length,2);
 }finally{fs.rmSync(sessions,{recursive:true,force:true});}
});

test('disk errors return a failure receipt rather than reporting a successful submission',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-failure-'));const sessions=path.join(temp,'not-a-directory');fs.writeFileSync(sessions,'test');let code;
 try{await feedbackHandler({req:{method:'POST'},res:{},url:new URL('http://local/api/feedback'),here:'.',sessions,rooms:new Map([['abc',{}]]),body:async()=>({room:'abc',draft:{role:'A',source:{},added:[],strokes:[]},images:[null,null,null]}),json:(_r,c)=>{code=c;}});assert.equal(code,500);}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
