// The machine in the middle. Deliberately unchanged from the browser simulation
// and deliberately deterministic: if the two participants are models and the
// builder is too, nothing in the run is measurable.

// `made` is what it does with the matches. A builder that can name the finished
// thing but not the act of making it is leaving out the whole of its work.
// Six named structures used to be the whole world, and that was the reason a
// scenario's talk could not change its ending. Three of the fourteen features
// named exactly ONE of them and three more narrowed it to two, so `heavy` —
// which is what `loads` is about — could only ever reach a prop or a trestle.
// Eight runs of loads gave two distinct outcomes.
//
// A crossing is five independent choices now, which is forty-eight of them.
// `heavy` reaches half. Everything downstream only ever iterates KIT, so build,
// provenance and the builder's own choosing all work unchanged.
export const AXES = ["level", "hand", "middle", "width", "bracing", "surface", "ends", "cover"];
export const CHOICES = {
  level:   { at:   "level with where you stand",  raised: "carried well above the ground" },
  hand:    { none: "nothing at the hand",         rail:   "a rail at the hand the whole way" },
  middle:  { none: "nothing set down in the gap", post:   "a post standing in the gap",
             tower: "a framed tower standing in the gap" },
  width:   { one:  "one person at a time",        two:    "two abreast" },
  bracing: { none: "nothing bracing it",          struts: "struts driven into both banks" },
  surface: { bare: "nothing laid on the walk",    rough: "a coarse surface that bites a wet boot" },
  ends:    { rested: "the ends resting on the banks", footed: "the ends carried down to firm ground" },
  cover:   { open:  "nothing overhead",           roof:  "a roof the whole length of it" },
};
const BARE = { level: "at", hand: "none", middle: "none", width: "one", bracing: "none",
               surface: "bare", ends: "rested", cover: "open" };

// Every feature is reachable more than one way — `steady` from a tower or from
// struts, `heavy` only where something carries the weight AND there is room for
// it — so which one the talk arrives at is decided by the talk.
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
  if (d.surface === "rough") has.add("grip");
  if (d.ends === "footed") has.add("footed");
  if (d.cover === "roof") has.add("sheltered");
  if (AXES.every(k => d[k] === BARE[k])) has.add("minimal");
  return [...has];
}

// Matchsticks, so "17 laid" still means something.
const COST = {level:{at:1,raised:3}, hand:{none:0,rail:4}, middle:{none:0,post:1,tower:5},
              width:{one:0,two:4}, bracing:{none:0,struts:3},
              surface:{bare:0,rough:7}, ends:{rested:0,footed:2}, cover:{open:0,roof:4}};

