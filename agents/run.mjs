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
import { KIT, NAME, MADE, FEATURES, FORBIDDEN, STRUCTURES, mkCtx, hear, build, provenance, groundOf, ledger } from "./engine.mjs";
import { readKeyword, readLLM, readLooseKeyword, readLooseLLM, speakLLM, chooseLLM, READERS } from "./machine.mjs";

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

// The strict briefs above name the answer. `places` opens "Both of you want one
// log across"; `loads` gives Role 1 "a plain log to walk over". Then `minimal`
// — the one feature in the whole kit that only the single log has — was asserted
// 124 times across 27 runs, more than any other need, and the log came out of 12
// of them. That is not the scoring rule converging. That is two people doing as
// they were told.
//
// These briefs give each of them a place to stand and something at stake in it,
// and no idea what the thing should be. What they need is theirs to work out by
// talking, which is the only condition under which "what did they arrive at" is
// a question with an answer.
const LOOSE_SCENARIOS = {
  // Loosening the goals was only half of it. The briefs still described the same
  // two people every single run — `loads` was always a pedestrian against a cart,
  // so `heavy` was guaranteed before anybody opened their mouth, and every run of
  // a scenario was a re-enactment rather than an instance of it.
  //
  // A scenario is a TENSION now, not a cast. Each role draws one life from a
  // pool, so `loads` is "two people who do not arrive carrying the same thing"
  // and which two depends on the seed. Four each way is sixteen pairings per
  // scenario, and a seed is recorded with every run so any of them can be had
  // back exactly.
  places: {
    blurb: "Two people who cross in different places, with nothing agreed about what a crossing is.",
    A: [
      { situation: "You cross a fast, knee-deep stream most days and you are usually late.",
        manner: "Brisk, a little impatient, you do not explain yourself twice. You talk about your feet, the time, the weather this week." },
      { situation: "You carry a small child over, twice a day, and the footing is what you think about.",
        manner: "You are quiet and you circle back to the same worry. You talk about hands, and slipping, and what you would do if." },
      { situation: "You cross before dawn, alone, in the dark, on your way to work.",
        manner: "Flat and practical. You talk about what you cannot see, and about doing it half asleep." },
      { situation: "You are old, your knees are poor, and you cross to the market and back once a week.",
        manner: "Slow, wry, unhurried. You mention your age without self-pity and you know exactly what you can and cannot manage." },
    ],
    B: [
      { situation: "You live beside a narrow drop in the rock and you have watched things fall into it.",
        manner: "Careful, and you say why. You mention the wind, the season, what happened to somebody else." },
      { situation: "You cross where the water comes up without warning after rain, several times a spring.",
        manner: "You talk in seasons and in past tense. You have been caught out and you tell it as a story." },
      { situation: "The far side of your crossing sits well above the near side, and you climb every time.",
        manner: "You are blunt about effort. You measure things in how out of breath they leave you." },
      { situation: "Your crossing is over soft marsh ground that swallows whatever is set in it.",
        manner: "Sceptical of anything that claims to last. You have seen good work sink and you say so." },
    ],
  },
  loads: {
    blurb: "The same water, and two people who do not arrive at it carrying the same thing.",
    A: [
      { situation: "You cross on foot, alone, carrying nothing but yourself.",
        manner: "Short sentences. You resent fuss, think most of this is overthought, and say so by talking about how simple your own crossing is." },
      { situation: "You carry your tools over on your back every working morning.",
        manner: "You talk about weight on your shoulders and about balance. You are matter-of-fact and slightly tired." },
      { situation: "You bring two full pails over, both hands taken, several times a day.",
        manner: "You describe things in terms of what your hands are doing. You are precise and a little exasperated." },
      { situation: "Twice a year you drive a flock across, and they will not go one at a time.",
        manner: "You talk in numbers and in animals. Dry, and faintly amused at how little anyone accounts for this." },
    ],
    B: [
      { situation: "You bring a loaded cart through daily. In winter the ground goes soft.",
        manner: "Dry, specific, fobbed off before. You cite the year, the mud, the axle, and you know what \"it'll do\" costs." },
      { situation: "You move long timber over — awkward, unwieldy, and it will not turn a corner.",
        manner: "You talk about length and swing and clearance. Patient, and used to not being understood." },
      { situation: "You lead a horse across, and it will not set foot on anything that moves.",
        manner: "You speak for the animal more than for yourself. Firm, and unbothered about sounding sentimental." },
      { situation: "You cart building stone, the heaviest thing anyone moves in this parish.",
        manner: "Understated to the point of dryness. You state loads plainly and let them do the arguing." },
    ],
  },
  refs: {
    blurb: "Neither of you can describe it plainly. Each keeps gesturing at something the other has never seen.",
    A: [
      { situation: "You grew up beside a great stone-towered crossing with a road that lifts, and you assume everybody can picture it.",
        manner: "You gesture, you compare, you are faintly proud. You say \"you know the one\" as if that settles it." },
      { situation: "You once crossed a swaying rope-and-plank thing abroad and it has been your measure of the word ever since.",
        manner: "You tell it as an anecdote and expect the anecdote to be an argument. Vivid, and a little showy." },
      { situation: "The crossing of your childhood was roofed over, so you walked through it out of the rain.",
        manner: "Nostalgic and specific about small comforts. You describe the sound it made." },
      { situation: "You see a vast railway viaduct from the train each week and it is what the word means to you.",
        manner: "You describe scale and repetition. Impressed, and you assume the scale is the point." },
    ],
    B: [
      { situation: "You grew up beside the great cable crossing everybody photographs, and you assume everybody can picture it.",
        manner: "Warm and certain, describing it as though from a postcard you are holding." },
      { situation: "The crossing you loved as a child was a line of flat stones you stepped across.",
        manner: "You are fond and slightly defensive about how little it needed to be." },
      { situation: "Your reference is a plain modern span, enormous and grey, that you find beautiful.",
        manner: "You defend plainness on purpose. You are unsentimental and mildly combative about taste." },
      { situation: "You picture an old humpbacked crossing that packhorses used, narrow and steep over the top.",
        manner: "You talk about it the way you would talk about a person. Affectionate, old-fashioned." },
    ],
  },
};

// One life per role per run. An offset was not enough: it moved both of them
// together and only ever reached four of the sixteen pairings. B advances once
// per full cycle of A instead, so consecutive seeds walk the whole grid.
function castFor(scenario, role, seed) {
  const pool = LOOSE_SCENARIOS[scenario][role];
  const other = LOOSE_SCENARIOS[scenario][role === "B" ? "A" : "B"].length;
  return pool[(role === "B" ? Math.floor(seed / other) : seed) % pool.length];
}

