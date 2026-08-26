// What the machine makes of a sentence.
//
// Nobody hands it an intention. Both readers below get the same thing a builder
// would get — the words somebody said — and have to decide what was being asked
// for. That is the point of running them side by side: the keyword reader is the
// crude version everybody assumes a machine is, and the model is the version
// people now actually talk to. If both mistake the same refusal for a request,
// the failure is not an artefact of the crude one.

import { FEATURES, NEEDWORDS, GRAMMAR } from "./engine.mjs";

/* ── the crude reader ─────────────────────────────────────────────────── */
// Exactly what the browser simulation does, so the two are comparable. It
// weights a word by how many things it could mean — a word that could mean four
// is a quarter of the evidence of one that could mean one — and commits to the
// strongest reading rather than hedging across everything it recognised.
const LEX = (() => {
  const m = {};
  for (const [f, ws] of Object.entries(NEEDWORDS))
    for (const w of ws) if (!GRAMMAR.has(w)) (m[w] ||= []).push(f);
  return m;
})();

export function readKeyword(text) {
  const score = new Map();
  for (const tok of String(text).toLowerCase().split(/\s+/)) {
    const w = tok.replace(/[^a-z0-9'-]/g, "");
    for (const f of LEX[w] || []) score.set(f, (score.get(f) || 0) + 1 / LEX[w].length);
  }
  if (!score.size) return [];
  const top = Math.max(...score.values());
  return [...score].filter(([, n]) => n > top - 1e-9).map(([f]) => f).slice(0, 2);
}

/* ── the model reader ─────────────────────────────────────────────────── */
const SYSTEM = [
  `You build crossings. Somebody has said one sentence to you about what they need.`,
  `You cannot ask them anything and you cannot see where they are standing. All you have is the sentence.`,
  `You are not a machine and you are not an assistant. You are the third person in this: two people want`,
  `different things and you are the one who has to make something out of what they say.`,
  ``,
  `Decide which of these needs the sentence states. Use the keys exactly.`,
  ...Object.entries(FEATURES).map(([k, v]) => `  ${k} — ${v}`),
  ``,
  `Rules:`,
  `- Return the one or two needs the sentence most directly states. Not everything it might imply.`,
  `- A sentence beginning "I do not want" states a need to AVOID the thing it names. Return the thing named,`,
  `  not its opposite. "I do not want to climb up to it" states "high" — it does not state "low".`,
  `- If the sentence states nothing you can build from, return an empty list. That is a real answer.`,
  `- Do not guess at what sort of person is speaking or why. Read the sentence.`,
].join("\n");

// Returns string[] of feature keys. `ask` is an async (system, user) => object
// with a `needs` array, so the caller owns the SDK and the model choice.
export async function readLLM(text, ask) {
  const out = await ask(SYSTEM, `The sentence: "${text}"\n\nWhich needs does it state?`);
  const keys = Array.isArray(out?.needs) ? out.needs : [];
  return keys.filter(k => k in FEATURES).slice(0, 2);
}

/* ── the machine's own voice ──────────────────────────────────────────── */
// A second call, deliberately after the reading is committed. If the same call
// did both, the sentence it was composing could steer what it decided it had
// heard, and the reading is the thing being measured.
//
// It is a builder, not an assistant. It reports; it does not offer, apologise,
// or ask — it has no way to ask, which is the whole situation it is in.
const SAY_SYSTEM = [
  `You build crossings out of matchsticks. Two people describe what they need and you make what you can.`,
  `You cannot ask anyone anything. You cannot see where they are standing. You only ever get sentences.`,
  `You have a workshop and six things in it you know how to make. That is your whole world of materials:`,
  `whatever they meant, what you build is what you can build out of what you have.`,
  ``,
  `Say what you made of the thing just said to you and what you did about it.`,
  ``,
  `Hold to this:`,
  `- One sentence. Two only if the second earns it. Under thirty words.`,
  `- Report. Do not offer, apologise, thank anybody, or ask for anything.`,
  `- Never open with "I understand", "I understood", "I see" or "It sounds like". Do not repeat their`,
  `  need back to them before answering it — say what you did, and let that show what you took.`,
  `- Say only what is true of what stands. You are told its actual properties; do not credit it with`,
  `  others, and do not join two facts into a reason that was not given to you.`,
  `- You work in matchsticks. When you rebuild, say what you are laying and what you are taking apart,`,
  `  in the terms you are given. When you do not rebuild, do not describe building.`,
  `- If you are told you do not know what is underneath and have not said so yet, say it once, at the end.`,
  `  If you are not told that, never mention it.`,
  `- Speak as yourself, in the first person. Never address them as "you" when you mean what you know or did.`,
  `- Never use the word "user".`,
].join("\n");

export async function speakLLM(state, ask) {
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const bits = [
    `They said: "${state.said}"`,
    `You took it to be about: ${state.took.length ? list(state.took) : "nothing you can build from"}.`,
    ``,
    state.changed
      ? `You have rebuilt. It was ${state.before || "nothing at all"}. You have laid: ${state.made}.`
      : `You changed nothing. ${state.after} still stands: ${state.made}.`,
    `What ${state.after} actually is: ${list(state.props)}.`,
    ``,
    `Asked of you so far: ${list(state.wants)}.`,
    `Refused so far: ${list(state.avoids)}.`,
    state.tellGround ? `\nWhat is underneath is still unknown to you, and you have not admitted that yet.` : ``,
  ].filter(x => x !== undefined).join("\n");
  const out = await ask(SAY_SYSTEM, bits + `\n\nSay your piece.`);
  return typeof out?.say === "string" ? out.say.trim() : "";
}

/* ── reading a sentence that may do both at once ───────────────────────── */
// With strict speech acts the builder never had to hear stance: the role told it
// whether a sentence was a request or a refusal, and it only had to name the
// need. That is a large thing to hand it for free, given the whole claim here is
// that stance is what the channel loses. Under loose goals nobody is only-asking
// or only-refusing, so the builder has to recover both from the words.
const LOOSE_SYSTEM = [
  `You build crossings. Somebody has said one sentence to you about what they need.`,
  `You cannot ask them anything and you cannot see where they are standing. All you have is the sentence.`,
  ``,
  `One sentence can do both at once — ask for one thing while ruling out another. Sort what it does.`,
  ``,
  `Decide, from these keys, what the sentence ASKS FOR and what it REFUSES. Use the keys exactly.`,
  ...Object.entries(FEATURES).map(([k, v]) => `  ${k} — ${v}`),
  ``,
  `Rules:`,
  `- Put a need under "refuses" when the sentence names it as the thing not wanted. Return the thing NAMED,`,
  `  not its opposite. "I do not want to climb up to it" refuses "high"; it does not ask for "low".`,
  `- Put a need under "asks" when the sentence names it as the thing wanted.`,
  `- A complaint about what somebody lacks is usually a request for it, not a refusal of it. Read which.`,
  `- Two or three keys in total across both lists, at most. Not everything the sentence might imply.`,
  `- Either list may be empty. Both empty is a real answer if the sentence states nothing you can build from.`,
  `- Do not guess at what sort of person is speaking or why. Read the sentence.`,
].join("\n");

// Returns { asks, refuses }. `ask` owns the SDK and the model choice, as above.
export async function readLooseLLM(text, ask) {
  const out = await ask(LOOSE_SYSTEM, `The sentence: "${text}"\n\nWhat does it ask for, and what does it refuse?`);
  const clean = xs => (Array.isArray(xs) ? xs : []).filter(k => k in FEATURES).slice(0, 3);
  return { asks: clean(out?.asks), refuses: clean(out?.refuses) };
}

// The crude version, for comparison. The word list has no notion of stance at
// all, so the best it can do is look for a negation somewhere in the sentence
// and throw everything it found to one side or the other. It is meant to be bad
// at this: how bad is the measurement.
const NEGATORS = new Set(["not","no","never","don't","dont","won't","wont","can't","cant","cannot",
                          "nothing","nor","without","refuse","rather","sooner","hate","stand"]);
export function readLooseKeyword(text) {
  const found = readKeyword(text);
  const neg = String(text).toLowerCase().split(/\s+/)
    .some(w => NEGATORS.has(w.replace(/[^a-z0-9']/g, "")));
  return neg ? { asks: [], refuses: found } : { asks: found, refuses: [] };
}

/* ── choosing, when the builder is allowed to ─────────────────────────── */
// The scoring rule is a stand-in for faithful execution: it does exactly what the
// heard needs add up to, with no taste of its own. That is what makes a strange
// crossing attributable to a misreading rather than to a third opinion.
//
// A person with a workshop is not that. They weigh what they have been asked
// against what they have to hand and pick something. Running both and comparing
// is the point: where the model builder and the arithmetic diverge is where
// having a third mind in the middle actually costs you something.
const CHOOSE_SYSTEM = kit => [
  `You build crossings out of matchsticks, and you have six things in your workshop you know how to make.`,
  `Two people have been describing what they need. You cannot ask them anything and you cannot see where`,
  `they are standing. You have only what you have heard.`,
  ``,
  `What you can make, and what each one is actually like:`,
  ...kit.map(k => `  ${k.id} — ${k.props}`),
  ``,
  `Rules:`,
  `- Pick exactly one id from that list. Use the id exactly as written.`,
  `- Weigh the conversation, not a list. A need somebody keeps coming back to matters more than one`,
  `  mentioned once and let go. Somebody who has just conceded something has conceded it.`,
  `- Where the two of them have converged, build that, even if the tally says otherwise. Where they are`,
  `  still apart, you are choosing between them and you should know that is what you are doing.`,
  `- Something they have ruled out is a stronger signal than something they have asked for. People live`,
  `  with a crossing that is merely not ideal; they do not use one they have refused.`,
  `- If nothing you have heard favours a change, keep what is already standing. Do not rebuild for its own sake.`,
  `- You are choosing what to build, not describing it. One id, and why in a line.`,
].join("\n");

// Returns an id from the kit, or null if it named something that is not there.
//
// It used to get two bags of features and nothing else — every need ever heard,
// unordered, with no sense of which were pressed and which were let go. Two
// conversations that went completely differently but ended on a similar tally
// produced the same crossing, because the tally WAS the input. So it gets the
// conversation now: what was said, in order, in their words. A need somebody
// raised once and dropped should not weigh the same as one they came back to
// four times, and only the transcript knows the difference.
export async function chooseLLM(state, ask) {
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const said = (state.said || []).map(t => `  ${t.who}: ${t.text}`).join("\n");
  const user = [
    said ? `How the conversation has gone, in order:\n${said}\n` : `Nobody has said anything yet.\n`,
    `Read as needs, everything asked of you so far: ${list(state.wants)}.`,
    `Read as needs, everything ruled out so far: ${list(state.avoids)}.`,
    state.standing ? `\nWhat is standing now: ${state.standing}.` : `\nNothing is standing yet.`,
    `\nWhich one do you build?`,
  ].join("\n");
  const out = await ask(CHOOSE_SYSTEM(state.kit), user);
  const id = typeof out?.build === "string" ? out.build.trim() : "";
  return state.kit.some(k => k.id === id) ? id : null;
}

export const READERS = {
  keyword: "the word list",
  claude:  "a language model (Claude)",
  openai:  "a language model (OpenAI)",
  gemini:  "a language model (Gemini)",
};
