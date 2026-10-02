// Cloud wire format keeps requests and responses below Vercel's payload limit.
// The UI still receives the same verified PNG data URLs as the local server.
(()=>{
 const nativeFetch=window.fetch.bind(window);
 const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const dataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
 function create(base){
  const send=async(path,options={})=>{let error;for(let i=0;i<3;i++){try{const r=await nativeFetch(new URL(path,base),{...options,credentials:'omit',mode:'cors',cache:'no-store',signal:AbortSignal.timeout(60000)});if(r.status>=500)throw Error('Cloud temporarily unavailable');return r;}catch(e){error=e;if(i<2)await new Promise(r=>setTimeout(r,500*(i+1)));}}throw error;};
  async function imageIn(m){if(!m||typeof m==='string')return m;if(m.kind!=='bridge-image-v1')throw Error('Unknown image format');const bytes=[];for(const h of m.parts){const r=await send('/api/chunk?hash='+h);if(!r.ok)throw Error('Saved image is unavailable');const b=await r.arrayBuffer();if(await sha(b)!==h)throw Error('Image checksum mismatch');bytes.push(b);}const blob=new Blob(bytes,{type:'image/png'});if(blob.size!==m.bytes||await sha(await blob.arrayBuffer())!==m.sha256)throw Error('Saved image did not match receipt');return dataURL(blob);}
  async function hydrate(rec){if(rec?.images)rec.images=await Promise.all(rec.images.map(imageIn));return rec;}
  return async(path,options={})=>{
   const url=new URL(path,base),method=(options.method||'GET').toUpperCase();
   if(url.pathname==='/api/feedback'&&method==='POST'){
    const payload=JSON.parse(options.body),images=[];
    for(const src of payload.images){if(!src){images.push(null);continue;}const b=await (await nativeFetch(src)).arrayBuffer();const parts=[];
     for(let start=0;start<b.byteLength;start+=750000){const chunk=b.slice(start,start+750000),h=await sha(chunk);const encoded=(await dataURL(new Blob([chunk]))).split(',')[1];const r=await send('/api/chunk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:payload.room,respondentId:payload.draft.respondentId,submissionId:payload.submissionId,hash:h,data:encoded})});if(!r.ok)throw Error('Image upload failed. Please retry.');parts.push(h);}
     images.push({kind:'bridge-image-v1',bytes:b.byteLength,sha256:await sha(b),parts});
    }
    return send('/api/feedback',{...options,body:JSON.stringify({...payload,images})});
   }
   const r=await send(path,options);
   if(r.ok&&method==='GET'&&((url.pathname==='/api/feedback'&&!url.searchParams.has('summary'))||(url.pathname==='/api/export'&&url.searchParams.get('format')==='json'))){const data=await r.json();if(data.records)data.records=await Promise.all(data.records.map(hydrate));if(data.feedback)data.feedback=await Promise.all(data.feedback.map(hydrate));return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});}
   return r;
  };
 }
 window.bridgeCloudTransport={create};
})();
