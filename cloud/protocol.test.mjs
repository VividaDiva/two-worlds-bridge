import test from 'node:test';import assert from 'node:assert/strict';import {hash,imageManifest,verifyImage,validDraft,uuid} from './protocol.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test('chunked PNG roundtrips and damaged or missing chunks cannot confirm a save',async()=>{const parts=[png.subarray(0,35),png.subarray(35)],store=new Map(parts.map(p=>[hash(p),p]));const m={kind:'bridge-image-v1',bytes:png.length,sha256:hash(png),parts:[...store.keys()]};assert.equal(imageManifest(m),true);await verifyImage(m,async h=>store.get(h));await assert.rejects(()=>verifyImage({...m,bytes:1},async h=>store.get(h)));store.delete(m.parts[0]);await assert.rejects(()=>verifyImage(m,async h=>store.get(h)));});
test('rejects invalid upload shapes, non-PNG data and oversized images',async()=>{assert.equal(imageManifest({kind:'bridge-image-v1',bytes:13000000}),false);assert.equal(uuid('../data'),false);assert.equal(validDraft({role:'X'}),false);const b=Buffer.from('not an image'),h=hash(b);await assert.rejects(()=>verifyImage({kind:'bridge-image-v1',bytes:b.length,sha256:h,parts:[h]},async()=>b));});

test('overall feedback scores preserve zero and reject out-of-range values',async()=>{
 const {validDraft}=await import('./protocol.mjs');const d={role:'B',source:{},added:[],strokes:[]};
 assert.ok(validDraft({...d,overallScores:[-3,0,3]}));
 assert.ok(validDraft({...d,overallScores:[null,'cannot-judge',2]}));
 assert.ok(validDraft(d));
 assert.ok(!validDraft({...d,overallScores:[-4,0,3]}));
 assert.ok(!validDraft({...d,overallScores:[0,0,3.5]}));
});

test('all three actions are required, and undoing an action makes a submission incomplete',async()=>{
 const {feedbackCompletionIssue}=await import('./protocol.mjs');
 const d={ratings:{a:'veryBlue'},removed:[],added:[{x1:0,y1:0,x2:50,y2:0}],annotations:[{x:1,y:2,color:'red',text:'Needs a railing'}]};
 assert.equal(feedbackCompletionIssue(d),null);
 assert.equal(feedbackCompletionIssue({...d,ratings:{},unratedConfirmed:true}).step,0);
 assert.equal(feedbackCompletionIssue({...d,added:[]}).step,1);
 assert.equal(feedbackCompletionIssue({...d,added:[{x1:0,y1:0,x2:0,y2:0}]}).step,1);
 assert.equal(feedbackCompletionIssue({...d,added:[],removed:['a']}),null);
 assert.equal(feedbackCompletionIssue({...d,annotations:[]}).step,2);
 assert.equal(feedbackCompletionIssue({...d,annotations:[{x:1,y:2,color:'red',text:'  '}]}).step,2);
});
