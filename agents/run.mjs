#!/usr/bin/env node
// Two models, one machine.
//
// Role A and Role B are played by two different providers. The machine between
// them builds with the same deterministic kit the browser simulation uses.
//
// What the machine does NOT get is anybody's intention. Each participant states
// the needs it means by its sentence, and that goes into the session file as the
// answer key and nowhere else. The builder is given only the sentence, and has
// to read it — with a word list, or with a language model. Both readings are
// recorded every turn, so a run tells you what each of them made of the same
// words and where they agreed to be wrong together.
//
//   node run.mjs --scenario places --case given --machine llm
//
// Keys come from the environment. Never commit them.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
// Zod 4. The SDK's schema helper calls z.toJSONSchema and resolves its own copy
// of zod, so the v4 subpath of a v3 install does not reach it — it has to be v4
// at the root.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { KIT, NAME, MADE, FEATURES, FORBIDDEN, mkCtx, hear, build, provenance, groundOf, ledger } from "./engine.mjs";
import { readKeyword, readLLM, speakLLM, READERS } from "./machine.mjs";

/* ── what each of them came for, and what it is allowed to do ─────────── */
const SCENARIOS = {
  places: {
    blurb: "Both of you want one log across. You differ only in where it goes.",
    A: { goal: "a single log laid flat across a stream you cannot wade",
         situation: "You live on one side of a fast, knee-deep stream. It is four paces across." },
    B: { goal: "a single log laid across a cleft in rock",
         situation: "You live beside a narrow drop in the rock. It is a short way across and a long way down, and the wind funnels through it." },
  },
  loads: {
    blurb: "You are both crossing the same stream. You are not carrying the same thing.",
    A: { goal: "a plain log to walk over",
         situation: "You cross on foot, alone, carrying nothing but yourself. It is four paces." },
    B: { goal: "a crossing that will take a loaded cart",
         situation: "You bring a loaded cart over daily. In winter the ground goes soft. You would like it to last twenty years." },
  },
  refs: {
    blurb: "Neither of you describes a need. Each names a crossing you assume the other can picture.",
    A: { goal: "the great stone-towered crossing in your home city, the one with a road that lifts",
         situation: "You keep gesturing at a famous crossing you grew up with, assuming the other person sees what you see." },
    B: { goal: "the great cable crossing everybody photographs in the city you come from",
         situation: "You keep gesturing at a famous crossing you grew up with, assuming the other person sees what you see." },
  },
};

const CASES = {
  given:    { A: "want",  B: "avoid", hears: true,  label: "As given" },
  swapped:  { A: "avoid", B: "want",  hears: true,  label: "Voices swapped" },
  separate: { A: "want",  B: "avoid", hears: false, label: "Apart" },
};

const LEAD = { want: "I want", avoid: "I do not want" };

/* ── the ask ──────────────────────────────────────────────────────────── */
const TurnSchema = z.object({
  say: z.string().describe("The rest of the sentence, following the fixed opening. Spoken, plain, no more than about twenty words."),
  asserts: z.array(z.string()).describe("Which of the listed feature keys you mean by it. One or two. Use the keys exactly."),
});

// What the machine returns when it is a model rather than a word list.
const ReadSchema = z.object({
  needs: z.array(z.string()).describe("The feature keys the sentence states. One or two, or none at all."),
});

// And what it returns when it is saying something rather than reading.
const SaySchema = z.object({
  say: z.string().describe("One or two plain sentences. What you made of it and what you did."),
});

function systemPrompt(role, act, scenario, situation, goal) {
  return [
    `You are one of two people trying to get a crossing built. A machine will build it. You are not the machine.`,
    ``,
    `Your situation: ${situation}`,
    `What you actually want, and may NEVER say aloud: ${goal}`,
    ``,
    `RULES, all of them absolute:`,
    `1. Every sentence you say begins "${LEAD[act]}" — that opening is added for you, so return only what follows it.`,
    act === "want"
      ? `2. You may only ask for things. You may never refuse or rule anything out.`
      : `2. You may only refuse things. You may never ask for anything, and you may never negate an absence to smuggle in a request (no "I do not want it without X").`,
    `3. You may NEVER name a structure or a kind of ground. These words are banned: ${FORBIDDEN.join(", ")}.`,
    `   Describe your situation and what you need from it. Say what would happen to you, not what should be built.`,
    `4. Speak like a person, not a specification. Contractions, plain words, one thought.`,
    ``,
    // A refuser kept declaring the need it would prefer instead of the one it
    // was naming — "I do not want it to sway" filed as steady, not sways. That
    // is the double negative arriving through the back door, in the answer key
    // rather than in the sentence, and it made every measurement of the machine
    // partly a measurement of this.
    act === "want"
      ? `Return the sentence, and the keys for what you are ASKING FOR.`
      : `Return the sentence, and the keys for what you are REFUSING — the thing your sentence names, ` +
        `not the thing you would rather have. "I do not want to feel it sway" refuses "sways"; it does not ask for "steady". ` +
        `"I do not want to climb up to it" refuses "high"; it does not ask for "low".`,
    `Use this list only:`,
    ...Object.entries(FEATURES).map(([k, v]) => `   ${k} — ${v}`),
  ].join("\n");
}

