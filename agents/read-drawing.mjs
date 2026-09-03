#!/usr/bin/env node
// Turn a drawing into a goal.
//
//   put two images in agents/drawings/ named role1.* and role2.*
//   node read-drawing.mjs
//
// It looks at each one and says which of the eight choices it sees, writes
// drawings/manifest.json, and prints what it found so you can correct it. The
// manifest is yours to edit: nothing re-reads the image once it exists, so a
// wrong reading is a one-line fix, not a re-run.
//
// The point of doing this at all: a drawing is a referent OUTSIDE the language.
// Once it is in the same eight axes the builder builds in, "did it arrive?" is
// arithmetic rather than opinion.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { AXES, CHOICES, propsOf, FEATURES } from "./engine.mjs";

const DIR = new URL("./drawings/", import.meta.url).pathname;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp", ".gif": "image/gif" };

const find = role => {
  const hit = fs.readdirSync(DIR).filter(f =>
    f.toLowerCase().startsWith(role) && MIME[path.extname(f).toLowerCase()]);
  if (!hit.length) return null;
  if (hit.length > 1) throw new Error(`more than one image for ${role}: ${hit.join(", ")}`);
  return hit[0];
};

const ASK = [
  `You are looking at a drawing of a crossing over a gap — a bridge of some kind.`,
  `Say which of these it is, on each of eight independent choices. If the drawing`,
  `does not show something, choose the plainer option rather than guessing.`,
  ``,
  ...AXES.map(ax => `${ax}: ` + Object.entries(CHOICES[ax])
    .map(([v, text]) => `"${v}" = ${text}`).join("  |  ")),
  ``,
  `Reply with JSON only: {${AXES.map(a => `"${a}": "..."`).join(", ")}, "note": "one line on what you saw"}`,
].join("\n");

const client = new Anthropic();
const MANIFEST = path.join(DIR, "manifest.json");
// A hand-corrected line is the most valuable thing in the file — it is a human
// saying what the picture actually shows — so a second run must not quietly
// overwrite it. Pass --again to re-read anyway.
const existing = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
const again = process.argv.includes("--again");
const out = { ...existing };

for (const role of ["role1", "role2"]) {
  if (existing[role] && !again) {
    console.log(`\n  ${role} — already read as ${existing[role].file}; keeping it (--again to re-read)`);
    console.log(`     needs: ${existing[role].needs.join(", ")}`);
    continue;
  }
  const file = find(role);
  if (!file) { console.log(`  ${role}: no image found (expected ${role}.png or .jpg in drawings/)`); continue; }
  const full = path.join(DIR, file);
  const bytes = fs.statSync(full).size;
  if (bytes > 4.5 * 1024 * 1024)
    throw new Error(`${file} is ${(bytes/1048576).toFixed(1)}MB; the API takes about 5MB — shrink it first`);
  const data = fs.readFileSync(full).toString("base64");
  const res = await client.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-opus-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: MIME[path.extname(file).toLowerCase()], data } },
      { type: "text", text: ASK },
    ]}],
  });
  const text = res.content.find(b => b.type === "text")?.text || "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let shape;
  try { shape = JSON.parse(json); }
  catch { throw new Error(`could not read a reading back for ${file}:\n${text.slice(0, 300)}`); }

  for (const ax of AXES) {
    if (!CHOICES[ax][shape[ax]])
      throw new Error(`${file}: "${shape[ax]}" is not one of the ${ax} choices (${Object.keys(CHOICES[ax]).join(", ")})`);
  }
  const clean = Object.fromEntries(AXES.map(a => [a, shape[a]]));
  const needs = propsOf(clean);
  out[role] = { file, shape: clean, needs, note: shape.note || "" };

  console.log(`\n  ${role} — ${file}`);
  console.log(`     ${shape.note || ""}`);
  for (const ax of AXES) console.log(`     ${ax.padEnd(8)} ${CHOICES[ax][clean[ax]]}`);
  console.log(`     so what it needs (${needs.length} keys):`);
  for (const k of needs) console.log(`        ${k.padEnd(10)} ${FEATURES[k]}`);
}

if (Object.keys(out).length) {
  fs.writeFileSync(MANIFEST, JSON.stringify(out, null, 2));
  console.log(`\n  written to drawings/manifest.json — edit it if any line above is wrong.`);
  const n = Object.values(out).map(x => x.needs.length);
  if (Math.max(...n) > 3 || n[0] !== n[1]) {
    console.log(`\n  A drawing gives back everything it is, which here is ${n.join(" and ")} keys —`);
    console.log(`  and some of them are absences, not wants: a crossing that "sways" or is`);
    console.log(`  "exposed" is one nobody asked for, it is only what yours happens to be.`);
    console.log(`  Every other argument gives each role TWO things they need. If you want the`);
    console.log(`  scores to sit alongside those, cut "needs" in the manifest down to the two`);
    console.log(`  or three that actually matter to that person. Leave it as it is and the`);
    console.log(`  goal becomes "reproduce my drawing", which is a fair question but a`);
    console.log(`  different and much harder one.`);
  }
}
