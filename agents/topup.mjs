// Fill in the Gemini column. cross-read.mjs called Gemini six at a time with a
// hand-rolled request and no backoff — run.mjs has had backoff for this exact
// reason — so 64 of 118 came back empty and got recorded as "read nothing".
// Rate limiting, not reading. Serial, with the retry honoured this time.
import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { readLooseLLM } from "./machine.mjs";
const gem = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
const SCHEMA = { type:"object", properties:{ asks:{type:"array",items:{type:"string"}},
  refuses:{type:"array",items:{type:"string"}} }, required:["asks","refuses"] };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ask(sys, usr) {
  for (let n = 0; n < 6; n++) {
    try {
      const r = await gem.models.generateContent({ model: "gemini-flash-lite-latest",
        contents: usr, config: { systemInstruction: sys, responseMimeType: "application/json",
          responseJsonSchema: SCHEMA } });
      return JSON.parse(r.text);
    } catch (e) {
      const wait = Number(String(e.message).match(/retryDelay":"(\d+)s/)?.[1] || (2 ** n)) * 1000;
      if (n === 5) throw e;
      await sleep(Math.min(wait, 30000));
    }
  }
}

const out = JSON.parse(fs.readFileSync("sessions/cross-read.json", "utf8"));
const todo = out.filter(o => !o.got.gemini);
console.log(`  ${todo.length} sentences to re-read with Gemini, serially\n`);
let ok = 0, fail = 0;
for (const [i, o] of todo.entries()) {
  try { o.got.gemini = await readLooseLLM(o.r.text, ask); ok++; }
  catch (e) { fail++; console.log(`  still failing: ${String(e.message).slice(0, 80)}`); }
  if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${todo.length}`);
}
fs.writeFileSync("sessions/cross-read.json", JSON.stringify(out, null, 1));
console.log(`\n  recovered ${ok}, still failing ${fail}`);
console.log(`  gemini now has ${out.filter(o => o.got.gemini).length} of ${out.length}`);
