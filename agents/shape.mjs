// A crossing as a set of choices, not a name.
//
// The kit used to be six named structures, and that turned out to be the reason
// every conversation in a scenario arrived at the same place. Three of the
// fourteen features named exactly one structure and three more narrowed it to
// two, so `heavy` — which is what `loads` is ABOUT — could only ever reach a
// prop or a trestle. Eight loose runs of loads produced two distinct outcomes.
// The talk had nowhere to land.
//
// Five independent choices give forty-eight crossings instead of six, every
// feature is reachable by several of them, and a crossing can be AMENDED rather
// than only replaced — which is what makes "tweak what stands" a possible thing
// to ask for.
//
// Nothing here has a name. The old six survive as recognisable corners of this
// space (see FAMILIAR), but nobody is told them.

export const CHOICES = {
  level:   { at:   "level with where you stand",      raised: "carried well above the ground" },
  hand:    { none: "nothing at the hand",             rail:   "a rail at the hand the whole way" },
  middle:  { none: "nothing set down in the gap",     post:   "a post standing in the gap",
             tower: "a framed tower standing in the gap" },
  width:   { one:  "one person at a time",            two:    "two abreast" },
  bracing: { none: "nothing bracing it",              struts: "struts driven into both banks" },
};

export const AXES = Object.keys(CHOICES);
export const DEFAULT = { level: "at", hand: "none", middle: "none", width: "one", bracing: "none" };

// What a given crossing is actually like. Every feature is reachable more than
// one way, which is the whole point: `steady` can be had from a tower or from
// struts, `heavy` needs support AND room, so the talk decides which.
export function propsOf(d) {
  const has = new Set();
  has.add(d.level === "at" ? "low" : "high");
  has.add(d.hand === "rail" ? "guarded" : "exposed");
  if (d.hand === "none") has.add("open");
  if (d.middle !== "none") has.add("inGap");
  if (d.width === "two") has.add("many");

  const held = d.bracing === "struts" || d.middle === "tower";
  has.add(held ? "steady" : "sways");
  if (held && (d.width === "two" || d.middle === "tower")) has.add("heavy");
  if (d.width === "one" && d.bracing === "none") has.add("light");

  // The bare thing: nothing added anywhere.
  if (AXES.every(a => d[a] === DEFAULT[a])) has.add("minimal");
  return [...has];
}

export const allShapes = () => {
  const out = [];
  const walk = (i, acc) => i === AXES.length ? out.push({ ...acc })
    : Object.keys(CHOICES[AXES[i]]).forEach(v => walk(i + 1, { ...acc, [AXES[i]]: v }));
  walk(0, {});
  return out;
};

export const same = (a, b) => AXES.every(k => a[k] === b[k]);

// Said the way somebody who just built it would say it, in parts, never as a name.
export const describe = d =>
  AXES.map(a => CHOICES[a][d[a]]).filter(t => !/^nothing/.test(t)).join(", ")
  || "one length laid flat across, and nothing else";

// What changed, for reporting an amendment rather than a rebuild.
export const diff = (a, b) => !a ? AXES.map(k => `${k}: ${CHOICES[k][b[k]]}`)
  : AXES.filter(k => a[k] !== b[k]).map(k => `${k}: ${CHOICES[k][a[k]]} → ${CHOICES[k][b[k]]}`);

// The old six, so a run can still be reported in familiar terms where it happens
// to land on one. Nobody is shown these while talking.
export const FAMILIAR = [
  { name: "a single log",         d: { level:"at",     hand:"none", middle:"none",  width:"one", bracing:"none"   } },
  { name: "a log with a handrail",d: { level:"at",     hand:"rail", middle:"none",  width:"one", bracing:"none"   } },
  { name: "a braced walkway",     d: { level:"at",     hand:"rail", middle:"none",  width:"two", bracing:"struts" } },
  { name: "a log on a prop",      d: { level:"at",     hand:"none", middle:"post",  width:"one", bracing:"none"   } },
  { name: "a timber trestle",     d: { level:"at",     hand:"rail", middle:"tower", width:"two", bracing:"struts" } },
  { name: "a hanging span",       d: { level:"raised", hand:"none", middle:"none",  width:"one", bracing:"none"   } },
];
export const familiarName = d => (FAMILIAR.find(f => same(f.d, d)) || {}).name || null;
