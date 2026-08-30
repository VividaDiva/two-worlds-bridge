#!/usr/bin/env node
// The same sentences, past three readers built by three companies.
//
// The claim this project rests on is that losing the speaker's stance is a
// property of reading shallowly, not of putting a machine in the middle. That is
// much harder to argue with when three models from three companies agree with
// each other and disagree with the word list — and it has never been measured on
// the recordings the page actually shows.
//
// Nothing new is said here. Every sentence already exists, stored with what its
// speaker meant by it, so this is the readers being compared and nothing else.
//
//   node --env-file=.env cross-read.mjs            every current recording
//   node --env-file=.env cross-read.mjs --limit 40 a cheaper slice

import fs from "node:fs";
import { FEATURES } from "./engine.mjs";
import { readLooseKeyword } from "./machine.mjs";

const argv = process.argv.slice(2);
const LIMIT = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : Infinity;
const CONC = 6;

// Exactly what the page is showing. Picking "newest per cell" by file
// mtime put a mixture of code versions on the page — descape.mjs and
// rescore.mjs bumped mtimes when they rewrote old recordings, floating
// stale runs to the top and displacing fresh ones. The batch log names
// the file each cell wrote, so read that.
const best = {};
const runFiles = fs.readdirSync("sessions/batch")
  .filter(x => /^run-.*\.txt$/.test(x))
  .map(f => (fs.readFileSync("sessions/batch/" + f, "utf8").match(/session written to (\S+)/) || [])[1])
  .filter(Boolean);
for (const p of runFiles) {
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  best[`${s.meta.scenario}/${s.meta.case}`] = { f: p, s };
}
const rows = [];
for (const { s } of Object.values(best))
  for (const turn of (s.transcript || []).filter(x => (x.who === "A" || x.who === "B") && x.text && !x.refused))
    rows.push({ text: turn.text,
                asks: (turn.meantAsks || []).filter(k => k in FEATURES),
                refuses: (turn.meantRefuses || []).filter(k => k in FEATURES) });
const work = rows.filter(r => r.asks.length + r.refuses.length > 0).slice(0, LIMIT);
console.log(`  ${work.length} sentences from ${Object.keys(best).length} recordings, three readers each\n`);

const { readLooseLLM } = await import("./machine.mjs");
const { default: Anthropic } = await import("@anthropic-ai/sdk");
const { betaZodOutputFormat } = await import("@anthropic-ai/sdk/helpers/beta/zod");
const { default: OpenAI } = await import("openai");
const { GoogleGenAI } = await import("@google/genai");
const { z } = await import("zod");
const Loose = z.object({ asks: z.array(z.string()), refuses: z.array(z.string()) });
const anthropic = new Anthropic(), openai = new OpenAI();
const gem = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });

const geminiOnce = async (sys, usr) => {
  const r = await gem.models.generateContent({ model: "gemini-flash-lite-latest",
    contents: usr, config: { systemInstruction: sys, responseMimeType: "application/json",
      responseJsonSchema: { type: "object", properties: {
        asks: { type: "array", items: { type: "string" } },
        refuses: { type: "array", items: { type: "string" } } }, required: ["asks", "refuses"] } } });
  return JSON.parse(r.text);
};

const READERS = {
  claude: async (sys, usr) => {
    const r = await anthropic.beta.messages.parse({ model: "claude-opus-5", max_tokens: 8192,
      system: sys, messages: [{ role: "user", content: usr }],
      output_config: { format: betaZodOutputFormat(Loose) } });
    if (r.stop_reason === "refusal") throw new Error("refused");
    return r.parsed_output ?? JSON.parse(r.content.find(c => c.type === "text").text.match(/\{[\s\S]*\}/)[0]);
  },
  openai: async (sys, usr) => {
    const r = await openai.chat.completions.create({ model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys + `\n\nReply with JSON only: {"asks":["key"],"refuses":["key"]}` },
                 { role: "user", content: usr }] });
    return JSON.parse(r.choices[0].message.content);
  },
  // Six at a time hit the rate limiter and two thirds of this column
  // came back empty — recorded as "read nothing", which is a reading,
  // not a refusal to answer. Honour the retry delay and wait.
  gemini: geminiOnce,
};

// Whichever reader is left unprotected gets rate-limited: gemini when it
// was alone, claude when all three run at once. A 429 is not an answer.
for (const k of Object.keys(READERS)) {
  const once = READERS[k];
  READERS[k] = async (sys, usr) => {
    for (let n = 0; ; n++) {
      try { return await once(sys, usr); }      catch (e) {
        if (n === 5) throw e;
        const wait = Number(String(e.message).match(/retryDelay":"(\d+)s/)?.[1] || (2 ** n)) * 1000;
        await new Promise(r => setTimeout(r, Math.min(wait, 30000)));
      }
    }
  };
}
const key = x => JSON.stringify([[...(x.asks || [])].sort(), [...(x.refuses || [])].sort()]);
const out = [];
let done = 0;
async function one(r) {
  const got = { word: readLooseKeyword(r.text) };
  for (const [name, fn] of Object.entries(READERS)) {
    try { got[name] = await readLooseLLM(r.text, fn); }
    catch { got[name] = null; }
  }
  out.push({ r, got });
  if (++done % 20 === 0) console.log(`  ...${done}/${work.length}`);
}
const queue = work.slice();
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) await one(queue.shift());
}));

const meantKey = r => key({ asks: r.asks, refuses: r.refuses });
const tookAsMeant = (g, r) => g && [...r.asks, ...r.refuses].every(f => [...(g.asks||[]), ...(g.refuses||[])].includes(f))
                              && [...(g.asks||[]), ...(g.refuses||[])].length > 0;
const inverted = (g, r) => g && (r.asks.some(f => (g.refuses||[]).includes(f)) || r.refuses.some(f => (g.asks||[]).includes(f)));

console.log(`\n  reader        took as meant   stance inverted   agreed with the word list`);
for (const name of ["claude", "openai", "gemini", "word"]) {
  const ok = out.filter(o => tookAsMeant(o.got[name], o.r)).length;
  const inv = out.filter(o => inverted(o.got[name], o.r)).length;
  const agr = out.filter(o => o.got[name] && key(o.got[name]) === key(o.got.word)).length;
  console.log(`  ${name.padEnd(12)} ${String(ok).padStart(4)}/${out.length}       ${String(inv).padStart(4)}          ${name === "word" ? "—" : `${agr}/${out.length}`}`);
}
const three = out.filter(o => o.got.claude && o.got.openai && o.got.gemini);
const allAgree = three.filter(o => key(o.got.claude) === key(o.got.openai) && key(o.got.openai) === key(o.got.gemini));
const agreeNotWord = allAgree.filter(o => key(o.got.claude) !== key(o.got.word));
console.log(`\n  all three readers identical:            ${allAgree.length}/${three.length}`);
console.log(`  ...and the word list differs:           ${agreeNotWord.length}`);
const pair = (a, b) => three.filter(o => key(o.got[a]) === key(o.got[b])).length;
console.log(`\n  pairwise: claude=openai ${pair("claude","openai")}   claude=gemini ${pair("claude","gemini")}   openai=gemini ${pair("openai","gemini")}   (of ${three.length})`);
fs.writeFileSync("sessions/cross-read.json", JSON.stringify(out, null, 1));
console.log(`\n  written to sessions/cross-read.json`);
