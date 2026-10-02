// GitHub Pages serves the UI; this adapter discovers the current study API.
// Read requests may reconnect to a new address. Submissions are never blindly retried.
(()=>{
 let base='',cloudFetch=null;
 async function discover(){
  const r=await fetch(new URL('live.json?ts='+Date.now(),location.href),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('The study server address is unavailable.');
  const data=await r.json(),u=new URL(data.url==='same-origin'?location.origin:data.url);
  if(u.protocol!=='https:'||!(u.hostname.endsWith('.trycloudflare.com')||u.hostname.endsWith('.vercel.app')||u.origin===location.origin))throw Error('The study server address is invalid.');
  base=u.origin;cloudFetch=data.transport==='blob-chunks-v1'?window.bridgeCloudTransport.create(base):null;
 }
 const ready=discover();
 window.bridgeFeedbackConnection={ready,url:path=>new URL(path,base+'/').href,async fetch(path,options={}){
  await ready;const method=(options.method||'GET').toUpperCase();
  if(method==='POST')await discover();
  if(cloudFetch)return cloudFetch(path,options);
  const send=()=>fetch(new URL(path,base+'/'),{...options,mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(method==='POST'?60000:20000)});
  // Retry only reads: a dropped POST may already have saved feedback.
  const attempts=method==='GET'?3:1;
  for(let attempt=0;attempt<attempts;attempt++){
   try{const r=await send();if(r.status>=500&&method==='GET')throw Error('Study server unavailable');return r;}
   catch(e){if(attempt+1<attempts){await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));try{await discover();}catch{}continue;}
    throw Error(method==='POST'?'The submission could not be confirmed. Your edits are still on this page.':'Unable to connect to the study server. Please try again, or ask the facilitator to check the connection.');}
  }
 }};
})();
