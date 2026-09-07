#!/usr/bin/env node
// A reading copy of the runs: the conversations, laid out to be read rather
// than queried. The CSVs are for counting; this is for looking at what was
// actually said and where it went wrong.
import fs from "node:fs";
import { FEATURES, propsOf, AXES, KIT } from "./engine.mjs";

const inDir = process.argv[2] || "/tmp/allruns";
const out = process.argv[3] || "../export/conversations.html";

const LABEL = {
  "open":"Everyone hears everything", "r2-blind":"Role 2 cannot see the crossing",
  "r1-blind":"Role 1 cannot see the crossing", "words":"They have only each other's words",
  "bridge":"They have only the crossing",
  "bridge-1":"Only Role 1 can see the crossing", "bridge-2":"Only Role 2 can see the crossing",
  "silent":"Nothing comes back to either of them",
  together:"They confer first", alone:"Each alone, a crossing each",
};
const ARG = { places:"Two places", loads:"Two loads", agreed:"Already agreed",
              pairs:"Two each", refs:"Two references" };

const shapeOf = b => !b ? null
  : b.split("-").length === AXES.length
    ? Object.fromEntries(b.split("-").map((v, i) => [AXES[i], v]))
    : (KIT.find(e => e.id === b) || {}).shape || null;

const runs = fs.readdirSync(inDir).filter(f => f.endsWith(".json")).map(f => {
  const s = JSON.parse(fs.readFileSync(`${inDir}/${f}`, "utf8"));
  const m = s.meta;
  return {
    id: f.replace(/\.json$/, ""), cast: m.pair, arg: m.scenario, cs: m.case,
    see: m.see, opens: m.starts === "B" ? 2 : 1,
    who: { 1: m.cast?.A, 2: m.cast?.B },
    built: s.outcome?.name, ground: s.outcome?.ground,
    builtB: s.outcome?.solo ? s.outcome.nameB : null,
    // what the crossing actually is, so the page can say which needs it served
    props: shapeOf(s.outcome?.built) ? propsOf(shapeOf(s.outcome.built)) : [],
    propsB: s.outcome?.solo && shapeOf(s.outcome.builtB) ? propsOf(shapeOf(s.outcome.builtB)) : null,
    turns: s.transcript.map(t => t.who === "machine"
      ? { r: 0, say: t.say || "", now: t.text || "", changed: !!t.changed }
      : { r: t.who === "A" ? 1 : 2, p: t.persona || "", say: t.text || "",
          plain: t.meantPlainly || "", meant: t.meant || [], took: t.taken || [],
          refused: !!t.refused, confer: t.phase === "confer" }),
  };
});
const data = { runs, FEATURES, LABEL, ARG };

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>What was said — two worlds bridge</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#fbfaf7; --ink:#1c1a17; --ink-2:#4a453e; --ink-3:#7d766c;
  --line:#e0dbd1; --a:#b4642a; --b:#2c6b86; --m:#5d6b4f;
  --hit:#3f7a4a; --miss:#a8443a; --panel:#f4f1ea;
}
@media (prefers-color-scheme:dark){:root:not([data-t="light"]){
  --paper:#16150f; --ink:#ece7dc; --ink-2:#b8b1a3; --ink-3:#867f72;
  --line:#2e2b24; --a:#d68b4a; --b:#6fb3cf; --m:#9db37f;
  --hit:#79c48a; --miss:#e08a7d; --panel:#1e1c15;
}}
:root[data-t="dark"]{
  --paper:#16150f; --ink:#ece7dc; --ink-2:#b8b1a3; --ink-3:#867f72;
  --line:#2e2b24; --a:#d68b4a; --b:#6fb3cf; --m:#9db37f;
  --hit:#79c48a; --miss:#e08a7d; --panel:#1e1c15;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
  font:400 17px/1.6 Newsreader,Georgia,serif;-webkit-font-smoothing:antialiased}
