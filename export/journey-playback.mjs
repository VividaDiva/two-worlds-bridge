import {recipients} from './flow-model.mjs';

const isHuman=turn=>turn?.who==='A'||turn?.who==='B';
const list=value=>Array.isArray(value)?value.filter(key=>typeof key==='string'&&key.length):[];
const coded=(keys,refuses=[])=>{
 const denied=new Set(list(refuses));
 return [...new Set([...list(keys),...denied])].map(key=>({key,refused:denied.has(key)}));
};
const token=entry=>JSON.stringify([entry.key,entry.refused]);

// These are recorded key correspondences, not proof of causal influence or of
// active requirements in the builder. Equal `at` values are staged display steps
// from one observed turn; they are not additional model calls.
export function buildJourney(session){
 const transcript=session.transcript||[],columns=[],lanes=[],meantByTurn=new Map(),aiColumns=[];
 let line=0;
 const add=column=>{const result={index:columns.length,...column};columns.push(result);for(const entry of result.keys)if(!lanes.includes(entry.key))lanes.push(entry.key);return result.index;};
 for(let i=0;i<transcript.length;i++){
  const turn=transcript[i];if(!isHuman(turn))continue;line++;
  const heard=coded(turn.heard).map(entry=>({...entry,refused:null}));
  if(heard.length){
   let sourceTurnIndex=null;
   // A listener's recorded reading concerns the last other-person message it
   // could actually receive, even if the listener has since spoken twice.
   for(let j=i-1;j>=0;j--){const previous=transcript[j];if(isHuman(previous)&&previous.who!==turn.who&&previous.text&&recipients(session,previous).includes(turn.who)){sourceTurnIndex=j;break;}}
   const sourceIndex=sourceTurnIndex===null?undefined:meantByTurn.get(sourceTurnIndex),source=sourceIndex===undefined?null:columns[sourceIndex];
   add({kind:'heard',role:turn.who,line:source?.line??line,contextLine:line,at:i,keys:heard,sources:source?[source.index]:[],sourceTurnIndex,contextTurnIndex:i,text:source?.text||'',contextText:turn.text||'',unknownSource:!source,polarityKnown:false});
  }
  const meant=add({kind:'meant',role:turn.who,line,at:i,keys:coded(turn.meant,turn.meantRefuses),sources:[],sourceTurnIndex:i,contextTurnIndex:i,text:turn.text||'',contextText:turn.text||''});
  meantByTurn.set(i,meant);
  if(!turn.unread&&recipients(session,turn).includes('M'))aiColumns.push(add({kind:'ai',role:'M',line,at:i,keys:coded(turn.taken,turn.takenRefuses),sources:[meant],sourceTurnIndex:i,contextTurnIndex:i,text:turn.text||'',contextText:turn.text||''}));
 }
 if(session.outcome){
  const world=session.outcome.world||{},terrain=['water','rock'].filter(key=>world[key]);
  const keys=coded([...terrain,...list(session.outcome.has)]).map(entry=>({...entry,world:terrain.includes(entry.key)}));
  add({kind:'built',role:'M',line:null,at:Math.max(0,transcript.length-1),keys,sources:aiColumns,sourceTurnIndex:null,contextTurnIndex:transcript.length?transcript.length-1:null,text:session.outcome.name||'',contextText:session.outcome.name||''});
 }
 return {columns,lanes};
}

export function journeyFrame(model,index){
 const requested=Number(index),end=Number.isFinite(requested)?Math.max(-1,Math.min(model.columns.length-1,Math.trunc(requested))):-1;
 const columns=model.columns.slice(0,end+1),links=[],drops=[],added=[];
 for(const column of columns){
  const sources=column.sources.filter(i=>i<column.index&&i<=end).map(i=>model.columns[i]);
  if(column.kind==='built'){
   // A matching past extraction is only an output correspondence. Terrain is
   // supplied context, and neither absent nor novel output keys prove a miss.
   for(const entry of column.keys){if(entry.world)continue;const source=[...sources].reverse().find(source=>source.kind==='ai'&&source.keys.some(key=>token(key)===token(entry)));if(source)links.push({from:source.index,to:column.index,key:entry.key,refused:entry.refused,kind:'output'});}
   continue;
  }
  if(!['ai','heard'].includes(column.kind)||column.unknownSource||!sources.length)continue;
  // Listener readings record keys but no stance. Their correspondences cannot
  // establish agreement with a request or refusal; only key absence is known.
  const polarityKnown=column.kind!=='heard',match=polarityKnown?token:entry=>entry.key;
  const targetKeys=new Set(column.keys.map(match)),sourceKeys=new Set(sources.flatMap(source=>source.keys.map(match)));
  for(const source of sources)for(const entry of source.keys){
   if(targetKeys.has(match(entry)))links.push({from:source.index,to:column.index,key:entry.key,refused:polarityKnown?entry.refused:null,kind:'handoff',...(!polarityKnown?{polarityKnown:false}:{})});
   else drops.push({from:source.index,to:column.index,key:entry.key,refused:entry.refused});
  }
  for(const entry of column.keys)if(!sourceKeys.has(match(entry)))added.push({at:column.index,key:entry.key,refused:entry.refused});
 }
 const observed=new Set(columns.flatMap(column=>column.keys.map(entry=>entry.key)));
 return {index:end,current:columns.at(-1)||null,columns,visibleIndices:columns.map(column=>column.index),lanes:model.lanes.filter(key=>observed.has(key)),links,drops,added,done:columns.at(-1)?.kind==='built'};
}
