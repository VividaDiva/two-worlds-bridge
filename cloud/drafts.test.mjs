import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import * as protocol from './protocol.mjs';
const source=fs.readFileSync(new URL('../api/cloud.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
test('cloud drafts preserve exact data, resist stale writes, retry idempotently and remain separate from submissions',async()=>{
 const objects=new Map([['snapshot/state/qatest.json',Buffer.from('{}')],['snapshot/export/qatest.json',Buffer.from('{}')]]);
 const c=vm.createContext({...protocol,Buffer,Response,URL,process:{env:{}},console,timingSafeEqual:()=>false,get:async key=>objects.has(key)?{stream:new Response(objects.get(key)).body}:null,put:async(key,bytes)=>{if(objects.has(key))throw Error('exists');objects.set(key,bytes);},list:async({prefix})=>({blobs:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(pathname=>({pathname}))})});vm.runInContext(source,c);
 const call=async(method,route,body={})=>{const req={method,url:'/api/'+route+'?room=qatest',headers:{},body},res={setHeader(){},end(s){this.body=JSON.parse(s);}};await c.handler(req,res);return res;};
 const draft={role:'B',respondentId:'12345678-1234-4123-8123-123456789abc',source:{},ratings:{a:'veryRed'},added:[{x1:1}],strokes:[],annotations:[{text:'in progress'}],overallScores:[-2,2,0]},id='12345678-1234-4123-8123-123456789abd';
 const current=await call('POST','drafts',{room:'qatest',id,revision:2,draft});assert.equal(current.statusCode,200);assert.deepEqual(current.body.record.draft,draft);
 await call('POST','drafts',{room:'qatest',id,revision:1,draft:{...draft,ratings:{}}});assert.equal((await call('GET','drafts')).body.records[0].revision,2);
 assert.equal((await call('POST','drafts',{room:'qatest',id,revision:2,draft})).statusCode,200);
 assert.equal((await call('POST','drafts',{room:'qatest',id,revision:2,draft:{...draft,ratings:{}}})).statusCode,409);
 assert.equal((await call('GET','feedback')).body.records.length,0);
 assert.equal([...objects.keys()].filter(k=>k.startsWith('feedback-drafts/')).length,2);
});
