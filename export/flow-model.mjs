export const PATHS={all:'Discuss together',confer:'Discuss privately',both:'Tell AI separately',chain:'Person relays','via-1':'AI relays 1 → 2','via-2':'AI relays 2 → 1','only-1':'Role 1 only','only-2':'Role 2 only'};
export const SCENARIOS={places:'Two structures',loads:'Two loads',agreed:'The same aim',pairs:'Two lives',refs:'Two references'};
export function recipients(session,turn){if(turn.who==='machine')return ['A','B'].filter(r=>session.see?.[r]?.echo);const other=turn.who==='A'?'B':'A',out=[];if(session.see?.[other]?.hears)out.push(other);if(turn.phase!=='confer'&&!(session.path==='chain'&&turn.who==='A'))out.push('M');return out;}
export function selectSession(data,hash){const p=new URLSearchParams(hash.replace(/^#/,''));return data.sessions.find(s=>s.path===p.get('path')&&s.scenario===p.get('scen')&&String(s.pair)===p.get('pair'))||data.sessions[0];}
export function needState(session,index){const voiced=new Set(),heard=new Set();session.transcript.slice(0,index+1).forEach(t=>{if(t.who==='machine')return;(t.meant||[]).forEach(n=>voiced.add(t.who+':'+n));if(recipients(session,t).includes('M'))(t.taken||[]).forEach(n=>heard.add(t.who+':'+n));});return {voiced,heard,done:index===session.transcript.length-1};}

// Keep the selected input distinct from each role's latest visible transcript
// entry. On a builder turn this is a previous input, not the full build context.
export function interpretationFrame(session,index){
 const roles={A:null,B:null};let lastReceived=null;
 const end=Math.min(index,session.transcript.length-1);
 for(let i=0;i<=end;i++){
  const turn=session.transcript[i];
  if(turn.who!=='A'&&turn.who!=='B')continue;
  const entry={turn,index:i};roles[turn.who]=entry;
  if(recipients(session,turn).includes('M'))lastReceived=entry;
 }
 const current=session.transcript[index];
 const selected=current&&(current.who==='A'||current.who==='B')?{turn:current,index}:current?.who==='machine'?lastReceived:null;
 return {sourceIndex:selected?.index??-1,source:selected?.turn??null,receivesAI:!!selected&&recipients(session,selected.turn).includes('M'),roles};
}
