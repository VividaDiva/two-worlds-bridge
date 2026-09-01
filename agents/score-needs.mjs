#!/usr/bin/env node
// Under loose goals nobody is handed a goal, so nothing could be scored: the page
// says "no goal was set" and means it. Each persona now carries a latent need in
// the engine's own feature keys — derived from its situation, shown to nobody,
// used only here. This asks the one question the instrument could not answer:
// did the crossing that got built actually serve the person who needed it?
import fs from "node:fs";
import { propsOf, AXES, KIT, FEATURES } from "./engine.mjs";

const src = fs.readFileSync(new URL("./run.mjs", import.meta.url), "utf8");
const blk = src.slice(src.indexOf("const LOOSE_SCENARIOS"),
  src.indexOf("\n};", src.indexOf("  refs: {", src.indexOf("const LOOSE_SCENARIOS"))) + 3);
const POOLS = new Function(blk + "; return LOOSE_SCENARIOS;")();

// Runs recorded before needs existed still name their persona in meta.cast, so
// the need can be found by the situation it was written for.
const needsFor = (meta, role) => {
  const c = meta.cast?.[role];
  if (c?.needs) return c.needs;
  const pool = POOLS[meta.scenario]?.[role] || [];
  return pool.find(p => p.situation === c?.situation)?.needs || null;
};

const shapeOf = b => b.split("-").length === AXES.length
  ? Object.fromEntries(b.split("-").map((v, i) => [AXES[i], v]))
  : KIT.find(e => e.id === b)?.shape;

const rows = process.argv.slice(2).filter(a => a.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(f, "utf8")));

const by = {}; let hit = 0, tot = 0;
const cells = [];
for (const s of rows) {
  if (s.meta.pictures) continue;                 // scored by score-pictures.mjs
  // In a split-room run each of them gets their own crossing; otherwise one stands for both.
  const crossing = role => shapeOf(s.outcome.solo && role === "B"
    ? s.outcome.builtB : s.outcome.built);
  for (const role of ["A", "B"]) {
    const need = needsFor(s.meta, role), sh = crossing(role);
    if (!need || !sh) continue;
    const got = propsOf(sh);
    const met = need.filter(k => got.includes(k));
    hit += met.length; tot += need.length;
    (by[s.meta.scenario] ||= { hit: 0, tot: 0 });
    by[s.meta.scenario].hit += met.length; by[s.meta.scenario].tot += need.length;
    cells.push({ scen: s.meta.scenario, cs: s.meta.case, m: s.meta.machine, role,
                 need, met, missed: need.filter(k => !got.includes(k)) });
  }
}

if (process.argv.includes("--detail"))
  for (const c of cells)
    console.log(`  ${c.scen}/${c.cs} ${c.m} role ${c.role === "A" ? 1 : 2}: `
      + `${c.met.length}/${c.need.length}  met [${c.met}]  missed [${c.missed}]`);

console.log("\n  did the crossing serve the person who needed it?");
for (const [k, v] of Object.entries(by))
  console.log(`    ${k.padEnd(8)} ${String(v.hit).padStart(3)}/${String(v.tot).padEnd(3)} = ${Math.round(v.hit / v.tot * 100)}%`);
console.log(`    ${"ALL".padEnd(8)} ${hit}/${tot} = ${Math.round(hit / tot * 100)}%`);

// A need met by luck is not a need met. Score every role against the crossings
// the OTHER runs built: whatever that rate is, is what nothing-at-all looks like.
let oh = 0, ot = 0;
for (const a of cells) for (const b of cells) {
  if (a === b) continue;
  const sh = shapeOf(rows.find(r => r.meta.scenario === b.scen && r.meta.case === b.cs
    && r.meta.machine === b.m)?.outcome.built);
  if (!sh) continue;
  const got = propsOf(sh);
  oh += a.need.filter(k => got.includes(k)).length; ot += a.need.length;
}
console.log(`\n    shuffled  ${oh}/${ot} = ${Math.round(oh / ot * 100)}%   (each need against other runs' crossings)`);
console.log(`    real is ${Math.round(hit / tot * 100) - Math.round(oh / ot * 100)} points above chance`);
