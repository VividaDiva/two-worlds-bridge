(()=>{
'use strict';
const params=new URLSearchParams(location.search),room=params.get('room'),role=params.get('role')||'B',receipt=params.get('receipt');
const state=document.getElementById('state'),records=document.getElementById('records'),reload=document.getElementById('reload');
const back=new URL('./feedback.html',location.href);if(room)back.searchParams.set('room',room);back.searchParams.set('role',role);if(role==='B')back.searchParams.set('participant','1');document.getElementById('back').href=back;
const labels={veryRed:'Very dissatisfied',red:'Dissatisfied',neutral:'Neutral',some:'Somewhat satisfied',blue:'Satisfied',veryBlue:'Very satisfied'};
const routes={all:'Discuss together',develop:'Discuss together · auto-build',confer:'Discuss privately, then tell AI',both:'Tell AI separately',chain:'Role 1 → Role 2 → AI','via-1':'Role 1 → AI → Role 2','via-2':'Role 2 → AI → Role 1','only-1':'Role 1 only','only-2':'Role 2 only'};
const blobs=[];
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function render(rec,index,number){const d=rec.draft,article=el('article');article.id='receipt-'+rec.id;article.append(el('h2',`Submission #${number}${index===0?' · Latest':''}`),el('p','Submitted '+new Date(rec.at).toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'})));const agent=d.source?.agent||rec.agent;article.append(el('h2',`${agent==='toolkit'?'Toolkit':'Control'} · ${routes[rec.route]||rec.route}`),el('p',`${d.participantLabel||'Role '+(d.role==='A'?'1':'2')} · ${new Date(rec.at).toLocaleString()} · Receipt ${rec.id}`,'meta'));
 const names=['1 · Bridge ratings','2 · Your rebuilt bridge','3 · Sketch comments'];
 names.forEach((name,i)=>{article.append(el('h3',name));const src=rec.images?.[i];if(typeof src==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src)){const figure=el('figure'),img=document.createElement('img');img.src=src;img.alt=name;const a=el('a','Download image');a.href=src;a.download=`feedback-${rec.id}-step${i+1}.png`;figure.append(img,a);article.append(figure);}else article.append(el('p','No image was included in this submission.'));
 if(i===0){const counts=new Map();Object.values(d.ratings||{}).forEach(k=>counts.set(k,(counts.get(k)||0)+1));article.append(el('p',[...counts].map(([k,n])=>`${d.ratingScale?.scores?.[k]?d.ratingScale.scores[k]+' · ':''}${d.ratingLabels?.[k]||labels[k]||k}: ${n} sticks`).join(' · ')||'No sticks rated.'));}
 if(i===1)article.append(el('p',`${(d.removed||[]).length} sticks removed · ${(d.added||[]).length} sticks added`));
 if(i===2)for(const [j,c] of (d.annotations||[]).entries())article.append(el('p',`${j+1}. ${labels[c.color]||c.color} — ${c.text}`,'comment'));
 if(d.notes?.[i])article.append(el('p','Your note: '+d.notes[i],'note'));
 });
 const url=URL.createObjectURL(new Blob([JSON.stringify(rec,null,2)],{type:'application/json'}));blobs.push(url);const download=el('a','Download full record (JSON)');download.href=url;download.download=`feedback-${rec.id}.json`;article.append(download);records.append(article);
}
async function load(){reload.disabled=true;state.textContent='Connecting to the study server…';
 try{if(!/^[a-z0-9]+$/.test(room||'')||!['A','B'].includes(role))throw Error('This feedback link is incomplete. Please ask the facilitator for the link to your session.');
 await window.bridgeFeedbackConnection.ready;
 const response=await window.bridgeFeedbackConnection.fetch('/api/feedback?room='+encodeURIComponent(room));if(!response.ok)throw Error('The study server could not load this session. Please try again.');const data=await response.json();if(!Array.isArray(data.records))throw Error('The server returned an incomplete response. Please try again.');
 let respondentId=null,ownReceipts=[];try{respondentId=localStorage.getItem('two-worlds-feedback-respondent-v1');ownReceipts=JSON.parse(localStorage.getItem('two-worlds-feedback-receipts-v1:'+respondentId)||'[]');}catch{}
 const saved=data.records.filter(r=>r.draft?.role===role&&((respondentId&&r.draft?.respondentId===respondentId)||ownReceipts.includes(r.id)||r.id===receipt));blobs.splice(0).forEach(u=>URL.revokeObjectURL(u));records.replaceChildren();saved.sort((a,b)=>new Date(b.at)-new Date(a.at)||b.id.localeCompare(a.id));const chronological=[...data.records].sort((a,b)=>new Date(a.at)-new Date(b.at)||a.id.localeCompare(b.id));saved.forEach((r,i)=>render(r,i,chronological.findIndex(item=>item.id===r.id)+1));
 state.textContent=saved.length?`${saved.length} submission${saved.length===1?'':'s'} received and stored for this session.`:'No submitted feedback for this session yet. After submitting, wait for “Received by server” and a receipt number.';
 if(receipt){const found=saved.find(r=>r.id===receipt);if(found){state.textContent='Submission confirmed. Your saved images and comments are shown below.';document.getElementById('receipt-'+found.id).scrollIntoView({block:'start'});}else state.textContent='This receipt was not found in the server response. Please keep your receipt and ask the facilitator to check it.';}
 }catch(e){state.textContent=(e.name==='TypeError'||e.name==='TimeoutError'?'The study server is not reachable right now. Ask the facilitator to check it, then select Refresh records.':e.message)+' This does not mean previously submitted feedback was deleted.';}
 finally{reload.disabled=false;}}
reload.onclick=load;load();
})();