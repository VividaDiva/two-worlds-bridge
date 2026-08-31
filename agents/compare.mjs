// The same twenty-five conversations, built by two different readers. The
// builder shared a model with Role 2 in the published set; here it is a third
// company. What survives the swap is not house style.
import fs from "node:fs";
const load = pre => {
  const out = {};
  for (const f of fs.readdirSync("sessions/batch").filter(x => x.startsWith(pre))) {
    const m = fs.readFileSync("sessions/batch/" + f, "utf8").match(/session written to (\S+)/);
    if (!m) continue;
    const s = JSON.parse(fs.readFileSync(m[1], "utf8"));
    out[`${s.meta.scenario}/${s.meta.case}`] = s;
  }
  return out;
};
const C = load("run-"), G = load("gem-");
const cells = Object.keys(C).filter(k => G[k]).sort();

const tally = set => {
  let caught = 0, said = 0, inv = 0, roleRight = 0, rolePart = 0, roleN = 0;
  for (const k of cells) {
    const s = set[k];
    caught += s.reading.caught; said += s.reading.said; inv += s.reading.invented;
    const t = (s.transcript || []).filter(x => x.who === "A" || x.who === "B");
    for (let i = 0; i < t.length - 1; i++) {
      const me = t[i], re = t[i + 1];
      if (re.who === me.who) continue;
      const took = re.tookThemToMean || [], meant = me.meant || [];
      if (!took.length || !meant.length) continue;
      roleN++;
      if (meant.every(f => took.includes(f))) roleRight++;
      else if (meant.some(f => took.includes(f))) rolePart++;
    }
  }
  return { caught, said, inv, roleRight, rolePart, roleN };
};
const c = tally(C), g = tally(G);
console.log(`  ${cells.length} matched cells\n`);
console.log("                                 claude building   gemini building");
console.log(`  builder took as meant            ${String(c.caught+"/"+c.said).padEnd(9)} ${String(Math.round(100*c.caught/c.said)+"%").padEnd(6)}  ${String(g.caught+"/"+g.said).padEnd(9)} ${Math.round(100*g.caught/g.said)}%`);
console.log(`  needs it credited nobody stated  ${String(c.inv).padEnd(16)}  ${g.inv}`);
console.log(`\n  the two ROLES reading each other — the builder is not involved:`);
console.log(`    had it right                   ${String(c.roleRight+"/"+c.roleN).padEnd(9)} ${String(Math.round(100*c.roleRight/c.roleN)+"%").padEnd(6)}  ${String(g.roleRight+"/"+g.roleN).padEnd(9)} ${Math.round(100*g.roleRight/g.roleN)}%`);
console.log(`    caught part of it              ${String(c.rolePart+"/"+c.roleN).padEnd(9)} ${String(Math.round(100*c.rolePart/c.roleN)+"%").padEnd(6)}  ${String(g.rolePart+"/"+g.roleN).padEnd(9)} ${Math.round(100*g.rolePart/g.roleN)}%`);

// Stance: did the builder hear a refusal as a request, or the other way round?
// This is the one result that has held all along; the question is whether it
// holds when the builder is a different company's model.
const stance = set => {
  let n = 0, inv = 0;
  for (const k of cells) for (const t of (set[k].transcript || []).filter(x => x.who === "A" || x.who === "B")) {
    const ma = t.meantAsks || [], mr = t.meantRefuses || [];
    const ta = t.takenAsks || [], tr = t.takenRefuses || [];
    if (!(ma.length + mr.length) || !(ta.length + tr.length)) continue;
    n++;
    if (ma.some(f => tr.includes(f)) || mr.some(f => ta.includes(f))) inv++;
  }
  return { n, inv };
};
const sc = stance(C), sg = stance(G);
console.log(`\n  builder read the STANCE backwards:`);
console.log(`    claude building  ${sc.inv}/${sc.n}  (${Math.round(100*sc.inv/sc.n)}%)`);
console.log(`    gemini building  ${sg.inv}/${sg.n}  (${Math.round(100*sg.inv/sg.n)}%)`);
console.log(`    a word list      32%   (measured separately, over 185 sentences)`);
