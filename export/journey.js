import {PATHS,SCENARIOS} from './flow-model.mjs?v=6';
import {FEATLABEL} from './flow-journey.mjs?v=3';
import {buildJourney,journeyFrame} from './journey-playback.mjs?v=1';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={A:'Role 1',B:'Role 2',M:'AI',machine:'AI'};
const sel={path:'all',scen:'pairs',pair:0};
const models=new Map(),lastFrames=new Map();
let data,mode='run',step=0,playing=false,timer=null,layoutFrame=null;
const identity=s=>`${s.path}:${s.scenario}:${s.pair}`;
const getModel=s=>{const key=identity(s);if(!models.has(key))models.set(key,buildJourney(s));return models.get(key);};
const selectedRuns=()=>!data?[]:mode==='paths'?data.paths.map(([path])=>data.sessions.find(s=>s.path===path&&s.scenario===sel.scen&&s.pair===sel.pair)).filter(Boolean):[data.sessions.find(s=>s.path===sel.path&&s.scenario===sel.scen&&s.pair===sel.pair)].filter(Boolean);
const finalStep=()=>Math.max(0,...selectedRuns().map(s=>getModel(s).columns.length-1));
const markToken=(key,refused)=>JSON.stringify([key,refused]);
function phase(c,s){if(!c)return '';if(c.kind==='built')return 'Final bridge';if(c.kind==='meant')return `${names[c.role]} speaks`;const source=s.transcript[c.sourceTurnIndex];return source?`${names[c.role]} reads ${names[source.who]}`:`${names[c.role]}'s recorded reading`;}
function syncControls(){
 const end=finalStep();$('play').textContent=playing?'Ⅱ Pause':'▶ Play';$('play').setAttribute('aria-label',playing?'Pause replay':'Play replay');document.body.classList.toggle('is-playing',playing);
 $('back').disabled=step===0;$('next').disabled=step===end;$('scrub').max=end;$('scrub').value=step;$('scrub').setAttribute('aria-valuetext',`Step ${step+1} of ${end+1}`);$('position').textContent=`${step+1} / ${end+1}`;
 $('path').disabled=mode==='paths';for(const name of ['run','paths'])$('mode-'+name).setAttribute('aria-pressed',String(mode===name));
}
function pause(){playing=false;clearTimeout(timer);timer=null;syncControls();}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(!playing)return;if(step>=finalStep()){pause();return;}step++;render({follow:true});if(step===finalStep())timer=setTimeout(pause,800);else schedule();},2400/Number($('speed').value));}
function play(){if(!data)return;if(playing){pause();return;}playing=true;if(step===finalStep()){step=0;lastFrames.clear();}else step++;render({follow:true});schedule();}
function seek(value){pause();step=Math.max(0,Math.min(finalStep(),Number(value)));render({follow:true});}
function updateHash(){history.replaceState(null,'',`#path=${sel.path}&scen=${sel.scen}&pair=${sel.pair}&mode=${mode}`);$('to-flow').href=`flow.html#path=${sel.path}&scen=${sel.scen}&pair=${sel.pair}`;}
function choose(){pause();step=0;lastFrames.clear();updateHash();render({follow:true});}
function readHash(){const p=new URLSearchParams(location.hash.slice(1));sel.path=PATHS[p.get('path')]?p.get('path'):'all';sel.scen=SCENARIOS[p.get('scen')]?p.get('scen'):'pairs';const requested=Number(p.get('pair'));sel.pair=Number.isInteger(requested)&&data.sessions.some(s=>s.pair===requested)?requested:0;mode=p.get('mode')==='paths'?'paths':'run';for(const k of ['path','scen','pair'])$(k).value=sel[k];choose();}
function diagram(s,model,frame,available,fresh){
 const count=model.columns.length,colW=Math.max(72,available/count),W=count*colW,top=60,row=30,H=top+Math.max(1,model.lanes.length)*row+12;
 const X=i=>(i+.5)*colW,Y=key=>top+(model.lanes.indexOf(key)+.5)*row;
 const seen=new Set(frame.lanes),color=key=>{const first=model.columns.find(c=>c.keys.some(k=>k.key===key));return first?.role==='B'?'#8b7590':first?.role==='A'?'#6f8666':'#899385';};
 const add=new Set(frame.added.map(e=>`${e.at}:${markToken(e.key,e.refused)}`));
 const canAnimate=fresh&&playing&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
 let labels='',grid='',columns='',edges='',nodes='';
 for(const key of model.lanes){const y=Y(key);grid+=`<path class="lane-grid" d="M0 ${y}H${W}"/>`;if(seen.has(key))labels+=`<g class="lane-label" style="--lane-color:${color(key)}"><title>${esc(FEATLABEL[key]||key)}</title><circle class="lane-dot" cx="15" cy="${y}" r="3"/><text class="lane-name" x="26" y="${y+4}">${esc(key)}</text></g>`;}
 model.columns.forEach((c,i)=>{const x=X(i),pending=i>frame.index,active=i===frame.index,who=c.kind==='built'?'Bridge':names[c.role],type=c.kind==='meant'?'expressed':c.kind==='built'?'built':'interpreted';
  columns+=`<rect class="column-bg${active?' active':pending?' pending':''}" x="${i*colW+2}" y="0" width="${colW-4}" height="${H}"/>`;
  if(i&&c.at!==model.columns[i-1].at)columns+=`<path class="stage-divider" d="M${i*colW} 57V${H-4}"/>`;
  columns+=`<g class="column-heading${pending?' pending':''}" data-column="${i}" role="button" tabindex="0" aria-label="Step ${i+1}: ${esc(phase(c,s))}" ${active?'aria-current="step"':''}><rect class="column-hit" x="${i*colW}" y="0" width="${colW}" height="55"/><text class="column-title ${c.role}" x="${x}" y="25">${who}</text><text class="column-type" x="${x}" y="41">${type}</text></g>`;
 });
 const path=(from,to,key)=>{const a=X(from)+7,b=X(to)-7,y=Y(key);return to-from>1?`M${a} ${y}C${a+15} ${y-12} ${b-15} ${y-12} ${b} ${y}`:`M${a} ${y}H${b}`;};
 for(const link of frame.links){const d=path(link.from,link.to,link.key),now=canAnimate&&link.to===frame.index;edges+=`<g style="--lane-color:${color(link.key)}"><title>${esc((link.kind==='output'?'Recorded output match: ':'Carried: ')+link.key+(link.refused===true?' (ruled out)':link.polarityKnown===false?' (listener stance not recorded)':''))}</title><path class="journey-link ${link.kind==='output'?'build-link':'carried'}${now?' fresh':''}" style="--length:${(link.to-link.from)*colW+20}" d="${d}"/>${now?`<circle r="3" fill="${color(link.key)}" class="traveller"><animateMotion dur="650ms" path="${d}" fill="freeze"/></circle>`:''}</g>`;}
 for(const drop of frame.drops){const x=X(drop.to),y=Y(drop.key),opposite=model.columns[drop.to].keys.some(k=>k.key===drop.key),mx=opposite?x-13:x,my=opposite?y+10:y,d=opposite?`M${X(drop.from)+7} ${y}C${X(drop.from)+22} ${my} ${mx-22} ${my} ${mx-6} ${my}`:path(drop.from,drop.to,drop.key),now=canAnimate&&drop.to===frame.index;edges+=`<g><title>${esc(`Not carried to ${names[model.columns[drop.to].role]}: ${drop.key}${drop.refused?' (ruled out)':''}`)}</title><path class="journey-link missed${now?' fresh':''}" d="${d}"/><path class="drop-mark${now?' fresh':''}" d="M${mx-3} ${my-3}l6 6m-6 0l6-6"/></g>`;}
 for(const c of frame.columns)for(const entry of c.keys){const x=X(c.index),y=Y(entry.key),added=add.has(`${c.index}:${markToken(entry.key,entry.refused)}`),now=canAnimate&&c.index===frame.index;
  const tip=`${names[c.role]} · ${FEATLABEL[entry.key]||entry.key}${entry.world?' · environment':entry.refused===true?' · ruled out':c.polarityKnown===false?' · listener stance not recorded':''}${added?' · added at this hand-off':''}`;
  if(added)edges+=`<path class="journey-link added${now?' fresh':''}" d="M${x-23} ${y}H${x-8}"/>`;
  const cls=`journey-node${c.kind==='built'?' built':''}${added?' added':''}${entry.refused?' refused':''}${now?' fresh':''}`;
  nodes+=`<g style="--lane-color:${color(entry.key)}"><title>${esc(tip)}</title>${c.kind==='built'?`<rect class="${cls}" x="${x-5}" y="${y-5}" width="10" height="10" rx="2"/>`:`<circle class="${cls}" cx="${x}" cy="${y}" r="5.5"/>`}${entry.refused?`<path class="refusal-mark" d="M${x-3} ${y}H${x+3}"/>`:''}</g>`;
 }
 const summary=frame.current?phase(frame.current,s)+'. Visible keys: '+frame.lanes.join(', '):'No keys shown yet.';
 return `<div class="diagram-shell"><svg class="lane-labels" width="116" height="${H}" viewBox="0 0 116 ${H}" aria-label="Visible keys">${labels}</svg><div class="diagram-scroll" tabindex="0" aria-label="Scrollable need journey"><svg class="diagram" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(summary)}">${grid}${columns}${edges}${nodes}</svg></div></div>`;
}
const legend=()=>`<div class="diagram-legend" aria-label="Diagram legend"><span class="legend-item"><i class="legend-line" aria-hidden="true"></i>Carried</span><span class="legend-item"><i class="legend-added" aria-hidden="true"></i>Added</span><span class="legend-item"><i class="legend-missed" aria-hidden="true"></i>Not carried</span><span class="legend-item"><i class="legend-refused" aria-hidden="true"></i>Ruled out</span><span class="legend-item"><i class="legend-built" aria-hidden="true"></i>Built</span></div>`;
function detail(s,frame){const c=frame.current;if(!c)return '';if(c.kind==='built')return `<div class="current-step final-step"><div class="final-copy"><h3>${esc(s.outcome.name)}</h3></div><canvas id="bridge-${s.path}" aria-label="Final recorded bridge"></canvas></div>`;
 const source=c.sourceTurnIndex===null?null:s.transcript[c.sourceTurnIndex],who=source?.who||c.role,text=source?.text||c.contextText||'';
 return `<div class="current-step"><span class="speaker-tag ${who}">${names[who]}</span><p class="quote">${esc(text)||'No message recorded.'}</p></div>`;}