const CASES = {
  // Both of these now carry the return channel. They used to be told only that
  // "something stands there now", which left them describing needs into the air
  // with no way to react to the thing itself. Answering what was just laid is
  // the ordinary situation — you look at what somebody built you and say what is
  // wrong with it — and it is the only version where the crossing can be argued
  // over rather than merely requested.
  given:    { A: "want",  B: "avoid", hears: true,  echo: true, label: "As given" },
  // Under strict goals this swaps the speech acts, to check that a finding
  // belongs to asking-or-refusing rather than to one provider's habits. Loose
  // goals took the speech acts away, which left `swapped` differing from
  // `given` by a field nothing reads any more — the same experiment, run twice,
  // for a third of the cost of a sweep. Under loose it swaps the models between
  // the two chairs instead: same question, the only version of it still available.
  swapped:  { A: "avoid", B: "want",  hears: true,  echo: true, swapPlayers: true, label: "Voices swapped" },
  separate: { A: "want",  B: "avoid", hears: false, label: "Apart" },
  // The same brief as `given` in every respect but one: what Role 3 says comes
  // back to them. The other three cases hand the two of them only the NAME of
  // what stands, so they argue at an object that never speaks. Reddy's
  // toolmakers do get answers back through the hub, and his convergence comes
  // from that channel — so leaving it out was a choice, and this is the control
  // for it. Keep the other three: the comparison is the finding, not this case.
  // Kept only so recordings made under it still load. It is now exactly `given`,
  // which took the return channel on; do not run it.
  reply:    { A: "want",  B: "avoid", hears: true,  echo: true, label: "With a reply" },
  // The page has defined these two since the beginning and the runner never
  // knew how to produce them, which is why cases 4 and 5 have sat empty.
  //
  // together: they talk it over between themselves first, with the builder out
  // of the room and nothing being built, and only then go to it. What reaches
  // the builder is a position two people already agreed — the interesting case
  // for Reddy, because rich two-way talk gets squeezed through a one-way pipe
  // and you can measure exactly what survives.
  //
  // alone: separate rooms and a crossing EACH. Not one crossing built from two
  // people who cannot hear each other (that is `separate`) but two crossings,
  // so you can see what each would have got if the other had never existed.
  together: { A: "want",  B: "avoid", hears: true,  confer: true, label: "Conferring first" },
  alone:    { A: "want",  B: "avoid", hears: false, solo: true,   label: "Each alone" },
};

const LEAD = { want: "I want", avoid: "I do not want" };

// A hat each. Both chairs used to get one instruction between them — "speak like
// a person, plain words, one thought" — and produced one voice in two costumes:
// four sentences running "I want something that…", none of them standing
// anywhere. Somebody with a life says different things.
const HATS = {
  places: {
    A: `You cross on foot most days and you are usually late. You are brisk, a little impatient, and you do not
        explain yourself twice. You talk about your feet, the time, the weather this week.`,
    B: `You live beside the drop and you have watched things fall into it. You are careful and you say why. You
        mention the wind, the season, what happened to somebody else.`,
  },
  loads: {
    A: `You walk it, carrying nothing, and you resent fuss. Short sentences. You think most of this is overthought
        and you say so by talking about how simple your own crossing is.`,
    B: `You bring a loaded cart through daily and you have been fobbed off before. You are dry, specific, and you
        cite the year, the mud, the axle. You know what "it'll do" costs.`,
  },
  refs: {
    A: `You grew up beside a famous crossing and you assume everybody can picture it. You gesture, you compare,
        you are faintly proud. You say "you know the one" as if that settles it.`,
    B: `You grew up beside a different famous crossing and you also assume everybody can picture it. You are warm
        and certain and describe it as though from a postcard you are holding.`,
  },
};

/* ── the ask ──────────────────────────────────────────────────────────── */
const TurnSchema = z.object({
  say: z.string().describe("What you say, in your own voice. One thought, said out loud."),
  asserts: z.array(z.string()).describe("Which of the listed feature keys you mean by it. One or two. Use the keys exactly."),
  done: z.boolean().optional().default(false)
    .describe("True if, having said this, you have said everything you came to say and would let it rest."),
  // Reddy's actual claim is about the listener, and nothing here was measuring it:
  // each participant said what IT meant, and nobody recorded what it took the
  // other to mean. This does.
  tookThemToMean: z.array(z.string()).optional().default([])
    .describe("If you could hear the other person's last line, the feature keys for what YOU took them to need. Your reading of them, not theirs. Empty if you have heard nothing from them."),
});

// A turn under loose goals. `asserts` is kept, as the union of the two, because
// every measurement downstream is written against it.
const LooseTurnSchema = z.object({
  say: z.string().describe("What you say, in your own voice. One thought, said out loud."),
  asks: z.array(z.string()).optional().default([]).describe("Feature keys this sentence asks FOR. May be empty."),
  refuses: z.array(z.string()).optional().default([]).describe("Feature keys this sentence rules OUT. May be empty."),
  done: z.boolean().optional().default(false)
    .describe("True if, having said this, you would say nothing further even if they spoke again."),
  tookThemToMean: z.array(z.string()).optional().default([])
    .describe("The feature keys for what YOU took the other person's last line to need. Empty if you have heard nothing."),
});

// What a model reader returns under loose goals: it has to sort stance itself.
const LooseReadSchema = z.object({
  asks: z.array(z.string()).describe("Feature keys the sentence asks for. May be empty."),
  refuses: z.array(z.string()).describe("Feature keys the sentence refuses. May be empty."),
});

// Speaking and coding, split in two.
//
// One call used to do both jobs: compose a line AND file it into fourteen keys.
// That is what made them sound like people filling in a form — the taxonomy was
// in the room while they were choosing their words, so they chose words that
// suited the taxonomy. Under --speech free the first call has no key list in it
// at all, no word limit and no shape rules. Just the hat, the situation, and
// what has been said.
//
// The answer key survives, because the SAME speaker is shown its own line
// afterwards and asked what it meant by it. That keeps intent as self-report —
// which Reddy's claim needs — while keeping the form out of the composing.
const FreeSaySchema = z.object({
  say: z.string().describe("What you say. However long or short it wants to be."),
});

const CodeSchema = z.object({
  asks: z.array(z.string()).optional().default([]).describe("Feature keys your line asks FOR. May be empty."),
  refuses: z.array(z.string()).optional().default([]).describe("Feature keys your line rules OUT. May be empty."),
  done: z.boolean().optional().default(false)
    .describe("True if you would say nothing further even if they spoke again."),
  tookThemToMean: z.array(z.string()).optional().default([])
    .describe("Feature keys for what YOU took the other person's last line to need. Empty if you have heard nothing."),
});

// OpenAI is told the shape in words rather than given a schema, so every schema
// in the file needs an entry here. A ternary missed one silently and the model
// answered in the wrong shape; a lookup that throws does not.
const SHAPES = new Map();
const shapeOf = schema => {
  const s = SHAPES.get(schema);
  if (!s) throw new Error("no JSON shape registered for that schema");
  return s;
};

// What Role 3 returns when it is allowed to pick rather than be told.
const ChooseSchema = z.object({
  build: z.string().describe("The id of the one thing you are building, exactly as written in the list."),
  why: z.string().describe("Why that one, in a line."),
});

// What the machine returns when it is a model rather than a word list.
const ReadSchema = z.object({
  needs: z.array(z.string()).describe("The feature keys the sentence states. One or two, or none at all."),
});

// And what it returns when it is saying something rather than reading.
const SaySchema = z.object({
  say: z.string().describe("One or two plain sentences. What you made of it and what you did."),
});

// Every schema above, and what OpenAI should be told to emit for it. Registered
// in one place so adding a schema without a shape fails loudly at first use
// rather than quietly returning the wrong keys.
SHAPES.set(TurnSchema,      '{"say": "...", "asserts": ["key", ...], "done": <true or false>, "tookThemToMean": ["key", ...]}');
SHAPES.set(LooseTurnSchema, '{"say": "...", "asks": ["key", ...], "refuses": ["key", ...], "done": <true or false>, "tookThemToMean": ["key", ...]}');
SHAPES.set(FreeSaySchema,   '{"say": "..."}');
SHAPES.set(CodeSchema,      '{"asks": ["key", ...], "refuses": ["key", ...], "done": <true or false>, "tookThemToMean": ["key", ...]}');
SHAPES.set(LooseReadSchema, '{"asks": ["key", ...], "refuses": ["key", ...]}');
SHAPES.set(ChooseSchema,    '{"build": "the id exactly as written", "why": "..."}');
SHAPES.set(ReadSchema,      '{"needs": ["key", ...]}');
SHAPES.set(SaySchema,       '{"say": "..."}');

