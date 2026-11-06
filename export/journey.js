import {PATHS,SCENARIOS} from './flow-model.mjs?v=6';
import {FEATLABEL} from './flow-journey.mjs?v=3';
import {buildJourney,journeyFrame} from './journey-playback.mjs?v=1';
import {exchangeFrame,KEY_NAMES} from './journey-exchange.mjs?v=1';
import {ledgerFrame} from './journey-ledger.mjs?v=1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={A:'Role 1',B:'Role 2',M:'AI',machine:'AI'};
const sel={path:'all',scen:'pairs',pair:0},models=new Map(),lastFrames=new Map();
let data,mode='run',step=0,playing=false,timer=null,layoutFrame=null,selectedNeed=null,inspection=null;
const identity=s=>`${s.path}:${s.scenario}:${s.pair}`;
const getModel=s=>{const key=identity(s);if(!models.has(key))models.set(key,buildJourney(s));return models.get(key);};
const selectedRuns=()=>!data?[]:mode==='paths'?data.paths.map(([path])=>data.sessions.find(s=>s.path===path&&s.scenario===sel.scen&&s.pair===sel.pair)).filter(Boolean):[data.sessions.find(s=>s.path===sel.path&&s.scenario===sel.scen&&s.pair===sel.pair)].filter(Boolean);
const finalStep=()=>Math.max(0,...selectedRuns().map(s=>getModel(s).columns.length-1));
const keyName=key=>KEY_NAMES[key]||key;
const stance=entry=>!entry?'Not recorded':entry.refused===true?'Avoid':entry.refused===false?'Present':'Recorded';
const statusName=event=>({expressed:'Expressed',retained:event.polarityKnown?'Retained':'Same key',missing:'Not recorded',added:'Added',changed:'Stance changed',reading:'Recorded',built:'Built',setting:'Setting'}[event.status]);
function phase(c,s){if(!c)return '';if(c.kind==='built')return 'Final bridge';if(c.kind==='meant')return `${names[c.role]} expressed`;const source=s.transcript[c.sourceTurnIndex];return source?`${names[source.who]} → ${names[c.role]}`:`${names[c.role]}'s recorded reading`;}
function syncControls(){
 const end=finalStep();$('play').textContent=playing?'Ⅱ Pause':'▶ Play';$('play').setAttribute('aria-label',playing?'Pause replay':'Play replay');document.body.classList.toggle('is-playing',playing);
 $('back').disabled=step===0;$('next').disabled=step===end;$('scrub').max=end;$('scrub').value=step;$('scrub').setAttribute('aria-valuetext',`Step ${step+1} of ${end+1}`);$('position').textContent=`${step+1} / ${end+1}`;$('overview').setAttribute('aria-pressed',String(step===end));
 $('path').disabled=mode==='paths';for(const name of ['run','paths'])$('mode-'+name).setAttribute('aria-pressed',String(mode===name));
}
function pause(){playing=false;clearTimeout(timer);timer=null;syncControls();}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(!playing)return;if(step>=finalStep()){pause();return;}step++;render({follow:true});if(step===finalStep())timer=setTimeout(pause,850);else schedule();},2800/Number($('speed').value));}
function play(){if(!data)return;if(playing){pause();return;}playing=true;inspection=null;if(step===finalStep()){step=0;lastFrames.clear();}else step++;render({follow:true});schedule();}
function seek(value){pause();inspection=null;step=Math.max(0,Math.min(finalStep(),Number(value)));render({follow:true});}
function updateHash(){history.replaceState(null,'',`#path=${sel.path}&scen=${sel.scen}&pair=${sel.pair}&mode=${mode}`);$('to-flow').href=`flow.html#path=${sel.path}&scen=${sel.scen}&pair=${sel.pair}`;}
function choose(){pause();selectedNeed=null;inspection=null;step=finalStep();lastFrames.clear();updateHash();render();}
function readHash(){const p=new URLSearchParams(location.hash.slice(1));sel.path=PATHS[p.get('path')]?p.get('path'):'all';sel.scen=SCENARIOS[p.get('scen')]?p.get('scen'):'pairs';const requested=Number(p.get('pair'));sel.pair=Number.isInteger(requested)&&data.sessions.some(s=>s.pair===requested)?requested:0;mode=p.get('mode')==='paths'?'paths':'run';for(const k of ['path','scen','pair'])$(k).value=sel[k];choose();}
function eventTitle(event,column,s){return `${event.key} · ${statusName(event)} · ${phase(column,s)}${event.entry?.refused?' · Avoid':''}`;}
function diagram(s,model,frame,ledger,available,labelWidth,fresh){
 const count=model.columns.length,colW=Math.max(84,available/count),W=count*colW,top=78,row=43,H=top+Math.max(1,ledger.needs.length)*row+10;
 const X=i=>(i+.5)*colW,Y=key=>top+(ledger.needs.indexOf(key)+.5)*row;
 const active=inspection?.path===s.path?inspection.index:frame.index,animate=fresh&&playing&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
 let headers='',labels='<text class="ledger-axis-label" x="14" y="29">Need</text><text class="ledger-axis-note" x="14" y="51">Select to trace</text>',rows='';
 for(const group of ledger.groups){const left=group.start*colW+8,right=(group.end+1)*colW-8,who=group.sourceRole?` · ${names[group.sourceRole]}`:'';headers+=`<text class="ledger-group-label ${group.sourceRole||''}" x="${(left+right)/2}" y="22">${esc(group.label+who)}</text><path class="ledger-group-rule" d="M${left} 30H${right}"/>`;}
 for(const c of model.columns){const x=X(c.index),pending=c.index>frame.index,title=c.kind==='meant'?'Expressed':c.kind==='built'?'Bridge':`${names[c.role]} reads`;headers+=`<g class="ledger-column${pending?' pending':''}${c.index===active?' active':''}" data-column="${c.index}" role="button" tabindex="0" aria-label="Step ${c.index+1}: ${esc(phase(c,s))}"${c.index===active?' aria-current="step"':''}><rect class="ledger-column-bg" x="${c.index*colW+2}" y="34" width="${colW-4}" height="${H-34}"/><rect class="ledger-hit" x="${c.index*colW}" y="34" width="${colW}" height="40"/><text class="ledger-column-title ${c.role}" x="${x}" y="56">${esc(title)}</text></g>`;}
 const curve=(from,to,y)=>{const x1=X(from)+7,x2=X(to)-8;return to-from>1?`M${x1} ${y}C${x1+16} ${y-14} ${x2-16} ${y-14} ${x2} ${y}`:`M${x1} ${y}H${x2}`;};
 for(const key of ledger.needs){const y=Y(key),focus=selectedNeed===key,cls=selectedNeed?(focus?' selected':' dim'):'';
  labels+=`<g class="ledger-label${cls}" data-need="${esc(key)}" role="button" tabindex="0" aria-pressed="${focus}" aria-label="Trace ${esc(key)}: ${esc(keyName(key))}"><title>${esc(FEATLABEL[key]||key)}</title><rect class="ledger-row-bg" x="0" y="${y-row/2}" width="${labelWidth}" height="${row}"/><rect class="ledger-label-hit" x="0" y="${y-row/2}" width="${labelWidth}" height="${row}"/><text class="ledger-key" x="14" y="${y-2}">${esc(key)}</text><text class="ledger-gloss" x="14" y="${y+13}">${esc(keyName(key))}</text></g>`;
  let edges='',nodes='';
  for(const e of ledger.events.filter(e=>e.key===key)){
   const c=model.columns[e.columnIndex],x=X(e.columnIndex),now=animate&&e.columnIndex===frame.index,motion=now?' fresh':'';
   if(e.sourceIndex!==null&&e.sourceEntry){const d=curve(e.sourceIndex,e.columnIndex,y);edges+=`<path class="ledger-link ${e.status}${motion}" d="${d}" pathLength="1"/>${now?`<circle class="ledger-traveller ${e.status}" r="3"><animateMotion dur="700ms" path="${d}" fill="freeze"/></circle>`:''}`;}
   if(focus&&e.status==='built'){const match=frame.links.find(link=>link.to===e.columnIndex&&link.key===key&&link.kind==='output');if(match)edges+=`<path class="ledger-link output${motion}" d="${curve(match.from,match.to,y)}" pathLength="1"/>`;}
   const label={missing:'Not recorded',added:'Added',changed:'Changed'}[e.status]||'';
   const nodeClass=`ledger-node ${e.status}${e.entry?.refused?' refused':''}${motion}`;
   const shape=e.status==='missing'?`<path class="ledger-break${motion}" d="M${x-4} ${y-4}l8 8m-8 0l8-8"/>`:['built','setting'].includes(e.status)?`<rect class="${nodeClass}" x="${x-5}" y="${y-5}" width="10" height="10" rx="1.5"/>`:`<circle class="${nodeClass}" cx="${x}" cy="${y}" r="5.5"/>`;
   const refused=e.entry?.refused?`<path class="ledger-refusal-mark" d="M${x-3} ${y}H${x+3}"/><text class="ledger-event-label refusal" x="${x}" y="${y-10}">Avoid</text>`:'';
   nodes+=`<g class="ledger-event${inspection?.path===s.path&&inspection.index===e.columnIndex&&selectedNeed===key?' inspected':''}" data-event="${e.columnIndex}" data-key="${esc(key)}" role="button" tabindex="0" aria-label="${esc(eventTitle(e,c,s))}"><title>${esc(eventTitle(e,c,s))}</title><rect class="ledger-event-hit" x="${x-colW/2+2}" y="${y-18}" width="${colW-4}" height="39"/>${shape}${refused}${label?`<text class="ledger-event-label ${e.status}${motion}" x="${x}" y="${y+17}">${label}</text>`:''}</g>`;
  }
  rows+=`<g class="ledger-row${cls}"><rect class="ledger-row-bg" x="0" y="${y-row/2}" width="${W}" height="${row}"/><path class="ledger-row-rule" d="M0 ${y+row/2}H${W}"/>${edges}${nodes}</g>`;
 }
 if(!ledger.needs.length)labels+='<text class="ledger-gloss" x="14" y="103">No keys yet</text>';
 return `<div class="ledger-shell"><svg class="ledger-labels" width="${labelWidth}" height="${H}" viewBox="0 0 ${labelWidth} ${H}" aria-label="Needs">${labels}</svg><div class="ledger-scroll" tabindex="0" aria-label="Horizontal need trace"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="Each need, across recorded hand-offs">${headers}${rows}</svg></div></div>`;
}
const legend=()=>'<div class="ledger-keyline"><span><i></i>Same key</span><span><i class="missing"></i>Not recorded</span><span><i class="added"></i>Added</span><span><i class="refused"></i>Avoid</span><span><i class="built"></i>Built</span></div>';
function evidence(s,model,frame,ledger){
 const idx=inspection?.path===s.path&&inspection.index<=frame.index?inspection.index:frame.index,c=model.columns[idx];if(!c)return '';
 const ex=exchangeFrame(model,{index:idx}),events=ledger.events.filter(e=>e.columnIndex===idx),filtered=selectedNeed?events.filter(e=>e.key===selectedNeed):events;
 if(c.kind==='built')return `<section class="evidence"><div class="evidence-source evidence-final"><div class="final-copy"><h3>${esc(s.outcome.name)}</h3><p class="evidence-status">Recorded output</p></div><canvas id="bridge-${s.path}" aria-label="Final recorded bridge"></canvas></div><div class="evidence-reading"><h3>${selectedNeed?esc(selectedNeed):'Bridge properties'}</h3>${filtered.length?filtered.map(e=>`<div class="evidence-row"><code>${esc(e.key)}</code><span>${esc(keyName(e.key))}</span><span class="status">${statusName(e)}</span></div>`).join(''):'<p>Not recorded in the final bridge.</p>'}${selectedNeed?'<p class="evidence-status">A matching property does not establish which statement caused it.</p>':''}</div></section>`;
 const source=ex.source,role=source?.role||c.role,text=source?.text||c.contextText||'',label=source?`${names[role]} · Line ${source.line}`:`${names[role]} · next reply`;
 let note=c.unknownSource?'Source message not linked in this record.':c.kind==='heard'?'Listener stance was not recorded; a matching key does not imply agreement.':ex.kind==='source'?'Participant-coded needs.':filtered.some(e=>e.status==='missing')?'Not recorded refers to this reading, not every later step.':'';
 return `<section class="evidence" aria-label="Evidence for step ${idx+1}"><div class="evidence-source ${role}"><h3>${esc(label)}</h3><p class="quote">${esc(text)||'No message recorded.'}</p></div><div class="evidence-reading"><h3>${esc(ex.kind==='source'?'Expressed needs':`${names[c.role]}'s reading`)}${selectedNeed?' · '+esc(selectedNeed):''}</h3>${filtered.length?filtered.map(e=>`<div class="evidence-row${selectedNeed===e.key?' selected':''}"><code>${esc(e.key)}</code><span>${e.sourceEntry?esc(stance(e.sourceEntry))+' → ':''}${esc(stance(e.entry))}</span><span class="status ${e.status}">${statusName(e)}</span></div>`).join(''):'<p>No record of this need in this step.</p>'}${note?`<p class="evidence-status">${esc(note)}</p>`:''}</div></section>`;
}
function transcript(s,frame,open){return `<details class="transcript"${open?' open':''}><summary>Transcript</summary><div class="transcript-list">${s.transcript.slice(0,(frame.current?.at??-1)+1).map(t=>`<article class="${t.who}"><header>${names[t.who]}${t.phase==='confer'?' · private':''}</header><p>${esc(t.who==='machine'?t.say||t.text:t.text)||'No message recorded.'}</p></article>`).join('')}</div></details>`;}
function render({follow=false,revealEvidence=false}={}){
 if(!data)return;const runs=selectedRuns(),width=$('stage').clientWidth,compare=mode==='paths',cardWidth=compare&&window.innerWidth>760?(width-24)/2:width,labelWidth=compare||window.innerWidth<=690?140:180;
 const previous=new Map([...$('stage').querySelectorAll('.run-panel')].map(el=>[el.dataset.path,{scroll:el.querySelector('.ledger-scroll')?.scrollLeft||0,open:el.querySelector('.transcript')?.open}]));
 $('stage').classList.toggle('compare',compare);$('stage').innerHTML=runs.map(s=>{const model=getModel(s),frame=journeyFrame(model,step),ledger=ledgerFrame(model,frame),fresh=frame.index>(lastFrames.get(identity(s))??-1);lastFrames.set(identity(s),frame.index);return `<section class="run-panel" data-path="${s.path}"><div class="ledger-toolbar"><h2>${esc(compare?PATHS[s.path]:'Need trace')}</h2><div class="ledger-focus">${selectedNeed?`<span>${esc(selectedNeed)}</span><button data-clear-need>All needs</button>`:'<span>Expression → reading → bridge</span>'}</div></div>${diagram(s,model,frame,ledger,Math.max(200,cardWidth-labelWidth-2),labelWidth,fresh)}${legend()}${evidence(s,model,frame,ledger)}${transcript(s,frame,previous.get(s.path)?.open)}</section>`;}).join('');
 syncControls();$('stage').setAttribute('aria-busy','false');
 cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{for(const s of runs){const panel=$('stage').querySelector(`[data-path="${s.path}"]`);if(!panel)continue;const scroller=panel.querySelector('.ledger-scroll');scroller.scrollLeft=previous.get(s.path)?.scroll||0;if(follow){const hit=panel.querySelector('.ledger-column.active .ledger-hit');if(hit){const x=Number(hit.getAttribute('x')),w=Number(hit.getAttribute('width'));if(x<scroller.scrollLeft||x+w>scroller.scrollLeft+scroller.clientWidth)scroller.scrollTo({left:Math.max(0,x+w-scroller.clientWidth+12),behavior:'auto'});}}if($('bridge-'+s.path))drawCrossing($('bridge-'+s.path),s.outcome.shape,s.outcome.world,[]);}if(revealEvidence&&inspection){$('stage').querySelector(`[data-path="${inspection.path}"] .evidence`)?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}});
}
function activate(target){
 const path=target.closest('[data-path]')?.dataset.path;
 if(target.matches('[data-clear-need]')){selectedNeed=null;render();return;}
 if(target.matches('[data-need]')){pause();const key=target.dataset.need;selectedNeed=selectedNeed===key?null:key;render();$('stage').querySelector(`[data-path="${path}"] [data-need="${CSS.escape(key)}"]`)?.focus({preventScroll:true});return;}
 const idx=Number(target.dataset.event??target.dataset.column);if(!Number.isFinite(idx))return;pause();
 if(mode==='paths'){mode='run';sel.path=path;$('path').value=path;updateHash();step=Math.min(step,finalStep());}
 if(idx>step)step=idx;
 inspection={path,index:idx};if(target.dataset.key)selectedNeed=target.dataset.key;
 render({follow:true,revealEvidence:target.hasAttribute('data-event')});
 const selector=target.hasAttribute('data-event')?`[data-event="${idx}"][data-key="${CSS.escape(target.dataset.key)}"]`:`[data-column="${idx}"]`;
 $('stage').querySelector(`[data-path="${path}"] ${selector}`)?.focus({preventScroll:true});
}
$('play').onclick=play;$('back').onclick=()=>seek(step-1);$('next').onclick=()=>seek(step+1);$('reset').onclick=()=>seek(0);$('overview').onclick=()=>seek(finalStep());$('scrub').oninput=e=>seek(e.target.value);$('speed').onchange=()=>{if(playing)schedule();};
for(const name of ['run','paths'])$('mode-'+name).onclick=()=>{mode=name;choose();};
for(const k of ['path','scen','pair'])$(k).onchange=()=>{sel[k]=k==='pair'?Number($(k).value):$(k).value;choose();};
$('stage').addEventListener('click',e=>{if(e.target.closest('summary')){if(playing)pause();return;}const target=e.target.closest('[data-event],[data-column],[data-need],[data-clear-need]');if(target)activate(target);});
$('stage').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-event],[data-column],[data-need]')){e.preventDefault();activate(e.target);}});
$('guide-toggle').onclick=()=>{if(playing)pause();$('guide').showModal();};$('guide-close').onclick=()=>{$('guide').close();$('guide-toggle').focus();};
document.addEventListener('keydown',e=>{if(!data||e.defaultPrevented||$('guide').open||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,a,summary,[data-column],[data-need],[data-event]'))return;if(e.code==='Space'){if(e.target.closest('button'))return;e.preventDefault();play();}else if(e.key==='ArrowRight'){e.preventDefault();seek(step+1);}else if(e.key==='ArrowLeft'){e.preventDefault();seek(step-1);}else if(e.key.toLowerCase()==='r'){e.preventDefault();seek(0);}});
window.addEventListener('hashchange',()=>{if(data)readHash();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause();});let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(),100);});
async function init(){try{$('error').hidden=true;const response=await fetch('eight-paths.json');if(!response.ok)throw Error('Archive unavailable');data=await response.json();$('path').innerHTML=data.paths.map(([p])=>`<option value="${p}">${PATHS[p]}</option>`).join('');$('scen').innerHTML=Object.keys(data.scenarios).map(s=>`<option value="${s}">${SCENARIOS[s]}</option>`).join('');$('pair').innerHTML=[...new Set(data.sessions.map(s=>s.pair))].sort((a,b)=>a-b).map(p=>`<option value="${p}">${String(p+1).padStart(2,'0')}</option>`).join('');$('key-list').innerHTML=Object.entries(FEATLABEL).map(([key,text])=>`<div><code>${esc(key)}</code><p><strong>${esc(keyName(key))}</strong><br>${esc(text)}</p></div>`).join('');for(const id of ['play','back','next','scrub','reset','overview','path','scen','pair','mode-run','mode-paths'])$(id).disabled=false;readHash();}catch(error){$('error').hidden=false;$('stage').setAttribute('aria-busy','false');for(const id of ['play','back','next','scrub','reset','overview','path','scen','pair','mode-run','mode-paths'])$(id).disabled=true;}}
$('retry').onclick=init;init();
