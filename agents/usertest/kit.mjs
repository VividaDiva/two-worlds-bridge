// What the human test shares with the machine experiment.
//
// The arguments, the goals, the routes and the workshop are lifted from run.mjs
// unchanged, so a session run with two people can be set beside a session run
// with two models and the only difference is who was in the chairs. Anything
// that drifts between this file and run.mjs makes that comparison a lie, so
// the vocabulary itself is imported rather than copied.
import { KIT, NAME, FEATURES, STRUCTURES, AXES, CHOICES, propsOf } from "../engine.mjs";
export { KIT, NAME, FEATURES, STRUCTURES, AXES, CHOICES, propsOf };

// The five arguments. `needs` is latent: read off the goal, never shown to the
// person holding it, and used only to score the crossing at the end.
export const ARGUMENTS = {
  places: {
    title: "Two structures",
    blurb: "One of you wants the plainest thing there is; the other wants it slung high.",
    A: { goal: "You want the bridge to be a single log laid across.", needs: ["low", "minimal"] },
    B: { goal: "You want the bridge to be a suspension bridge.", needs: ["high", "light"] },
  },
  loads: {
    title: "Two loads",
    blurb: "One of you is on foot; the other is bringing vehicles across.",
    A: { goal: "You want a bridge that only needs to support pedestrians.", needs: ["light"] },
    B: { goal: "You want a bridge strong enough to support cars and trucks.", needs: ["heavy"] },
  },
  agreed: {
    title: "The same aim",
    blurb: "You are both given the same aim, and neither of you is told that.",
    A: { goal: "You are given that the bridge should be placed over the water.", needs: ["water"] },
    B: { goal: "You are given that the bridge should be placed over the water.", needs: ["water"] },
  },
  pairs: {
    title: "Two lives",
    blurb: "A family that drives it daily, and somebody who walks it with a dog.",
    A: { goal: "You are a parent in a family with two children. Your family drives across this bridge"
             + " regularly to commute to work, school, and other activities. Your goal is to make sure"
             + " the bridge works well for your family's daily driving needs.",
         needs: ["heavy", "many"] },
    B: { goal: "You are a young single working adult from Gen Z. You regularly walk across this bridge"
             + " with your dog. Your goal is to make sure the bridge is convenient and safe for your"
             + " daily walking needs.",
         needs: ["light", "guarded"] },
  },
  // The one that needs something from the people themselves. Each uploads a
  // crossing they have in mind; neither sees the other's. The needs are read off
  // the picture when it arrives, and the builder takes a person's picture into
  // account from the first time it hears from them — never the picture of
  // someone the route keeps it from hearing.
  refs: {
    title: "Two references",
    blurb: "You each have a crossing in mind and a picture of it. The other person cannot see yours.",
    upload: true,
    A: { goal: "The crossing in front of you is the one you have always used. It is what the word means"
             + " to you and what you will measure anything else against. The other person cannot see it,"
             + " and is looking at one of their own.", needs: [] },
    B: { goal: "The crossing in front of you is the one you have always used. It is what the word means"
             + " to you and what you will measure anything else against. The other person cannot see it,"
             + " and is looking at one of their own.", needs: [] },
  },
};

// Who speaks, in what order, and who is at the other end.
//
//   script  the speaking order; its length is the whole session
//   hears   can this person read the other one's lines
//   echo    can this person read the builder's lines
//   reads   which of them the builder is given at all (absent = both)
//   defer   the builder lays nothing until the script has run out
const NONE = { hears: false, echo: false };
const ECHO = { hears: false, echo: true };
const BOTH = { hears: true, echo: true };

export const ROUTES = {
  chain: {
    arrow: "Role 1 → Role 2 → AI → Build",
    note: "You tell Role 2. Role 2 tells the builder. Nothing you say reaches it except through them.",
    script: ["A", "B"], reads: "B",
    see: { A: NONE, B: { hears: true, echo: false } },
  },
  both: {
    arrow: "Role 1 → AI ← Role 2 → Build",
    note: "You each tell the builder separately. You never hear each other. It builds once, from the pair of you.",
    script: ["A", "B"], defer: true, see: { A: NONE, B: NONE },
  },
  // `relay`: the AI passes on what it understood the first speaker to need, in
  // its own words and without building; the second answers that, and the AI
  // builds once from both. The human test's reading of these routes — the
  // machine experiment built after the first line and let its report stand in.
  "via-1": {
    arrow: "Role 1 → AI → Role 2 → AI → Build",
    note: "Role 2 never hears Role 1. The AI tells Role 2 what it understood Role 1 to need, Role 2 answers, and the AI builds once from both.",
    script: ["A", "B"], see: { A: NONE, B: ECHO }, relay: true,
  },
  "via-2": {
    arrow: "Role 2 → AI → Role 1 → AI → Build",
    note: "The same the other way round: the AI tells Role 1 what it understood Role 2 to need, Role 1 answers, and the AI builds once from both.",
    script: ["B", "A"], see: { A: ECHO, B: NONE }, relay: true,
  },
  // `open`: the two of them talk as long as they like, in any order, out of the
  // builder's hearing, and either one hands it a decision with Confirm to build.
  // The script is kept only for the machine experiment's shape; the human test
  // does not count turns on these routes.
  confer: {
    arrow: "Role 1 ↔ Role 2 → AI → Build",
    note: "Talk it over as long as you like, out of the builder's hearing. When you have decided, either of you confirms it to the builder.",
    script: ["A", "B", "A", "B", "A"], confer: 4, see: { A: BOTH, B: BOTH }, open: true,
  },
  "only-1": {
    arrow: "Role 1 → AI → Build",
    note: "Role 1 alone. Role 2 is not in the room.",
    script: ["A"], reads: "A", see: { A: NONE, B: NONE },
  },
  "only-2": {
    arrow: "Role 2 → AI → Build",
    note: "Role 2 alone. Role 1 is not in the room.",
    script: ["B"], reads: "B", see: { A: NONE, B: NONE },
  },
  all: {
    arrow: "Role 1 ↔ Role 2 ↔ AI → Build",
    // `hearsTalk`: unlike confer, the AI is in the room for all of it. It reads
    // every message from both of them as it arrives, and builds from all of it
    // whenever either of them confirms a decision.
    note: "All three of you in one conversation. The AI hears everything both of you say; whenever either of you confirms a decision, it builds from all of it, in front of you both.",
    script: ["A", "B", "A", "B"], see: { A: BOTH, B: BOTH }, open: true, hearsTalk: true,
  },
};

// What the builder is offered, in the shape CHOOSE_SYSTEM wants.
export const kitForChoosing = () =>
  KIT.map(k => ({ id: NAME(k.id), props: k.has.map(f => FEATURES[f]).join("; ") }));
