import fs from "node:fs";
import { KIT, mkCtx, hear, W_WANT, W_AVOID } from "./engine.mjs";
const score = (c, k) => k.has.reduce((s, f) =>
  s + (c.wants.get(f) || 0) * W_WANT - (c.avoids.get(f) || 0) * W_AVOID, 0);
const p = fs.readFileSync("../i-want-i-do-not-want.html", "utf8");
const a = p.indexOf("/* SESSIONS */"), b = p.indexOf("/* /SESSIONS */");
const S = JSON.parse(p.slice(a + 14, b).trim().replace(/^const SESSIONS = /, "").replace(/;$/, ""));
let steps = 0, tied = 0, tiedAtEnd = 0;
for (const s of S) {
  const ctx = mkCtx();
  let last = 0;
  for (const t of (s.transcript || []).filter(x => x.who === "A" || x.who === "B")) {
    if (t.takenAsks || t.takenRefuses) {
      hear(ctx, t.who, "want", t.takenAsks || []);
      hear(ctx, t.who, "avoid", t.takenRefuses || []);
    } else hear(ctx, t.who, t.act || "want", t.taken || []);
    const sc = KIT.map(k => score(ctx, k)).sort((x, y) => y - x);
    last = sc[0] - sc[1];
    steps++; if (last === 0) tied++;
  }
  if (last === 0) tiedAtEnd++;
}
console.log(`  ${steps} turns across ${S.length} runs`);
console.log(`    top two exactly tied:        ${tied}  (${Math.round(100 * tied / steps)}%)`);
console.log(`    runs that ENDED on a tie:    ${tiedAtEnd} of ${S.length}`);
console.log(`\n  On a tie the rule keeps whatever is already standing — so the first`);
console.log(`  thing built freezes and later needs cannot move it.`);
