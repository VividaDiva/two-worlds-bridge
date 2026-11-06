// Display labels for the fixed coding vocabulary, not paraphrases or quotations
// of an individual participant's words. Raw keys remain the stable identifiers.
export const KEY_NAMES=Object.freeze({
 water:'Water crossing',rock:'Gap crossing',minimal:'Minimal construction',
 low:'Level with the banks',open:'Open sides',light:'One-person load',heavy:'Heavy loads',
 guarded:'Hand support',steady:'Stability',exposed:'Exposed drop',sways:'Swaying',
 inGap:'Structure in the gap',high:'Raised crossing',many:'Lots of timber',
 grip:'Wet-weather grip',footed:'Firm bridge ends',sheltered:'Weather protection'
});

const knownStance=entry=>entry&&typeof entry.refused==='boolean';
function revealed(model,frame){
 const requested=Number(frame?.index);
 const end=Number.isFinite(requested)?Math.max(-1,Math.min(model.columns.length-1,Math.trunc(requested))):-1;
 return model.columns.slice(0,end+1);
}
function recordedRows(entries,side){
 return entries.map(entry=>({key:entry.key,source:side==='source'?entry:null,target:side==='target'?entry:null,status:'recorded',polarityKnown:Boolean(knownStance(entry))}));
}
function handoffRows(source,target){
 const sourceKeys=new Map(source.keys.map(entry=>[entry.key,entry]));
 const targetKeys=new Map(target.keys.map(entry=>[entry.key,entry]));
 return [...new Set([...sourceKeys.keys(),...targetKeys.keys()])].map(key=>{
  const from=sourceKeys.get(key)||null,to=targetKeys.get(key)||null;
  const polarityKnown=Boolean(knownStance(from)&&knownStance(to));
  const status=!from?'added':!to?'missing':polarityKnown&&from.refused!==to.refused?'changed':'retained';
  // Retained means the key appears on both sides. It does not establish stance
  // agreement when the listener's recorded stance is unknown.
  return {key,source:from,target:to,status,polarityKnown};
 });
}

export function exchangeFrame(model,frame){
 const columns=revealed(model,frame),current=columns.at(-1)||null,history={A:[],B:[]};
 // Preserve chronological observations, including repetitions and reversals.
 // This history is not a reconstruction of active requirements or AI memory.
 for(const column of columns){
  if(column.kind!=='ai')continue;
  const source=column.sources.filter(index=>index<column.index).map(index=>model.columns[index]).find(candidate=>candidate?.kind==='meant'&&['A','B'].includes(candidate.role));
  if(!source)continue;
  for(const entry of column.keys)history[source.role].push({key:entry.key,refused:entry.refused,columnIndex:column.index,sourceIndex:source.index,sourceTurnIndex:column.sourceTurnIndex});
 }
 const base={current,source:null,target:null,rows:[],history,historyKind:'recorded-extractions'};
 if(!current)return {...base,kind:'empty'};
 if(current.kind==='meant')return {...base,kind:'source',source:current,rows:recordedRows(current.keys,'source')};
 // Output properties remain recorded properties, even if a past extraction
 // shares the same key. World/terrain flags are retained on the target entry.
 if(current.kind==='built')return {...base,kind:'built',target:current,rows:recordedRows(current.keys,'target')};
 const source=current.unknownSource?null:current.sources.filter(index=>index<current.index).map(index=>model.columns[index]).find(candidate=>candidate?.kind==='meant')||null;
 if(!source)return {...base,kind:'reading',target:current,rows:recordedRows(current.keys,'target')};
 return {...base,kind:'handoff',source,target:current,rows:handoffRows(source,current)};
}

// This is a trace of observed occurrences of a key, not a claim that one
// occurrence caused the next. Unrevealed columns never enter the trace.
export function keywordTrace(model,frame,key){
 return revealed(model,frame).filter(column=>column.keys.some(entry=>entry.key===key)).map(column=>column.index);
}
