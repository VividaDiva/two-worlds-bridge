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
  `You are a machine that builds crossings. Somebody has said one sentence to you about what they need.`,
  `You cannot ask them anything and you cannot see where they are standing. All you have is the sentence.`,
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

export const READERS = {
  keyword: "the word list",
  claude:  "a language model (Claude)",
  openai:  "a language model (OpenAI)",
};
