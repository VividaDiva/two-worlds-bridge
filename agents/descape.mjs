#!/usr/bin/env node
// The model sometimes writes the escape for a dash rather than the dash,
// inside a string that has already been through JSON.parse — so a literal
// backslash-u lands in a recording and renders as itself on the page.
// run.mjs decodes these now, but recordings made before that fix still
// carry them.
//
// Decoding a stored escape is exactly what the fix does at run time, so
// this cleans the old recordings rather than paying to make them again.
import fs from "node:fs";

const ok = c => c === 9 || c === 10 || c === 13 || c >= 32;
const clean = t => {
  let out = "";
  for (const ch of String(t)) {
    const c = ch.charCodeAt(0);
    out += ok(c) ? ch : " ";
  }
  return out.replace(/[ \t]+/g, " ").trim();
};
const de = t => clean(String(t).replace(/\\u([0-9a-fA-F]{4})/g,
  (_, h) => String.fromCharCode(parseInt(h, 16))));

const hasEsc = t => /\\u[0-9a-fA-F]{4}/.test(t);

let files = 0, lines = 0;
for (const f of fs.readdirSync("sessions").filter(x => x.endsWith(".json"))) {
  const p = "sessions/" + f, raw = fs.readFileSync(p, "utf8");
  if (!hasEsc(raw)) continue;
  const s = JSON.parse(raw);
  let n = 0;
  for (const t of s.transcript || []) for (const k of ["text", "say", "why"])
    if (typeof t[k] ===  "string" && hasEsc(t[k])) { t[k] = de(t[k]); n++; }
  if (n) { fs.writeFileSync(p, JSON.stringify(s, null, 1)); files++; lines += n; }
}
console.log(`  ${lines} spoken lines cleaned in ${files} recordings`);
