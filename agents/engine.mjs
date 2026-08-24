// The machine in the middle. Deliberately unchanged from the browser simulation
// and deliberately deterministic: if the two participants are models and the
// builder is too, nothing in the run is measurable.

export const KIT = [
  { id: "log",     name: "A single log",          has: ["minimal","low","open","light","exposed"],   members: 1 },
  { id: "rail",    name: "A log with a handrail", has: ["low","light","guarded"],                    members: 2 },
  { id: "braced",  name: "A braced walkway",      has: ["low","light","guarded","steady","many"],    members: 3 },
  { id: "prop",    name: "A log on a prop",       has: ["low","open","heavy","inGap","steady"],      members: 2 },
  { id: "trestle", name: "A timber trestle",      has: ["heavy","inGap","steady","many","guarded"],  members: 6 },
  { id: "hang",    name: "A hanging span",        has: ["high","open","light","sways","exposed"],    members: 4 },
];
export const NAME = id => (KIT.find(k => k.id === id) || { name: "nothing" }).name;

// The only vocabulary the machine has. A participant may assert these; it may
// never name a structure or a ground, so these are described as needs.
export const FEATURES = {
  water:   "the ground between us is water",
  rock:    "the ground between us is a drop in rock",
  minimal: "as little built as possible",
  low:     "level with where we stand, no climbing",
  open:    "nothing closing it in; you can see out",
  light:   "it needs to hold one person only",
  heavy:   "it needs to take loads and carts",
  guarded: "something at the hand; an edge to hold",
  steady:  "it does not move underfoot",
  exposed: "you are out over the drop with nothing at hand",
  sways:   "it moves when the wind gets up",
  inGap:   "something stands in the middle of the gap",
  high:    "it is raised above where we stand",
  many:    "a great deal of material goes into it",
};

// Nobody may say any of these. Checked on every generated line.
export const FORBIDDEN = ("water stream river brook creek boat wade waded mountain cleft rock ridge hill hillside " +
  "gorge canyon cliff chasm log plank bridge rail handrail tower towers cable cables rope prop props post posts " +
  "trestle beam deck timber frame span walkway footbridge").split(" ");

export const W_WANT = 2, W_AVOID = 4;

export function mkCtx() {
  return { wants: new Map(), avoids: new Map(), world: { water: false, rock: false },
           namedBy: new Map(), design: null };
}

// A want adds weight to a property; a refusal takes more away than a want adds,
// so one fear can outlast several requests.
export function hear(ctx, role, act, asserts) {
  for (const f of asserts) {
    if (!ctx.namedBy.has(f)) ctx.namedBy.set(f, new Set());
    ctx.namedBy.get(f).add(role);
    if (f === "water" || f === "rock") {
      // Ground is established only by someone asking. Refusing an experience
      // says what you fear; it does not assert that the world contains it.
      if (act === "want") ctx.world[f] = true;
      continue;
    }
    if (act === "want") ctx.wants.set(f, (ctx.wants.get(f) || 0) + 1);
    else ctx.avoids.set(f, (ctx.avoids.get(f) || 0) + 1);
  }
}

export function build(ctx) {
  const scored = KIT.map(k => {
    let s = 0;
    for (const f of k.has) {
      if (ctx.wants.has(f))  s += W_WANT  * ctx.wants.get(f);
      if (ctx.avoids.has(f)) s -= W_AVOID * ctx.avoids.get(f);
    }
    return { k, s };
  }).sort((x, y) => y.s - x.s || KIT.indexOf(x.k) - KIT.indexOf(y.k));
  ctx.design = scored[0].k;
  return { chosen: scored[0], ranked: scored };
}

// Of the properties the built thing actually has, which were ever put into words?
export function provenance(ctx) {
  if (!ctx.design) return { feats: [], named: 0, total: 0 };
  const feats = ctx.design.has.map(f => {
    const by = ctx.namedBy.get(f);
    return { feature: f, description: FEATURES[f],
             byA: !!(by && by.has("A")), byB: !!(by && by.has("B")) };
  });
  return { feats, named: feats.filter(f => f.byA || f.byB).length, total: feats.length };
}

export const groundOf = ctx =>
  ctx.world.water && ctx.world.rock ? "water at the bottom of a drop"
  : ctx.world.water ? "water" : ctx.world.rock ? "a drop in rock" : "ground nobody has described";

// Every word said, and whether it did anything. The same ledger the page draws.
export function ledger(transcript) {
  const GRAMMAR = new Set(("a an the and or but is are be to of it in on at we i you this that for with as our my " +
    "its do does so if no have has from by can will would need make just too very there here been was were they " +
    "them he she his her us me then than what when how all any out up down over under about into also still more " +
    "most only own same such other some each one two both am not want it's i'm that'll you're don't doesn't").split(" "));
  let spoken = 0, carried = 0, grammar = 0, meaning = 0;
  for (const t of transcript) {
    if (t.who === "machine") continue;
    const words = String(t.text).split(/\s+/).map(w => w.replace(/[^A-Za-z0-9'-]/g, "")).filter(Boolean);
    spoken += words.length;
    // A word counts as carried if it is a content word in a turn that asserted
    // something. This is coarser than the page's per-feature lexicon, and the
    // session file records the raw turns so it can be recomputed any way you like.
    const asserted = (t.asserts || []).length > 0;
    for (const w of words) {
      const g = GRAMMAR.has(w.toLowerCase());
      if (g) grammar++;
      else if (asserted && carried < spoken) { carried++; }
      else meaning++;
    }
  }
  return { spoken, carried, grammar, meaning };
}
