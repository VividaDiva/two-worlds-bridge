import {exchangeFrame} from './journey-exchange.mjs';

// The ledger records what each stage contains, and key differences across a
// verified expression→reading handoff. It does not reconstruct internal memory,
// infer human agreement, or score whether the final bridge satisfies a need.
function originRole(model,column){
 if(column.kind==='meant')return ['A','B'].includes(column.role)?column.role:null;
 if(column.kind==='built'||column.unknownSource)return null;
 const source=column.sources.filter(index=>index<column.index).map(index=>model.columns[index]).find(candidate=>candidate?.kind==='meant');
 return source&&['A','B'].includes(source.role)?source.role:null;
}

function columnGroups(model){
 const groups=[];
 for(const column of model.columns){
  const previous=model.columns[column.index-1],group=groups.at(-1),role=originRole(model,column);
  // A repeated line later in the record begins a new group. Never reorder
  // columns to collect it with its earlier appearances.
  if(group&&column.kind!=='built'&&previous?.kind!=='built'&&group.line===column.line){
   group.end=column.index;
   if(group.sourceRole!==role)group.sourceRole=null;
  }else groups.push({start:column.index,end:column.index,line:column.line,label:column.kind==='built'?'Bridge':`Line ${column.line}`,sourceRole:role});
 }
 return groups;
}

export function ledgerFrame(model,frame){
 const requested=Number(frame?.index),index=Number.isFinite(requested)?Math.max(-1,Math.min(model.columns.length-1,Math.trunc(requested))):-1;
 const columns=model.columns.slice(0,index+1),observed=new Set(columns.flatMap(column=>column.keys.map(entry=>entry.key))),events=[];
 for(const column of columns){
  const exchange=exchangeFrame(model,{index:column.index});
  for(const row of exchange.rows){
   const status=exchange.kind==='source'?'expressed':exchange.kind==='built'?(row.target?.world?'setting':'built'):exchange.kind==='reading'?'reading':row.status;
   events.push({key:row.key,columnIndex:column.index,sourceIndex:exchange.kind==='handoff'?exchange.source.index:null,status,entry:row.target||(exchange.kind==='source'?row.source:null),sourceEntry:exchange.kind==='handoff'?row.source:null,polarityKnown:row.polarityKnown});
  }
 }
 // Model lanes are ordered by first appearance. Filtering unrevealed keys
 // keeps existing row indices stable without exposing empty future rows.
 return {index,current:columns.at(-1)||null,columns,needs:model.lanes.filter(key=>observed.has(key)),groups:columnGroups(model),events};
}
