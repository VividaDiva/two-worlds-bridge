import fs from 'node:fs';import path from 'node:path';import {get,put} from '@vercel/blob';
const dir='agents/usertest/uploads';let count=0;
for(const file of fs.readdirSync(dir).filter(x=>!x.includes('-sketch-'))){const full=path.join(dir,file);if(!fs.statSync(full).isFile())continue;const bytes=fs.readFileSync(full),key='snapshot/reference-originals/'+file;const prior=await get(key,{access:'private',useCache:false});if(!prior)await put(key,bytes,{access:'private',addRandomSuffix:false,allowOverwrite:false});const r=await get(key,{access:'private',useCache:false});if(!r||!bytes.equals(Buffer.from(await new Response(r.stream).arrayBuffer())))throw Error('Reference copy differs: '+file);count++;}
console.log(JSON.stringify({referenceOriginals:count,verified:true}));
