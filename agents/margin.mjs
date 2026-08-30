// Does the crossing stop moving because nothing new is said, or because the
// leader gets too far ahead for one more need to matter?
import fs from "node:fs";
import { KIT, mkCtx, hear, W_WANT, W_AVOID } from "./engine.mjs";
const score = (ctx, k) => k.has.reduce((s, f) =>
  s + (ctx.wants.get(f) || 0) * W_WANT - (ctx.avoids.get(f) || 0) * W_AVOID, 0);

const p = fs.readFileSync("../i-want-i-do-not-want.html", "utf8");
const a = p.indexOf("/* SESSIONS */"), b = p.indexOf("/* /SESSIONS */");
const S = JSON.parse(p.slice(a + 14, b).trim().replace(/^const SESSIONS = /, "").replace(/;$/, ""));

const s = S.find(x => x.meta.scenario === "agreed" && x.meta.case === "separate");
const ctx = mkCtx();
console.log(`  ${s.meta.scenario}/${s.meta.case} — margin between the top two after each turn\n`);
console.log("  turn  new needs heard      margin  could one more need flip it?");
const seen = new Set();
for (const t of (s.transcript || []).filter(x => x.who === "A" || x.who === "B")) {
  const taken = t.taken || [];
  const fresh = taken.filter(f => !seen.has(f));
  taken.forEach(f => seen.add(f));
  if (t.takenAsks || t.takenRefuses) {
    hear(ctx, t.who, "want", t.takenAsks || []);
    hear(ctx, t.who, "avoid", t.takenRefuses || []);
  } else hear(ctx, t.who, t.act || "want", taken);
  const sc = KIT.map(k => score(ctx, k)).sort((x, y) => y - x);
  const margin = sc[0] - sc[1];
  console.log(`   ${String(t.turn).padStart(3)}  ${(fresh.join(",") || "—").padEnd(20)} ${String(margin).padStart(5)}   ${margin <= W_WANT ? "yes" : "no — needs " + Math.ceil(margin / W_WANT) + " of them"}`);
}
