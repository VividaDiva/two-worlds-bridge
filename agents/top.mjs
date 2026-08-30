// The gaps are turns that ran while the account was empty or the rate
// limiter was hitting. The sentence and the key list are all a reader
// needs, and both are still here — fill the gaps rather than pay to read
// all 363 again.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { FEATURES } from "./engine.mjs";

const anthropic = new Anthropic();
const gem = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
const Loose = z.object({ asks: z.array(z.string()), refuses: z.array(z.string()) });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SYS = [
  `You build crossings. Somebody has said one sentence to you about what they need.`,
  `Decide, from these keys, what the sentence ASKS FOR and what it REFUSES.`,
  ...Object.entries(FEATURES).map(([k, v]) => `  ${k} — ${v}`),
].join("\n");

const READERS = {
  claude: async usr => {
    const r = await anthropic.beta.messages.parse({ model: "claude-opus-5", max_tokens: 8192,
      system: SYS, messages: [{ role: "user", content: usr }],
      output_config: { format: betaZodOutputFormat(Loose) } });
    if (r.stop_reason === "refusal") throw new Error("refused");
    return r.parsed_output ?? JSON.parse(r.content.find(c => c.type === "text").text.match(/\{[\s\S]*\}/)[0]);
  },
  gemini: async usr => {
    const r = await gem.models.generateContent({ model: "gemini-flash-lite-latest",
      contents: usr, config: { systemInstruction: SYS, responseMimeType: "application/json",
        responseJsonSchema: { type: "object", properties: {
          asks: { type: "array", items: { type: "string" } },
          refuses: { type: "array", items: { type: "string" } } }, required: ["asks", "refuses"] } } });
    return JSON.parse(r.text);
  },
};

const out = JSON.parse(fs.readFileSync("sessions/cross-read.json", "utf8"));
for (const k of Object.keys(READERS)) {
  const todo = out.filter(o => !o.got[k]);
  if (!todo.length) { console.log(`  ${k}: none missing`); continue; }
  console.log(`  ${k}: ${todo.length} to fill in`);
  let ok = 0, fail = 0;
  for (const [i, o] of todo.entries()) {
    for (let n = 0; ; n++) {
      try {
        o.got[k] = await READERS[k](`The sentence: "${o.r.text}"\n\nWhat does it ask for, and what does it refuse?`);
        ok++; break;
      } catch (e) {
        const m = String(e.message);
        if (n === 5 || /invalid_request|not_found|authentication/i.test(m)) {
          fail++; console.log(`  giving up: ${m.slice(0, 70)}`); break;
        }
        const wait = Number(m.match(/retryDelay":"(\d+)s/)?.[1] || (2 ** n)) * 1000;
        await sleep(Math.min(wait, 30000));
      }
    }
    if ((i + 1) % 20 === 0) console.log(`    ...${i + 1}/${todo.length}`);
  }
  console.log(`  ${k}: filled ${ok}, still failing ${fail}`);
  fs.writeFileSync("sessions/cross-read.json", JSON.stringify(out, null, 1));
}
