import fs from "node:fs";
const o = JSON.parse(fs.readFileSync("sessions/cross-read.json", "utf8"));
const key = x => JSON.stringify([[...(x.asks || [])].sort(), [...(x.refuses || [])].sort()]);
const all = x => [...(x.asks || []), ...(x.refuses || [])];
const took = (g, r) => g && [...r.asks, ...r.refuses].every(f => all(g).includes(f)) && all(g).length > 0;
const inv = (g, r) => g && (r.asks.some(f => (g.refuses || []).includes(f)) || r.refuses.some(f => (g.asks || []).includes(f)));

console.log(`  ${o.length} sentences, three readers and the word list\n`);
console.log("  reader     took as meant   stance inverted   agreed with the word list");
for (const k of ["claude", "openai", "gemini", "word"]) {
  const has = o.filter(x => x.got[k]);
  const t = has.filter(x => took(x.got[k], x.r)).length;
  const i = has.filter(x => inv(x.got[k], x.r)).length;
  const a = has.filter(x => key(x.got[k]) === key(x.got.word)).length;
  const pct = n => String(Math.round(100 * n / has.length)).padStart(2);
  console.log(`  ${k.padEnd(10)} ${String(t).padStart(3)}/${has.length} (${pct(t)}%)      ${String(i).padStart(3)} (${pct(i)}%)       ${k === "word" ? "—" : a + "/" + has.length}`);
}
const three = o.filter(x => x.got.claude && x.got.openai && x.got.gemini);
const agree = three.filter(x => key(x.got.claude) === key(x.got.openai) && key(x.got.openai) === key(x.got.gemini));
console.log(`\n  all three identical:   ${agree.length}/${three.length}`);
const pair = (a, b) => three.filter(x => key(x.got[a]) === key(x.got[b])).length;
const ov = (a, b) => three.filter(x => all(x.got[a]).some(f => all(x.got[b]).includes(f))).length;
console.log(`  pairwise identical:   c=o ${pair("claude", "openai")}  c=g ${pair("claude", "gemini")}  o=g ${pair("openai", "gemini")}`);
console.log(`  overlap on ≥1 key:   c/o ${ov("claude", "openai")}  c/g ${ov("claude", "gemini")}  o/g ${ov("openai", "gemini")}`);
console.log(`\n  (${o.filter(x => !x.got.claude).length} sentences the claude reader declined to read)`);
