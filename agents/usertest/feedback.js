(async()=>{
'use strict';
const $=id=>document.getElementById(id), room=new URLSearchParams(location.search).get('room'),variant=new URLSearchParams(location.search).get('variant');
const embedded=new URLSearchParams(location.search).get('embedded')==='1';
if(embedded){document.body.classList.add('embedded');const seat=new URLSearchParams(location.search).get('role');if(['A','B'].includes(seat))$('role').value=seat;}
const colors={red:'#e75e65',neutral:'#f3ccd9',some:'#a8d8f0',blue:'#2672cb'};
const labels={red:'Dissatisfied',neutral:'Neutral',some:'Somewhat satisfied',blue:'Satisfied',none:'Clear rating'};
let step=0,color='red',mode='grid',brush=22,draft,matches,background,sketch=null,dirty=false,pointer=null,preview=null;
let undo=[[],[],[]],redo=[[],[],[]];
let orientation='horizontal',pieceLength=100,hover=null,original=false,beforeAction=null;
const fields=['ratings','added','strokes'];
const pieces={horizontal:[1,0],vertical:[0,1],rising:[1,-1],falling:[1,1]};
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
 $('chat-help').textContent='Read-only review of this session, in original order. Some messages may not have been visible to both people during the experiment.';
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
async function load(){draft=fresh();try{const saved=JSON.parse(localStorage.getItem(localKey()));if(saved?.version===1)draft=saved;}catch{}undo=[[],[],[]];redo=[[],[],[]];pointer=null;preview=null;hover=null;original=false;beforeAction=null;step=0;sketch=null;showConversation();
if(draft.source.sketchUrl){try{sketch=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=draft.source.sketchUrl;});}catch{status('Saved sketch could not load. Matchstick feedback is still available.');}}
matches=crossingMatches(draft.source.shape,draft.source.world,draft.source.extras);$('workspace').hidden=false;render();}
const palette=()=>Object.keys(labels).map((k,i)=>`<button class="swatch" style="--color:${colors[k]||'#eee8dc'}" data-color="${k}" aria-pressed="${k===color}" title="${labels[k]} · ${i<4?i+1:'E'}"><span class="color-chip" aria-hidden="true"></span><span>${k==='none'&&step===2?'Erase color':labels[k]}<small>${i<4?`Key ${i+1}`:'Key E'}</small></span></button>`).join('');
function render(){
 document.querySelectorAll('[data-step]').forEach(b=>{b.classList.toggle('active',+b.dataset.step===step);b.setAttribute('aria-current',+b.dataset.step===step?'step':'false');});
 $('title').textContent=['How do you feel about each part?','Build the changes you want','Show what works in the sketch'][step];
 $('instruction').textContent=['Pick a rating below, then click a stick to color it. You can brush across several sticks. Leave anything you cannot judge unmarked.','Your red sticks are removed. Choose a blue piece, then click the grid to place it. Blue here means a change you propose.','Pick a rating and brush over the relevant area. The transparent color keeps the drawing visible underneath.'][step];
 $('palette').innerHTML=step===1?'':palette();
 $('tools').innerHTML=step===1?`${Object.entries({horizontal:['━','Horizontal'],vertical:['┃','Vertical'],rising:['╱','Diagonal up'],falling:['╲','Diagonal down']}).map(([k,[icon,name]])=>`<button data-piece="${k}" aria-pressed="${mode==='grid'&&orientation===k}"><span class="piece-icon" aria-hidden="true">${icon}</span>${name}</button>`).join('')}<label>Length <select id="piece-length"><option value="50" ${pieceLength===50?'selected':''}>Short</option><option value="100" ${pieceLength===100?'selected':''}>Long</option></select></label><span class="tool-divider"></span><button data-mode="erase" aria-pressed="${mode==='erase'}">⌫ Remove added stick</button><button data-mode="free" aria-pressed="${mode==='free'}">Free draw</button>`:step===2?`<label>Brush size <input id="brush" type="range" min="6" max="70" value="${brush}"></label>`:'';
 $('note').value=draft.notes[step];$('next').disabled=step===2;$('previous').disabled=step===0;
 $('undo').disabled=original||!undo[step].length;$('redo').disabled=original||!redo[step].length;
 $('undo').title=undo[step].length?`Undo ${undo[step].at(-1).label} (⌘/Ctrl Z)`:'Nothing to undo in this step';
 $('redo').title=redo[step].length?`Redo ${redo[step].at(-1).label} (⌘/Ctrl Shift Z)`:'Nothing to redo in this step';
 $('active-tool').textContent=original?'Viewing original · editing paused':step===1?mode==='grid'?`Place a ${orientation.replace('rising','diagonal up').replace('falling','diagonal down')} blue stick`:mode==='erase'?'Remove added blue sticks':'Free draw · blue sticks':color==='none'?(step===2?'Erase sketch color':'Clear a stick’s rating'):`Mark as ${labels[color].toLowerCase()}`;
 $('gesture-help').textContent=step===1?mode==='grid'?'Click to place · R to rotate · Undo any placement':mode==='erase'?'Click a blue stick to remove it. Original sticks stay intact.':'Drag from start to end. Release to place sticks.':step===0?'Click or brush sticks · 1–4 choose rating · E clears':'Brush to color · 1–4 choose rating · E erases';
 $('compare').textContent=original?'Return to editing':'Show original';$('compare').setAttribute('aria-pressed',String(original));
 $('canvas').hidden=step===2&&!sketch;$('download').disabled=step===2&&!sketch;
 draw($('canvas'),step,true);
 const values=Object.values(draft.ratings);$('counts').textContent=step===0?`${values.length} / ${matches.length} sticks rated · ${values.filter(c=>c==='red').length} dissatisfied · ${matches.length-values.length} not rated`:step===1?`${values.filter(c=>c==='red').length} original sticks removed · ${draft.added.length} blue sticks added`:sketch?`${draft.strokes.length} brush strokes · the original sketch is unchanged`:'No saved sketch for this result. You can still save feedback on the matchsticks.';
}
function draw(canvas,n,editing=false){
 const ctx=canvas.getContext('2d'), showOriginal=editing&&original;
 if(n===2){canvas.width=1200;canvas.height=sketch?Math.round(1200*sketch.height/sketch.width):700;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);if(sketch)ctx.drawImage(sketch,0,0,canvas.width,canvas.height);
 const overlay=document.createElement('canvas');overlay.width=canvas.width;overlay.height=canvas.height;const c=overlay.getContext('2d');
 for(const st of (showOriginal?[]:draft.strokes)){c.globalCompositeOperation=st.color==='none'?'destination-out':'source-over';c.strokeStyle=colors[st.color]||'#000';c.lineWidth=st.width;c.lineCap='round';c.lineJoin='round';c.beginPath();st.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(st.points.length===1)c.lineTo(st.points[0].x+.1,st.points[0].y);c.stroke();}
 ctx.globalAlpha=.5;ctx.drawImage(overlay,0,0);ctx.globalAlpha=1;return;}
 const ratingColors=Object.fromEntries(Object.entries(draft.ratings).map(([id,c])=>[id,colors[c]]));
 // Draw at a fixed resolution, independent of the screen's device pixel ratio.
 const base=document.createElement('canvas');base.getBoundingClientRect=()=>({width:1200});
 drawCrossing(base,draft.source.shape,draft.source.world,draft.source.extras,{colors:showOriginal?{}:ratingColors,removed:n===1&&!showOriginal?Object.keys(draft.ratings).filter(id=>draft.ratings[id]==='red'):[]});
 canvas.width=1200;canvas.height=700;ctx.drawImage(base,0,0,1200,700);
 if(n===1&&!showOriginal){if(editing&&mode==='grid'){ctx.strokeStyle='rgba(39,76,67,.13)';ctx.fillStyle='rgba(39,76,67,.3)';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=1200;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,700);}for(let y=0;y<=700;y+=50){ctx.moveTo(0,y);ctx.lineTo(1200,y);}ctx.stroke();for(let x=0;x<=1200;x+=50)for(let y=0;y<=700;y+=50){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}}
 for(const m of draft.added)drawStick(ctx,m,colors.blue,10);
 if(editing&&preview){ctx.save();ctx.globalAlpha=.55;drawStick(ctx,preview,colors.blue,12);ctx.restore();}}
 if(editing&&!showOriginal&&hover){ctx.save();ctx.strokeStyle=step===1?'#c23e49':'#fff';ctx.lineWidth=20;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(hover.x1,hover.y1);ctx.lineTo(hover.x2,hover.y2);ctx.stroke();drawStick(ctx,hover,step===1?'#c23e49':colors[color]||'#b07a3c',11);ctx.restore();}
}
function drawStick(ctx,m,color,width){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(m.x1,m.y1);ctx.lineTo(m.x2,m.y2);ctx.stroke();ctx.beginPath();ctx.arc(m.x2,m.y2,width*.65,0,Math.PI*2);ctx.fill();}
// One pointer gesture is one undoable action. No-op clicks keep the redo branch.
function beginAction(){beforeAction=clone(draft[fields[step]]);}
function commitAction(label){if(beforeAction===null)return;const after=clone(draft[fields[step]]);if(JSON.stringify(beforeAction)!==JSON.stringify(after)){undo[step].push({before:beforeAction,after,label});if(undo[step].length>60)undo[step].shift();redo[step]=[];localSave();}beforeAction=null;}
function historyAction(direction){if(pointer||original)return;const from=direction==='undo'?undo[step]:redo[step],to=direction==='undo'?redo[step]:undo[step];const entry=from.pop();if(!entry)return;to.push(entry);draft[fields[step]]=clone(direction==='undo'?entry.before:entry.after);preview=null;hover=null;localSave();render();status(`${direction==='undo'?'Undid':'Redid'} ${entry.label}.`);}
function distance(p,m){const dx=m.x2-m.x1,dy=m.y2-m.y1,t=Math.max(0,Math.min(1,((p.x-m.x1)*dx+(p.y-m.y1)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-m.x1-t*dx,p.y-m.y1-t*dy);}
function nearest(p,list){let best=null,d=16*1200/Math.max(1,$('canvas').getBoundingClientRect().width);for(const m of list){const nd=distance(p,m);if(nd<d){best=m;d=nd;}}return best;}
function stamp(p){const [dx,dy]=pieces[orientation],x=Math.round(p.x/50)*50,y=Math.round(p.y/50)*50;const m={x1:x,y1:y,x2:x+dx*pieceLength,y2:y+dy*pieceLength};return Object.values(m).every(Number.isFinite)&&m.x2>=0&&m.x2<=1200&&m.y2>=0&&m.y2<=700?m:null;}
function paint(p){if(step===0){const m=nearest(p,matches);if(m){if(color==='none')delete draft.ratings[m.id];else draft.ratings[m.id]=color;}}
 else if(step===1&&mode==='erase'){const m=nearest(p,draft.added);if(m)draft.added.splice(draft.added.indexOf(m),1);}
 else if(step===2)draft.strokes.at(-1).points.push(p);
 draw($('canvas'),step,true);}
function point(e){const b=$('canvas').getBoundingClientRect();return {x:Math.max(0,Math.min($('canvas').width,(e.clientX-b.left)*$('canvas').width/b.width)),y:Math.max(0,Math.min($('canvas').height,(e.clientY-b.top)*$('canvas').height/b.height))};}
$('canvas').onpointerdown=e=>{if(pointer||original||e.button>0)return;e.preventDefault();$('canvas').focus({preventScroll:true});beginAction();hover=null;pointer={id:e.pointerId,start:point(e)};$('canvas').setPointerCapture(e.pointerId);if(step===2)draft.strokes.push({color,width:brush,points:[]});if(step===1&&mode==='grid'){preview=stamp(pointer.start);draw($('canvas'),step,true);}else paint(pointer.start);};
$('canvas').onpointermove=e=>{if(original)return;const p=point(e);if(!pointer){hover=step===0?nearest(p,matches):step===1&&mode==='erase'?nearest(p,draft.added):null;preview=step===1&&mode==='grid'?stamp(p):null;draw($('canvas'),step,true);return;}if(pointer.id!==e.pointerId)return;if(step===1&&mode==='grid'){preview=stamp(p);draw($('canvas'),step,true);}else if(step===1&&mode==='free'){preview={x1:pointer.start.x,y1:pointer.start.y,x2:p.x,y2:p.y};draw($('canvas'),step,true);}else paint(p);};
$('canvas').onpointerleave=()=>{if(!pointer){hover=null;preview=null;draw($('canvas'),step,true);}};
function end(e){if(!pointer||pointer.id!==e.pointerId)return;if(step===1&&mode==='grid'){const m=stamp(point(e));if(m&&!draft.added.some(a=>['x1','y1','x2','y2'].every(k=>a[k]===m[k])))draft.added.push(m);}else if(step===1&&mode==='free'){const p=point(e),a=pointer.start,len=Math.hypot(p.x-a.x,p.y-a.y),n=Math.max(1,Math.round(len/100));if(len>8)for(let i=0;i<n;i++)draft.added.push({x1:a.x+(p.x-a.x)*i/n,y1:a.y+(p.y-a.y)*i/n,x2:a.x+(p.x-a.x)*(i+1)/n,y2:a.y+(p.y-a.y)*(i+1)/n});}pointer=null;preview=null;commitAction(step===0?'stick rating':step===1?mode==='erase'?'stick removal':'blue stick placement':color==='none'?'color erasure':'sketch color');render();}
$('canvas').onpointerup=end;$('canvas').onpointercancel=()=>{if(beforeAction!==null)draft[fields[step]]=beforeAction;beforeAction=null;pointer=null;preview=null;render();};
function changeStep(n){step=n;draft.visited[step]=true;original=false;preview=null;hover=null;render();}
 document.querySelector('nav').onclick=e=>{const b=e.target.closest('[data-step]');if(b)changeStep(+b.dataset.step);};
 $('palette').onclick=e=>{const b=e.target.closest('[data-color]');if(b){color=b.dataset.color;original=false;render();}};
 $('tools').onclick=e=>{const piece=e.target.closest('[data-piece]'),b=e.target.closest('[data-mode]');if(piece){orientation=piece.dataset.piece;mode='grid';}else if(b)mode=b.dataset.mode;else return;original=false;preview=null;hover=null;render();};
 $('tools').oninput=e=>{if(e.target.id==='brush')brush=+e.target.value;if(e.target.id==='piece-length'){pieceLength=+e.target.value;preview=null;}};
 $('note').oninput=()=>{draft.notes[step]=$('note').value;localSave();};
 $('undo').onclick=()=>historyAction('undo');$('redo').onclick=()=>historyAction('redo');
 $('compare').onclick=()=>{original=!original;hover=null;preview=null;render();};
 $('next').onclick=()=>changeStep(Math.min(2,step+1));$('previous').onclick=()=>changeStep(Math.max(0,step-1));
 document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable=true]')||pointer)return;const key=e.key.toLowerCase();if((e.metaKey||e.ctrlKey)&&!e.altKey&&(key==='z'||key==='y')){e.preventDefault();historyAction(key==='y'||e.shiftKey?'redo':'undo');return;}if(e.metaKey||e.ctrlKey||e.altKey)return;if(step!==1&&(['1','2','3','4','e'].includes(key))){e.preventDefault();color=({1:'red',2:'neutral',3:'some',4:'blue',e:'none'})[key];original=false;render();}else if(step===1&&key==='r'){e.preventDefault();const keys=Object.keys(pieces);orientation=keys[(keys.indexOf(orientation)+1)%keys.length];mode='grid';original=false;preview=null;render();}});
 $('role').onchange=()=>{dirty=false;load();};
 $('download').onclick=()=>{const c=document.createElement('canvas');draw(c,step);const a=document.createElement('a');a.href=c.toDataURL();a.download=`${room}-${draft.role}-step${step+1}.png`;a.click();};
 $('save').onclick=async()=>{const button=$('save');button.disabled=true;status('Saving all three steps…');try{draft.removed=Object.keys(draft.ratings).filter(id=>draft.ratings[id]==='red');draft.originalMatches=clone(matches);draft.sketchSize=sketch?{width:1200,height:Math.round(1200*sketch.height/sketch.width)}:null;const images=[0,1,2].map(n=>{if(n===2&&!sketch)return null;const c=document.createElement('canvas');draw(c,n);return c.toDataURL('image/png');});const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,draft,images})});const out=await r.json();if(!r.ok)throw Error(out.error||'Save failed');dirty=false;status(`Saved ${new Date(out.at).toLocaleString()}. Original results unchanged.`);await records();}catch(e){status(`Not saved to server: ${e.message}. Your draft remains in this browser; retry Save.`);}finally{button.disabled=false;}};
 async function records(){try{const r=await fetch(`/api/feedback?room=${encodeURIComponent(room)}`).then(r=>r.json());$('record-list').replaceChildren();for(const rec of r.records||[]){const a=document.createElement('article'),title=document.createElement('p');title.textContent=`${rec.draft.participantLabel||rec.draft.role} · ${rec.draft.source.agent} · ${new Date(rec.at).toLocaleString()}`;a.append(title);rec.images.forEach((src,i)=>{if(!src)return;const link=document.createElement('a'),img=new Image();link.href=src;link.download=`${room}-${rec.draft.role}-${rec.id}-step${i+1}.png`;img.src=src;img.alt=['Rated original matchsticks','Rebuilt bridge','Colored sketch'][i];link.append(img);a.append(link);});const details=document.createElement('p');details.textContent=rec.draft.notes.filter(Boolean).join(' · ');a.append(details);const exportLink=document.createElement('a');exportLink.textContent='Download full record (JSON)';exportLink.href=URL.createObjectURL(new Blob([JSON.stringify(rec,null,2)],{type:'application/json'}));exportLink.download=`feedback-${rec.id}.json`;a.append(exportLink);$('record-list').append(a);}if(!r.records?.length)$('record-list').textContent='No feedback saved yet.';}catch{status('Could not load saved feedback.');}}
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 await load();await records();
})().catch(e=>{document.getElementById('status').textContent=`Unable to open feedback: ${e.message}`;});
