#!/usr/bin/env node
// Flatten the recorded runs into three tables that can be opened in anything.
//   node export.mjs <dir-of-session-json> <out-dir>
import fs from "node:fs";
import path from "node:path";
import { propsOf, AXES, KIT, CHOICES, FEATURES } from "./engine.mjs";

const [inDir = "/tmp/allruns", outDir = "../export"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const shapeOf = b => !b ? null
  : b.split("-").length === AXES.length
    ? Object.fromEntries(b.split("-").map((v, i) => [AXES[i], v]))
    : (KIT.find(e => e.id === b) || {}).shape || null;

// every crossing the kit can make, for the ceiling column
const V = { level:["at","raised"], hand:["none","rail"], middle:["none","post","tower"],
            width:["one","two"], bracing:["none","struts"], surface:["bare","rough"],
            ends:["rested","footed"], cover:["open","roof"] };
const ALL = []; (function rec(i, d){ if (i === AXES.length) return ALL.push(propsOf(d));
  for (const v of V[AXES[i]]) rec(i + 1, { ...d, [AXES[i]]: v }); })(0, {});
const ceiling = (a, b) => Math.max(...ALL.map(p =>
  a.filter(k => p.includes(k)).length + b.filter(k => p.includes(k)).length));

const q = v => {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (file, cols, rows) => {
  const out = [cols.join(",")].concat(rows.map(r => cols.map(c => q(r[c])).join(",")));
  fs.writeFileSync(path.join(outDir, file), out.join("\n") + "\n");
  return rows.length;
};

const files = fs.readdirSync(inDir).filter(f => f.endsWith(".json"));
const runs = [], turns = [], needs = [];

for (const f of files) {
  const s = JSON.parse(fs.readFileSync(path.join(inDir, f), "utf8"));
  const m = s.meta, id = f.replace(/\.json$/, "");
  const see = m.see || { A: {}, B: {} };
  const nA = m.cast?.A?.needs || [], nB = m.cast?.B?.needs || [];
  const shA = shapeOf(s.outcome?.built);
  const shB = shapeOf(s.outcome?.solo ? s.outcome.builtB : s.outcome?.built);
  const gotA = shA ? propsOf(shA) : [], gotB = shB ? propsOf(shB) : [];
  const metA = nA.filter(k => gotA.includes(k)), metB = nB.filter(k => gotB.includes(k));

  const role = t => t.who === "A" ? "role1" : t.who === "B" ? "role2" : "builder";
  const spoke = r => s.transcript.filter(t => t.who === r && t.text && !t.refused).length;
  const lost  = r => s.transcript.filter(t => t.who === r && t.refused).length;

  runs.push({
    run_id: id, cast: m.pair, argument: m.scenario, case: m.case, case_label: m.label,
    role1_model: m.models?.[m.players?.A], role2_model: m.models?.[m.players?.B],
    builder_model: m.models?.machine,
    role1_hears_other: see.A?.hears, role1_hears_builder: see.A?.echo,
    role2_hears_other: see.B?.hears, role2_hears_builder: see.B?.echo,
    opens: m.starts === "B" ? "role2" : "role1",
    solo: !!s.outcome?.solo, confer_turns: s.confer?.conferTurns ?? "",
    built_id: s.outcome?.built, built_name: s.outcome?.name, ground: s.outcome?.ground,
    builtB_id: s.outcome?.builtB || "", builtB_name: s.outcome?.nameB || "",
    // the properties of what stands, so the chance floor can be computed from
    // these files alone: shuffling which crossing meets which need-set is the
    // whole of the test, and it needs both columns
    built_props: gotA, builtB_props: s.outcome?.solo ? gotB : [],
    role1_needs: nA, role2_needs: nB,
    role1_met: metA, role2_met: metB,
    role1_met_n: metA.length, role1_needs_n: nA.length,
    role2_met_n: metB.length, role2_needs_n: nB.length,
    // the most any ONE crossing could have served of both, which is not always
    // all of them: some pairs want things no single crossing holds at once
    ceiling_n: (nA.length && nB.length && !s.outcome?.solo) ? ceiling(nA, nB)
             : (nA.length + nB.length),
    turns: m.turns, ended_by: m.endedBy, last_moved: m.lastMoved,
    role1_spoke: spoke("A"), role1_lost: lost("A"),
    role2_spoke: spoke("B"), role2_lost: lost("B"),
    said: s.reading?.said, caught: s.reading?.caught, partly: s.reading?.partly,
    invented: s.reading?.invented, wordlist_agreed: s.reading?.wordListAgreed,
    retries: s.reading?.retries, ran_at: m.ranAt,
  });

  for (const t of s.transcript) {
    turns.push({
      run_id: id, cast: m.pair, argument: m.scenario, case: m.case,
      turn: t.turn, speaker: role(t), persona: t.persona || "",
      model: t.who === "machine" ? m.models?.machine : m.models?.[t.player],
      phase: t.phase || "main", refused: !!t.refused, unread: !!t.unread,
      text: t.who === "machine" ? (t.say || "") : (t.text || ""),
      meant: t.meant || [], taken: t.taken || [],
      took_them_to_mean: t.tookThemToMean || [], meant_plainly: t.meantPlainly || "",
      standing_after: t.who === "machine" ? (t.text || "") : "",
      changed: t.who === "machine" ? !!t.changed : "",
    });
  }

  // one row per need — the unit the scoring actually works in
  for (const [r, ns, got] of [["role1", nA, gotA], ["role2", nB, gotB]])
    for (const k of ns) needs.push({
      run_id: id, cast: m.pair, argument: m.scenario, case: m.case, role: r,
      need: k, need_meaning: FEATURES[k] || "", met: got.includes(k) ? 1 : 0,
    });
}

console.log("runs.csv  :", csv("runs.csv", Object.keys(runs[0]), runs), "rows");
console.log("turns.csv :", csv("turns.csv", Object.keys(turns[0]), turns), "rows");
console.log("needs.csv :", csv("needs.csv", Object.keys(needs[0]), needs), "rows");