.mono,.k,select,button,.tag{font-family:"IBM Plex Mono",ui-monospace,monospace}
.wrap{max-width:820px;margin:0 auto;padding:34px 22px 90px}
h1{font-size:30px;font-weight:500;margin:0 0 6px;letter-spacing:-.01em}
h1 em{font-style:italic;color:var(--ink-3)}
h2#title{font-size:22px;font-weight:500;margin:0 0 4px;letter-spacing:-.005em}
h2#title span{color:var(--ink-3);font-style:italic}
.runid{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3);margin:0 0 20px}
.sub{color:var(--ink-2);margin:0 0 26px;max-width:60ch}
.k{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3)}
.bar{position:sticky;top:0;z-index:5;background:var(--paper);
  border-bottom:1px solid var(--line);padding:12px 0 13px;margin-bottom:26px;
  display:flex;gap:9px;flex-wrap:wrap;align-items:center}
select{font-size:12px;padding:6px 9px;border:1px solid var(--line);border-radius:7px;
  background:var(--panel);color:var(--ink);max-width:100%}
button.nav{font-size:12px;padding:6px 11px;border:1px solid var(--line);border-radius:7px;
  background:var(--panel);color:var(--ink);cursor:pointer}
button.nav:hover{border-color:var(--ink-3)}
.result{border:1px solid var(--line);border-radius:12px;padding:18px 20px 16px;margin:0 0 14px;background:var(--panel)}
.result .stood{font-size:24px;line-height:1.3;font-weight:500;margin:5px 0 3px;letter-spacing:-.01em}
.result .over{font-size:13px;color:var(--ink-3);margin-bottom:16px}
.score{display:grid;grid-template-columns:1fr 1fr;gap:16px;border-top:1px solid var(--line);padding-top:14px}
@media(max-width:640px){.score{grid-template-columns:1fr}}
.score .tally{font-size:12.5px;color:var(--ink-2);margin:3px 0 6px}
.score .tally b{font-weight:500;font-size:15px}
.need{display:block;font-size:13px;line-height:1.5;margin:2px 0;padding-left:17px;position:relative}
.need::before{position:absolute;left:0;top:0;font-family:"IBM Plex Mono",monospace;font-size:11px}
.need.y{color:var(--ink-2)} .need.y::before{content:"✓";color:var(--hit)}
.need.n{color:var(--ink-3)} .need.n::before{content:"✕";color:var(--miss)}
.setup{border:1px solid var(--line);border-radius:12px;padding:15px 18px;margin-bottom:30px}
.setup .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:640px){.setup .row{grid-template-columns:1fr}}
.who1{color:var(--a)} .who2{color:var(--b)} .whom{color:var(--m)}
.sit{font-size:15px;color:var(--ink-2);margin:4px 0 6px}
.needs{font-size:11.5px;color:var(--ink-3)}
.needs b{font-weight:500;color:var(--ink-2)}
.hears{font-size:11.5px;color:var(--ink-3);margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
.turn{margin:0 0 30px;padding-left:16px;border-left:2px solid var(--line)}
.turn.r1{border-color:color-mix(in srgb,var(--a) 55%,transparent)}
.turn.r2{border-color:color-mix(in srgb,var(--b) 55%,transparent)}
.turn.r0{border-color:color-mix(in srgb,var(--m) 55%,transparent)}
.turn.confer{border-style:dashed}
.hd{display:flex;gap:9px;align-items:baseline;margin-bottom:5px;flex-wrap:wrap}
.said{font-size:18.5px;line-height:1.55;margin:0}
.said.q{font-style:italic}
.gloss{margin-top:9px;font-size:13.5px;color:var(--ink-2);
  display:grid;grid-template-columns:auto 1fr;gap:3px 12px;align-items:baseline}
.gloss .k{padding-top:2px}
.tag{display:inline-block;font-size:10.5px;padding:1.5px 6px;border-radius:5px;
  border:1px solid var(--line);margin:0 4px 3px 0;white-space:nowrap}
.tag.hit{color:var(--hit);border-color:color-mix(in srgb,var(--hit) 45%,transparent)}
.tag.miss{color:var(--miss);border-color:color-mix(in srgb,var(--miss) 45%,transparent)}
.stands{font-size:12.5px;color:var(--ink-3);margin-top:7px}
.stands b{color:var(--ink-2);font-weight:500}
.refused{font-style:italic;color:var(--ink-3);font-size:15px}
.end{border-top:1px solid var(--line);margin-top:34px;padding-top:18px}
.end h3{font-size:19px;font-weight:500;margin:0 0 6px}
.legend{font-size:12px;color:var(--ink-3);margin-top:26px;line-height:1.75}
body.bare .bar, body.bare h1, body.bare .sub, body.bare .legend{display:none}
body.bare .wrap{padding-top:26px}
@media print{
  .bar{position:static;border:0} button.nav,select{display:none}
  body{background:#fff;color:#000;font-size:12pt} .wrap{max-width:none;padding:0}
  .turn{break-inside:avoid}
}
</style></head><body><div class="wrap">
<h1>What was said, <em>and what was made of it</em></h1>
<p class="sub">Two people describe what they need. A third builds from their words alone,
and may ask nothing. Nobody but the builder may name a part of a crossing. Every
sentence was generated at run time.</p>
<div class="bar">
  <select id="arg"></select><select id="cs"></select><select id="cast"></select>
  <button class="nav" id="prev">&larr;</button><button class="nav" id="next">&rarr;</button>
</div>
<h2 id="title"></h2><div id="out"></div>
<p class="legend" id="legend"></p>
</div>
<script id="d" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById("d").textContent);
const $ = i => document.getElementById(i);
const esc = s => String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const F = k => D.FEATURES[k] || k;

const ARGS = ["places","loads","agreed","pairs","refs"];
const CASES = ["open","r2-blind","r1-blind","words","bridge","bridge-1","bridge-2","silent","together","alone"];
const Q = new URLSearchParams(location.search);
let S = { arg: Q.get("arg") || "places", cs: Q.get("case") || "open",
          cast: +(Q.get("cast") || 0) };
if (Q.get("bare") === "1") document.body.classList.add("bare");

const opt = (el, vals, label, cur) => {
  el.innerHTML = vals.map(v => \`<option value="\${v}"\${v==cur?" selected":""}>\${esc(label(v))}</option>\`).join("");
};
opt($("arg"), ARGS, v => D.ARG[v], S.arg);
opt($("cs"), CASES, v => D.LABEL[v], S.cs);
opt($("cast"), [0,1,2,3], v => "cast " + (v+1), S.cast);

const find = () => D.runs.find(r => r.arg===S.arg && r.cs===S.cs && r.cast===+S.cast);

function hears(see, r){
  const v = (see||{})[r==1?"A":"B"] || {};
  return v.hears && v.echo ? "hears the other one and the builder"
       : v.hears ? "hears the other one, never the builder"
       : v.echo ? "hears the builder, never the other one" : "hears neither";
}

function render(){
  const r = find();
  const o = $("out");
  if (!r){ o.innerHTML = '<p class="sub">No conversation recorded for this one.</p>'; return; }
  const person = n => {
    const w = r.who[n] || {};
    const two = w.personas;
    const sit = two ? two.map(p => \`<b>\${esc(p.who)}</b> — \${esc(p.situation)}\`).join("<br>")
                    : esc(w.situation || "");
    return \`<div><div class="k who\${n}">Role \${n}</div>
      <div class="sit">\${sit}</div></div>\`;
  };
  const turns = r.turns.map(t => {
    if (t.r === 0) return \`<div class="turn r0">
      <div class="hd"><span class="k whom">The builder</span></div>
      <p class="said">\${esc(t.say)}</p>
      <div class="stands">\${t.changed ? "rebuilt" : "changed nothing"} · now standing: <b>\${esc(t.now)}</b></div></div>\`;
    if (t.refused) return \`<div class="turn r\${t.r}"><div class="hd">
      <span class="k who\${t.r}">Role \${t.r}</span></div>
      <p class="refused">— would not speak this turn</p></div>\`;
    const took = new Set(t.took), meant = new Set(t.meant);
    const tags = [...new Set([...t.meant, ...t.took])].map(k => {
      const both = meant.has(k) && took.has(k);
      return \`<span class="tag \${both?"hit":"miss"}">\${esc(F(k))}\${
        both ? "" : meant.has(k) ? " · not heard" : " · heard, not meant"}</span>\`;
    }).join("");
    return \`<div class="turn r\${t.r}\${t.confer?" confer":""}">
      <div class="hd"><span class="k who\${t.r}">Role \${t.r}</span>
        \${t.p?\`<span class="k">\${esc(t.p)}</span>\`:""}
        \${t.confer?'<span class="k">to the other, not the builder</span>':""}</div>
      <p class="said q">\${esc(t.say)}</p>
      \${t.plain?\`<div class="gloss"><span class="k">meant</span><span>\${esc(t.plain)}</span></div>\`:""}
      \${tags?\`<div class="gloss"><span class="k">read as</span><span>\${tags}</span></div>\`:""}
    </div>\`;
  }).join("");
  // The outcome goes at the top: what was built, and how much of what each of
  // them needed it turned out to have. Then who they were, then how it went.
  const scored = n => {
    const w = r.who[n] || {}, ns = w.needs || [];
    const got = (n === 2 && r.propsB) ? r.propsB : r.props;
    const met = ns.filter(k => got.includes(k));
    return \`<div><div class="k who\${n}">Role \${n}\${r.propsB?" · its own crossing":""}</div>
      <div class="tally"><b>\${met.length} of \${ns.length}</b> of what it needed</div>
      \${ns.map(k => \`<span class="need \${got.includes(k)?"y":"n"}">\${esc(F(k))}</span>\`).join("")}</div>\`;
  };
  o.innerHTML = \`<div class="result">
      <div class="k">what stood at the end</div>
      <div class="stood">\${esc(r.built||"nothing")}\${r.builtB?\` &nbsp;/&nbsp; \${esc(r.builtB)}\`:""}</div>
      <div class="over">over \${esc(r.ground||"ground nobody described")}\${r.builtB?" · a crossing each, built in separate rooms":""}</div>
      <div class="score">\${scored(1)}\${scored(2)}</div></div>
    <div class="setup"><div class="row">\${person(1)}\${person(2)}</div>
      <div class="hears">Role 1 \${hears(r.see,1)}. Role 2 \${hears(r.see,2)}. Role \${r.opens} speaks first.</div></div>
    <div class="k" style="margin:0 0 14px">how it went</div>
    \${turns}\`;
  $("title").innerHTML = \`\${esc(D.ARG[r.arg])} <span>&mdash; \${esc(D.LABEL[r.cs])} &mdash; cast \${r.cast + 1}</span>\`;
  const idEl = document.querySelector(".runid") || Object.assign(
    document.createElement("p"), { className: "runid" });
  idEl.textContent = r.id; $("title").after(idEl);
  history.replaceState(null, "", \`?arg=\${r.arg}&case=\${r.cs}&cast=\${r.cast}\`);
}
$("legend").innerHTML = 'A tag is green when the builder took a need the speaker '
  + 'meant, red when it heard something they did not mean or missed something they did. '
  + '&ldquo;Meant&rdquo; is the speaker&rsquo;s own account, asked after the sentence was said &mdash; '
  + 'never shown to the builder. Dashed lines are turns spoken to each other with the '
  + 'builder out of the room.';
for (const [id,key] of [["arg","arg"],["cs","cs"],["cast","cast"]])
  $(id).onchange = e => { S[key] = key==="cast" ? +e.target.value : e.target.value; render(); };
const step = d => { const i = CASES.indexOf(S.cs); S.cs = CASES[(i+d+CASES.length)%CASES.length];
  $("cs").value = S.cs; render(); };
$("prev").onclick = () => step(-1); $("next").onclick = () => step(1);
render();
</script></body></html>`;

fs.writeFileSync(out, PAGE.replace("__DATA__", JSON.stringify(data).replace(/</g, "\\u003c")));
console.log("wrote", out, (fs.statSync(out).size/1024/1024).toFixed(2) + " MB");
