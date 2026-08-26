// The machine in the middle. Deliberately unchanged from the browser simulation
// and deliberately deterministic: if the two participants are models and the
// builder is too, nothing in the run is measurable.

// `made` is what it does with the matches. A builder that can name the finished
// thing but not the act of making it is leaving out the whole of its work.
export const KIT = [
  { id: "log",     name: "A single log",          has: ["minimal","low","open","light","exposed"],   members: 1,
    made: "one length flat across, bank to bank" },
  { id: "rail",    name: "A log with a handrail", has: ["low","light","guarded"],                    members: 2,
    made: "a length flat across, and a rail beside it on three uprights" },
  { id: "braced",  name: "A braced walkway",      has: ["low","light","guarded","steady","many"],    members: 3,
    made: "a length flat across, a rail beside it, and two struts driven down into the banks" },
  { id: "prop",    name: "A log on a prop",       has: ["low","open","heavy","inGap","steady"],      members: 2,
    made: "a length flat across, carried in the middle on a post standing in the gap" },
  { id: "trestle", name: "A timber trestle",      has: ["heavy","inGap","steady","many","guarded"],  members: 6,
    made: "a framed tower standing in the gap, with the walk carried over the top of it" },
  { id: "hang",    name: "A hanging span",        has: ["high","open","light","sways","exposed"],    members: 4,
    made: "two towers, a cable slung between them, and the walk hung off it" },
];
export const MADE = id => (KIT.find(k => k.id === id) || { made: "nothing" }).made;
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
// The ban exists so nobody can SPECIFY THE DESIGN — the whole problem is having
// to describe an experience and let somebody else reconstruct a thing from it.
// It had swept up eighteen words for the ground as well, so the two of them were
// forbidden to say where they were standing. Then 82% of runs ended over "ground
// nobody has described" and that got written up as a finding, when it was a rule.
//
// Structures stay banned. Ground does not: where you are is your situation, not
// your design, and a person who cannot mention the water they cross every day is
// not speaking freely by any reading of the word.
export const STRUCTURES = ("log plank bridge rail handrail tower towers cable cables rope prop props post posts " +
  "trestle beam deck timber frame span walkway footbridge").split(" ");

export const GROUND = ("water stream river brook creek boat wade waded mountain cleft rock ridge hill hillside " +
  "gorge canyon cliff chasm").split(" ");

// Kept so anything still importing it keeps working; new code should use
// STRUCTURES, which is what is actually enforced now.
export const FORBIDDEN = STRUCTURES;

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

  // Ties used to be settled by position in KIT, which is to say by nothing.
  // A quarter of all runs ended tied at the top, and five in seven of those were
  // handed to whatever sits at index 0 — the bare log. List order, not anything
  // anybody said, was the commonest single cause of the outcome.
  //
  // Two rules replace it, in order. A builder with nothing to gain does not tear
  // down and re-lay, so what is already standing keeps standing on a tie. On the
  // first build there is no incumbent, so prefer the structure the conversation
  // has actually been about — the one with most of its properties named out
  // loud. KIT order remains underneath as a last resort, and now decides almost
  // nothing.
  const top = scored[0].s;
  const tied = scored.filter(r => r.s === top);
  const named = k => k.has.filter(f => ctx.namedBy.has(f)).length;
  const held = ctx.design && tied.find(r => r.k === ctx.design);
  const pick = held || tied.slice().sort((x, y) => named(y.k) - named(x.k))[0];

  ctx.design = pick.k;
  return { chosen: pick, ranked: scored };
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

// The machine's own vocabulary: the words it watches for, and what each one
// makes it think of. This is the whole of its understanding — it has no access
// to anybody's intention, only to the sentence.
export const NEEDWORDS = {
  water:   ["soaked","running","knees","past","underneath","current","wet","dry","feet"],
  rock:    ["down","up","side","bottom","way","round","other"],
  minimal: ["smallest","paces","project","trees","plain","little","small","today","thin","cheap","again","slight","least"],
  low:     ["step","level","standing","over","onto","feet","walks","walk"],
  open:    ["look","see","sky","hemmed","shut","hear","plain","closed","side"],
  light:   ["myself","person","weight","one","alone","unload","full","hand","own"],
  heavy:   ["cart","carts","carting","loaded","wheels","laden","road","hauling","pass","lot","heavy","carry","load"],
  guarded: ["hand","hold","hemmed","edge","edges","lean","view"],
  steady:  ["put","wind","funnels","shifting","give","winter","still","dead","rebuilding"],
  exposed: ["out","nothing","that"],
  sways:   ["swaying","shifting","moving","bounce","give","gives","alive"],
  inGap:   ["driven","bottom","standing","bed"],
  high:    ["climb","climbing","up","onto","grand","stair"],
  many:    ["half","cut","great","deal","taken","twenty","years","grand","postcards","photographs","two"],
};

// Words that mean nothing on their own. The list above was written to mark which
// words carried something, and half of it is grammar — watching "down" makes the
// machine hear a drop in every second sentence — so parsing skips these.
export const GRAMMAR = new Set(("a an the and or but is are be to of it in on at we i you this that for with as our my its " +
  "do does so if no have has from by can will would need make just too very there here been was were they them " +
  "he she his her us me then than what when how all any out up down over under about into also still more most " +
  "only own same such other some each one two both am not want").split(" "));