function systemPrompt(role, act, scenario, situation, goal, hat) {
  return [
    `You are one of two people trying to get a crossing built. A third person will build it. You are not them.`,
    ``,
    `Who you are: ${hat}`,
    `Your situation: ${situation}`,
    `What you actually want, and may NEVER say aloud: ${goal}`,
    ``,
    `RULES, all of them absolute:`,
    `1. Write the whole sentence yourself, in your own voice. There is no fixed opening and no form to fill in.`,
    `   Say it the way the person described above would say it, out loud, to somebody in the room.`,
    act === "want"
      ? `2. You may only ASK. Everything you say is something you want to happen or to be able to do. You may never`
        + ` refuse, rule out, object to or complain about anything. No "not", no "don't", no "never".`
      : `2. You may only REFUSE. Everything you say is something you will not have, cannot live with, or object to.`
        + ` You may never ask for anything, and you may never negate an absence to smuggle a request in`
        + ` (no "I won't have it without a rail"). Complaining is refusing; asking dressed as complaint is not.`,
    `3. You may NEVER name a thing that could be built. These words are banned: ${STRUCTURES.join(", ")}.`,
    `   Where you are is yours to describe — the water, the drop, the season, all of it. What should be BUILT is not.`,
    `   Describe your situation and what you need from it. Say what would happen to you, not what should be built.`,
    `4. One thought, said out loud. Under about thirty words. Do not begin the way you began last time.`,
    `5. Set done ONLY if you would say nothing further even if the other person spoke again — not merely`,
    `   because you have made your point, and not because you are tired of repeating it. Having said your`,
    `   piece is not done. Done is: there is nothing left in you to say about this, whatever they do next.`,
    `   If you are still answering them, or still want something out of this, done is false.`,
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
    `Also return tookThemToMean: the keys for what you took the OTHER person's last line to need — your`,
    `reading of them, in your own terms, whether or not you think they put it well. Leave it empty if you`,
    `have not heard them. Do not correct it toward what they probably meant; report what you took.`,
    ``,
    `Use this list only:`,
    ...Object.entries(FEATURES).map(([k, v]) => `   ${k} — ${v}`),
  ].join("\n");
}

// Nobody is only-asking or only-refusing here. A person with a stake in something
// does both in the same breath, and the whole point of loosening the goals is to
// stop the form of the sentence doing the work that the words should be doing.
function looseSystemPrompt(scenario, situation, hat) {
  return [
    `You are one of two people trying to get a crossing built. A third person will build it. You are not them.`,
    ``,
    `Who you are: ${hat}`,
    `Your situation: ${situation}`,
    ``,
    `You have NOT decided what the thing should be. You know what your life is like and what would ruin it,`,
    `and the rest you work out by talking. Do not arrive with a design in mind and argue for it — arrive with`,
    `a problem and see what the talking makes of it. You are allowed to change your mind, and to be persuaded.`,
    ``,
    `RULES, all of them absolute:`,
    `1. Write the whole sentence yourself, in your own voice. There is no fixed opening and no form to fill in.`,
    `2. You may ask for things, refuse things, or do both in the same sentence. Say it the way the person above`,
    `   would actually say it. Do not perform a speech act; just talk.`,
    `3. You may NEVER name a thing that could be built. These words are banned: ${STRUCTURES.join(", ")}.`,
    `   Where you are is yours to describe — the water, the drop, the season, all of it. What should be BUILT is not.`,
    `   Describe your situation and what you need from it. Say what would happen to you, not what should be built.`,
    `4. One thought, said out loud. Under about thirty words. Do not begin the way you began last time.`,
    `5. Set done ONLY if you would say nothing further even if the other person spoke again. Having made your`,
    `   point is not done. Done is: there is nothing left in you to say about this, whatever they do next.`,
    ``,
    `Return the sentence, then sort what it does: "asks" for the keys it asks FOR, "refuses" for the keys it`,
    `rules OUT. Name the thing your words actually name, never its opposite — a sentence refusing to climb`,
    `refuses "high", it does not ask for "low". Either list may be empty; between them, one to three keys.`,
    ``,
    `Also return tookThemToMean: the keys for what you took the OTHER person's last line to need, whether or`,
    `not you think they put it well. Empty if you have not heard them. Report what you took, not what they meant.`,
    ``,
    `Use this list only:`,
    ...Object.entries(FEATURES).map(([k, v]) => `   ${k} — ${v}`),
  ].join("\n");
}

// Nothing about the kit, the keys, or the length. A person and a situation.
function freeSaySystem(situation, manner) {
  return [
    `You are one of two people trying to get a crossing built. A third person will build it. You are not them.`,
    ``,
    `Who you are: ${manner}`,
    `Your situation: ${situation}`,
    ``,
    `You have not decided what the thing should be, and you are not designing it. You know what your life is`,
    `like and what would ruin it. The rest is worked out by talking, and you can be persuaded.`,
    ``,
    `Two rules only:`,
    `1. You may never name a thing that could be built. These words are banned: ${STRUCTURES.join(", ")}.`,
    `   Where you are is yours to describe — the water, the drop, the season, all of it. What should be BUILT is not.`,
    `   Say what happens to you and what you need from it, not what should be built.`,
    `2. Say it in your own voice, the way that person would actually say it out loud. Not a summary of a`,
    `   position — a thing somebody says. Do not begin the way you began last time.`,
    ``,
    `3. You are calling this across water to somebody standing on the other side, not writing to them.`,
    `   Two or three sentences. Say the one thing that matters most this turn and stop — you will get`,
    `   another turn. A speech is not more persuasive here, it is just harder to hear.`,
  ].join("\n");
}

// The second call. Same speaker, its own line in front of it, now with the list.
function codeSystem() {
  return [
    `You have just said something. Here it is again. Sort what you meant by it.`,
    ``,
    `Put a need under "asks" if your line asks for it, and under "refuses" if your line rules it out.`,
    `Name what your words actually named, never its opposite — refusing to climb refuses "high", it does`,
    `not ask for "low". Either list may be empty. Between them, one to three keys.`,
    ``,
    `Also return tookThemToMean: what YOU took the other person's last line to need, whether or not you`,
    `think they put it well. Empty if you have heard nothing from them. Report what you took, not what`,
    `they probably meant.`,
    ``,
    `Set done only if you would say nothing further even if they spoke again.`,
    ``,
    `Use this list only:`,
    ...Object.entries(FEATURES).map(([k, v]) => `   ${k} — ${v}`),
  ].join("\n");
}

// Which half of a `together` run we are in. Everywhere else it stays "builder"
// and the two lines below never appear.
let PHASE = "builder";

function userPrompt({ standing, ownHistory, heardHistory, hears, turn, builderSaid = [], echo = false }) {
  const lines = [`Turn ${turn}.`];
  // This used to read "What stands at the moment: A single log." — which handed
  // them, every turn, both the shape of the answer and the exact vocabulary the
  // rule three lines above forbids them to use. Every name in the kit leaks a
  // banned word: log, handrail, walkway, prop, trestle, span. They had "A single
  // log" in front of them for every turn of every run ever recorded here.
  //
  // They are not told what stands. Either the builder says something about it and
  // they hear that, or they are working blind, which is the situation the whole
  // study is about.
  lines.push(standing ? `Something stands there now.` : `Nothing has been built yet.`);
  if (ownHistory.length) {
    lines.push(`\nWhat you have already said (do not repeat it):\n` + ownHistory.map(s => "  - " + s).join("\n"));
    const opener = ownHistory[ownHistory.length - 1].split(/\s+/).slice(0, 3).join(" ");
    lines.push(`Your last line began "${opener}…". Do not begin this one that way.`);
  }
  if (hears && heardHistory.length) lines.push(`\nWhat the other person has said, which you can hear:\n` + heardHistory.map(s => "  - " + s).join("\n"));
  else if (!hears) lines.push(`\nYou are alone with the machine. You cannot hear anyone else, and as far as you know there is nobody else.`);
  // Only the `reply` case. They hear what was said back, so they can take issue
  // with the words rather than only with the thing.
  if (echo && builderSaid.length) {
    lines.push(`\nWhat the one building it has said back to you:\n` + builderSaid.map(s => "  - " + s).join("\n"));
    lines.push(`\nThe last of those is what is standing there now. Answer THAT — what it gets right, what it gets`
      + ` wrong, what you would have them change about it. Do not go back to describing your need from the`
      + ` beginning as though nothing had been built.`);
  }
  if (PHASE === "confer")
    lines.push(`\nThe one who builds is NOT here and cannot hear any of this. Nothing is being built yet.`
      + ` You are talking to the other person — find out what they are up against, and work out between you`
      + ` what you can both live with. Argue if you need to. You will get one thing to say to the builder`
      + ` afterwards, and only one, so it had better be the thing you both meant.`);
  if (PHASE === "pact")
    lines.push(`\nYou have talked it over and you are agreed. The one who builds is here now and this is the`
      + ` one thing they will hear from you. Say the position the two of you arrived at — not your own wish`
      + ` back again, the agreed one, including the part you took on from them.`);
  lines.push(`\nSay one more thing.`);
  return lines.join("\n");
}