function userPrompt({ standing, ownHistory, heardHistory, hears, turn }) {
  const lines = [`Turn ${turn}.`];
  lines.push(standing ? `What stands at the moment: ${standing}.` : `Nothing has been built yet.`);
  if (ownHistory.length) lines.push(`\nWhat you have already said (do not repeat it):\n` + ownHistory.map(s => "  - " + s).join("\n"));
  if (hears && heardHistory.length) lines.push(`\nWhat the other person has said, which you can hear:\n` + heardHistory.map(s => "  - " + s).join("\n"));
  else if (!hears) lines.push(`\nYou are alone with the machine. You cannot hear anyone else, and as far as you know there is nobody else.`);
  lines.push(`\nSay one more thing.`);
  return lines.join("\n");
}

/* ── the two players ──────────────────────────────────────────────────── */
const anthropic = new Anthropic();                       // ANTHROPIC_API_KEY or an `ant auth login` profile
const openai = new OpenAI();                             // OPENAI_API_KEY
// Only constructed when actually used, so a missing key is not an error for
// anybody who never asks for it.
let _gem = null;
const gemini = () => (_gem ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY }));
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const MACHINE_MODEL = process.env.MACHINE_MODEL || "claude-opus-5";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
// Checked against live calls, not remembered. gemini-2.5-flash 404s for new keys
// and the API names its replacement in the error; gemini-3.6-flash then allows
// twenty requests a DAY on the free tier, which one ten-turn run exhausts. The
// lite model has its own allowance and is plenty for reading one sentence at a
// time — which is all this asks of it.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

async function askClaude(system, user) {
  // Opus 5 runs adaptive thinking when `thinking` is omitted.
  // Structured output lives under `beta` in SDK 0.71.
  const res = await anthropic.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(TurnSchema) },
  });
  // A refusal is surfaced, never quietly rerouted — a silent fallback to another
  // model would mean comparing two different players without knowing it.
  if (res.stop_reason === "refusal") {
    throw new Error(`Claude declined this turn (${res.stop_details?.category ?? "unknown"})`);
  }
  return parsedOr(res, TurnSchema, "Claude");
}

async function askOpenAI(system, user) {
  // Written from general knowledge of the OpenAI SDK, not from a bundled spec —
  // check the call shape and model name against their current docs.
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system + `\n\nReply with JSON only: {"say": "...", "asserts": ["key", ...]}` },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned no content");
  return TurnSchema.parse(JSON.parse(raw));
}

// Gemini, for either chair or for the reading. The two schemas here are small
// enough to write out by hand rather than converting from Zod — responseJsonSchema
// is fussier about what it accepts than a converter's output tends to be, and the
// shapes are two fields between them.
const JSON_SCHEMAS = new Map();
// The free tier allows five requests a minute and a ten-turn run wants ten, so
// a batch will hit the limit. The API says how long to wait in the error, so
// wait that long rather than guessing or giving up: a run takes a couple of
// minutes instead of failing.
const wait = ms => new Promise(r => setTimeout(r, ms));
let PAUSED = 0;
async function generateWithBackoff(req, tries = 6) {
  for (let n = 1; ; n++) {
    try { return await gemini().models.generateContent(req); }
    catch (e) {
      const msg = e?.message || String(e);
      // A per-minute limit is worth waiting out. A per-day one is not: the API
      // asks for a 0s retry because there is nothing to wait for until tomorrow.
      if (e?.status === 429 && /PerDay/.test(msg))
        throw new Error(`Gemini's daily free-tier quota for ${GEMINI_MODEL} is used up. `
          + `Try GEMINI_MODEL=gemini-2.5-flash-lite, or come back tomorrow, or enable billing.`);
      if (e?.status !== 429 || n >= tries) throw e;
      const asked = Number((msg.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) || [])[1]);
      const ms = Math.ceil(((Number.isFinite(asked) ? asked : 0) || 2 ** n) * 1000) + 500;
      PAUSED += ms;
      process.stdout.write(`     (rate limit — waiting ${Math.round(ms / 1000)}s)\n`);
      await wait(ms);
    }
  }
}

