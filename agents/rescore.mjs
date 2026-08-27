#!/usr/bin/env node
// Re-score recorded runs against the current kit, without calling anything.
//
// The kit went from six named structures to forty-eight compositions. The page
// REPLAYS a recording — it pushes the stored readings back through hear() and
// build() — so what it renders was already coming out of the new space, while
// the `outcome` field written at record time still held the old one. Tile and
// verdict disagreed on every cell.
//
// Nothing here is invented: the readings are what the builder took at the time
// and they do not depend on the kit. This runs the same arithmetic over them
// that the page runs, so stored and rendered agree by construction.
//
//   node rescore.mjs            rewrite every session in ./sessions
//   node rescore.mjs --dry      say what would change and touch nothing

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkCtx, hear, build, groundOf, provenance, NAME } from "./engine.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "sessions");
const dry = process.argv.includes("--dry");

const replay = (turns, ctx) => {
  for (const t of turns) {
    if (t.phase === "confer" || t.unread || t.refused) continue;   // never reached the builder
    if (t.takenAsks || t.takenRefuses) {                            // loose: stance was read
      hear(ctx, t.who, "want", t.takenAsks || []);
      hear(ctx, t.who, "avoid", t.takenRefuses || []);
    } else {
      hear(ctx, t.who, t.act || (t.who === "A" ? "want" : "avoid"), t.taken || []);
    }
    build(ctx);
  }
  return ctx;
};

let changed = 0, same = 0, skipped = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
  const p = path.join(dir, f);
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!s.transcript || !s.outcome) { skipped++; continue; }
  const said = s.transcript.filter(t => t.who === "A" || t.who === "B");
  const was = s.outcome.name;

  let out;
  if (s.outcome.solo) {
    const a = replay(said.filter(t => t.who === "A"), mkCtx());
    const b = replay(said.filter(t => t.who === "B"), mkCtx());
    if (!a.design || !b.design) { skipped++; continue; }
    out = { built: a.design.id, name: NAME(a.design.id), ground: groundOf(a), solo: true,
            builtB: b.design.id, nameB: NAME(b.design.id), groundB: groundOf(b),
            agreed: a.design.id === b.design.id };
    s.provenance = provenance(a);
  } else {
    const c = replay(said, mkCtx());
    if (!c.design) { skipped++; continue; }
    out = { built: c.design.id, name: NAME(c.design.id), ground: groundOf(c) };
    s.provenance = provenance(c);
  }
  s.outcome = out;
  s.rescored = true;
  if (was === out.name) { same++; continue; }
  changed++;
  console.log(`  ${f.replace(/-\d+\.json/,"").padEnd(18)} ${was}  ->  ${out.name}`);
  if (!dry) fs.writeFileSync(p, JSON.stringify(s, null, 1));
}
console.log(`\n  ${changed} changed, ${same} unchanged, ${skipped} skipped${dry ? "   (dry run — nothing written)" : ""}`);