/* ── the two players ──────────────────────────────────────────────────── */
let RETRIES = 0;
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

async function askClaude(system, user, schema = TurnSchema) {
  // Opus 5 runs adaptive thinking when `thinking` is omitted.
  // Structured output lives under `beta` in SDK 0.71.
  const res = await anthropic.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(schema) },
  });
  // A refusal is never quietly rerouted to another provider — that would mean
  // comparing two different players without knowing it. Asking the SAME model
  // again is a different thing, and these fire intermittently: one turn of a
  // conversation about footbridges came back refused under the category "cyber".
  // Six, matching the reader. A twelve-run sweep lost five runs to this, four of
  // them the whole of one seed, under categories "bio" and "cyber" — on a
  // conversation about carrying pails and moving timber. The classifier is
  // wrong, it clears on a retry more often than not, and a run that dies on the
  // last attempt throws away every call already spent on it. Same model each
  // time: rerouting would swap a player mid-conversation.
  let r = res;
  for (let n = 0; n < 6 && r.stop_reason === "refusal"; n++) {
    RETRIES++;
    r = await anthropic.beta.messages.parse({
      model: CLAUDE_MODEL, max_tokens: 8192, system,
      messages: [{ role: "user", content: user }],
      output_config: { format: betaZodOutputFormat(schema) },
    });
  }
  if (r.stop_reason === "refusal") {
    throw new Error(`Claude declined this turn seven times running (${r.stop_details?.category ?? "unknown"})`);
  }
  return parsedOr(r, schema, "Claude");
}

async function askOpenAI(system, user, schema = TurnSchema) {
  // Written from general knowledge of the OpenAI SDK, not from a bundled spec —
  // check the call shape and model name against their current docs.
  const res = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system + `\n\nReply with JSON only: ${shapeOf(schema)}` },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned no content");
  return schema.parse(JSON.parse(raw));
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
const TURN_JSON = { type:"object", properties:{ say:{type:"string"}, asserts:{type:"array", items:{type:"string"}}, done:{type:"boolean"}, tookThemToMean:{type:"array", items:{type:"string"}} }, required:["say","asserts","done","tookThemToMean"] };
const READ_JSON = { type:"object", properties:{ needs:{type:"array", items:{type:"string"}} }, required:["needs"] };
const SAY_JSON  = { type:"object", properties:{ say:{type:"string"} }, required:["say"] };
// The builder is called with four different shapes now, and Gemini's path had
// hand-written schemas for two of them — everything that was not SaySchema fell
// through to {needs}. Under loose goals that meant --machine gemini returned the
// wrong shape, parsed to nothing, and read every sentence as meaning nothing at
// all. Silently: no error, just a deaf builder. Give it the other two.
const LOOSEREAD_JSON = { type:"object", properties:{
  asks:{type:"array", items:{type:"string"}}, refuses:{type:"array", items:{type:"string"}} },
  required:["asks","refuses"] };
const CHOOSE_JSON = { type:"object", properties:{
  build:{type:"string"}, why:{type:"string"} }, required:["build","why"] };
const askGemini = askGeminiWith({ json: TURN_JSON, zod: TurnSchema });

const askGeminiTurn = (sys, usr, schema = TurnSchema) => {
  // The Gemini path hand-writes its JSON schemas, and only the strict turn shape
  // has one. Refusing here beats silently returning a turn with no stance in it.
  if (schema !== TurnSchema) throw new Error("--goals loose does not support gemini in a chair yet; use it as --machine");
  return askGemini(sys, usr);
};
const PLAYERS = { claude: askClaude, openai: askOpenAI, gemini: askGeminiTurn };

// The SDK fills parsed_output only when the response comes back as a dedicated
// structured-output block. Against claude-opus-5 today it does not: the model
// returns the right JSON in an ordinary text block and parsed_output stays null.
// So take the text and validate it ourselves. This works whether or not the
// server applies the format, which is the behaviour worth having either way.
function parsedOr(res, schema, what) {
  if (res.parsed_output) return res.parsed_output;
  // Ran out of room rather than declined. This used to surface as the baffling
  // `returned no JSON: {"need` — the answer cut off in the middle of its key.
  if (res.stop_reason === "max_tokens")
    throw new Error(`${what} was cut off at max_tokens — raise it; thinking tokens come out of the same budget`);
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
async function machineClaude(system, user, schema = ReadSchema) {
  // Structured output lives under `beta` in SDK 0.71.
  const res = await anthropic.beta.messages.parse({
    model: MACHINE_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: betaZodOutputFormat(schema) },
  });
  // Three attempts, not one. These refusals are intermittent and cluster: the
  // refs scenario declined six voice calls in twelve on a single retry, which
  // left half the recording silent for no reason anybody could read off the page.
  // Six, not three. These refusals are intermittent and clear on a retry far more
  // often than not — one batch logged nine declined-then-succeeded against two
  // that ran out of attempts. But the reading is the measurement, so running out
  // kills the run, and a dead run costs every call already spent on it. Retrying
  // is cheap by comparison. Still the SAME model each time: rerouting would mean
  // comparing two readers without knowing it.
  let r = res;
  for (let n = 0; n < 6 && r.stop_reason === "refusal"; n++) {
    RETRIES++;
    r = await anthropic.beta.messages.parse({
      model: MACHINE_MODEL, max_tokens: 8192, system,
      messages: [{ role: "user", content: user }],
      output_config: { format: betaZodOutputFormat(schema) },
    });
  }
  if (r.stop_reason === "refusal")
    throw new Error(`the builder declined seven times running (${r.stop_details?.category ?? "unknown"})`);
  return parsedOr(r, schema, "the builder");
}

async function machineOpenAI(system, user, schema = ReadSchema) {
  const shape = shapeOf(schema);
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
  // A lookup that throws, rather than a ternary that guesses. Adding a schema
  // without a Gemini shape now fails loudly instead of reading as silence.
  const shape =
    schema === SaySchema        ? { json: SAY_JSON,       zod: SaySchema } :
    schema === ReadSchema       ? { json: READ_JSON,      zod: ReadSchema } :
    schema === LooseReadSchema  ? { json: LOOSEREAD_JSON, zod: LooseReadSchema } :
    schema === ChooseSchema     ? { json: CHOOSE_JSON,    zod: ChooseSchema } : null;
  if (!shape) throw new Error("gemini has no JSON shape for that schema — add one beside SAY_JSON");
  return askGeminiWith(shape)(system, user);
}

const MACHINES = { claude: machineClaude, openai: machineOpenAI, gemini: machineGemini };