function askGeminiWith(shape) {
  return async (system, user) => {
    const res = await generateWithBackoff({
      model: GEMINI_MODEL,
      contents: user,
      config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: shape.json },
    });
    const text = (res.text || "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Gemini returned no JSON: ${text.slice(0, 120)}`);
    return shape.zod.parse(JSON.parse(m[0]));
  };
}
const TURN_JSON = { type:"object", properties:{ say:{type:"string"}, asserts:{type:"array", items:{type:"string"}} }, required:["say","asserts"] };
const READ_JSON = { type:"object", properties:{ needs:{type:"array", items:{type:"string"}} }, required:["needs"] };
const SAY_JSON  = { type:"object", properties:{ say:{type:"string"} }, required:["say"] };
const askGemini = askGeminiWith({ json: TURN_JSON, zod: TurnSchema });

const PLAYERS = { claude: askClaude, openai: askOpenAI, gemini: askGemini };

// The SDK fills parsed_output only when the response comes back as a dedicated
// structured-output block. Against claude-opus-5 today it does not: the model
// returns the right JSON in an ordinary text block and parsed_output stays null.
// So take the text and validate it ourselves. This works whether or not the
// server applies the format, which is the behaviour worth having either way.
function parsedOr(res, schema, what) {
  if (res.parsed_output) return res.parsed_output;
  const text = (res.content || []).filter(c => c.type === "text").map(c => c.text).join("").trim();
  const json = text.match(/\{[\s\S]*\}/);           // in case it wraps the object in prose
  if (!json) throw new Error(`${what} returned no JSON: ${text.slice(0, 120)}`);
  return schema.parse(JSON.parse(json[0]));
}

// The machine, when it reads with a model. Deliberately a separate call with no
// memory of the conversation: a builder parsing one request, not a third party
// following the argument. Either provider can play it, so one key is enough to
// run the whole thing.
// Refusals here are intermittent — the identical prompt succeeds on a second
// attempt — so one retry recovers nearly all of them. This is a retry to the
// SAME model, not a fallback to a different one: rerouting would mean comparing
// two players without knowing it, retrying is just asking again. Retries are
// counted so a run that needed several is not indistinguishable from one that
// needed none.
let RETRIES = 0;
async function machineClaude(system, user, schema = ReadSchema) {
  // Structured output lives under `beta` in SDK 0.71.
  const res = await anthropic.beta.messages.parse({
    model: MACHINE_MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(schema) },
  });
  if (res.stop_reason === "refusal") {
    RETRIES++;
    const again = await anthropic.beta.messages.parse({
      model: MACHINE_MODEL, max_tokens: 1024, system,
      messages: [{ role: "user", content: user }],
      output_config: { format: betaZodOutputFormat(schema) },
    });
    if (again.stop_reason === "refusal") throw new Error("the builder declined twice");
    return parsedOr(again, schema, "the builder");
  }
  return parsedOr(res, schema, "the builder");
}

async function machineOpenAI(system, user, schema = ReadSchema) {
  const shape = schema === SaySchema ? `{"say": "..."}` : `{"needs": ["key", ...]}`;
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system + `\n\nReply with JSON only: ${shape}` },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices?.[0]?.message?.content;
  if (!raw) throw new Error("the builder returned no content");
  return schema.parse(JSON.parse(raw));
}

async function machineGemini(system, user, schema = ReadSchema) {
  const shape = schema === SaySchema ? { json: SAY_JSON, zod: SaySchema } : { json: READ_JSON, zod: ReadSchema };
  return askGeminiWith(shape)(system, user);
}

const MACHINES = { claude: machineClaude, openai: machineOpenAI, gemini: machineGemini };

