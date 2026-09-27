// Apply explicit owner revisions; another person's report never overwrites a need.
export function applyNeedUpdates(wall, updates, {who,text,line,at=Date.now()}) {
  const applied=[], deferred=[];
  for(const u of updates || []) {
    const c=wall.cards.find(c=>c.id===u.id); if(!c) continue;
    const evidence=String(u.evidence || '').trim();
    const authorized=c.who===who && u.explicit===true && evidence.length>0 && text.includes(evidence);
    const mutates=u.action==='revise' || u.action==='withdraw';
    const valid=authorized && mutates && (u.action==='withdraw' || !!u.need?.trim());
    const change={...u,by:who,line,at,status:valid?'applied':'pending'};
    (c.changes ||= []).push(change);
    if(valid){
      (c.versions ||= []).push(structuredClone({need:c.need,quote:c.quote,why:c.why,concern:c.concern,when:c.when,readings:c.readings,withdrawn:c.withdrawn,at,line}));
      if(u.action==='withdraw') c.withdrawn=true;
      else {c.need=u.need;c.quote=evidence;c.why=u.why || '';c.concern=u.concern || '';c.when=u.when || '';c.readings=[];c.withdrawn=false;c.hmw='';c.story='';}
      c.checked={by:who,at,how:'explicit revision'}; c.met=null;
      for(const prior of c.changes) if(prior.status==='pending') prior.status='superseded';
      for(const item of wall.sheet || []) if(item.cardId===c.id) {item.declined=true;item.superseded=true;}
      applied.push(c.id);
    }else deferred.push(c.id);
  }
  return {applied,deferred};
}

// Store questions on the wall so reconnects/restarts cannot lose their state.
export function publishClarification(room,line,heard,canAsk){
  const wall=room.wall, who=line.who;
  let answered=false;
  if(wall.question?.status==='pending' && wall.question.who===who && heard.answeredQuestion===true){
    wall.question.status='answered';wall.question.answerLine=room.transcript.indexOf(line);
    const q=room.transcript.find(e=>e.questionId===wall.question.id);if(q)q.questionStatus='answered';
    answered=true;
  }
  if(!canAsk || !heard.ask || answered || wall.question?.status==='pending') return;
  // Do not keep repeating a previously answered question.
  if(room.transcript.some(e=>e.clarification && e.questionFor===who && e.text===heard.ask))return;
  const id='q'+room.transcript.length;
  wall.question={id,who,text:heard.ask,status:'pending',at:Date.now()};
  room.transcript.push({who:'builder',phase:'main',text:heard.ask,clarification:true,questionId:id,questionFor:who,questionStatus:'pending',built:null,at:Date.now()});
}