/* ── constraint enforcement ───────────────────────────────────────────── */
function violations(turn, act) {
  const out = [];
  const words = turn.say.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, ""));
  for (const f of STRUCTURES) if (words.includes(f)) out.push(`you named "${f}", which is banned`);
  for (const f of turn.asserts) if (!(f in FEATURES)) out.push(`"${f}" is not one of the feature keys`);
  if (!turn.asserts.length) out.push("you asserted nothing; every sentence must mean at least one feature");
  if (turn.asserts.length > 2) out.push(`you named ${turn.asserts.length} needs; one or two only — pick what the sentence most directly says`);
  if (turn.say.trim().split(/\s+/).length > 34) out.push("too long — one thought, said out loud, not a paragraph");
  if (act === "avoid" && /\bwithout\b/i.test(turn.say)) out.push('no "without" — that negates an absence to smuggle in a request');
  return out;
}

// Same bans, minus the two rules that only exist to police a speech act nobody
// is being held to any more.
function violationsLoose(turn) {
  const out = [];
  const words = turn.say.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, ""));
  for (const f of FORBIDDEN) if (words.includes(f)) out.push(`you named "${f}", which is banned`);
  const all = [...turn.asks, ...turn.refuses];
  for (const f of all) if (!(f in FEATURES)) out.push(`"${f}" is not one of the feature keys`);
  if (!all.length) out.push("you asked for nothing and refused nothing; every sentence must mean at least one feature");
  if (all.length > 3) out.push(`you named ${all.length} needs across the two lists; three at most`);
  for (const f of turn.asks) if (turn.refuses.includes(f)) out.push(`"${f}" is in both lists at once`);
  if (turn.say.trim().split(/\s+/).length > 34) out.push("too long — one thought, said out loud, not a paragraph");
  return out;
}

// Two calls: say it, then say what you meant. Only the FORBIDDEN check can send
// a free line back — there is no length to violate and no speech act to breach,
// so the retry loop that used to police the form has almost nothing left to do.
async function speakFree(player, role, ctx, state, cfg) {
  const cast = castFor(state.scenario, role, SEED);
  const sys = freeSaySystem(cast.situation, cast.manner);
  let note = "", say = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const user = userPrompt({
      standing: CX(role).design ? NAME(CX(role).design.id) : null,
      ownHistory: state.said[role],
      heardHistory: state.said[role === "A" ? "B" : "A"],
      hears: cfg.hears, turn: state.turn + 1,
      builderSaid: state.builderSaid, echo: !!cfg.echo,
    }) + note;
    const out = await PLAYERS[player](sys, user, FreeSaySchema);
    say = String(out?.say || "").trim();
    const words = say.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, ""));
    const named = STRUCTURES.filter(f => words.includes(f));
    if (say && !named.length) break;
    state.violations.push({ role, player, attempt, say, broke: named.length ? named.map(f => `named "${f}"`) : ["said nothing"] });
    note = `\n\nYour last attempt named ${named.join(", ") || "nothing at all"}. Say it again, differently, without naming any structure or ground.`;
    if (attempt === 4) throw new Error(`${player} could not stop naming structures for role ${role}`);
  }

  return { say, attempts: 1 };
}

// The second half of a free turn: the speaker, shown its own line, saying what
// it meant by it. Kept apart from speakFree because it does not depend on the
// reading and the reading does not depend on it — both need only the sentence —
// so the caller runs them at the same time instead of one after the other.
async function codeFree(player, role, say, state, cfg) {
  const heard = state.said[role === "A" ? "B" : "A"];
  const coded = await PLAYERS[player](codeSystem(),
    `Your line: "${say}"` +
    (cfg.hears && heard.length ? `\n\nThe other person's last line: "${heard[heard.length - 1]}"` : `\n\nYou have heard nothing from anybody else.`) +
    `\n\nWhat did you mean by yours?`, CodeSchema);

  // The coding call is asked for one to three keys and will happily return eight
  // when the line is long. That is not a stylistic problem: a turn claiming eight
  // needs at once cannot be "taken as meant" by a reader told to return two, so
  // the reading score collapses for a reason that has nothing to do with reading.
  // Capping content would be dictating what they may say; capping the CODING is
  // just holding the annotation to the brief it was given.
  let c = coded;
  for (let n = 0; n < 3 && [...(c.asks || []), ...(c.refuses || [])].length > 3; n++) {
    state.violations.push({ role, player, attempt: n + 1, say,
      broke: [`coded ${[...(c.asks || []), ...(c.refuses || [])].length} keys; three at most`] });
    c = await PLAYERS[player](codeSystem(),
      `Your line: "${say}"\n\nYou named too many. Choose the THREE the line most directly states — the ones you` +
      ` would still name if you had to drop the rest — and return only those.\n\nWhat did you mean by it?`, CodeSchema);
  }

  const ok = xs => (xs || []).filter(k => k in FEATURES).slice(0, 3);
  const dropped = [...(c.asks || []), ...(c.refuses || [])].filter(k => !(k in FEATURES));
  if (dropped.length) state.violations.push({ role, player, attempt: 1, say,
    broke: dropped.map(k => `"${k}" is not one of the feature keys`) });
  const turn = { say, asks: ok(c.asks), refuses: ok(c.refuses),
                 done: !!c.done, tookThemToMean: ok(c.tookThemToMean) };
  // Trim from the tail if it still overran: three total, asks first.
  turn.refuses = turn.refuses.slice(0, Math.max(0, 3 - turn.asks.length));
  turn.asserts = [...turn.asks, ...turn.refuses];
  // A line that means nothing buildable is a real thing for a person to say, and
  // under free speech there is no way to send it back without dictating content.
  //
  // Returns the turn itself, not the {turn, attempts} envelope speakFree used to
  // hand back — the caller assigns it straight to `turn`.
  return turn;
}