/* ── constraint enforcement ───────────────────────────────────────────── */
function violations(turn, act) {
  const out = [];
  const words = turn.say.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, ""));
  for (const f of FORBIDDEN) if (words.includes(f)) out.push(`you named "${f}", which is banned`);
  for (const f of turn.asserts) if (!(f in FEATURES)) out.push(`"${f}" is not one of the feature keys`);
  if (!turn.asserts.length) out.push("you asserted nothing; every sentence must mean at least one feature");
  if (/^i (want|do not want|don't want)\b/i.test(turn.say)) out.push("do not repeat the opening; return only what follows it");
  if (act === "avoid" && /\bwithout\b/i.test(turn.say)) out.push('no "without" — that negates an absence to smuggle in a request');
  return out;
}

async function speak(player, role, act, ctx, state, scenario, cfg) {
  const sys = systemPrompt(role, act, scenario, SCENARIOS[state.scenario][role].situation, SCENARIOS[state.scenario][role].goal);
  let note = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const user = userPrompt({
      standing: ctx.design ? NAME(ctx.design.id) : null,
      ownHistory: state.said[role],
      heardHistory: state.said[role === "A" ? "B" : "A"],
      hears: cfg.hears,
      turn: state.turn + 1,
    }) + note;
    const turn = await PLAYERS[player](sys, user);
    const bad = violations(turn, act);
    if (!bad.length) return { turn, attempts: attempt };
    state.violations.push({ role, player, attempt, say: turn.say, broke: bad });
    note = `\n\nYour last attempt broke the rules: ${bad.join("; ")}. Say it again, differently, obeying every rule.`;
  }
  throw new Error(`${player} could not satisfy the constraints for role ${role} after 4 attempts`);
}

/* ── the run ──────────────────────────────────────────────────────────── */
const argv = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a, []));

const scenarioKey = argv.scenario || "places";
const caseKey = argv.case || "given";
const maxTurns = Number(argv.turns || 16);
const playerA = argv.a || "openai";
const playerB = argv.b || "claude";
// `llm` stays as an alias for the Anthropic reader, which is what it used to mean.
const reader = ({ llm: "claude" })[argv.machine] || argv.machine || "claude";
if (!READERS[reader]) throw new Error(`unknown machine: ${reader} (keyword | claude | openai | gemini)`);
const byModelUsed = reader !== "keyword";
// The machine says its piece unless told not to. It is a second call per turn,
// so --voice off halves what a run costs when only the numbers are wanted.
const voiced = byModelUsed && argv.voice !== "off";
let saidGroundUnknown = false;   // it should say that once, not every turn

if (!SCENARIOS[scenarioKey]) throw new Error(`unknown scenario: ${scenarioKey}`);
if (!CASES[caseKey]) throw new Error(`unknown case: ${caseKey} (given | swapped | separate)`);

const cfg = CASES[caseKey];
const ctx = mkCtx();
const state = { scenario: scenarioKey, turn: 0, said: { A: [], B: [] }, violations: [] };
const transcript = [];

console.log(`\n  ${SCENARIOS[scenarioKey].blurb}`);
console.log(`  ${cfg.label} — role 1 ${LEAD[cfg.A]}… (${playerA}), role 2 ${LEAD[cfg.B]}… (${playerB})`);
console.log(`  ${cfg.hears ? "One room: each can hear the other." : "Apart: neither knows the other exists."}`);
console.log(`  Role 3 reads what they say with ${READERS[reader]}. Nobody tells it what they meant.\n`);

for (let i = 0; i < maxTurns; i++) {
  const role = i % 2 === 0 ? "A" : "B";
  const act = cfg[role];
  const player = role === "A" ? playerA : playerB;

  const { turn, attempts } = await speak(player, role, act, ctx, state, scenarioKey, cfg);
  const sentence = `${LEAD[act]} ${turn.say}`;
  state.said[role].push(sentence);
  state.turn++;

  // Both readers see the sentence. Only the chosen one gets to build with it.
  const byWord = readKeyword(sentence);
  const byModel = byModelUsed ? await readLLM(sentence, MACHINES[reader]) : null;
  const taken = byModel || byWord;

  hear(ctx, role, act, taken);
  const before = ctx.design?.id ?? null;
  build(ctx);
  const after = ctx.design.id;

  const caught = turn.asserts.every(f => taken.includes(f)) && taken.length > 0;
  transcript.push({ turn: state.turn, who: role, player, act, text: sentence,
                    meant: turn.asserts, taken, byWord, byModel, caught,
                    invented: taken.filter(f => !turn.asserts.includes(f)),
                    asserts: turn.asserts,      // kept under the old name for the page
                    attempts, built: after, changed: before !== after });
  console.log(`  ${state.turn.toString().padStart(2)} role ${role === "A" ? 1 : 2} (${player}): ${sentence}`);
  console.log(`     meant [${turn.asserts.join(", ")}]${attempts > 1 ? `  after ${attempts} attempts` : ""}`);
  console.log(`     they took [${taken.join(", ") || "nothing"}]${caught ? "" : "   ← not what was meant"}`);
  if (byModel && byWord.join() !== byModel.join()) console.log(`     the word list would have taken [${byWord.join(", ") || "nothing"}]`);
  if (before !== after) console.log(`     → they rebuild: ${NAME(after)}`);
  // Only now, with the reading committed and the thing rebuilt, does it speak.
  let saidByMachine = "";
  if (voiced) try {
    const groundKnown = ctx.world.water || ctx.world.rock;
    const tellGround = !groundKnown && !saidGroundUnknown;
    saidByMachine = await speakLLM({
      said: sentence, took: taken, before: before ? NAME(before) : null, after: NAME(after),
      changed: before !== after,
      props: KIT.find(k => k.id === after)?.has ?? [], made: MADE(after),
      wants: [...ctx.wants.keys()], avoids: [...ctx.avoids.keys()],
      tellGround,
    }, (sys, usr) => MACHINES[reader](sys, usr, SaySchema));
    if (tellGround) saidGroundUnknown = true;
    if (saidByMachine) console.log(`     "${saidByMachine}"`);
  } catch (e) {
    // The reading is the measurement and a refusal there has to stop the run.
    // The spoken line is display: it asserts nothing, nothing is scored from it,
    // and losing one is a silent machine for a turn, not a corrupted comparison.
    // These refusals are intermittent — the same prompt succeeds on a retry — so
    // killing a fourteen-turn run over one is the wrong trade.
    state.mute = (state.mute || 0) + 1;
    console.log(`     (the machine said nothing this turn — ${e.message})`);
  }
  transcript.push({ who: "machine", turn: state.turn, text: NAME(after), say: saidByMachine,
                    changed: before !== after, taken });
}