// The six that were the whole kit are corners of this space. Recordings made
// before it existed still resolve, and a run that lands on one gets called by
// its name rather than by a list of parts.
export const FAMILIAR = [
  { id:"log",     name:"A single log",          d:{level:"at",    hand:"none",middle:"none", width:"one",bracing:"none"},
    made:"one length flat across, bank to bank" },
  { id:"rail",    name:"A log with a handrail", d:{level:"at",    hand:"rail",middle:"none", width:"one",bracing:"none"},
    made:"a length flat across, and a rail beside it on three uprights" },
  { id:"braced",  name:"A braced walkway",      d:{level:"at",    hand:"rail",middle:"none", width:"two",bracing:"struts"},
    made:"a length flat across, a rail beside it, and two struts driven down into the banks" },
  { id:"prop",    name:"A log on a prop",       d:{level:"at",    hand:"none",middle:"post", width:"one",bracing:"none"},
    made:"a length flat across, carried in the middle on a post standing in the gap" },
  { id:"trestle", name:"A timber trestle",      d:{level:"at",    hand:"rail",middle:"tower",width:"two",bracing:"struts"},
    made:"a framed tower standing in the gap, with the walk carried over the top of it" },
  { id:"hang",    name:"A hanging span",        d:{level:"raised",hand:"none",middle:"none", width:"one",bracing:"none"},
    made:"the walk carried well above the ground, with nothing at the hand" },
];
const SHORTNAME = d => {
  // "raised" is not a thing the crossing HAS, it is how it sits, so it belongs
  // in front of the noun rather than in the list after it.
  const head = d.level === "raised" ? "A raised crossing" : "A crossing";
  const bits = [];
  if (d.hand === "rail") bits.push("a rail");
  if (d.middle === "post") bits.push("a post in the gap");
  if (d.middle === "tower") bits.push("a tower in the gap");
  if (d.width === "two") bits.push("two abreast");
  if (d.bracing === "struts") bits.push("struts");
  if (d.surface === "rough") bits.push("a coarse surface");
  if (d.ends === "footed") bits.push("footed ends");
  if (d.cover === "roof") bits.push("a roof");
  if (!bits.length) return d.level === "raised" ? "A raised crossing" : "A bare crossing";
  return head + " with " + (bits.length === 1 ? bits[0]
    : bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1]);
};
// The six named ones predate these axes; they take the bare setting on each.
for (const f of FAMILIAR) f.d = { surface: "bare", ends: "rested", cover: "open", ...f.d };
const sameShape = (x, y) => AXES.every(k => x[k] === y[k]);
const slug = d => AXES.map(k => d[k]).join("-");
const parts = d => AXES.map(k => CHOICES[k][d[k]]).filter(t => !/^nothing/.test(t)).join(", ")
                || "one length laid flat across, and nothing else";

export const KIT = (() => {
  const out = [];
  const walk = (i, acc) => i === AXES.length ? out.push({ ...acc })
    : Object.keys(CHOICES[AXES[i]]).forEach(v => walk(i + 1, { ...acc, [AXES[i]]: v }));
  walk(0, {});
  return out.map(d => {
    const fam = FAMILIAR.find(f => sameShape(f.d, d));
    return {
      id: fam ? fam.id : slug(d), shape: d,
      name: fam ? fam.name : SHORTNAME(d),
      made: fam ? fam.made : parts(d),
      has: propsOf(d),
      members: AXES.reduce((n, k) => n + COST[k][d[k]], 0),
    };
  });
})();

export const SHAPE = id => (KIT.find(k => k.id === id) || {}).shape || null;
export const describe = d => parts(d);
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
  grip:      "it does not go slick underfoot when it is wet",
  footed:    "its ends hold when the banks go soft",
  sheltered: "the weather is kept off you as you cross",
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
// Clear at the top of each turn; hear() adds to it. build() uses it to break
// ties in favour of whatever this turn actually asked for.
export function newTurn(ctx) { ctx.justHeard = []; }

export function hear(ctx, role, act, asserts) {
  ctx.justHeard = ctx.justHeard || [];
  if (act === "want") ctx.justHeard.push(...asserts);
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
  // Ties are not the exception here, they are the weather: with forty-eight
  // crossings and small integer scores the top two are level on nine turns in
  // ten. "Keep what is already standing" was right for six structures and is a
  // freeze for forty-eight — it built the first thing and then held it against
  // everything said afterwards, so a third of the turns that told the builder
  // something new moved nothing at all.
  //
  // What breaks a tie now is what was JUST said. Among the crossings level at
  // the top, take the one carrying most of what this turn actually asked for;
  // only if that cannot separate them does the standing one keep its place.
  const top = scored[0].s;
  const tied = scored.filter(r => r.s === top);
  const fresh = new Set(ctx.justHeard || []);
  const nowWanted = k => k.has.filter(f => fresh.has(f)).length;
  const named = k => k.has.filter(f => ctx.namedBy.has(f)).length;
  const best = Math.max(...tied.map(r => nowWanted(r.k)));
  const front = tied.filter(r => nowWanted(r.k) === best);
  const held = ctx.design && front.find(r => r.k === ctx.design);
  const pick = held || front.slice().sort((x, y) => named(y.k) - named(x.k))[0];

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
