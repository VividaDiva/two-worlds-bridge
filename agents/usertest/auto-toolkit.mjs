import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const REPLAY_EXCLUDED_ROUTES = new Set(['via-1','via-2']);

// Only human input crosses conditions. Interpretation, keys and AI replies never do.
export function replaySnapshot(room) {
  const transcript=room.transcript||[];
  if(REPLAY_EXCLUDED_ROUTES.has(room.route)) return null;
  if(room.agent!=='keys'||!room.autoReplayEnabled||room.thinking||!room.standing) return null;
  const lastHuman=transcript.findLastIndex(e=>['A','B'].includes(e.who));
  const lastBuild=transcript.findLastIndex(e=>e.who==='builder'&&e.built&&!e.failed&&!e.relay&&!e.clarification&&!e.understandingUpdate);
  if(lastHuman<0||lastBuild<lastHuman||transcript.some(e=>e.upload)) return null;
  const lines=transcript.flatMap((e,i)=>['A','B'].includes(e.who)?[{who:e.who,text:e.text,phase:e.phase,at:e.at,sourceIndex:i,...Object.fromEntries(['talk','decision','corrected','part','replyTo'].filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))}]:[]);
  const input={source:room.id,argument:room.argument,route:room.route,lines};
  return {...input,hash:createHash('sha256').update(JSON.stringify(input)).digest('hex')};
}

// Durable queue, one generation at a time. Failure is visible and requires an
// explicit retry, preventing unbounded model charges. A new revision is a new room.
export function createAutoToolkit({file,execute,onChange=()=>{},delay=2500}) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const jobs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  let busy=false,timer;
  const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(jobs,null,2));fs.renameSync(file+'.tmp',file)};
  for(const j of jobs){if(REPLAY_EXCLUDED_ROUTES.has(j.route)&&['queued','running','sketching'].includes(j.status)){j.status='excluded';continue;}if(['running','sketching'].includes(j.status)){j.status='queued';j.restarted=true;}}
  save();
  const publicJob=j=>j?Object.fromEntries(['id','source','target','status','error','createdAt','updatedAt','route','progress','total','restarted'].map(k=>[k,j[k]])):null;
  const changed=j=>{j.updatedAt=new Date().toISOString();save();onChange(j.source,publicJob(j));};
  const arm=()=>{clearTimeout(timer);timer=setTimeout(drain,delay);timer.unref?.()};
  async function drain(){if(busy)return;const j=jobs.find(x=>x.status==='queued');if(!j)return;busy=true;j.status='running';changed(j);
    try{await execute(j,patch=>{Object.assign(j,patch);changed(j)});j.status='complete';j.error=null;}catch(e){j.status='failed';j.error=String(e.message||e);}finally{changed(j);busy=false;arm()}}
  return {
    observe(room){const snapshot=replaySnapshot(room);if(!snapshot)return; if(jobs.some(j=>j.id===snapshot.hash))return;
      const j={...snapshot,id:snapshot.hash,status:'queued',createdAt:new Date().toISOString(),total:snapshot.lines.length,progress:0};jobs.push(j);changed(j);arm();},
    latest(source){return publicJob(jobs.filter(j=>j.source===source).at(-1))},
    retry(source){const j=jobs.filter(j=>j.source===source).at(-1);if(!j||REPLAY_EXCLUDED_ROUTES.has(j.route)||j.status!=='failed')throw Error('No failed replay to retry');j.status='queued';j.error=null;changed(j);arm();return publicJob(j)},
    start(){arm()},close(){clearTimeout(timer)},
    async flush(){clearTimeout(timer);await drain();clearTimeout(timer)}
  };
}
