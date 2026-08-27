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

// Only what the page is showing: the newest loose+free run per cell.
const best = {};
for (const f of fs.readdirSync("sessions").filter(x => x.endsWith(".json"))) {
  const s = JSON.parse(fs.readFileSync("sessions/" + f, "utf8"));
  if (s.meta?.goals !== "loose" || s.meta?.speech !== "free") continue;
  const k = `${s.meta.scenario}/${s.meta.case}`, t = fs.statSync("sessions/" + f).mtimeMs;
  if (!best[k] || t > best[k].t) best[k] = { f, t, s };
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
  gemini: async (sys, usr) => {
    const r = await gem.models.generateContent({ model: "gemini-flash-lite-latest",
      contents: usr, config: { systemInstruction: sys, responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: {
          asks: { type: "array", items: { type: "string" } },
          refuses: { type: "array", items: { type: "string" } } }, required: ["asks", "refuses"] } } });
    return JSON.parse(r.text);
  },
};

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
