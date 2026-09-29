// GitHub Pages serves the UI; this adapter discovers the current study API.
// Read requests may reconnect to a new address. Submissions are never blindly retried.
(()=>{
 let base='';
 async function discover(){
  const r=await fetch(new URL('live.json?ts='+Date.now(),location.href),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('The study server address is unavailable.');
  const data=await r.json(),u=new URL(data.url);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.trycloudflare.com'))throw Error('The study server address is invalid.');
  base=u.origin;
 }
 const ready=discover();
 window.bridgeFeedbackConnection={ready,url:path=>new URL(path,base+'/').href,async fetch(path,options={}){
  await ready;const method=(options.method||'GET').toUpperCase();
  if(method==='POST')await discover();
  const send=()=>fetch(new URL(path,base+'/'),{...options,mode:'cors',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(method==='POST'?60000:20000)});
  try{const r=await send();if(r.status>=500&&method==='GET')throw Error('Study server unavailable');return r;}
  catch(e){if(method==='GET'){const previous=base;try{await discover();if(base!==previous)return await send();}catch{}}throw Error(method==='POST'?'The submission could not be confirmed. Your edits are still on this page.':'Unable to connect to the study server. It may be offline or unreachable from this network.');}
 }};
})();
