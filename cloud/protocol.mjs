import {createHash} from 'node:crypto';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
export const roomId=s=>typeof s==='string'&&/^[a-z0-9]{3,20}$/.test(s);
export function imageManifest(m){return m===null||(m&&m.kind==='bridge-image-v1'&&Number.isInteger(m.bytes)&&m.bytes>0&&m.bytes<=12000000&&/^[a-f0-9]{64}$/.test(m.sha256)&&Array.isArray(m.parts)&&m.parts.length>0&&m.parts.length<=24&&m.parts.every(x=>/^[a-f0-9]{64}$/.test(x)));}
export function validDraft(d){return d&&['A','B'].includes(d.role)&&d.source&&Array.isArray(d.added)&&Array.isArray(d.strokes)&&JSON.stringify(d).length<1200000;}
export async function verifyImage(m,read){if(m===null)return; if(!imageManifest(m))throw Error('Invalid image manifest');const chunks=await Promise.all(m.parts.map(async h=>{const b=await read(h);if(!b||hash(b)!==h)throw Error('Image chunk is missing or damaged');return b;}));const b=Buffer.concat(chunks);if(b.length!==m.bytes||hash(b)!==m.sha256||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Image verification failed');}