function transcript(s,frame,open){return `<details class="transcript"${open?' open':''}><summary>Transcript</summary><div class="transcript-list">${s.transcript.slice(0,(frame.current?.at??-1)+1).map(t=>`<article class="${t.who}"><header>${names[t.who]}${t.phase==='confer'?' · private':''}</header><p>${esc(t.who==='machine'?t.say||t.text:t.text)||'No message recorded.'}</p></article>`).join('')}</div></details>`;}
function render({follow=false}={}){
 if(!data)return;const runs=selectedRuns(),width=$('stage').clientWidth,compare=mode==='paths',cardWidth=compare&&window.innerWidth>760?(width-24)/2:width;
 const previous=new Map([...$('stage').querySelectorAll('.run-panel')].map(el=>[el.dataset.path,{scroll:el.querySelector('.diagram-scroll')?.scrollLeft||0,open:el.querySelector('.transcript')?.open}]));
 $('stage').classList.toggle('compare',compare);$('stage').innerHTML=runs.map(s=>{const model=getModel(s),frame=journeyFrame(model,step),fresh=frame.index>(lastFrames.get(identity(s))??-1);lastFrames.set(identity(s),frame.index);return `<section class="run-panel" data-path="${s.path}"><div class="panel-top"><h2>${esc(compare?PATHS[s.path]:phase(frame.current,s))}</h2><span class="step-label">${compare?`${frame.index+1} / ${model.columns.length}`:''}</span></div>${diagram(s,model,frame,Math.max(200,cardWidth-118),fresh)}${legend()}${detail(s,frame)}${transcript(s,frame,previous.get(s.path)?.open)}</section>`;}).join('');
 syncControls();$('stage').setAttribute('aria-busy','false');
 cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{for(const s of runs){const panel=$('stage').querySelector(`[data-path="${s.path}"]`);if(!panel)continue;const scroller=panel.querySelector('.diagram-scroll'),frame=journeyFrame(getModel(s),step);scroller.scrollLeft=previous.get(s.path)?.scroll||0;if(follow){const current=panel.querySelector('[aria-current="step"] .column-hit');if(current){const x=Number(current.getAttribute('x')),w=Number(current.getAttribute('width'));if(x<scroller.scrollLeft+8||x+w>scroller.scrollLeft+scroller.clientWidth-8)scroller.scrollTo({left:Math.max(0,x+w-scroller.clientWidth+24),behavior:playing&&!matchMedia('(prefers-reduced-motion:reduce)').matches?'smooth':'auto'});}}if(frame.done&&$('bridge-'+s.path))drawCrossing($('bridge-'+s.path),s.outcome.shape,s.outcome.world,[]);}});
}
$('play').onclick=play;$('back').onclick=()=>seek(step-1);$('next').onclick=()=>seek(step+1);$('reset').onclick=()=>seek(0);$('scrub').oninput=e=>seek(e.target.value);$('speed').onchange=()=>{if(playing)schedule();};
for(const name of ['run','paths'])$('mode-'+name).onclick=()=>{mode=name;choose();};
for(const k of ['path','scen','pair'])$(k).onchange=()=>{sel[k]=k==='pair'?Number($(k).value):$(k).value;choose();};
$('stage').addEventListener('click',e=>{const target=e.target.closest('[data-column]');if(!target)return;const path=target.closest('[data-path]').dataset.path;if(mode==='paths'){mode='run';sel.path=path;$('path').value=path;updateHash();}seek(Number(target.dataset.column));});
$('stage').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-column]')){e.preventDefault();const at=Number(e.target.dataset.column),path=e.target.closest('[data-path]').dataset.path;if(mode==='paths'){mode='run';sel.path=path;$('path').value=path;updateHash();}seek(at);$('stage').querySelector(`[data-column="${at}"]`)?.focus({preventScroll:true});}});
$('stage').addEventListener('toggle',e=>{if(e.target.matches('.transcript')&&e.target.open&&playing)pause();},true);
$('guide-toggle').onclick=()=>{if(playing)pause();$('guide').showModal();};$('guide-close').onclick=()=>{$('guide').close();$('guide-toggle').focus();};
document.addEventListener('keydown',e=>{if(!data||e.defaultPrevented||$('guide').open||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,a,summary,[data-column]'))return;if(e.code==='Space'){if(e.target.closest('button'))return;e.preventDefault();play();}else if(e.key==='ArrowRight'){e.preventDefault();seek(step+1);}else if(e.key==='ArrowLeft'){e.preventDefault();seek(step-1);}else if(e.key.toLowerCase()==='r'){e.preventDefault();seek(0);}});
window.addEventListener('hashchange',()=>{if(data)readHash();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause();});let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(),100);});
async function init(){try{$('error').hidden=true;const response=await fetch('eight-paths.json');if(!response.ok)throw Error('Archive unavailable');data=await response.json();$('path').innerHTML=data.paths.map(([p])=>`<option value="${p}">${PATHS[p]}</option>`).join('');$('scen').innerHTML=Object.keys(data.scenarios).map(s=>`<option value="${s}">${SCENARIOS[s]}</option>`).join('');$('pair').innerHTML=[...new Set(data.sessions.map(s=>s.pair))].sort((a,b)=>a-b).map(p=>`<option value="${p}">${String(p+1).padStart(2,'0')}</option>`).join('');$('key-list').innerHTML=Object.entries(FEATLABEL).map(([key,text])=>`<div><code>${esc(key)}</code><p>${esc(text)}</p></div>`).join('');for(const id of ['play','back','next','scrub','reset','path','scen','pair','mode-run','mode-paths'])$(id).disabled=false;readHash();}catch(error){$('error').hidden=false;$('stage').setAttribute('aria-busy','false');for(const id of ['play','back','next','scrub','reset','path','scen','pair','mode-run','mode-paths'])$(id).disabled=true;}}
$('retry').onclick=init;init();