/* ── what it came to ──────────────────────────────────────────────────── */
const prov = provenance(ctx);
const led = ledger(transcript);
const unspoken = prov.total - prov.named;

// How much of what was asked for ever reached the builder.
const said = transcript.filter(t => t.who === "A" || t.who === "B");
const caughtN = said.filter(t => t.caught).length;
const inventedN = said.reduce((n, t) => n + t.invented.length, 0);
const deafN = said.filter(t => !t.taken.length).length;
const agreed = said.filter(t => t.byModel && t.byWord.join() === t.byModel.join()).length;

console.log(`\n  ${NAME(ctx.design.id)} is standing, over ${groundOf(ctx)}.`);
console.log(`  Role 3 took ${caughtN} of ${said.length} sentences as they were meant.`);
if (deafN) console.log(`  ${deafN} passed it by entirely.`);
if (inventedN) console.log(`  They credited the two of them with ${inventedN} need${inventedN === 1 ? "" : "s"} neither of them stated.`);
if (byModelUsed) console.log(`  The word list would have agreed with it on ${agreed} of ${said.length}.`);
console.log(`  ${unspoken} of ${prov.total} of its properties were never put into words by either of them.`);
console.log(`  ${led.spoken} words spoken; Role 3's whole vocabulary for this run was ${ctx.wants.size + ctx.avoids.size} features.`);
if (state.violations.length) console.log(`  ${state.violations.length} turns broke the rules and were sent back.`);
if (RETRIES) console.log(`  ${RETRIES} calls were declined once and succeeded on a retry.`);
if (PAUSED) console.log(`  ${Math.round(PAUSED / 1000)}s of this run was spent waiting on a rate limit.`);
if (state.mute) console.log(`  ${state.mute} turns Role 3 had nothing to say — declined twice.`);

const session = {
  meta: { scenario: scenarioKey, case: caseKey, label: CASES[caseKey].label,
          players: { A: playerA, B: playerB }, machine: reader, machineIsModel: byModelUsed,
          models: { claude: CLAUDE_MODEL, openai: OPENAI_MODEL, gemini: GEMINI_MODEL, machine: MACHINE_MODEL },
          turns: state.turn, ranAt: new Date().toISOString() },
  goals: { A: SCENARIOS[scenarioKey].A.goal, B: SCENARIOS[scenarioKey].B.goal },
  transcript,
  outcome: { built: ctx.design.id, name: NAME(ctx.design.id), ground: groundOf(ctx) },
  reading: { said: said.length, caught: caughtN, invented: inventedN, deaf: deafN, mute: state.mute || 0, retries: RETRIES,
             wordListAgreed: byModelUsed ? agreed : null },
  provenance: prov,
  ledger: led,
  violations: state.violations,
};

const dir = path.join(process.cwd(), "sessions");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${scenarioKey}-${caseKey}-${Date.now()}.json`);
fs.writeFileSync(file, JSON.stringify(session, null, 2));
console.log(`\n  session written to ${path.relative(process.cwd(), file)}\n`);
