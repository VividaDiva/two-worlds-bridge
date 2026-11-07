// The builder names every crossing from its eight switch positions (engine.mjs
// SHORTNAME, with six familiar shapes keeping their old names). This inverts
// that: the name in a machine turn gives back the shape it had at that moment.
export const AXES8=['level','hand','middle','width','bracing','surface','ends','cover'];
export const CH={level:['at','raised'],hand:['none','rail'],middle:['none','post','tower'],width:['one','two'],bracing:['none','struts'],surface:['bare','rough'],ends:['rested','footed'],cover:['open','roof']};
export const BARE8={level:'at',hand:'none',middle:'none',width:'one',bracing:'none',surface:'bare',ends:'rested',cover:'open'};
const FAM=[['A single log',{}],['A log with a handrail',{hand:'rail'}],['A braced walkway',{hand:'rail',width:'two',bracing:'struts'}],['A log on a prop',{middle:'post'}],['A timber trestle',{hand:'rail',middle:'tower',width:'two',bracing:'struts'}],['A hanging span',{level:'raised'}]].map(([n,d])=>[n,{...BARE8,...d}]);
function shortname(d){const head=d.level==='raised'?'A raised crossing':'A crossing';const b=[];
 if(d.hand==='rail')b.push('a rail');if(d.middle==='post')b.push('a post in the gap');if(d.middle==='tower')b.push('a tower in the gap');if(d.width==='two')b.push('two abreast');if(d.bracing==='struts')b.push('struts');if(d.surface==='rough')b.push('a coarse surface');if(d.ends==='footed')b.push('footed ends');if(d.cover==='roof')b.push('a roof');
 if(!b.length)return d.level==='raised'?'A raised crossing':'A bare crossing';return head+' with '+(b.length===1?b[0]:b.slice(0,-1).join(', ')+' and '+b[b.length-1]);}
const same=(x,y)=>AXES8.every(k=>x[k]===y[k]);
export const NAME2SHAPE={};
(function walk(i,acc){if(i===AXES8.length){const f=FAM.find(([,d])=>same(d,acc));NAME2SHAPE[f?f[0]:shortname(acc)]={...acc};return;}for(const v of CH[AXES8[i]])walk(i+1,{...acc,[AXES8[i]]:v});})(0,{});
export const shapeOfName=n=>NAME2SHAPE[String(n||'').trim()]||null;
