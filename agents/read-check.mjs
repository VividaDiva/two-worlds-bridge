#!/usr/bin/env node
// How much of the script does the word list actually understand?
//
// Pulls every written sentence out of the browser simulation together with the
// need it was written to state, runs the machine's reader over it, and reports
// how often the two agree. No keys needed. Run it before spending money on the
// model reader, so you know what the crude one scores on the same material.
//
//   node read-check.mjs            summary
//   node read-check.mjs --misses   every sentence it takes as something else

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURES } from "./engine.mjs";
import { readKeyword } from "./machine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, "..", "i-want-i-do-not-want.html"), "utf8");

// The speech data is written as { infer:[...], why:"...", says:[ "...", ... ] }
const entries = [];
for (const m of page.matchAll(/infer:\s*\[([^\]]*)\][\s\S]{0,400}?says:\s*\[([\s\S]*?)\]\s*\}/g)) {
  const infer = [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map(x => x[1]).filter(k => k in FEATURES);
  const says = [...m[2].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1].replace(/\\"/g, '"'));
  if (infer.length && says.length) entries.push({ infer, says });
}
if (!entries.length) { console.error("  found no sentences — the page's shape must have changed"); process.exit(1); }

const rows = [];
for (const e of entries)
  for (const say of e.says) {
    const taken = readKeyword(say);
    rows.push({ say, meant: e.infer, taken,
                caught: e.infer.every(f => taken.includes(f)) && taken.length > 0,
                deaf: !taken.length,
                invented: taken.filter(f => !e.infer.includes(f)) });
  }

const caught = rows.filter(r => r.caught).length;
const deaf = rows.filter(r => r.deaf).length;
const inverted = rows.filter(r => !r.caught && !r.deaf && !r.taken.some(f => r.meant.includes(f)));
const pct = n => Math.round(100 * n / rows.length);

console.log(`\n  ${rows.length} written sentences, ${entries.length} intents.`);
console.log(`  Taken as meant      ${caught}  (${pct(caught)}%)`);
console.log(`  Taken as something  ${inverted.length}  (${pct(inverted.length)}%)  — nothing it took was asked for`);
console.log(`  Not heard at all    ${deaf}  (${pct(deaf)}%)`);

// Which needs the word list is deafest to — the ones worth rewriting sentences for.
const byFeature = new Map();
for (const r of rows) for (const f of r.meant) {
  const t = byFeature.get(f) || { n: 0, ok: 0 };
  t.n++; if (r.taken.includes(f)) t.ok++;
  byFeature.set(f, t);
}
console.log(`\n  per need, how often it is picked up when stated:`);
for (const [f, t] of [...byFeature].sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n))
  console.log(`    ${f.padEnd(9)} ${String(t.ok).padStart(3)}/${String(t.n).padEnd(3)}  ${FEATURES[f]}`);

if (process.argv.includes("--misses")) {
  console.log(`\n  taken as something else:\n`);
  for (const r of inverted)
    console.log(`    "${r.say}"\n      meant ${r.meant.join(", ")}  ->  took ${r.taken.join(", ") || "nothing"}\n`);
}
console.log();
