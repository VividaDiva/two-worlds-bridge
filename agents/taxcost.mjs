// What the coding scheme costs.
//
// Every sentence anybody says is squeezed into seventeen keys I wrote, and the
// answer key is squeezed the same way — so "what they meant" has never quite
// been what they meant. Each role now also says it in one plain sentence of
// their own. The gap between the two is the taxonomy's own losses, and it has
// never been looked at.
import fs from "node:fs";
import { FEATURES } from "./engine.mjs";

const p = fs.readFileSync("../i-want-i-do-not-want.html", "utf8");
const a = p.indexOf("/* SESSIONS */"), b = p.indexOf("/* /SESSIONS */");
const S = JSON.parse(p.slice(a + 14, b).trim().replace(/^const SESSIONS = /, "").replace(/;$/, ""));

const rows = [];
for (const s of S)
  for (const t of (s.transcript || []).filter(x => (x.who === "A" || x.who === "B") && x.meantPlainly))
    rows.push({ plain: t.meantPlainly, keys: t.meant || [] });

// A crude but honest proxy: how much of the plain sentence is about something
// the keys can hold at all. Words that name a need the kit knows are "covered";
// content words that are not are the residue.
const KEYWORDS = new Set(Object.values(FEATURES).join(" ").toLowerCase().match(/[a-z]{4,}/g));
const STOP = new Set("that this with what when they them from have will would could about your very just more than then only over into onto also because",);
let words = 0, covered = 0;
const residue = new Map();
for (const r of rows) {
  for (const w of (r.plain.toLowerCase().match(/[a-z]{4,}/g) || [])) {
    if (STOP.has(w)) continue;
    words++;
    if (KEYWORDS.has(w)) covered++;
    else residue.set(w, (residue.get(w) || 0) + 1);
  }
}
console.log(`  ${rows.length} turns where both were recorded\n`);
console.log(`  content words in what they said they meant:  ${words}`);
console.log(`  words the seventeen needs can hold at all:   ${covered}  (${Math.round(100*covered/words)}%)`);
console.log(`  words with nowhere to go:                    ${words-covered}  (${Math.round(100*(words-covered)/words)}%)\n`);
console.log("  what they keep meaning that the kit has no word for:");
for (const [w, n] of [...residue].sort((x, y) => y[1] - x[1]).slice(0, 14))
  console.log(`    ${w.padEnd(14)} ${n}`);
const keys = rows.reduce((n, r) => n + r.keys.length, 0);
console.log(`\n  keys used per turn: ${(keys/rows.length).toFixed(1)}   words per plain sentence: ${(words/rows.length).toFixed(0)}`);
