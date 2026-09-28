(async()=>{
'use strict';
const $=id=>document.getElementById(id), room=new URLSearchParams(location.search).get('room'),variant=new URLSearchParams(location.search).get('variant');
const colors={red:'#e75e65',neutral:'#f3ccd9',some:'#a8d8f0',blue:'#2672cb'};
const labels={red:'Dissatisfied',neutral:'Neutral',some:'Somewhat satisfied',blue:'Satisfied',none:'Unrated / erase'};
let step=0,color='red',mode='grid',brush=22,draft,matches,background,sketch=null,dirty=false,pointer=null,preview=null;
let undo=[[],[],[]];
const status=t=>$('status').textContent=t;
const clone=x=>JSON.parse(JSON.stringify(x));
const localKey=()=>`bridge-feedback-v1:${room}:${variant||'main'}:${$('role').value}`;
const h=await fetch(`/api/state?room=${encodeURIComponent(room)}&role=host`).then(r=>{if(!r.ok)throw Error('Session is unavailable');return r.json()}).catch(e=>{status(e.message);return null});if(!h)return;
const v=variant==='control'&&h.control?{...h,...h.control,sheetDrawn:null}:h;
const last=h.sketches?.at(-1);
// A legacy side-by-side control has no separate sketch: never label the Toolkit image as Control.
const sketchUrl=last&&variant!=='control'?`/sketch/${encodeURIComponent(room)}/${last.n}.png`:null;
const source={shape:v.shape,world:v.world,extras:v.sheetDrawn,standing:v.standing,sketchUrl,sketch:last||null,variant:variant||'main',agent:variant==='control'?'keys':h.agent,capturedAt:new Date().toISOString(),conversation:{room,argument:h.argument,route:h.route,arrow:h.arrow,note:h.note,lines:(h.lines||[]).filter(l=>variant!=='control'||l.who!=='builder').map(l=>({who:l.who,text:l.text,phase:l.phase,upload:l.upload,decision:l.decision,relay:l.relay,about:l.about,clarification:l.clarification,understandingUpdate:l.understandingUpdate,built:l.built,failed:!!l.failed}))}};
$('back').href=`/j/${encodeURIComponent(room)}/both`;
$('context').textContent=`${h.argument||''} · ${h.route||''} · ${source.agent} · session ${room}`;
try{const us=await fetch('/api/users').then(r=>r.json());const arr=Array.isArray(us)?us:us.users||us.profiles||[];const pair=arr.find(u=>u.sessions?.some(s=>s.room===room));if(pair?.participants)$('role').options[1].textContent=`Role ${pair.participants[1]}`;}catch{}
function showConversation(){
 const context=draft.source.conversation||source.conversation;
 if(!draft.source.conversation)$('chat-help').textContent='Conversation loaded when this page opened. This older drawing draft has no saved chat snapshot; the conversation may include later messages.';
 const roleName=r=>r==='A'?$('role').options[0].textContent:r==='B'?$('role').options[1].textContent:r==='builder'?'AI':r||'Unknown speaker';
 const rename=s=>(s||'').replace(/Role 2/g,roleName('B')).replace(/Role 1/g,roleName('A'));
 $('route-condition').textContent=draft.source.agent==='keys'?'Control':draft.source.agent==='toolkit'?'Toolkit':'Control · historical';
 $('route-arrow').textContent=rename(context?.arrow)||context?.route||'Route unavailable';
 $('route-note').textContent=rename(context?.note)||'No route description saved.';
 $('feedback-chat').replaceChildren();
 if(!context){$('feedback-chat').textContent='This older feedback draft has no conversation snapshot. Open the session to review its record.';return;}
 for(const l of context.lines){
  const message=document.createElement('div');message.className='chat-message';message.dataset.speaker=l.who;
  const who=document.createElement('strong');who.textContent=roleName(l.who);message.append(who);
  const tag=l.failed?'AI response failed':l.clarification?'Clarification question':l.understandingUpdate?'Understanding updated':l.relay?`Relaying ${roleName(l.about)}’s needs`:l.decision?'Confirmed to AI':l.phase==='confer'?'Between participants · not sent to AI':null;
  if(tag){const label=document.createElement('small');label.textContent=tag;message.append(label);}
  const text=document.createElement('p');text.textContent=l.upload?'Shared a reference image.':l.text||'(No text recorded)';message.append(text);
  if(l.built){const build=document.createElement('p');build.className='chat-build';build.textContent=`Built: ${l.built}`;message.append(build);}
  $('feedback-chat').append(message);
 }
 if(!context.lines.length)$('feedback-chat').textContent='No conversation recorded for this result.';
 if(variant==='control')$('chat-help').textContent='Original participant messages for the Control comparison. Toolkit AI replies are excluded.';
}
function fresh(){return {version:1,palette:{...colors},ratingLabels:{...labels},coordinateSpace:{width:1200,height:700},role:$('role').value,participantLabel:$('role').selectedOptions[0].textContent,source:clone(source),ratings:{},added:[],strokes:[],notes:['','',''],visited:[true,false,false]};}
function localSave(){dirty=true;try{localStorage.setItem(localKey(),JSON.stringify(draft));}catch{status('Local draft storage unavailable. Use Save feedback to keep your work.');}}
async function load(){draft=fresh();try{const saved=JSON.parse(localStorage.getItem(localKey()));if(saved?.version===1)draft=saved;}catch{}undo=[[],[],[]];step=0;sketch=null;showConversation();
if(draft.source.sketchUrl){try{sketch=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=draft.source.sketchUrl;});}catch{status('Saved sketch could not load. Matchstick feedback is still available.');}}
matches=crossingMatches(draft.source.shape,draft.source.world,draft.source.extras);$('workspace').hidden=false;render();}
const palette=()=>Object.keys(labels).map(k=>`<button class="swatch" style="--color:${colors[k]||'#eee8dc'}" data-color="${k}" aria-pressed="${k===color}">${labels[k]}</button>`).join('');
function render(){
 document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',+b.dataset.step===step));
 $('title').textContent=['Color what works and what does not','Remove the red, then rebuild','Mark the line sketch'][step];
 $('instruction').textContent=['Choose a rating, then click or brush over individual sticks. Untouched sticks stay unrated. This rates what the image communicates, not structural safety.','Red-rated sticks are hidden here. Draw from start to end to add blue sticks. Return to step 1 to change what is removed. Blue additions mean your proposed changes, not a satisfaction score.','Use the same rating colors to paint areas of the sketch. Add a note when the drawing cannot express your needs.'][step];
 $('palette').innerHTML=step===1?'':palette();
 $('tools').innerHTML=step===1?`<button data-mode="grid" aria-pressed="${mode==='grid'}">Grid · snap sticks</button><button data-mode="free" aria-pressed="${mode==='free'}">Free · draw sticks</button><button data-mode="erase" aria-pressed="${mode==='erase'}">Remove added sticks</button>`:step===2?`<label>Brush size <input id="brush" type="range" min="6" max="70" value="${brush}"></label>`:'';
 $('note').value=draft.notes[step];$('next').disabled=step===2;$('undo').disabled=!undo[step].length;
 $('canvas').hidden=step===2&&!sketch;$('download').disabled=step===2&&!sketch;
 draw($('canvas'),step,true);
 const values=Object.values(draft.ratings);$('counts').textContent=step===0?`${values.length} of ${matches.length} sticks rated · ${values.filter(c=>c==='red').length} dissatisfied · ${matches.length-values.length} unrated`:step===1?`${values.filter(c=>c==='red').length} original sticks removed · ${draft.added.length} blue sticks added. Accepted extra parts remain as context.`:sketch?`${draft.strokes.length} brush strokes. The original sketch stays intact.`:'No saved sketch for this result. Save the matchstick steps now; generate a sketch in the session to evaluate it separately.';
}
function draw(canvas,n,editing=false){
 const ctx=canvas.getContext('2d');
 if(n===2){canvas.width=1200;canvas.height=sketch?Math.round(1200*sketch.height/sketch.width):700;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);if(sketch)ctx.drawImage(sketch,0,0,canvas.width,canvas.height);
 const overlay=document.createElement('canvas');overlay.width=canvas.width;overlay.height=canvas.height;const c=overlay.getContext('2d');
 for(const st of draft.strokes){c.globalCompositeOperation=st.color==='none'?'destination-out':'source-over';c.strokeStyle=colors[st.color]||'#000';c.lineWidth=st.width;c.lineCap='round';c.lineJoin='round';c.beginPath();st.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(st.points.length===1)c.lineTo(st.points[0].x+.1,st.points[0].y);c.stroke();}
 ctx.globalAlpha=.5;ctx.drawImage(overlay,0,0);ctx.globalAlpha=1;return;}
 const ratingColors=Object.fromEntries(Object.entries(draft.ratings).map(([id,c])=>[id,colors[c]]));
 // Draw at a fixed resolution, independent of the screen's device pixel ratio.
 const base=document.createElement('canvas');base.getBoundingClientRect=()=>({width:1200});
 drawCrossing(base,draft.source.shape,draft.source.world,draft.source.extras,{colors:ratingColors,removed:n===1?Object.keys(draft.ratings).filter(id=>draft.ratings[id]==='red'):[]});
 canvas.width=1200;canvas.height=700;ctx.drawImage(base,0,0,1200,700);
 if(n===1){if(editing&&mode==='grid'){ctx.strokeStyle='rgba(39,76,67,.13)';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<1200;x+=25){ctx.moveTo(x,0);ctx.lineTo(x,700);}for(let y=0;y<700;y+=25){ctx.moveTo(0,y);ctx.lineTo(1200,y);}ctx.stroke();}
 for(const m of [...draft.added,...(editing&&preview?[preview]:[])]){ctx.strokeStyle=colors.blue;ctx.fillStyle=colors.blue;ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(m.x1,m.y1);ctx.lineTo(m.x2,m.y2);ctx.stroke();ctx.beginPath();ctx.arc(m.x2,m.y2,7,0,Math.PI*2);ctx.fill();}}
}
function snapshot(){undo[step].push(clone(step===0?draft.ratings:step===1?draft.added:draft.strokes));if(undo[step].length>60)undo[step].shift();}
function distance(p,m){const dx=m.x2-m.x1,dy=m.y2-m.y1,t=Math.max(0,Math.min(1,((p.x-m.x1)*dx+(p.y-m.y1)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-m.x1-t*dx,p.y-m.y1-t*dy);}
function paint(p){if(step===0){let best=null,d=18;for(const m of matches){const nd=distance(p,m);if(nd<d){best=m;d=nd;}}if(best){if(color==='none')delete draft.ratings[best.id];else draft.ratings[best.id]=color;}}
 else if(step===1&&mode==='erase'){let i=-1,d=18;draft.added.forEach((m,j)=>{const nd=distance(p,m);if(nd<d){i=j;d=nd;}});if(i>=0)draft.added.splice(i,1);}
 else if(step===2)draft.strokes.at(-1).points.push(p);
 draw($('canvas'),step,true);}
function point(e){const b=$('canvas').getBoundingClientRect();let p={x:(e.clientX-b.left)*$('canvas').width/b.width,y:(e.clientY-b.top)*$('canvas').height/b.height};if(step===1&&mode==='grid')p={x:Math.round(p.x/25)*25,y:Math.round(p.y/25)*25};return p;}
$('canvas').onpointerdown=e=>{if(pointer)return;e.preventDefault();snapshot();pointer={id:e.pointerId,start:point(e)};$('canvas').setPointerCapture(e.pointerId);if(step===2)draft.strokes.push({color,width:brush,points:[]});paint(pointer.start);};
$('canvas').onpointermove=e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=point(e);if(step===1&&mode!=='erase'){preview={x1:pointer.start.x,y1:pointer.start.y,x2:p.x,y2:p.y};draw($('canvas'),step,true);}else paint(p);};
function end(e){if(!pointer||pointer.id!==e.pointerId)return;if(step===1&&mode!=='erase'){const p=point(e),a=pointer.start,len=Math.hypot(p.x-a.x,p.y-a.y),n=Math.max(1,Math.round(len/100));if(len>8)for(let i=0;i<n;i++)draft.added.push({x1:a.x+(p.x-a.x)*i/n,y1:a.y+(p.y-a.y)*i/n,x2:a.x+(p.x-a.x)*(i+1)/n,y2:a.y+(p.y-a.y)*(i+1)/n});}pointer=null;preview=null;localSave();render();}
$('canvas').onpointerup=end;$('canvas').onpointercancel=()=>{pointer=null;preview=null;localSave();render();};
 document.querySelector('nav').onclick=e=>{const b=e.target.closest('[data-step]');if(b){step=+b.dataset.step;draft.visited[step]=true;localSave();render();}};
 $('palette').onclick=e=>{const b=e.target.closest('[data-color]');if(b){color=b.dataset.color;render();}};
 $('tools').onclick=e=>{const b=e.target.closest('[data-mode]');if(b){mode=b.dataset.mode;render();}};
 $('tools').oninput=e=>{if(e.target.id==='brush')brush=+e.target.value;};
 $('note').oninput=()=>{draft.notes[step]=$('note').value;localSave();};
 $('undo').onclick=()=>{const prev=undo[step].pop();if(prev)draft[['ratings','added','strokes'][step]]=prev;localSave();render();};
 $('next').onclick=()=>{step=Math.min(2,step+1);draft.visited[step]=true;localSave();render();};
 $('role').onchange=()=>{dirty=false;load();};
 $('download').onclick=()=>{const c=document.createElement('canvas');draw(c,step);const a=document.createElement('a');a.href=c.toDataURL();a.download=`${room}-${draft.role}-step${step+1}.png`;a.click();};
 $('save').onclick=async()=>{const button=$('save');button.disabled=true;status('Saving all three steps…');try{draft.removed=Object.keys(draft.ratings).filter(id=>draft.ratings[id]==='red');draft.originalMatches=clone(matches);draft.sketchSize=sketch?{width:1200,height:Math.round(1200*sketch.height/sketch.width)}:null;const images=[0,1,2].map(n=>{if(n===2&&!sketch)return null;const c=document.createElement('canvas');draw(c,n);return c.toDataURL('image/png');});const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,draft,images})});const out=await r.json();if(!r.ok)throw Error(out.error||'Save failed');dirty=false;status(`Saved ${new Date(out.at).toLocaleString()}. Original results unchanged.`);await records();}catch(e){status(`Not saved to server: ${e.message}. Your draft remains in this browser; retry Save.`);}finally{button.disabled=false;}};
 async function records(){try{const r=await fetch(`/api/feedback?room=${encodeURIComponent(room)}`).then(r=>r.json());$('record-list').replaceChildren();for(const rec of r.records||[]){const a=document.createElement('article'),title=document.createElement('p');title.textContent=`${rec.draft.participantLabel||rec.draft.role} · ${rec.draft.source.agent} · ${new Date(rec.at).toLocaleString()}`;a.append(title);rec.images.forEach((src,i)=>{if(!src)return;const link=document.createElement('a'),img=new Image();link.href=src;link.download=`${room}-${rec.draft.role}-${rec.id}-step${i+1}.png`;img.src=src;img.alt=['Rated original matchsticks','Rebuilt bridge','Colored sketch'][i];link.append(img);a.append(link);});const details=document.createElement('p');details.textContent=rec.draft.notes.filter(Boolean).join(' · ');a.append(details);const exportLink=document.createElement('a');exportLink.textContent='Download full record (JSON)';exportLink.href=URL.createObjectURL(new Blob([JSON.stringify(rec,null,2)],{type:'application/json'}));exportLink.download=`feedback-${rec.id}.json`;a.append(exportLink);$('record-list').append(a);}if(!r.records?.length)$('record-list').textContent='No feedback saved yet.';}catch{status('Could not load saved feedback.');}}
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 await load();await records();
})().catch(e=>{document.getElementById('status').textContent=`Unable to open feedback: ${e.message}`;});
