// "Where it went": every need keeps its own row, every hand-off is a column.
// Ported from i-want-i-do-not-want.html (renderJourney) onto the eight-paths archive.
export const FEATLABEL={water:"a stream to cross",rock:"a cleft to cross",minimal:"as little built as possible",low:"level with the banks",open:"nothing closing it in",light:"one person's weight",heavy:"loads and carts",guarded:"something at the hand",steady:"it does not move",exposed:"the drop right there under you",sways:"it swings",inGap:"something standing in the gap",high:"raised above the banks",many:"a great deal of timber",grip:"it does not go slick when wet",footed:"ends that hold when the bank softens",sheltered:"the weather kept off you"};
export const HUE={water:200,rock:28,minimal:95,low:140,open:170,light:52,heavy:12,guarded:285,steady:228,exposed:350,sways:318,inGap:112,high:258,many:38,grip:186,footed:72,sheltered:302};
const hx=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const known=xs=>(xs||[]).filter(f=>f in FEATLABEL);
const name=r=>r==='A'?'Role 1':'Role 2';

// The steps of one session, in the order they happened. `at` is the transcript
// index a column becomes visible at; the built column only at the final turn.
export function journeyColumns(session){
 const t=session.transcript.map((x,i)=>({...x,i})).filter(x=>x.who==='A'||x.who==='B');
 const cols=[],aiCols=[],lastMeant={A:null,B:null},lastHeard={A:null,B:null};
 t.forEach((turn,k)=>{
  const role=turn.who,other=role==='A'?'B':'A';
  cols.push({kind:'meant',role,line:k+1,at:turn.i,keys:known(turn.meant),not:new Set(known(turn.meantRefuses)),sources:[lastHeard[role],lastMeant[role]].filter(x=>x!=null)});
  const m=cols.length-1;lastMeant[role]=m;
  if(!turn.unread){cols.push({kind:'ai',line:k+1,at:turn.i,keys:known(turn.taken),not:new Set(known(turn.takenRefuses)),sources:[m]});aiCols.push(cols.length-1);}
  const reply=t[k+1],heard=reply&&reply.who===other?known(reply.heard):[];
  if(heard.length){cols.push({kind:'heard',role:other,line:k+1,at:reply.i,keys:heard,not:new Set(),sources:[m]});lastHeard[other]=cols.length-1;}
 });
 const built=[...known(session.outcome.has)];const w=session.outcome.world||{};if(w.water&&!built.includes('water'))built.unshift('water');if(w.rock&&!built.includes('rock'))built.unshift('rock');
 cols.push({kind:'built',line:null,at:session.transcript.length-1,keys:built,not:new Set(),sources:aiCols});
 return {cols,lines:t.length};
}

