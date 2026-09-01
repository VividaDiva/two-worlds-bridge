#!/usr/bin/env node
// Did the referent arrive? Each role was shown two crossings and told nothing.
// What its two had in common is what it needed. The crossing that got built is
// in the same eight axes, so this is a straight comparison, not a judgement.
import fs from "node:fs";
import { AXES, CHOICES, KIT } from "./engine.mjs";

// outcome.built is an eight-axis string for anything composed, but a bare kit id
// ("hang", "braced") when what got built happens to be one of the named familiar
// ones. Reading the second as the first silently scored two whole runs as zero.
const shapeOfBuilt = built => {
  if (built.split("-").length === AXES.length)
    return Object.fromEntries(built.split("-").map((v, i) => [AXES[i], v]));
  const k = KIT.find(e => e.id === built);
  if (!k) throw new Error(`cannot read built crossing: ${built}`);
  return k.shape;
};

const files = process.argv.slice(2).filter(a => a.endsWith(".json"));
let hit = 0, total = 0;

for (const f of files) {
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  const pics = s.meta?.pictures;
  if (!pics) { console.log(`${f}: not a --pictures run, skipped`); continue; }
  const got = shapeOfBuilt(s.outcome.built);
  console.log(`\n${s.meta.scenario}/${s.meta.case}  seed ${s.meta.seed}  → ${s.outcome.name}`);
  for (const role of ["A", "B"]) {
    const shared = pics[role].shared;
    const keys = Object.keys(shared);
    const arrived = keys.filter(ax => got[ax] === shared[ax]);
    hit += arrived.length; total += keys.length;
    console.log(`  role ${role === "A" ? 1 : 2} (${pics[role].key}) needed ${keys.length}, got ${arrived.length}`);
    for (const ax of keys)
      console.log(`      ${got[ax] === shared[ax] ? "arrived " : "lost    "} ${CHOICES[ax][shared[ax]]}`
        + (got[ax] === shared[ax] ? "" : `  — built ${CHOICES[ax][got[ax]]} instead`));
  }
}
if (total) console.log(`\n  across ${files.length} run(s): ${hit} of ${total} needed things arrived`
  + ` (${Math.round(hit / total * 100)}%)`);
