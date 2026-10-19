import {createHash} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export const roomId=s=>typeof s==='string'&&/^[a-z0-9]{3,20}$/.test(s);
export function imageManifest(m){return m===null||(m&&m.kind==='bridge-image-v1'&&Number.isInteger(m.bytes)&&m.bytes>0&&m.bytes<=12000000&&/^[a-f0-9]{64}$/.test(m.sha256)&&Array.isArray(m.parts)&&m.parts.length>0&&m.parts.length<=24&&m.parts.every(x=>/^[a-f0-9]{64}$/.test(x)));}
export function validDraft(d){return d&&['A','B'].includes(d.role)&&d.source&&(d.overallScores===undefined||(Array.isArray(d.overallScores)&&d.overallScores.length===3&&d.overallScores.every(v=>v===null||v==='cannot-judge'||Number.isInteger(v)&&v>=-3&&v<=3)))&&Array.isArray(d.added)&&Array.isArray(d.strokes)&&JSON.stringify(d).length<1200000;}
export async function verifyImage(m,read){if(m===null)return; if(!imageManifest(m))throw Error('Invalid image manifest');const chunks=await Promise.all(m.parts.map(async h=>{const b=await read(h);if(!b||hash(b)!==h)throw Error('Image chunk is missing or damaged');return b;}));const b=Buffer.concat(chunks);if(b.length!==m.bytes||hash(b)!==m.sha256||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Image verification failed');}

export function feedbackCompletionIssue(d){
 const colors=['veryRed','red','neutral','blue','veryBlue','some'];
 if(!Object.values(d.ratings||{}).some(v=>colors.includes(v)))return {step:0,message:'Step 1: choose a rating color and apply it to at least one stick.'};
 if(!(d.removed||d.rebuildRemoved||[]).length&&!(d.added||[]).some(s=>[s.x1,s.y1,s.x2,s.y2].every(Number.isFinite)&&(s.x1!==s.x2||s.y1!==s.y2)))return {step:1,message:'Step 2: remove at least one original stick or add at least one blue stick.'};
 if(!(d.annotations||[]).some(a=>typeof a.text==='string'&&a.text.trim()&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&['red','neutral','some','blue'].includes(a.color)))return {step:2,message:'Step 3: place a colored comment on the sketch and write your reason.'};
 return null;
}
