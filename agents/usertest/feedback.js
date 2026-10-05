(async()=>{
'use strict';
const $=id=>document.getElementById(id);
const connection=window.bridgeFeedbackConnection;
const apiFetch=(path,options)=>connection?connection.fetch(path,options):fetch(path,options);
const assetURL=path=>connection?connection.url(path):path;
const feedbackHistoryBase=connection?new URL('./feedback-records.html',location.href).href:'https://vividadiva.github.io/two-worlds-bridge/feedback-records.html';
function connectionError(message){$('context').textContent='We could not load the saved experiment.';$('receipt').replaceChildren();const text=document.createElement('p');text.textContent=message;const retry=document.createElement('button');retry.type='button';retry.className='primary';retry.textContent='Try connecting again';retry.onclick=()=>location.reload();$('receipt').append(text,retry);$('status').textContent='';document.querySelector('nav').hidden=true;document.querySelector('.context-sidebar').hidden=true;$('records').hidden=true;}
// Keep submitted attempts across refreshes; never restore them into a fresh questionnaire.
const pendingCopies=new Map();
function recoveryStore(action,value){return new Promise((resolve,reject)=>{
 let db,settled=false;const done=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);db?.close();error?reject(error):resolve(result);};
 const timer=setTimeout(()=>done(Error('Local backup timed out')),4000);
 try{const request=indexedDB.open('two-worlds-feedback-outbox',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('attempts',{keyPath:'submissionId'});
 request.onerror=()=>done(request.error);
 request.onsuccess=()=>{db=request.result;if(settled){db.close();return;}const tx=db.transaction('attempts',action==='list'?'readonly':'readwrite'),store=tx.objectStore('attempts');let result;
 const op=action==='list'?store.getAll():action==='put'?store.put(value):store.delete(value);
 op.onsuccess=()=>{result=op.result;};tx.oncomplete=()=>done(null,result);tx.onerror=()=>done(tx.error||Error('Local backup failed'));tx.onabort=()=>done(tx.error||Error('Local backup aborted'));};
 }catch(error){done(error);}
});}
function renderRecovery(){
 const panel=$('recovery-copies');panel.replaceChildren();panel.hidden=!pendingCopies.size;if(panel.hidden)return;
 const title=document.createElement('h3');title.textContent='Submission backups';const help=document.createElement('p');help.textContent='These attempts have not been confirmed on this page. Download a complete copy if saving fails, and give it to your researcher. It contains all three steps, comments, scores and images.';panel.append(title,help);
 for(const item of pendingCopies.values()){const button=document.createElement('button');button.type='button';button.textContent=`Download backup · ${item.room} · ${new Date(item.backedUpAt).toLocaleString()}`;button.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(item)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`feedback-backup-${item.room}-${item.submissionId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};panel.append(button);}
}
async function retainSubmission(item){pendingCopies.set(item.submissionId,item);renderRecovery();try{await recoveryStore('put',item);return true;}catch{return false;}}
async function releaseSubmission(id){try{await recoveryStore('delete',id);pendingCopies.delete(id);renderRecovery();}catch{/* Keep the recoverable copy if local cleanup fails. */}}
recoveryStore('list').then(items=>{for(const item of items)if(!pendingCopies.has(item.submissionId))pendingCopies.set(item.submissionId,item);renderRecovery();}).catch(()=>{});
function sameSubmission(saved,payload,images){return !!saved&&JSON.stringify(saved.draft)===JSON.stringify(payload)&&JSON.stringify(saved.images)===JSON.stringify(images);}
if(connection){try{await connection.ready;}catch(e){connectionError(e.message);return;}}
let room=new URLSearchParams(location.search).get('room');
let variant=new URLSearchParams(location.search).get('variant');
const embedded=new URLSearchParams(location.search).get('embedded')==='1';
const params=new URLSearchParams(location.search), participant=params.get('participant')==='1', seat=params.get('role');
if(embedded)document.body.classList.add('embedded');
if(['A','B'].includes(seat))$('role').value=seat;
if(participant){$('role').value='B';$('role').disabled=true;$('identity-picker').hidden=true;$('back').hidden=true;document.title='Role 2 · Bridge feedback';}
// A shared study link is not a participant identity. Keep identity and receipt ownership
// in this browser, while all actual feedback remains durably stored by the server.
const identityKey='two-worlds-feedback-respondent-v1';
let respondentId;
try{respondentId=localStorage.getItem(identityKey);if(!respondentId){respondentId=crypto.randomUUID();localStorage.setItem(identityKey,respondentId);}}
catch{respondentId=crypto.randomUUID();}
const receiptKey='two-worlds-feedback-receipts-v1:'+respondentId;
let ownReceipts=new Set();
try{ownReceipts=new Set(JSON.parse(localStorage.getItem(receiptKey)||'[]'));}catch{}
function rememberReceipt(id){ownReceipts.add(id);try{localStorage.setItem(receiptKey,JSON.stringify([...ownReceipts]));}catch{}}
function ownFeedback(r){return r.draft?.respondentId===respondentId||ownReceipts.has(r.id);}
const colors={red:'#e75e65',neutral:'#f3ccd9',some:'#a8d8f0',blue:'#2672cb'};
const bridgeRatingKeys=['veryRed','red','neutral','blue','veryBlue'];
const bridgeColors={veryRed:'#b42335',red:'#ef9a9f',neutral:'#d7dadd',blue:'#8abfe8',veryBlue:'#205da8'};
const labels={veryRed:'Very dissatisfied',veryBlue:'Very satisfied',red:'Dissatisfied',neutral:'Neutral',some:'Somewhat satisfied',blue:'Satisfied',none:'Erase color'};
let step=0,color=null,mode='erase',brush=48,draft,matches,background,sketch=null,dirty=false,pointer=null,preview=null;
let undo=[[],[],[]],redo=[[],[],[]];
let orientation='horizontal',pieceLength=100,hover=null,original=false,beforeAction=null;
let zoom=1,sketchTool='comments',cursorPoint=null;
const fields=['ratings','added','annotations'];
const pieces={horizontal:[1,0],vertical:[0,1],rising:[1,-1],falling:[1,1]};
const status=t=>$('status').textContent=t;
const clone=x=>JSON.parse(JSON.stringify(x));
const pageDrafts=new Map();
const localKey=()=>`bridge-feedback-v1:${room}:${variant||'main'}:${$('role').value}`;
// Synchronous, compact backups after each committed edit, separate from submissions.
const draftStorageKeys=new Map();
const cloudDraftQueue=new Map(),cloudDraftRevisions=new Map();let cloudDraftTimer=null,cloudDraftBusy=false;
function queueCloudDraft(key,record){cloudDraftQueue.set(key,record);if(!cloudDraftTimer)cloudDraftTimer=setTimeout(flushCloudDrafts,1000);}
async function flushCloudDrafts(){
 clearTimeout(cloudDraftTimer);cloudDraftTimer=null;if(cloudDraftBusy)return;cloudDraftBusy=true;
 try{for(const [key,record] of [...cloudDraftQueue]){try{
  const r=await apiFetch('/api/drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:record.room,id:record.draft.cloudDraftId,revision:record.revision,draft:record.draft})});
  if(!r.ok)throw Error('Cloud draft not confirmed');const saved=(await r.json()).record;
  if(saved?.revision!==record.revision||JSON.stringify(saved.draft)!==JSON.stringify(record.draft))throw Error('Cloud draft differs');
  if(cloudDraftQueue.get(key)===record){cloudDraftQueue.delete(key);try{const local=JSON.parse(localStorage.getItem(key));if(local?.revision===record.revision){local.cloudSavedAt=saved.at;localStorage.setItem(key,JSON.stringify(local));}}catch{}
   if(draftStorageKeys.get(localKey())===key)$('autosave-status').textContent='Saved to researcher’s cloud · '+new Date(saved.at).toLocaleTimeString()+' · Draft, not submitted';}
 }catch{if(draftStorageKeys.get(localKey())===key)$('autosave-status').textContent='Cloud backup pending · retrying automatically. Keep this page open until Saved to researcher’s cloud appears.';}}
 }finally{cloudDraftBusy=false;if(cloudDraftQueue.size&&!cloudDraftTimer)cloudDraftTimer=setTimeout(flushCloudDrafts,5000);}
}
window.addEventListener('online',()=>flushCloudDrafts());

function draftPrefix(){return `two-worlds-autodraft-v1:${respondentId}:${localKey()}:`;}
function persistDraft(){
 const scope=localKey();if(!draftStorageKeys.has(scope))draftStorageKeys.set(scope,draftPrefix()+crypto.randomUUID());
 const key=draftStorageKeys.get(scope);draft.cloudDraftId=key.split(':').at(-1);draft.removed=[...(draft.rebuildRemoved||[])];const revision=Math.max(Date.now(),(cloudDraftRevisions.get(key)||0)+1);cloudDraftRevisions.set(key,revision);const record={revision,kind:'unsubmitted-feedback-draft',room,variant:variant||null,step,savedAt:new Date().toISOString(),draft:clone(draft)};
 queueCloudDraft(key,record);
 try{const encoded=JSON.stringify(record);localStorage.setItem(key,encoded);if(localStorage.getItem(key)!==encoded)throw Error('Backup verification failed');$('autosave-status').textContent='Saved on this browser; syncing to researcher’s cloud · '+new Date(record.savedAt).toLocaleTimeString()+' · Not submitted';return true;}
 catch{$('autosave-status').textContent='Automatic backup unavailable. Keep this page open and submit, or download your draft below.';return false;}
}
function downloadDraft(record){const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`feedback-draft-${record.room}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function showDraftRecovery(){
 const panel=$('draft-recovery');panel.replaceChildren();const items=[];
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(draftPrefix())&&key!==draftStorageKeys.get(localKey())){const record=JSON.parse(localStorage.getItem(key));if(record?.kind==='unsubmitted-feedback-draft'&&record.room===room&&record.draft?.respondentId===respondentId)items.push({key,record});}}}catch{}
 items.sort((a,b)=>b.record.savedAt.localeCompare(a.record.savedAt));panel.hidden=!items.length;
 if(!items.length)return;const intro=document.createElement('p');intro.textContent='Unsubmitted drafts from this browser. Restore one to continue, or start a new response below. Cloud-saved copies appear separately as unsubmitted drafts in the researcher’s History.';panel.append(intro);
 for(const {key,record} of items){const row=document.createElement('div'),restore=document.createElement('button'),download=document.createElement('button');restore.type=download.type='button';restore.textContent='Restore draft · '+new Date(record.savedAt).toLocaleString();download.textContent='Download draft';
 restore.onclick=async()=>{if(saving||switching)return;if(dirty)persistDraft();draftStorageKeys.set(localKey(),key);pageDrafts.set(localKey(),clone(record.draft));dirty=true;pendingRooms.add(room);await load();step=Math.max(0,Math.min(2,record.step||0));render();persistDraft();$('workspace').scrollIntoView({block:'start'});};download.onclick=()=>downloadDraft(record);row.append(restore,download);panel.append(row);}
}
$('download-draft').onclick=()=>{syncVisibleNote();downloadDraft({kind:'unsubmitted-feedback-draft',room,variant:variant||null,step,savedAt:new Date().toISOString(),draft:clone(draft)});};
let h,source,pair=null,switching=false,saving=false;
let pathItems=[],pathProgress=new Map(),pendingRooms=new Set();
const routeLabels={all:'Discuss together',develop:'Discuss together · auto-build',confer:'Discuss privately, then tell AI',both:'Tell AI separately',chain:'Role 1 → Role 2 → AI','via-1':'Role 1 → AI → Role 2','via-2':'Role 2 → AI → Role 1','only-1':'Role 1 only','only-2':'Role 2 only'};
const routeOrder=Object.keys(routeLabels);
async function fetchState(id){const r=await apiFetch(`/api/state?room=${encodeURIComponent(id)}&role=host`);if(!r.ok)throw Error('Session is unavailable');return r.json();}
function setSource(){
const v=variant==='control'&&h.control?{...h,...h.control,sheetDrawn:null}:h;
const last=h.sketches?.at(-1);
// A legacy side-by-side control has no separate sketch: never label the Toolkit image as Control.
const sketchUrl=last&&variant!=='control'?`/sketch/${encodeURIComponent(room)}/${last.n}.png`:null;
source={shape:v.shape,world:v.world,extras:v.sheetDrawn,standing:v.standing,sketchUrl,sketch:last||null,variant:variant||'main',agent:variant==='control'?'keys':(h.agent||'keys'),capturedAt:new Date().toISOString(),conversation:{room,argument:h.argument,route:h.route,arrow:h.arrow,note:h.note,lines:(h.lines||[]).filter(l=>variant!=='control'||l.who!=='builder').map(l=>({who:l.who,text:l.text,phase:l.phase,upload:l.upload,decision:l.decision,relay:l.relay,about:l.about,clarification:l.clarification,understandingUpdate:l.understandingUpdate,built:l.built,failed:!!l.failed}))}};
$('feedback-history').href=feedbackHistoryBase+'?room='+encodeURIComponent(room)+'&role='+$('role').value;
$('back').href=assetURL(`/j/${encodeURIComponent(room)}/both`);
$('context').textContent=`${h.argument==='refs'?'Two references':h.argument==='pairs'?'Two lives':h.argument||'Bridge study'} · ${source.agent==='toolkit'?'Toolkit':'Control'} · Session ${room}`;
}
try{h=await fetchState(room);setSource();}catch(e){status(e.message);connectionError(e.message);return;}
try{const us=await apiFetch('/api/users').then(r=>r.json());const arr=Array.isArray(us)?us:us.users||us.profiles||[];pair=arr.find(u=>u.sessions?.some(s=>s.room===room));if(pair?.participants)$('role').options[1].textContent=`Role ${pair.participants[1]}`;}catch{}
if(participant){$('participant-badge').hidden=false;$('participant-badge').textContent=$('role').selectedOptions[0].textContent+' · Your feedback';}
function feedbackPaths(sessions){const seen=new Set();const replaySources=new Set(sessions.filter(s=>s.agent==='toolkit'&&!s.historical).map(s=>s.replay?.sourceRoom).filter(Boolean));return sessions.filter(s=>['keys','toolkit'].includes(s.agent)&&(s.agent==='keys'||!s.historical)&&s.hasContent&&s.argument==='pairs').sort((a,b)=>Number(replaySources.has(b.room))-Number(replaySources.has(a.room))).filter(s=>{const key=s.agent+':'+s.argument+':'+s.route;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.agent.localeCompare(b.agent)||a.argument.localeCompare(b.argument)||routeOrder.indexOf(a.route)-routeOrder.indexOf(b.route));}
function completedSummary(r){return r.role==='B'&&r.complete===true&&(r.respondentId===respondentId||ownReceipts.has(r.id));}
function renderPaths(){
 if(!pathItems.length)return;
 $('path-tour').hidden=false;
 const done=pathItems.filter(p=>pathProgress.get(p.room)===true).length;
 $('path-progress').textContent=`${done} of ${pathItems.length} paths submitted`;
 $('path-progress-bar').max=pathItems.length;$('path-progress-bar').value=done;
 const active=source.agent==='toolkit'?'toolkit':'keys';
 const visible=pathItems.filter(p=>p.agent===active);
 const conditions=$('condition-switch');conditions.replaceChildren();
 for(const [agent,name] of [['keys','Control'],['toolkit','Toolkit']]){const items=pathItems.filter(p=>p.agent===agent),count=items.filter(p=>pathProgress.get(p.room)===true).length;const b=document.createElement('button');b.type='button';b.dataset.condition=agent;b.setAttribute('aria-pressed',String(active===agent));b.disabled=switching||saving||!items.length;b.textContent=`${name} · ${count} / ${items.length} submitted`;conditions.append(b);}
 $('condition-label').textContent=`${active==='keys'?'CONTROL':'TOOLKIT'} · ONE PATH AT A TIME`;
 const list=$('path-list');list.replaceChildren();
 visible.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.dataset.room=p.room;b.setAttribute('aria-current',p.room===room?'page':'false');b.disabled=switching||saving;
 const label=document.createElement('span');label.textContent=`${i+1}. ${p.argument==='refs'?'Two references':'Two lives'} · ${routeLabels[p.route]||p.route}`;
 const tag=document.createElement('small');const submitted=pathProgress.get(p.room)===true;const hasDraft=pendingRooms.has(p.room);
 tag.textContent=submitted?(hasDraft?'Submitted · open-page draft':'Submitted'):hasDraft?'Draft in this page':pathProgress.get(p.room)===null?'Status unavailable':'Not submitted';b.append(label,tag);list.append(b);});
 const current=visible.findIndex(p=>p.room===room);
 $('current-path').textContent=current>=0?`Path ${current+1} of ${visible.length} · ${routeLabels[visible[current].route]||h.route}`:'Choose a path';
 $('continue-path').hidden=pathProgress.get(room)!==true||pendingRooms.has(room);
 const pending=nextPath();$('continue-path').disabled=!pending||switching||saving;$('continue-path').textContent=pending?`Continue: ${pending.agent==='keys'?'Control':'Toolkit'} · ${routeLabels[pending.route]||pending.route} →`:'Control and Toolkit submitted ✓';
}
function nextPath(){const i=pathItems.findIndex(p=>p.room===room);return [...pathItems.slice(i+1),...pathItems.slice(0,i)].find(p=>pathProgress.get(p.room)!==true);}
async function loadPathProgress(){await Promise.all(pathItems.map(async p=>{try{const r=await apiFetch(`/api/feedback?room=${encodeURIComponent(p.room)}&summary=1`,{cache:'no-store'});if(!r.ok)throw Error();const out=await r.json();pathProgress.set(p.room,(out.summaries||[]).some(completedSummary));}catch{pathProgress.set(p.room,null);}}));renderPaths();}
async function switchPath(id){
 finishComment();
 if(id===room||switching||saving||!pathItems.some(p=>p.room===id))return;
 switching=true;renderPaths();status('Opening this path…');
 try{const next=await fetchState(id);if(draft)pageDrafts.set(localKey(),clone(draft));room=id;variant=null;h=next;setSource();dirty=false;zoom=1;await load();await records();const url=new URL(location.href);url.searchParams.set('room',room);url.searchParams.delete('variant');history.replaceState(null,'',url);status('');$('path-tour').scrollIntoView({block:'start'});}
 catch(e){status(`Could not open this path: ${e.message}. Please try again.`);}
 finally{switching=false;renderPaths();}
}
$('path-list').onclick=e=>{const b=e.target.closest('[data-room]');if(b)switchPath(b.dataset.room);};
$('continue-path').onclick=()=>{const next=nextPath();if(next)switchPath(next.room);};
$('condition-switch').onclick=e=>{const b=e.target.closest('[data-condition]');if(!b)return;const options=pathItems.filter(p=>p.agent===b.dataset.condition);const target=options.find(p=>p.argument===h.argument&&p.route===h.route)||options.find(p=>pathProgress.get(p.room)!==true)||options[0];if(target)switchPath(target.room);};
// Two references is paused for feedback; preserve its sessions and submissions.
if(h.argument==='refs'){
 const available=feedbackPaths(pair?.sessions||[]),agent=source.agent==='toolkit'?'toolkit':'keys';
 const target=available.find(p=>p.agent===agent&&p.route===h.route)||available.find(p=>p.agent===agent)||available[0];
 if(!target){$('context').textContent='Two references feedback is paused.';$('receipt').textContent='Please ask the facilitator for a Two lives feedback link. Existing records are preserved.';document.querySelector('nav').hidden=true;return;}
 try{const next=await fetchState(target.room);room=target.room;variant=null;h=next;setSource();const url=new URL(location.href);url.searchParams.set('room',room);url.searchParams.delete('variant');history.replaceState(null,'',url);}
 catch(e){connectionError(e.message);return;}
}
if(participant&&!variant&&pair){pathItems=feedbackPaths(pair.sessions||[]);renderPaths();}
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
function fresh(){return {version:2,respondentId,ratingScale:{id:'bridge-satisfaction-5-v1',scores:Object.fromEntries(bridgeRatingKeys.map((key,i)=>[key,i+1])),labels:Object.fromEntries(bridgeRatingKeys.map(key=>[key,labels[key]])),unrated:'Cannot judge / not rated'},bridgePalette:{...bridgeColors},rebuildBasis:'original-independent-of-ratings',palette:{...colors},ratingLabels:{...labels},coordinateSpace:{width:1200,height:700},role:$('role').value,participantLabel:$('role').selectedOptions[0].textContent,source:clone(source),ratings:{},added:[],strokes:[],annotations:[],overallScores:[null,null,null],overallScoreScale:{min:-3,max:3,neutral:0,unknown:'cannot-judge',targets:['original bridge','rebuilt bridge','sketch']},notes:['','',''],visited:[true,false,false]};}
let editRevision=0;
let submissionAttempt=null;
let confirmedCurrent=false,showingSaved=false,hasReceipt=false;
function submissionUI(){
 $('submission-result').classList.toggle('saved',hasReceipt);
 $('saved-heading').hidden=!hasReceipt;
 $('saved-heading').textContent=confirmedCurrent?'✓ Feedback saved':'Unsaved changes';
 $('edit-submitted').hidden=!showingSaved;
 $('workspace').hidden=showingSaved;
 document.querySelector('nav').hidden=showingSaved;
 $('save').hidden=step!==2||confirmedCurrent;
 $('submission-review').hidden=step!==2||confirmedCurrent;
 $('save').textContent=hasReceipt?'Submit updated feedback':'Submit my feedback';
}
$('edit-submitted').onclick=()=>{showingSaved=false;submissionUI();$('workspace').scrollIntoView({block:'start',behavior:'smooth'});};
function localSave(){persistDraft();confirmedCurrent=false;showingSaved=false;dirty=true;pendingRooms.add(room);editRevision++;pageDrafts.set(localKey(),clone(draft));renderPaths();$('receipt').textContent='Not submitted yet. Your work will be sent to History when you click Submit feedback. Your draft is backed up on this browser when automatic backup is available.';if(hasReceipt)$('receipt').textContent='Your earlier submission is saved. Submit your new changes before continuing.';submissionUI();}
async function load(){confirmedCurrent=false;showingSaved=false;hasReceipt=false;$('submission-result').classList.remove('saved');$('saved-heading').hidden=true;$('edit-submitted').hidden=true;document.querySelector('nav').hidden=false;$('records').open=false;editRevision++;$('receipt').textContent='Your original result is safe. Work through the three steps, then submit your feedback to History.';draft=pageDrafts.has(localKey())?clone(pageDrafts.get(localKey())):fresh();if(pageDrafts.has(localKey()))$('receipt').textContent='Unsubmitted draft. Submit when you have finished all three steps.';draft.annotations ||= [];commentEdit=null;$('comment-bubble').hidden=true;undo=[[],[],[]];redo=[[],[],[]];pointer=null;preview=null;hover=null;original=false;beforeAction=null;step=0;color=null;mode='erase';sketch=null;showConversation();
if(draft.source.sketchUrl){try{sketch=await new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>resolve(img);img.onerror=reject;img.src=assetURL(draft.source.sketchUrl);});}catch{status('Saved sketch could not load. Matchstick feedback is still available.');}}
matches=crossingMatches(draft.source.shape,draft.source.world,draft.source.extras);$('workspace').hidden=false;render();showDraftRecovery();$('autosave-status').textContent=pageDrafts.has(localKey())?'Unsubmitted draft · changes save on this browser':'Changes automatically sync to the researcher’s cloud · draft, not submitted';}
let commentEdit=null;
function openComment(p,index=null){
 if(!sketch)return;if(commentEdit&&index===commentEdit.index){$('comment-text').focus();return;}const targetId=index===null?null:draft.annotations[index]?.id;finishComment();if(targetId){index=draft.annotations.findIndex(n=>n.id===targetId);if(index<0)return;}
 if(index===null){const radius=20*1200/Math.max(1,$('canvas').getBoundingClientRect().width);index=draft.annotations.findIndex(n=>Math.hypot(n.x-p.x,n.y-p.y)<=radius);}
 if(index<0&&(!color||color==='none')){$('active-tool').textContent='Choose a color first, then click the sketch.';return;}
 const before=clone(draft.annotations);
 if(index<0){draft.annotations.push({id:crypto.randomUUID(),x:p.x,y:p.y,color,text:''});index=draft.annotations.length-1;}
 commentEdit={index,before};const note=draft.annotations[index];
 $('comment-title').textContent=`Comment ${index+1}`;$('comment-text').value=note.text;$('comment-color').value=note.color;$('comment-error').textContent='';$('comment-bubble').hidden=false;
 localSave();renderComments();draw($('canvas'),2,true);positionComment();$('comment-text').focus({preventScroll:true});
}
function syncVisibleNote(){if(draft&&$('note').value!==draft.notes[step]){draft.notes[step]=$('note').value;localSave();}}
function finishComment(cancel=false){
 syncVisibleNote();
 if(!commentEdit)return;
 const before=commentEdit.before;
 if(!cancel&&draft.annotations[commentEdit.index]){draft.annotations[commentEdit.index].text=$('comment-text').value;draft.annotations[commentEdit.index].color=$('comment-color').value;}
 if(cancel||!draft.annotations[commentEdit.index]?.text.trim())draft.annotations=clone(before);
 const after=clone(draft.annotations);commentEdit=null;$('comment-bubble').hidden=true;
 if(JSON.stringify(before)!==JSON.stringify(after)){undo[2].push({before,after,label:'sketch comment'});redo[2]=[];}
 localSave();if(step===2)render();
}
function positionComment(){
 if(!commentEdit)return;const note=draft.annotations[commentEdit.index],rect=$('canvas').getBoundingClientRect(),bubble=$('comment-bubble');
 const x=rect.left+note.x/$('canvas').width*rect.width,y=rect.top+note.y/$('canvas').height*rect.height;
 bubble.style.left=Math.max(12,Math.min(window.innerWidth-bubble.offsetWidth-12,x+20))+'px';bubble.style.top=Math.max(12,Math.min(window.innerHeight-bubble.offsetHeight-12,y+16))+'px';
}
function renderComments(){
 $('sketch-comments').hidden=step!==2||!sketch;const list=$('comment-list');list.replaceChildren();
 for(const [i,note] of (draft.annotations||[]).entries()){const button=document.createElement('button');button.type='button';button.className='comment-card';button.style.borderLeftColor=colors[note.color];button.textContent=`${i+1}. ${labels[note.color]} — ${note.text||'Write your reason…'}`;button.onclick=()=>{if(original){original=false;render();}openComment(null,i);};list.append(button);}
 $('comment-list-help').textContent=draft.annotations.length?'Click a pin or a comment to edit it.':'No comments yet. Choose a color and click the sketch.';
}
$('comment-text').oninput=()=>{if(commentEdit){draft.annotations[commentEdit.index].text=$('comment-text').value;localSave();renderComments();}};
$('comment-color').onchange=()=>{if(commentEdit){draft.annotations[commentEdit.index].color=$('comment-color').value;localSave();renderComments();draw($('canvas'),2,true);}};
$('comment-done').onclick=()=>{if(!$('comment-text').value.trim()){$('comment-error').textContent='Write a short reason for this color.';$('comment-text').focus();return;}finishComment();};
$('comment-cancel').onclick=()=>finishComment(true);
$('comment-delete').onclick=()=>{if(!commentEdit)return;const before=commentEdit.before;draft.annotations.splice(commentEdit.index,1);const after=clone(draft.annotations);commentEdit=null;$('comment-bubble').hidden=true;if(JSON.stringify(before)!==JSON.stringify(after)){undo[2].push({before,after,label:'comment removal'});redo[2]=[];}localSave();render();};
$('comment-bubble').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();finishComment(true);}};
window.addEventListener('resize',positionComment);window.addEventListener('scroll',positionComment,true);
function removedIds(){return [...new Set(draft.rebuildRemoved||[])];}
const palette=()=>(step===0?bridgeRatingKeys:['red','neutral','some','blue']).map((k,i)=>`<button class="swatch" style="--color:${step===0?bridgeColors[k]:colors[k]}" data-color="${k}" aria-pressed="${k===color}"><span class="color-chip" aria-hidden="true"></span><span>${step===0?`${i+1} · `:''}${labels[k]}${step===0?'':`<small>${({red:'Red',neutral:'Light pink',some:'Light blue',blue:'Blue'})[k]}</small>`}</span></button>`).join('');
function allowRatingProgress(){return Object.keys(draft.ratings||{}).length>0||draft.unratedConfirmed===true;}
function requireRatingProgress(){if(allowRatingProgress())return true;changeStep(0);$('rating-error').textContent='No sticks are colored yet. Mark at least one stick, or explicitly choose to leave them uncolored.';$('rating-check').scrollIntoView({block:'center'});return false;}
$('rating-skip').onchange=()=>{draft.unratedConfirmed=$('rating-skip').checked;localSave();render();};
function render(){
 $('rating-check').hidden=step!==0;const ratedCount=Object.keys(draft.ratings||{}).length;$('rating-progress').textContent=ratedCount?`${ratedCount} sticks colored · these marks will be submitted`:'No sticks colored yet';$('rating-skip-label').hidden=ratedCount>0;$('rating-skip').checked=draft.unratedConfirmed===true;$('rating-error').textContent='';
 $('workspace').classList.toggle('sketch-step',step===2);
 document.querySelectorAll('[data-step]').forEach(b=>{b.classList.toggle('active',+b.dataset.step===step);b.setAttribute('aria-current',+b.dataset.step===step?'step':'false');});
 $('title').textContent=['Which parts meet your needs?','How would you change this bridge?','What do you think of this sketch?'][step];
 const removing=mode==='erase'||mode==='restore';
 $('step-position').textContent=`STEP ${step+1} OF 3`;
 $('instruction').textContent=[
  'Choose a rating from 1 (very dissatisfied) to 5 (very satisfied), then click individual sticks. 3 is neutral. Leave anything you cannot judge uncolored.',
  mode==='restore'?'The dashed outlines show sticks that were taken away. Click one to bring it back.':removing?'Start fresh from the original bridge. Click unwanted sticks to remove them. Your ratings from step 1 stay separate.':'Choose a direction and length, then click the grid to add a blue stick. No drawing needed.',
  'Choose a color, then click a place on the sketch. A comment bubble will open: tell us why you feel this way.'
 ][step];
 $('palette').classList.toggle('five-point',step===0);$('palette').innerHTML=step===1?'':palette();
 $('tools').innerHTML=step===2?'':step===1?`<p class="rebuild-progress"><span class="${removing?'current':''}">A · Take sticks away</span><span aria-hidden="true">→</span><span class="${!removing?'current':''}">B · Put new sticks in</span></p>${removing?`<div class="row"><button data-mode="${mode==='restore'?'erase':'restore'}">${mode==='restore'?'Back to taking sticks away':'Bring a stick back'}</button><span class="tool-explanation">You can also use Undo after a mistake.</span></div>`:`<div class="row piece-picker" aria-label="Choose the direction of the new stick">${Object.entries({horizontal:['━','Across'],vertical:['┃','Up / down'],rising:['╱','Slant up'],falling:['╲','Slant down']}).map(([k,[icon,name]])=>`<button data-piece="${k}" aria-pressed="${orientation===k}"><span class="piece-icon" aria-hidden="true">${icon}</span>${name}</button>`).join('')}<label>Stick length <select id="piece-length"><option value="50" ${pieceLength===50?'selected':''}>Short</option><option value="100" ${pieceLength===100?'selected':''}>Long</option></select></label></div><div class="row"><button data-mode="erase">← Take more sticks away</button><span class="tool-explanation">Blue sticks are your additions, not a rating.</span></div>`}`:`<div class="row"><button data-color="none" aria-pressed="${color==='none'}">Erase color</button><span class="tool-explanation">${step===0?'Click a colored stick to remove its color. The stick stays.':'Move over colored areas to erase only the color.'}</span></div>${step===2?`<div class="sketch-controls"><div class="row" aria-label="Coloring tool"><button data-sketch="brush" aria-pressed="${sketchTool==='brush'}">Brush</button><button data-sketch="fill" aria-pressed="${sketchTool==='fill'}">Double-click fill</button><span class="tool-explanation">${sketchTool==='fill'?'Double-click inside an enclosed area. Local outline detection; Undo reverses a fill.':'Drag to paint, or click to make a dot.'}</span></div>${sketchTool==='brush'?`<div class="brush-sizing"><label for="brush">${color==='none'?'Eraser':'Brush'} size <output id="brush-value" for="brush">${brush}</output></label><div class="brush-slider"><span aria-hidden="true" class="brush-dot small"></span><input id="brush" aria-label="Brush size" type="range" min="6" max="160" step="2" value="${brush}"><span aria-hidden="true" class="brush-dot large"></span></div><div class="row brush-presets">${[[16,'Small'],[48,'Medium'],[100,'Large']].map(([size,name])=>`<button data-brush="${size}" aria-pressed="${brush===size}">${name}</button>`).join('')}</div></div>`:''}</div>`:''}`;

 draft.overallScores ||= [null,null,null];
 $('overall-question').textContent=['How well does the original bridge meet your needs?','How well does your rebuilt bridge meet your needs?','How well does the sketch meet your needs?'][step];
 $('overall-options').replaceChildren();for(const v of [-3,-2,-1,0,1,2,3,'cannot-judge']){const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='overall-score';input.value=String(v);input.checked=draft.overallScores[step]===v;input.onchange=()=>{draft.overallScores[step]=v;localSave();};label.append(input,document.createTextNode(v==='cannot-judge'?'Cannot judge':v>0?'+'+v:String(v)));$('overall-options').append(label);}
 $('note').value=draft.notes[step];$('next').hidden=step===2;$('next').disabled=false;$('previous').disabled=step===0;$('previous').hidden=step===0;
 $('next').textContent=step===0?'Next: change the bridge →':removing?'Finished taking sticks away →':'Next: comment on the sketch →';
 $('advance-build').hidden=true;$('advance-build').onclick=()=>{mode='grid';preview=null;hover=null;original=false;render();showStepStart();};
 $('next').className='primary';$('save').className=step===2?'primary':'';$('save').textContent='Submit my feedback';$('save').hidden=step!==2;
 $('submission-review').hidden=step!==2;
 if(step===2){$('submission-review').replaceChildren();const title=document.createElement('h3');title.textContent='Ready to submit?';const list=document.createElement('ul');for(const text of [`Bridge ratings: ${Object.keys(draft.ratings).length} sticks marked${!Object.keys(draft.ratings).length&&draft.unratedConfirmed?' · deliberately left uncolored':''}`,`Bridge changes: ${removedIds().length} removed · ${draft.added.length} added`,sketch?`Sketch: ${draft.annotations.length} comments`:'Sketch unavailable · bridge feedback will still be saved']){const li=document.createElement('li');li.textContent=text;list.append(li);}const help=document.createElement('p');help.textContent='You can go back to any step. Submit saves all three steps and your notes to History.';$('submission-review').append(title,list,help);}
 $('note').placeholder=['Optional: why did you choose these colors?','Optional: what do your changes make better?','Optional: what do you want us to notice?'][step];
 $('undo').disabled=original||!undo[step].length;$('redo').disabled=original||!redo[step].length;
 $('undo').title=undo[step].length?`Undo ${undo[step].at(-1).label} (⌘/Ctrl Z)`:'Nothing to undo in this step';
 $('redo').title=redo[step].length?`Redo ${redo[step].at(-1).label} (⌘/Ctrl Shift Z)`:'Nothing to redo in this step';
 $('active-tool').textContent=original?'Viewing original · editing paused':step===2?(color&&color!=='none'?`Selected: ${labels[color]} · click to add a comment`:'Choose a color to add a comment'):step===1?mode==='grid'?'Click a grid point to place your new stick':mode==='erase'?'Click a stick to take it away':mode==='restore'?'Click a dashed stick to bring it back':'Free draw · blue sticks':color==='none'?(step===2?'Erase sketch color':'Click a stick to erase its color'):color?`Selected: ${labels[color]} · now click a stick to color it`:'Start by choosing a color';
 $('gesture-help').textContent=step===1?mode==='grid'?'The preview shows where your stick will go. Click once to place it.':mode==='erase'?'Click the highlighted stick to remove it. Undo brings it back.':mode==='restore'?'Dashed sticks are removed. Click one to bring it back.':'Drag from start to end. Release to place sticks.':step===0?'Click or drag across sticks to color them. Dashed outline = hover only; solid color = your rating.':sketchTool==='fill'?'Double-click inside a closed outline to fill it.':'Hold and move to color. The circle shows the size of your brush.';
 $('compare').textContent=original?'Back to my changes':'Compare with original';$('compare').setAttribute('aria-pressed',String(original));
 $('canvas').hidden=step===2&&!sketch;$('download').disabled=step===2&&!sketch;
 draw($('canvas'),step,true);
 applyCanvasZoom();if(step===2)draw($('canvas'),2,true);renderComments();
 const values=Object.values(draft.ratings);$('counts').textContent=step===0?`${values.length} / ${matches.length} sticks rated · ${values.filter(c=>c==='red'||c==='veryRed').length} dissatisfied · ${matches.length-values.length} not rated`:step===1?`${removedIds().length} original sticks removed · ${draft.added.length} blue sticks added`:sketch?`${draft.annotations.length} comments · click a numbered pin to edit`:'No saved sketch for this result. You can still save feedback on the matchsticks.';
 submissionUI();
}
function applyCanvasZoom(){
 const viewport=document.querySelector('.canvas-viewport'),canvas=$('canvas');
 viewport.classList.toggle('sketch-view',step===2);
 let scale=1;
 if(step===2&&sketch){const controlsHeight=viewport.getBoundingClientRect().top-$('workspace').getBoundingClientRect().top;const maxHeight=Math.min(420,window.innerHeight*.52,Math.max(160,window.innerHeight-controlsHeight-80));scale=Math.min(1,(maxHeight-2)*canvas.width/(canvas.height*Math.max(1,viewport.clientWidth)));}
 canvas.style.width=(scale*zoom*100)+'%';canvas.style.marginInline='auto';
 $('zoom-label').textContent=step===2&&zoom===1?'Fit':Math.round(scale*zoom*100)+'%';
}
window.addEventListener('resize',()=>{if(draft)applyCanvasZoom();});
function draw(canvas,n,editing=false){
 const ctx=canvas.getContext('2d'), showOriginal=editing&&original;
 if(n===2){canvas.width=1200;canvas.height=sketch?Math.round(1200*sketch.height/sketch.width):700;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);if(sketch)ctx.drawImage(sketch,0,0,canvas.width,canvas.height);
 const overlay=document.createElement('canvas');overlay.width=canvas.width;overlay.height=canvas.height;const c=overlay.getContext('2d');
 for(const st of (showOriginal?[]:draft.strokes)){
 if(st.fillRuns){c.globalCompositeOperation=st.color==='none'?'destination-out':'source-over';c.fillStyle=colors[st.color]||'#000';for(const [x,y,width,height] of st.fillRuns)c.fillRect(x,y,width,height);continue;}
 if(st.rect){c.globalCompositeOperation=st.color==='none'?'destination-out':'source-over';c.fillStyle=colors[st.color]||'#000';c.fillRect(st.rect.x,st.rect.y,st.rect.width,st.rect.height);continue;}c.globalCompositeOperation=st.color==='none'?'destination-out':'source-over';c.strokeStyle=colors[st.color]||'#000';c.lineWidth=st.width;c.lineCap='round';c.lineJoin='round';c.beginPath();st.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(st.points.length===1)c.lineTo(st.points[0].x+.1,st.points[0].y);c.stroke();}
 ctx.globalAlpha=.5;ctx.drawImage(overlay,0,0);ctx.globalAlpha=1;
 if(!showOriginal)for(const [index,note] of (draft.annotations||[]).entries()){const radius=editing?14*1200/Math.max(1,$('canvas').getBoundingClientRect().width):22;ctx.beginPath();ctx.arc(note.x,note.y,radius,0,Math.PI*2);ctx.fillStyle=colors[note.color]||colors.neutral;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=radius*.16;ctx.stroke();ctx.fillStyle=note.color==='blue'?'#fff':'#233d36';ctx.font=`bold ${radius}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),note.x,note.y);}
 if(editing&&!showOriginal&&cursorPoint&&sketchTool==='brush'){ctx.beginPath();ctx.arc(cursorPoint.x,cursorPoint.y,brush/2,0,Math.PI*2);ctx.fillStyle=colors[color]||'#fff';ctx.globalAlpha=.25;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#233d36';ctx.lineWidth=1.5;ctx.stroke();}
 return;}
 const ratingColors=Object.fromEntries(Object.entries(draft.ratings).map(([id,c])=>[id,(draft.bridgePalette||colors)[c]]));
 // Draw at a fixed resolution, independent of the screen's device pixel ratio.
 const base=document.createElement('canvas');base.getBoundingClientRect=()=>({width:1200});
 drawCrossing(base,draft.source.shape,draft.source.world,draft.source.extras,{colors:showOriginal||n===1?{}:ratingColors,removed:n===1&&!showOriginal?removedIds():[]});
 canvas.width=1200;canvas.height=700;ctx.drawImage(base,0,0,1200,700);
 if(n===1&&!showOriginal){if(editing&&mode==='grid'){ctx.strokeStyle='rgba(39,76,67,.13)';ctx.fillStyle='rgba(39,76,67,.3)';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=1200;x+=50){ctx.moveTo(x,0);ctx.lineTo(x,700);}for(let y=0;y<=700;y+=50){ctx.moveTo(0,y);ctx.lineTo(1200,y);}ctx.stroke();for(let x=0;x<=1200;x+=50)for(let y=0;y<=700;y+=50){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}}
 if(editing&&mode==='restore'){ctx.save();ctx.setLineDash([6,6]);ctx.globalAlpha=.6;for(const m of matches.filter(m=>removedIds().includes(m.id))){ctx.strokeStyle='#b84950';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(m.x1,m.y1);ctx.lineTo(m.x2,m.y2);ctx.stroke();}ctx.restore();}
 for(const m of draft.added)drawStick(ctx,m,colors.blue,10);
 if(editing&&preview){ctx.save();ctx.globalAlpha=.55;drawStick(ctx,preview,colors.blue,12);ctx.restore();}}
 if(editing&&!showOriginal&&hover&&step===0){ctx.save();ctx.setLineDash([8,6]);ctx.strokeStyle='#243f35';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(hover.x1,hover.y1);ctx.lineTo(hover.x2,hover.y2);ctx.stroke();ctx.restore();}
 if(editing&&!showOriginal&&hover&&step!==0){ctx.save();ctx.strokeStyle=step===1?(mode==='restore'?'#2672cb':'#c23e49'):'#fff';ctx.lineWidth=20;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(hover.x1,hover.y1);ctx.lineTo(hover.x2,hover.y2);ctx.stroke();drawStick(ctx,hover,step===1?(mode==='restore'?'#2672cb':'#c23e49'):(draft.bridgePalette||colors)[color]||'#b07a3c',11);ctx.restore();}
}
function drawStick(ctx,m,color,width){ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(m.x1,m.y1);ctx.lineTo(m.x2,m.y2);ctx.stroke();ctx.beginPath();ctx.arc(m.x2,m.y2,width*.65,0,Math.PI*2);ctx.fill();}
// One pointer gesture is one undoable action. No-op clicks keep the redo branch.
function beginAction(){beforeAction=actionState();}
function actionState(){return clone(step===1?{added:draft.added,removed:draft.rebuildRemoved||[],restored:draft.rebuildRestored||[]}:draft[fields[step]]);}
function applyAction(value){if(step===1){draft.added=clone(value.added);draft.rebuildRemoved=clone(value.removed);draft.rebuildRestored=clone(value.restored);}else draft[fields[step]]=clone(value);}
function commitAction(label){if(beforeAction===null)return;const after=actionState();if(JSON.stringify(beforeAction)!==JSON.stringify(after)){undo[step].push({before:beforeAction,after,label});if(undo[step].length>60)undo[step].shift();redo[step]=[];localSave();}beforeAction=null;}
function historyAction(direction){if(pointer||original)return;const from=direction==='undo'?undo[step]:redo[step],to=direction==='undo'?redo[step]:undo[step];const entry=from.pop();if(!entry)return;to.push(entry);applyAction(direction==='undo'?entry.before:entry.after);preview=null;hover=null;localSave();render();status(`${direction==='undo'?'Undid':'Redid'} ${entry.label}.`);}
function distance(p,m){const dx=m.x2-m.x1,dy=m.y2-m.y1,t=Math.max(0,Math.min(1,((p.x-m.x1)*dx+(p.y-m.y1)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-m.x1-t*dx,p.y-m.y1-t*dy);}
function nearest(p,list){let best=null,d=22*1200/Math.max(1,$('canvas').getBoundingClientRect().width);for(const m of list){const nd=distance(p,m);if(nd<d){best=m;d=nd;}}return best;}
function stamp(p){const [dx,dy]=pieces[orientation],x=Math.round(p.x/50)*50,y=Math.round(p.y/50)*50;const m={x1:x,y1:y,x2:x+dx*pieceLength,y2:y+dy*pieceLength};return Object.values(m).every(Number.isFinite)&&m.x2>=0&&m.x2<=1200&&m.y2>=0&&m.y2<=700?m:null;}
function removalTargets(){return mode==='restore'?matches.filter(m=>removedIds().includes(m.id)): [...draft.added,...matches.filter(m=>!removedIds().includes(m.id))];}
let drawFrame=null;
function queueCanvasDraw(){if(drawFrame===null)drawFrame=requestAnimationFrame(()=>{drawFrame=null;draw($('canvas'),step,true);});}
function setBrushSize(value){brush=Math.max(6,Math.min(160,Math.round(Number(value)/2)*2));if($('brush'))$('brush').value=brush;if($('brush-value'))$('brush-value').textContent=brush;document.querySelectorAll('[data-brush]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.brush===brush)));queueCanvasDraw();}
function paint(p){if(step===0){const m=nearest(p,matches);if(m){if(color==='none')delete draft.ratings[m.id];else draft.ratings[m.id]=color;}}
 else if(step===1&&(mode==='erase'||mode==='restore')){const m=nearest(p,removalTargets());if(m){if(m.id!==undefined){if(mode==='restore'){draft.rebuildRemoved=(draft.rebuildRemoved||[]).filter(id=>id!==m.id);draft.rebuildRestored=[...new Set([...(draft.rebuildRestored||[]),m.id])];}else{draft.rebuildRemoved=[...new Set([...(draft.rebuildRemoved||[]),m.id])];draft.rebuildRestored=(draft.rebuildRestored||[]).filter(id=>id!==m.id);}}else draft.added.splice(draft.added.indexOf(m),1);}}
 else if(step===2){draft.strokes.at(-1).points.push(p);}
 queueCanvasDraw();}
function enclosedRegion(rgba,w,h,sx,sy){
 const blocked=new Uint8Array(w*h),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if((rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114)<210){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h)blocked[yy*w+xx]=1;}}}
 sx=Math.max(0,Math.min(w-1,Math.floor(sx)));sy=Math.max(0,Math.min(h-1,Math.floor(sy)));const start=sy*w+sx;
 if(blocked[start])return {error:'Click inside the outline, not on a pencil line. Zoom in if needed.'};
 let head=0,tail=1;queue[0]=start;seen[start]=1;
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);
 if(x===0||y===0||x===w-1||y===h-1||tail>w*h*.4)return {error:'This area is not clearly enclosed. Nothing was filled. Use the brush here.'};
 for(const n of [i-1,i+1,i-w,i+w])if(!blocked[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}
 }
 if(tail<4)return {error:'This area is too small. Try zooming in or use a small brush.'};
 const runs=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!seen[y*w+x])continue;const startX=x;while(x+1<w&&seen[y*w+x+1])x++;runs.push([startX,y,x-startX+1,1]);}
 return {runs};
}
function fillSketchAt(p){
 const sample=document.createElement('canvas');sample.width=600;sample.height=Math.round(sample.width*sketch.height/sketch.width);const c=sample.getContext('2d',{willReadFrequently:true});c.fillStyle='white';c.fillRect(0,0,sample.width,sample.height);c.drawImage(sketch,0,0,sample.width,sample.height);
 const scale=$('canvas').width/sample.width;const result=enclosedRegion(c.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height,p.x/scale,p.y/scale);
 if(result.error){$('active-tool').textContent=result.error;status(result.error);return;}
 beginAction();draft.strokes.push({color,width:0,points:[],fillRuns:result.runs.map(run=>run.map(v=>v*scale)),method:'local-outline-fill'});commitAction(color==='none'?'area color erasure':'enclosed area fill');render();$('active-tool').textContent='Area filled · Undo reverses this fill.';
}
function point(e){const b=$('canvas').getBoundingClientRect();return {x:Math.max(0,Math.min($('canvas').width,(e.clientX-b.left)*$('canvas').width/b.width)),y:Math.max(0,Math.min($('canvas').height,(e.clientY-b.top)*$('canvas').height/b.height))};}
$('canvas').onpointerdown=e=>{if(pointer||original||e.button>0)return;if(step===2){e.preventDefault();openComment(point(e));return;}if(step!==1&&!color){$('active-tool').textContent='Choose a color above first, then mark the picture.';$('palette').classList.add('needs-color');setTimeout(()=>$('palette').classList.remove('needs-color'),1200);return;}if(step===2&&sketchTool==='fill')return;e.preventDefault();$('canvas').focus({preventScroll:true});beginAction();hover=null;cursorPoint=point(e);pointer={id:e.pointerId,start:point(e)};try{$('canvas').setPointerCapture(e.pointerId);}catch{}if(step===2)draft.strokes.push({color,width:brush,points:[]});if(step===1&&mode==='grid'){preview=stamp(pointer.start);draw($('canvas'),step,true);}else paint(pointer.start);};
$('canvas').onpointermove=e=>{if(original)return;const p=point(e);cursorPoint=p;if(!pointer){hover=step===0?nearest(p,matches):step===1&&(mode==='erase'||mode==='restore')?nearest(p,removalTargets()):null;preview=step===1&&mode==='grid'?stamp(p):null;draw($('canvas'),step,true);return;}if(pointer.id!==e.pointerId)return;if(step===0){paint(p);}else if(step===1&&mode==='grid'){preview=stamp(p);draw($('canvas'),step,true);}else if(step===1&&mode==='free'){preview={x1:pointer.start.x,y1:pointer.start.y,x2:p.x,y2:p.y};draw($('canvas'),step,true);}else if(step===2){const samples=sketchTool==='brush'&&e.getCoalescedEvents?e.getCoalescedEvents():[];for(const sample of samples)paint(point(sample));paint(p);}};
$('canvas').onpointerleave=()=>{if(!pointer){hover=null;preview=null;cursorPoint=null;draw($('canvas'),step,true);}};
function end(e){if(!pointer||pointer.id!==e.pointerId)return;if(step===2)paint(point(e));if(step===1&&mode==='grid'){const m=stamp(point(e));if(m&&!draft.added.some(a=>['x1','y1','x2','y2'].every(k=>a[k]===m[k])))draft.added.push(m);}else if(step===1&&mode==='free'){const p=point(e),a=pointer.start,len=Math.hypot(p.x-a.x,p.y-a.y),n=Math.max(1,Math.round(len/100));if(len>8)for(let i=0;i<n;i++)draft.added.push({x1:a.x+(p.x-a.x)*i/n,y1:a.y+(p.y-a.y)*i/n,x2:a.x+(p.x-a.x)*(i+1)/n,y2:a.y+(p.y-a.y)*(i+1)/n});}pointer=null;preview=null;commitAction(step===0?'stick rating':step===1?mode==='erase'?'stick removal':mode==='restore'?'stick restoration':'blue stick placement':color==='none'?'color erasure':'sketch color');render();}
$('canvas').ondblclick=e=>{if(step!==2||sketchTool!=='fill'||original||!sketch||!color||pointer)return;e.preventDefault();fillSketchAt(point(e));};
$('canvas').onpointerup=end;$('canvas').onpointercancel=()=>{if(beforeAction!==null)applyAction(beforeAction);beforeAction=null;pointer=null;preview=null;render();};
function showStepStart(){const viewport=document.querySelector('.canvas-viewport');viewport.scrollTop=0;viewport.scrollLeft=0;$('workspace').scrollIntoView({block:'start'});}
function changeStep(n){if(saving||switching)return;finishComment();if(n!==step){zoom=1;color=null;}if(n===1&&step!==1)mode='erase';step=n;draft.visited[step]=true;original=false;preview=null;hover=null;render();showStepStart();}
 document.querySelector('nav').onclick=e=>{const b=e.target.closest('[data-step]');if(b)changeStep(+b.dataset.step);};
 $('palette').onclick=e=>{finishComment();const b=e.target.closest('[data-color]');if(b){color=b.dataset.color;original=false;render();}};
 $('tools').onclick=e=>{const size=e.target.closest('[data-brush]');if(size){setBrushSize(size.dataset.brush);return;}const eraser=e.target.closest('[data-color]');if(eraser){color=eraser.dataset.color;original=false;render();return;}const sketchButton=e.target.closest('[data-sketch]');if(sketchButton){sketchTool=sketchButton.dataset.sketch;render();return;}const piece=e.target.closest('[data-piece]'),b=e.target.closest('[data-mode]');if(piece){orientation=piece.dataset.piece;mode='grid';}else if(b)mode=b.dataset.mode;else return;original=false;preview=null;hover=null;render();};
 $('tools').oninput=e=>{if(e.target.id==='brush')setBrushSize(e.target.value);if(e.target.id==='piece-length'){pieceLength=+e.target.value;preview=null;}};
 $('note').oninput=()=>{draft.notes[step]=$('note').value;localSave();};
 $('undo').onclick=()=>{finishComment();historyAction('undo');};$('redo').onclick=()=>{finishComment();historyAction('redo');};
 function zoomAtCenter(value){
  finishComment();
  const viewport=document.querySelector('.canvas-viewport'),canvas=$('canvas');
  const before=canvas.getBoundingClientRect(),box=viewport.getBoundingClientRect();
  const anchorX=Math.max(0,Math.min(1,(box.left+viewport.clientLeft+viewport.clientWidth/2-before.left)/before.width));
  const anchorY=Math.max(0,Math.min(1,(box.top+viewport.clientTop+viewport.clientHeight/2-before.top)/before.height));
  zoom=value==='fit'?1:Math.max(1,Math.min(3,zoom+Number(value)));hover=null;preview=null;cursorPoint=null;render();
  if(value==='fit'){viewport.scrollLeft=0;viewport.scrollTop=0;return;}
  const after=canvas.getBoundingClientRect(),newBox=viewport.getBoundingClientRect();
  viewport.scrollLeft+=after.left+anchorX*after.width-(newBox.left+viewport.clientLeft+viewport.clientWidth/2);
  viewport.scrollTop+=after.top+anchorY*after.height-(newBox.top+viewport.clientTop+viewport.clientHeight/2);
 }
 document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>zoomAtCenter(b.dataset.zoom));
 $('compare').onclick=()=>{finishComment();original=!original;hover=null;preview=null;render();};
 $('next').onclick=()=>{if(step===0&&!requireRatingProgress())return;if(step===1&&(mode==='erase'||mode==='restore')){mode='grid';preview=null;hover=null;original=false;render();showStepStart();}else changeStep(Math.min(2,step+1));};$('previous').onclick=()=>changeStep(Math.max(0,step-1));
 document.addEventListener('keydown',e=>{if(saving||switching)return;if(e.target.closest('input,textarea,select,[contenteditable=true]')||pointer)return;const key=e.key.toLowerCase();if((e.metaKey||e.ctrlKey)&&!e.altKey&&(key==='z'||key==='y')){e.preventDefault();finishComment();historyAction(key==='y'||e.shiftKey?'redo':'undo');return;}if(e.metaKey||e.ctrlKey||e.altKey)return;if(step!==1&&(['1','2','3','4',...(step===0?['5','e']:[])].includes(key))){e.preventDefault();finishComment();color=key==='e'?'none':(step===0?bridgeRatingKeys:['red','neutral','some','blue'])[Number(key)-1];original=false;render();}else if(step===1&&(mode==='grid'||mode==='free')&&key==='r'){e.preventDefault();const keys=Object.keys(pieces);orientation=keys[(keys.indexOf(orientation)+1)%keys.length];mode='grid';original=false;preview=null;render();}});
 $('role').onchange=()=>{finishComment();dirty=false;load();};
 $('download').onclick=()=>{const c=document.createElement('canvas');draw(c,step);const a=document.createElement('a');a.href=c.toDataURL();a.download=`${room}-${draft.role}-step${step+1}.png`;a.click();};
 function setSubmissionBusy(busy){saving=busy;$('workspace').inert=busy;document.querySelector('nav').inert=busy;$('identity-picker').inert=busy;$('save').disabled=busy;renderPaths();}
 function unreviewedStep(){return [0,1,2].find(n=>draft.visited?.[n]!==true);}
 $('save').onclick=async()=>{
  if(saving||switching)return;const missing=unreviewedStep();if(missing!==undefined){changeStep(missing);status('Please review this step before submitting all three steps. You may leave it unchanged.');return;}if(!requireRatingProgress())return;if(commentEdit&&!$('comment-text').value.trim()){ $('comment-text').focus();$('comment-error').textContent='Please explain this comment, or cancel it before submitting.';return;}finishComment();setSubmissionBusy(true);const revision=editRevision,submittedRole=draft.role;
  $('receipt').textContent='Sending images and ratings… Please wait for the server receipt.';status('Saving feedback…');
  try{
   draft.notes[step]=$('note').value;
   const payload=clone(draft);
   payload.feedbackUiVersion='2026-10-05-cloud-draft';payload.removed=removedIds();payload.originalMatches=clone(matches);payload.sketchSize=sketch?{width:1200,height:Math.round(1200*sketch.height/sketch.width)}:null;
   const images=[0,1,2].map(n=>{if(n===2&&!sketch)return null;const c=document.createElement('canvas');draw(c,n);return c.toDataURL('image/png');});
   const signature=JSON.stringify({room,draft:payload,images});if(submissionAttempt?.signature!==signature)submissionAttempt={signature,id:crypto.randomUUID()};
   const attempt={room,draft:payload,images,submissionId:submissionAttempt.id,backedUpAt:new Date().toISOString()};
   const locallyBackedUp=await retainSubmission(attempt);
   if(!locallyBackedUp)status('Browser backup is unavailable. Keep this page open until saving is confirmed; a backup download is available below.');
   const r=await apiFetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room,draft:payload,images,submissionId:submissionAttempt.id})});
   const out=await r.json();if(!r.ok)throw Error(out.error||'Save failed');
   // Confirm the saved record is retrievable, not merely that the POST returned.
   const check=await apiFetch(`/api/feedback?room=${encodeURIComponent(room)}`,{cache:'no-store'});if(!check.ok)throw Error('Server receipt could not be verified. Check Saved feedback before retrying.');
   const saved=(await check.json()).records?.find(x=>x.id===out.id);
   if(!sameSubmission(saved,payload,images))throw Error('Saved feedback could not be verified. Check Saved feedback before retrying.');
   await releaseSubmission(submissionAttempt.id);
   rememberReceipt(out.id);
   const count=images.filter(Boolean).length;
   const receipt=`Received by server · ${payload.participantLabel||submittedRole} · ${Object.keys(saved.draft.ratings||{}).length} colored sticks · ${(saved.draft.removed||[]).length} removed / ${(saved.draft.added||[]).length} added · ${(saved.draft.annotations||[]).length} sketch comments · ${count}/3 images${count<3?' (no sketch available)':''} · receipt ${out.id.slice(0,8)} · ${new Date(out.at).toLocaleString()}`;
   if(editRevision===revision){try{const key=draftStorageKeys.get(localKey());if(key)localStorage.removeItem(key);draftStorageKeys.delete(localKey());}catch{}dirty=false;pendingRooms.delete(room);confirmedCurrent=true;showingSaved=true;hasReceipt=true;$('receipt').textContent=receipt;}
   else $('receipt').textContent=receipt+' · Newer edits or the currently selected participant are not included in this submission.';
   status('');submissionUI();if(payload.role==='B'&&payload.visited?.length===3&&payload.visited.every(Boolean)){pathProgress.set(room,true);}renderPaths();await records(saved);$('records').open=true;$('feedback-history').href=feedbackHistoryBase+'?room='+encodeURIComponent(room)+'&role='+submittedRole+'&receipt='+encodeURIComponent(out.id);$('submission-result').scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){$('receipt').textContent=`Submission not confirmed: ${e.message} Your edits remain on this page. Retry, or download the submission backup below before leaving.`;status('Please check the receipt above and retry if needed.');}
  finally{setSubmissionBusy(false);$('submission-result').scrollIntoView({block:'start',behavior:'smooth'});}
 };
 async function records(confirmed){try{const r=confirmed?{records:[confirmed]}:await apiFetch(`/api/feedback?room=${encodeURIComponent(room)}`).then(r=>{if(!r.ok)throw Error('Could not load records');return r.json();});$('record-list').replaceChildren();for(const rec of (r.records||[]).filter(rec=>ownFeedback(rec)&&(!participant||rec.draft.role==='B'))){const a=document.createElement('article'),title=document.createElement('p');title.textContent=`${rec.draft.participantLabel||rec.draft.role} · ${rec.draft.source.agent} · ${new Date(rec.at).toLocaleString()}`;a.append(title);rec.images.forEach((src,i)=>{if(!src)return;const link=document.createElement('a'),img=new Image();link.href=src;link.download=`${room}-${rec.draft.role}-${rec.id}-step${i+1}.png`;img.src=src;img.alt=['Rated original matchsticks','Rebuilt bridge','Sketch comments'][i];link.append(img);a.append(link);});const details=document.createElement('p');details.textContent=rec.draft.notes.filter(Boolean).join(' · ');a.append(details);for(const [i,n] of (rec.draft.annotations||[]).entries()){const text=document.createElement('p');text.textContent=`${i+1}. ${labels[n.color]} — ${n.text}`;a.append(text);}const exportLink=document.createElement('a');exportLink.textContent='Download full record (JSON)';exportLink.href=URL.createObjectURL(new Blob([JSON.stringify(rec,null,2)],{type:'application/json'}));exportLink.download=`feedback-${rec.id}.json`;a.append(exportLink);$('record-list').append(a);}if(!$('record-list').children.length)$('record-list').textContent='No feedback saved yet.';}catch{status('Could not load saved feedback.');}}

 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith('two-worlds-autodraft-v1:'+respondentId+':')){const record=JSON.parse(localStorage.getItem(key));if(record?.revision&&!record.cloudSavedAt)queueCloudDraft(key,record);}}}catch{}
 await load();await records();if(pathItems.length)await loadPathProgress();
})().catch(e=>{document.getElementById('status').textContent=`Unable to open feedback: ${e.message}`;});