export function journeyHTML(session,index){
 const {cols,lines}=journeyColumns(session);
 const lanes=[];cols.forEach(c=>c.keys.forEach(k=>{if(!lanes.includes(k))lanes.push(k);}));
 if(!lanes.length)return `<p class="journey-empty">Nothing in this conversation was meant or interpreted as a need.</p>`;
 const from=cols.map(()=>new Map()),onward=cols.map(()=>new Set());
 cols.forEach((c,ci)=>c.keys.forEach(k=>{const s=[...c.sources].sort((a,b)=>b-a).find(s=>cols[s].keys.includes(k));if(s!=null){from[ci].set(k,s);onward[s].add(k);}}));
 const handedOn=cols.map((_,ci)=>cols.some(c=>c.sources.includes(ci)));
 const shown=ci=>cols[ci].at<=index;
 const COLW=84,LANEH=28,TOP=66,PADL=46;
 const W=PADL+cols.length*COLW,H=TOP+lanes.length*LANEH+10;
 const X=ci=>PADL+ci*COLW,Y=li=>TOP+li*LANEH+LANEH/2;
 let bands='',heads='';
 for(let a=0;a<cols.length;){let b=a;while(b+1<cols.length&&cols[b+1].line===cols[a].line)b++;
  const x0=X(a)-COLW/2+4,x1=X(b)+COLW/2-4;
  bands+=`<rect class="jband${cols[a].line==null?' built':''}${shown(a)?'':' ahead'}" x="${x0}" y="4" width="${x1-x0}" height="${H-8}" rx="8"/><text class="jline" x="${x0+8}" y="18">${cols[a].line==null?'BUILT':'LINE '+cols[a].line}</text>`;a=b+1;}
 cols.forEach((c,ci)=>{const who=c.kind==='ai'?'AI':c.kind==='built'?'crossing':name(c.role);const what=c.kind==='meant'?'meant':c.kind==='built'?'has':'interpreted';const cls=c.kind==='meant'||c.kind==='heard'?(c.role==='A'?'a':'b'):'m';
  heads+=`<text class="jhead ${cls}${shown(ci)?'':' ahead'}" x="${X(ci)}" y="38" text-anchor="middle">${hx(who)}</text><text class="jsub${shown(ci)?'':' ahead'}" x="${X(ci)}" y="50" text-anchor="middle">${what}</text>`;});
 const said=c=>c.kind==='meant'?`${name(c.role)} meant`:c.kind==='ai'?'The AI interpreted':c.kind==='heard'?`${name(c.role)} interpreted`:'The crossing has';
 let rows='';
 lanes.forEach((k,li)=>{const y=Y(li),L=[],M=[];
  cols.forEach((c,ci)=>{if(!c.keys.includes(k)||!shown(ci))return;const x=X(ci),s=from[ci].get(k),added=s==null&&c.kind!=='meant';
   if(s!=null)L.push(`<line class="jl carried" x1="${X(s)+8}" y1="${y}" x2="${x-8}" y2="${y}"/>`);
   if(added)L.push(`<line class="jl added" x1="${x-30}" y1="${y}" x2="${x-9}" y2="${y}"/>`);
   const next=cols.findIndex(d=>d.sources.includes(ci)&&shown(cols.indexOf(d)));
   const missed=handedOn[ci]&&!onward[ci].has(k)&&next>=0;
   if(missed){L.push(`<line class="jl dropped" x1="${x+9}" y1="${y}" x2="${x+26}" y2="${y}"/>`);M.push(`<text class="jx" x="${x+29}" y="${y+4}">✗</text>`);}
   const tip=`${said(c)} “${FEATLABEL[k]}”${c.line?` (line ${c.line})`:''}${c.not.has(k)?' — ruled out':''}${added?(c.kind==='built'?' — nobody meant or interpreted it':' — nobody had meant it'):''}${missed?' — missed at the next step':''}`;
   const shape=c.kind==='built'?`<rect class="jn${added?' added':''}" x="${x-6.5}" y="${y-6.5}" width="13" height="13" rx="3"/>`:`<circle class="jn${added?' added':''}${c.not.has(k)?' not':''}" cx="${x}" cy="${y}" r="6.5"/>`+(c.not.has(k)?`<line class="jnot" x1="${x-4}" y1="${y}" x2="${x+4}" y2="${y}"/>`:'');
   M.push(`<g><title>${hx(tip)}</title>${shape}</g>`);});
  rows+=`<g class="lane" style="--h:${HUE[k]??0}">${L.join('')}${M.join('')}</g>`;});
 const LW=236;const seen=new Set(cols.filter((c,ci)=>shown(ci)).flatMap(c=>c.keys));
 const labels=`<svg class="jlabels" width="${LW}" height="${H}" viewBox="0 0 ${LW} ${H}"><text class="jline" x="12" y="18">NEED</text>${lanes.map((k,li)=>`<g class="lane${seen.has(k)?'':' ahead'}" style="--h:${HUE[k]??0}"><title>${hx(FEATLABEL[k])}</title><rect class="jsw" x="12" y="${Y(li)-5}" width="10" height="10" rx="2"/><text class="jlab" x="28" y="${Y(li)+4}">${hx(FEATLABEL[k])}</text></g>`).join('')}</svg>`;
 // The figures, for what is visible so far.
 const vis=cols.filter((c,ci)=>shown(ci));
 const meantSet=new Set(vis.filter(c=>c.kind==='meant').flatMap(c=>c.keys)),interpSet=new Set(vis.filter(c=>c.kind==='ai'||c.kind==='heard').flatMap(c=>c.keys));
 const done=index>=session.transcript.length-1,built=cols[cols.length-1].keys;
 const reached=built.filter(k=>meantSet.has(k)).length,unasked=built.filter(k=>!meantSet.has(k)&&!interpSet.has(k)).length;
 let missed=0;cols.forEach((c,ci)=>{if(!shown(ci)||!handedOn[ci])return;const next=cols.some((d,di)=>d.sources.includes(ci)&&shown(di));if(next)c.keys.forEach(k=>{if(!onward[ci].has(k))missed++;});});
 const pl=(n,one,many)=>`${n} ${n===1?one:many}`;
 const summary=done?`<b>${meantSet.size}</b> ${meantSet.size===1?'need was':'needs were'} meant along the way; <b>${reached}</b> ${reached===1?'is':'are'} in what was built. Missed at a hand-off <b>${missed}</b> time${missed===1?'':'s'}; the crossing has <b>${unasked}</b> ${unasked===1?'property':'properties'} nobody meant or interpreted.`
  :`So far <b>${meantSet.size}</b> ${meantSet.size===1?'need':'needs'} meant, <b>${interpSet.size}</b> interpreted, missed at a hand-off <b>${missed}</b> time${missed===1?'':'s'}. ${pl(lines,'line','lines')} in all.`;
 return `<div class="journey-head"><p>${summary}</p><p class="jlegend"><span><i class="lg-dot"></i>meant or interpreted</span><span><i class="lg-carried"></i>carried on</span><span><i class="lg-missed"></i>✗ missed at the next step</span><span><i class="lg-added"></i>interpreted, never meant</span><span><i class="lg-not"></i>ruled out</span><span><i class="lg-built"></i>in the crossing</span></p></div><div class="jwrap">${labels}<div class="jscroll"><svg class="journey" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Where each need went, step by step">${bands}${heads}${rows}</svg></div></div><p class="journey-note">Read left to right. Each column is one step: what a speaker meant (as needs), how the AI or the other person interpreted that line, and at the end what the built crossing has. A line along a row is that need carried on. Hover a mark. <a href="../how-we-compare.html">How the comparison works ↗</a></p>`;
}