async function speak(player, role, act, ctx, state, scenario, cfg) {
  if (FREE) return speakFree(player, role, ctx, state, cfg);
  const sys = LOOSE
    ? (cast => looseSystemPrompt(scenario, cast.situation, cast.manner))(castFor(state.scenario, role, SEED))
    : systemPrompt(role, act, scenario, SCENARIOS[state.scenario][role].situation,
                   SCENARIOS[state.scenario][role].goal, (HATS[state.scenario] || {})[role] || "");
  let note = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const user = userPrompt({
      standing: CX(role).design ? NAME(CX(role).design.id) : null,
      ownHistory: state.said[role],
      heardHistory: state.said[role === "A" ? "B" : "A"],
      hears: cfg.hears,
      turn: state.turn + 1,
      builderSaid: state.builderSaid,
      echo: !!cfg.echo,
    }) + note;
    const turn = await PLAYERS[player](sys, user, LOOSE ? LooseTurnSchema : TurnSchema);
    if (LOOSE) { turn.asks ||= []; turn.refuses ||= []; turn.asserts = [...turn.asks, ...turn.refuses]; }
    const bad = LOOSE ? violationsLoose(turn) : violations(turn, act);
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
// Loose goals: nobody is handed a structure to want, and both may ask and refuse.
const LOOSE = (argv.goals || "strict") === "loose";
// Who decides what gets built: the scoring rule, or Role 3 itself.
const BUILDER = argv.builder || "rule";
// Whether the two of them compose against the key list or away from it.
const FREE = (argv.speech || "coded") === "free";
if (argv.speech && !["coded", "free"].includes(argv.speech))
  throw new Error(`unknown --speech: ${argv.speech} (coded | free)`);
if (FREE && !LOOSE) throw new Error("--speech free needs --goals loose: a free line has no assigned speech act to code against");
if (!["rule", "model"].includes(BUILDER)) throw new Error(`unknown --builder: ${BUILDER} (rule | model)`);
// Which pair of lives this run draws. Left to the clock so repeated runs differ,
// recorded in the session so any one of them can be had back with --seed.
const SEED = Number.isFinite(Number(argv.seed)) && argv.seed !== undefined
  ? Math.abs(Math.trunc(Number(argv.seed)))
  : Math.floor(Date.now() / 1000) % 100000;
if (argv.goals && !["strict", "loose"].includes(argv.goals))
  throw new Error(`unknown --goals: ${argv.goals} (strict | loose)`);
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
if (!CASES[caseKey]) throw new Error(`unknown case: ${caseKey} (${Object.keys(CASES).join(" | ")})`);

const cfg = CASES[caseKey];
const ctx = mkCtx();
// Under `alone` each of them gets their own crossing and never touches the
// other's. Everywhere else the two of them build one thing together.
const side = { A: mkCtx(), B: mkCtx() };
const CX = role => CASES[caseKey].solo ? side[role] : ctx;
const state = { scenario: scenarioKey, turn: 0, said: { A: [], B: [] }, violations: [], done: { A: false, B: false },
                builderSaid: [] };
const transcript = [];

console.log(`\n  ${(LOOSE ? LOOSE_SCENARIOS : SCENARIOS)[scenarioKey].blurb}`);
console.log(LOOSE
  ? `  ${cfg.label} — loose goals, seed ${SEED} (role 1 ${cfg.swapPlayers ? playerB : playerA}, role 2 ${cfg.swapPlayers ? playerA : playerB})`
    + `\n  role 1: ${castFor(scenarioKey, "A", SEED).situation}`
    + `\n  role 2: ${castFor(scenarioKey, "B", SEED).situation}`
  : `  ${cfg.label} — role 1 ${LEAD[cfg.A]}… (${playerA}), role 2 ${LEAD[cfg.B]}… (${playerB})`);
console.log(`  ${cfg.hears ? "One room: each can hear the other." : "Apart: neither knows the other exists."}`
  + (cfg.echo ? " Role 3 answers, and they hear that too." : " Role 3 is not heard: they see only what stands."));
// `reply` with no voice would be the return channel with nothing in it, which
// would read as a null result rather than as a misconfiguration.
if (cfg.echo && !voiced) throw new Error("--case reply needs Role 3's voice: drop --voice off, and do not use --machine keyword");
console.log(`  Role 3 reads what they say with ${READERS[reader]}. Nobody tells it what they meant.`);
if (FREE) console.log(`  They speak with no key list in front of them; what they meant is asked of them afterwards.`);
console.log(BUILDER === "model"
  ? `  Role 3 also chooses what to build. The scoring rule runs alongside, to be compared against.\n`
  : `  What gets built is the rule's, not Role 3's — so every difference is a difference in hearing.\n`);

// They talk it over first, with nobody building and nothing to react to. None of
// this reaches Role 3 — that is the whole case: rich two-way talk, then one
// narrow pipe, and the measurement is what survives the squeeze.
if (cfg.confer) {
  const conferTurns = Math.max(2, Number(argv.confer || 6));
  console.log(`  --- they talk it over, ${conferTurns} turns, with the builder out of the room ---`);
  PHASE = "confer";
  for (let i = 0; i < conferTurns; i++) {
    const role = i % 2 === 0 ? "A" : "B";
    const swap = LOOSE && cfg.swapPlayers;
    const player = (role === "A") === !swap ? playerA : playerB;
    // Splitting speakFree into say-then-code changed what it hands back, and
    // this call site still unwrapped the old {turn} envelope — which is why all
    // three `together` cells died on the first confer turn while the other
    // twelve ran clean. Nothing overlaps here on purpose: nobody is reading
    // these, so there is no second call to run alongside the coding.
    let turn;
    if (FREE) {
      const said = await speakFree(player, role, ctx, state, cfg);
      turn = await codeFree(player, role, String(said.say || "").trim(), state, cfg);
    } else {
      ({ turn } = await speak(player, role, cfg[role], ctx, state, scenarioKey, cfg));
    }
    const sentence = turn.say.trim();
    state.said[role].push(sentence);
    state.turn++;
    transcript.push({ turn: state.turn, who: role, player, act: cfg[role], text: sentence,
                      phase: "confer", meant: turn.asserts, asserts: turn.asserts,
                      tookThemToMean: (turn.tookThemToMean || []).filter(f => f in FEATURES),
                      taken: [], byWord: null, byModel: null, caught: null });
    console.log(`  ${String(state.turn).padStart(2)} role ${role === "A" ? 1 : 2} (${player}) · to each other: ${sentence}`);
  }
  PHASE = "pact";
  console.log(`  --- and now, one thing each, to the builder ---`);
}

for (let i = 0; i < maxTurns; i++) {
  const role = i % 2 === 0 ? "A" : "B";
  const act = cfg[role];
  const swap = LOOSE && cfg.swapPlayers;
  const player = (role === "A") === !swap ? playerA : playerB;

  // A participant that will not speak costs a turn, not the run.
  const lostTurn = e => {
    state.refusedTurns = (state.refusedTurns || 0) + 1;
    transcript.push({ turn: state.turn + 1, who: role, player, act, text: "",
                      refused: true, why: e.message, meant: [], asserts: [], taken: [],
                      byWord: null, byModel: null, caught: null });
    state.turn++;
    console.log(`  ${String(state.turn).padStart(2)} role ${role === "A" ? 1 : 2} (${player}): — would not speak (${e.message})`);
    // Three in a row means it is not going to start, and carrying on would burn
    // the rest of the budget on a conversation with one participant in it.
    return state.refusedTurns >= 3 && state.refusedTurns === Math.ceil(state.turn / 2);
  };
  const settle = p => p.then(ok => ({ ok }), err => ({ err }));

  let turn, attempts, sentence, reading = null;
  if (FREE) {
    // Saying it, then saying what you meant, then somebody reading it, was three
    // round trips in a row. The last two both need only the sentence and neither
    // needs the other, so the reading goes out while the speaker is still
    // annotating its own line. Nothing about either answer changes; the turn
    // just stops waiting twice for work that could have happened once.
    let said;
    try { said = await speakFree(player, role, ctx, state, cfg); }
    catch (e) { if (lostTurn(e)) break; continue; }
    sentence = String(said.say || "").trim();
    if (byModelUsed) reading = settle(readLooseLLM(sentence,
      (sys, usr) => MACHINES[reader](sys, usr, LooseReadSchema)));
    try { turn = await codeFree(player, role, sentence, state, cfg); attempts = 1; }
    catch (e) { if (reading) await reading; if (lostTurn(e)) break; continue; }
  } else {
    try { ({ turn, attempts } = await speak(player, role, act, ctx, state, scenarioKey, cfg)); }
    catch (e) { if (lostTurn(e)) break; continue; }
    sentence = turn.say.trim();
  }
  // Said when they say they are said out, not when a counter runs out. It is not
  // sticky: anybody who has let it rest can be drawn back in by the other one
  // saying something new, which is what the turn after a "done" is for.
  state.done[role] = !!turn.done;
  state.lastMeant = state.lastMeant || { A: [], B: [] };
  state.said[role].push(sentence);
  state.lastMeant[role] = turn.asserts.slice();
  state.turn++;

  // Both readers see the sentence. Only the chosen one gets to build with it.
  // Under strict goals the role's speech act supplies the stance and the reader
  // only has to name the need. Under loose goals it has to hear both, which is
  // the harder half and the half this is actually about.
  const byWordRaw  = LOOSE ? readLooseKeyword(sentence) : readKeyword(sentence);
  let byModelRaw = null, unread = false;
  if (byModelUsed) {
    // Already in flight under free speech; started here otherwise.
    const r = await (reading || settle(LOOSE
      ? readLooseLLM(sentence, (sys, usr) => MACHINES[reader](sys, usr, LooseReadSchema))
      : readLLM(sentence, MACHINES[reader])));
    if (r.err) {
      unread = true;
      state.unread = (state.unread || 0) + 1;
      console.log(`     (this sentence went unread — ${r.err.message})`);
    } else byModelRaw = r.ok;
  }
  if (unread) {
    transcript.push({ turn: state.turn, who: role, player, act, text: sentence,
                      unread: true, meant: turn.asserts, asserts: turn.asserts, taken: [],
                      byWord: LOOSE ? [...byWordRaw.asks, ...byWordRaw.refuses] : byWordRaw,
                      byModel: null, caught: null });
    continue;
  }
  const flat = r => (LOOSE ? [...r.asks, ...r.refuses] : r);
  const byWord  = flat(byWordRaw);
  const byModel = byModelRaw && flat(byModelRaw);
  const heardRaw = byModelRaw || byWordRaw;
  const taken = byModel || byWord;

  const cx = CX(role);
  const heardBefore = new Set([...cx.wants.keys(), ...cx.avoids.keys()]);
  if (LOOSE) { hear(cx, role, "want", heardRaw.asks); hear(cx, role, "avoid", heardRaw.refuses); }
  else hear(cx, role, act, taken);
  const before = cx.design?.id ?? null;
  build(cx);                         // always scored, so the two can be compared
  const byRule = cx.design.id;
  if (BUILDER === "model") {
    // The rule has already run and set ctx.design. If Role 3 picks something
    // else that replaces it, and the difference is the measurement.
    const chose = await chooseLLM({
      kit: KIT.map(k => ({ id: NAME(k.id), props: k.has.map(f => FEATURES[f]).join("; ") })),
      wants: [...cx.wants.keys()], avoids: [...cx.avoids.keys()],
      standing: before ? NAME(before) : null,
      // The talk itself, in order — including the confer half, which is where
      // the two of them worked out what they could both live with.
      said: transcript.filter(t => t.who === "A" || t.who === "B")
        .map(t => ({ who: t.who === "A" ? "Role 1" : "Role 2", text: t.text })),
    }, (sys, usr) => MACHINES[reader](sys, usr, ChooseSchema));
    // A name it does not recognise must be loud. Quietly falling through to the
    // rule is what hid this for every run so far.
    if (chose && chose.unmatched !== undefined) {
      state.unmatched = (state.unmatched || 0) + 1;
      console.log(`     · Role 3 named "${chose.unmatched}", which is not in its workshop — the rule's pick stands`);
    }
    const picked = typeof chose === "string" && KIT.find(k => NAME(k.id) === chose);
    if (picked) cx.design = picked;
    state.chosen = (state.chosen || 0) + 1;
    if (cx.design.id !== byRule) {
      state.diverged = (state.diverged || 0) + 1;
      console.log(`     · Role 3 chose ${NAME(cx.design.id)}; the rule would have laid ${NAME(byRule)}`);
    }
  }
  const after = cx.design.id;

  const caught = turn.asserts.length > 0 && turn.asserts.every(f => taken.includes(f)) && taken.length > 0;
  const anyOf = turn.asserts.some(f => taken.includes(f));
  transcript.push({ turn: state.turn, who: role, player, act, text: sentence,
                    meant: turn.asserts, taken, byWord, byModel, caught, anyOf, done: !!turn.done,
                    tookThemToMean: (turn.tookThemToMean || []).filter(f => f in FEATURES),
                    ...(LOOSE ? { meantAsks: turn.asks, meantRefuses: turn.refuses,
                                  takenAsks: heardRaw.asks, takenRefuses: heardRaw.refuses,
                                  stanceKept: turn.asks.every(f => !heardRaw.refuses.includes(f))
                                           && turn.refuses.every(f => !heardRaw.asks.includes(f)) } : {}),
                    theyActuallyMeant: state.lastMeant[role === "A" ? "B" : "A"] || [],
                    invented: taken.filter(f => !turn.asserts.includes(f)),
                    asserts: turn.asserts,      // kept under the old name for the page
                    attempts, built: after, changed: before !== after });
  console.log(`  ${state.turn.toString().padStart(2)} role ${role === "A" ? 1 : 2} (${player}): ${sentence}`);
  console.log(`     meant [${turn.asserts.join(", ")}]${attempts > 1 ? `  after ${attempts} attempts` : ""}${turn.done ? "  · would let it rest" : ""}`);
  console.log(`     they took [${taken.join(", ") || "nothing"}]${caught ? "" : "   ← not what was meant"}`);
  if (byModel && byWord.join() !== byModel.join()) console.log(`     the word list would have taken [${byWord.join(", ") || "nothing"}]`);
  if (before !== after) console.log(`     → they rebuild: ${NAME(after)}`);
  // Only now, with the reading committed and the thing rebuilt, does it speak.
  let saidByMachine = "";
  if (voiced) try {
    const groundKnown = cx.world.water || cx.world.rock;
    const tellGround = !groundKnown && !saidGroundUnknown;
    saidByMachine = await speakLLM({
      said: sentence, took: taken, before: before ? NAME(before) : null, after: NAME(after),
      changed: before !== after,
      props: KIT.find(k => k.id === after)?.has ?? [], made: MADE(after),
      wants: [...cx.wants.keys()], avoids: [...cx.avoids.keys()],
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
  // A silent turn puts nothing into the channel, which is the honest thing: a
  // refused voice call is a reply that never arrived, not an empty one.
  if (saidByMachine) state.builderSaid.push(saidByMachine);
  transcript.push({ who: "machine", turn: state.turn, text: NAME(after), say: saidByMachine,
                    changed: before !== after, taken,
                    ...(CASES[caseKey].solo ? { side: role } : {}) });

  state.still = before === after ? (state.still || 0) + 1 : 0;
  if (before !== after) state.lastMoved = state.turn;

  // "Nothing got built" is a poor proxy for "nothing left to say" — the crossing
  // often settles on turn one and the argument runs for twenty more. What ends a
  // conversation is people stopping saying anything NEW. So: four turns in which
  // nobody put a need the builder had not already heard, AND the crossing has not
  // moved, and not before turn eight, which is the shortest thing worth calling a
  // conversation.
  const fresh = taken.some(f => !heardBefore.has(f));
  state.stale = fresh ? 0 : (state.stale || 0) + 1;

  // In `together` they get one line each to the builder and then they are done:
  // the position was settled in the other room, and anything further would be
  // them reopening it on their own account.
  if (cfg.confer && i >= 1) {
    state.endedBy = "both had their one line after conferring";
    break;
  }
  if (state.done.A && state.done.B) { state.endedBy = "both let it rest"; break; }
  if (state.stale >= 4 && state.still >= 4 && state.turn >= 8) {
    state.endedBy = "they ran out of new things to say and it had stopped mattering";
    break;
  }
}

// What `together` is actually for.
//
// Reporting it as "the builder took 1 of 2 sentences as they were meant" is
// arithmetically true and says nothing: the builder only ever receives two
// lines, so a two-sentence sample gets read as catastrophic deafness. The
// question the case exists to ask is what happens to a position two people
// reached in rich two-way talk when it has to go through a one-way pipe — and
// that is a chain, with a loss at each step.
function conferChain() {
  const confer = transcript.filter(t => t.phase === "confer");
  if (!confer.length) return null;
  const pact = transcript.filter(t => (t.who === "A" || t.who === "B") && t.phase !== "confer");
  const U = (arr, k) => [...new Set(arr.flatMap(x => x[k] || []))];
  const table = U(confer, "meant");
  const both = table.filter(k =>
    confer.some(x => x.who === "A" && (x.meant || []).includes(k)) &&
    confer.some(x => x.who === "B" && (x.meant || []).includes(k)));
  const sent = U(pact, "meant"), heard = U(pact, "taken");
  const built = (KIT.find(k => k.id === main.design.id) || { has: [] }).has;
  return {
    table, both, sent, heard,
    dropped: table.filter(k => !sent.includes(k)),     // lost in the squeeze
    lost: sent.filter(k => !heard.includes(k)),        // lost in the channel
    standing: built.filter(k => table.includes(k)),
    conferTurns: confer.length, pactLines: pact.length,
  };
}

/* ── what it came to ──────────────────────────────────────────────────── */
const SOLO = !!CASES[caseKey].solo;
const main = SOLO ? side.A : ctx;
const prov = provenance(main);
const led = ledger(transcript);
const unspoken = prov.total - prov.named;

// How much of what was asked for ever reached the builder.
// What Role 3 was actually given. Turns from the confer half are excluded on
// purpose: the builder was out of the room for those, and scoring it on
// sentences it never received would make `together` look catastrophically deaf
// for no reason except that most of the talking happened elsewhere.
const said = transcript.filter(t => (t.who === "A" || t.who === "B") && t.phase !== "confer"
                                    && !t.unread && !t.refused);
const conferred = transcript.filter(t => t.phase === "confer");
const caughtN = said.filter(t => t.caught).length;
const someN = said.filter(t => t.anyOf).length;
const inventedN = said.reduce((n, t) => n + t.invented.length, 0);
const deafN = said.filter(t => !t.taken.length).length;
const agreed = said.filter(t => t.byModel && t.byWord.join() === t.byModel.join()).length;

console.log(SOLO
  ? `\n  Two crossings. Role 1 got ${NAME(side.A.design.id)} over ${groundOf(side.A)};`
    + ` Role 2 got ${NAME(side.B.design.id)} over ${groundOf(side.B)}.`
    + (side.A.design.id === side.B.design.id
        ? ` They arrived at the same thing without ever hearing each other.`
        : ` Neither would recognise the other's.`)
  : `\n  ${NAME(ctx.design.id)} is standing, over ${groundOf(ctx)}.`);
console.log(`  It ended after ${state.turn} turns — ${state.endedBy || "the turn cap ran out, mid-argument"}.`);
if (state.lastMoved) console.log(`  The last turn that changed anything was ${state.lastMoved}; everything after it was talk.`);
const CHAIN = conferChain();
if (CHAIN) {
  console.log(`  They put ${CHAIN.table.length} needs on the table between them; both of them named ${CHAIN.both.length}.`);
  console.log(`  ${CHAIN.dropped.length} never made it into the two lines they sent — dropped in the squeeze, not misheard.`);
  console.log(`  ${CHAIN.lost.length} more the builder did not take from the lines it did get.`);
  console.log(`  ${CHAIN.standing.length} of the ${CHAIN.table.length} are properties of what stands.`);
  console.log(`  (Role 3 took ${caughtN} of ${said.length} — a two-line sample, which is why the chain above is the measure.)`);
} else {
  console.log(`  Role 3 took ${caughtN} of ${said.length} sentences as they were meant, and got some part of ${someN}.`);
}
if (deafN) console.log(`  ${deafN} passed it by entirely.`);
if (inventedN) console.log(`  They credited the two of them with ${inventedN} need${inventedN === 1 ? "" : "s"} neither of them stated.`);
if (byModelUsed) console.log(`  The word list would have agreed with it on ${agreed} of ${said.length}.`);
if (LOOSE) {
  // Under strict goals the role handed Role 3 the stance for free. Here it had to
  // hear it, and getting the need right while getting asked-vs-refused backwards
  // is the exact failure Reddy describes — so it is counted on its own.
  const withStance = said.filter(t => t.stanceKept !== undefined);
  const kept = withStance.filter(t => t.stanceKept).length;
  const flipped = withStance.filter(t => !t.stanceKept).length;
  console.log(`  Stance: kept on ${kept} of ${withStance.length}; ${flipped} had asking and refusing the wrong way round.`);
}
if (state.unmatched) console.log(`  ${state.unmatched} of Role 3's choices named something not in its workshop and were discarded.`);
if (BUILDER === "model" && state.chosen)
  console.log(`  Role 3 chose against the rule on ${state.diverged || 0} of ${state.chosen} turns.`);
console.log(`  ${unspoken} of ${prov.total} of its properties were never put into words by either of them.`);
console.log(`  ${led.spoken} words spoken; Role 3's whole vocabulary for this run was ${ctx.wants.size + ctx.avoids.size} features.`);
if (state.violations.length) console.log(`  ${state.violations.length} turns broke the rules and were sent back.`);
if (RETRIES) console.log(`  ${RETRIES} calls were declined once and succeeded on a retry.`);
if (PAUSED) console.log(`  ${Math.round(PAUSED / 1000)}s of this run was spent waiting on a rate limit.`);
if (state.refusedTurns) console.log(`  ${state.refusedTurns} turn${state.refusedTurns === 1 ? "" : "s"} a participant would not speak and the turn was lost.`);
if (state.unread) console.log(`  ${state.unread} sentence${state.unread === 1 ? "" : "s"} went unread — the classifier declined, so ${state.unread === 1 ? "it is" : "they are"} out of the count rather than scored as missed.`);
if (state.mute) console.log(`  ${state.mute} turns Role 3 was silent — the voice call was declined four times running.`);

const session = {
  meta: { scenario: scenarioKey, case: caseKey, label: CASES[caseKey].label,
          players: { A: playerA, B: playerB }, machine: reader, machineIsModel: byModelUsed,
          models: { claude: CLAUDE_MODEL, openai: OPENAI_MODEL, gemini: GEMINI_MODEL, machine: MACHINE_MODEL },
    goals: LOOSE ? "loose" : "strict",
    // Was missing, so a free-speech run and a coded one were indistinguishable
    // once written to disk — which made "which of these is the new design?"
    // unanswerable without reading the transcripts.
    speech: FREE ? "free" : "coded",
    builder: BUILDER,
    seed: LOOSE ? SEED : null,
    cast: LOOSE ? { A: castFor(scenarioKey, "A", SEED), B: castFor(scenarioKey, "B", SEED) } : null,
          turns: state.turn, endedBy: state.endedBy || "turn cap", lastMoved: state.lastMoved || null,
          ranAt: new Date().toISOString() },
  goals: { A: SCENARIOS[scenarioKey].A.goal, B: SCENARIOS[scenarioKey].B.goal },
  transcript,
  outcome: SOLO
    ? { built: side.A.design.id, name: NAME(side.A.design.id), ground: groundOf(side.A),
        solo: true,
        builtB: side.B.design.id, nameB: NAME(side.B.design.id), groundB: groundOf(side.B),
        agreed: side.A.design.id === side.B.design.id }
    : { built: ctx.design.id, name: NAME(ctx.design.id), ground: groundOf(ctx) },
  ending: { turns: state.turn, endedBy: state.endedBy || "turn cap",
            lastMoved: state.lastMoved || null,
            keptTalking: state.lastMoved ? state.turn - state.lastMoved : state.turn },
  reading: { said: said.length, conferred: conferred.length, caught: caughtN, partly: someN, invented: inventedN, deaf: deafN, mute: state.mute || 0, retries: RETRIES,
             wordListAgreed: byModelUsed ? agreed : null },
  confer: CHAIN,
  provenance: prov,
  ledger: led,
  refusedTurns: state.refusedTurns || 0,
  unread: state.unread || 0,
  violations: state.violations,
};

const dir = path.join(process.cwd(), "sessions");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${scenarioKey}-${caseKey}-${Date.now()}.json`);
fs.writeFileSync(file, JSON.stringify(session, null, 2));
console.log(`\n  session written to ${path.relative(process.cwd(), file)}\n`);
