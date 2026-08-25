#!/usr/bin/env node
// Put recorded sessions into the page.
//
// The page has to stay a single file that makes no network call — that is what
// lets it be shared as a link with no key anywhere near it. So sessions do not
// get fetched; they get written into it, between two markers, and the Recorded
// runs tab appears on its own once there is something to show.
//
//   node inline-session.mjs                       every session in ./sessions
//   node inline-session.mjs sessions/a.json       just these
//   node inline-session.mjs --clear               take them all back out
//
// Re-run this after regenerating the page from its source, or the sessions go
// with it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const clear = args.includes("--clear");
const pageArg = args.indexOf("--page");
const pagePath = pageArg >= 0 ? args[pageArg + 1] : path.join(here, "..", "i-want-i-do-not-want.html");
const named = args.filter(a => a.endsWith(".json"));

const OPEN = "/* SESSIONS */", CLOSE = "/* /SESSIONS */";

// Only the fields the page reads. A session file also holds the word ledger, the
// provenance breakdown and every rule violation, and none of that belongs in a
// page that has to stay small enough to open on a phone.
const keep = s => ({
  meta: s.meta,
  outcome: s.outcome,
  reading: s.reading,
  transcript: (s.transcript || [])
    .filter(t => t.who === "A" || t.who === "B" || (t.who === "machine" && t.say))
    .map(t => t.who === "machine"
      ? { turn: t.turn, who: "machine", text: t.text, say: t.say, changed: !!t.changed }
      : { turn: t.turn, who: t.who, player: t.player, text: t.text,
          meant: t.meant || t.asserts || [], taken: t.taken || [],
          byWord: t.byWord || null, byModel: t.byModel || null }),
});

let sessions = [];
if (!clear) {
  const files = named.length ? named : (() => {
    const dir = path.join(here, "sessions");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort().map(f => path.join(dir, f));
  })();
  if (!files.length) {
    console.error("  no sessions found. Run run.mjs first, or pass files explicitly.");
    process.exit(1);
  }
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!s.meta || !s.transcript) { console.error(`  skipping ${f}: not a session file`); continue; }
    sessions.push(keep(s));
    console.log(`  + ${path.basename(f)}  ${s.meta.label} · ${s.meta.scenario} · ${s.meta.turns} turns`);
  }
}

const page = fs.readFileSync(pagePath, "utf8");
const a = page.indexOf(OPEN), b = page.indexOf(CLOSE);
if (a < 0 || b < 0) { console.error(`  ${pagePath} has no ${OPEN} … ${CLOSE} markers`); process.exit(1); }

const json = JSON.stringify(sessions);
const out = page.slice(0, a) + OPEN + ` const SESSIONS = ${json}; ` + page.slice(b);
fs.writeFileSync(pagePath, out);

const kb = Math.round(json.length / 102.4) / 10;
console.log(clear
  ? `\n  cleared. ${path.relative(process.cwd(), pagePath)} carries no sessions.\n`
  : `\n  ${sessions.length} session${sessions.length === 1 ? "" : "s"} (${kb} KB) written into ${path.relative(process.cwd(), pagePath)}\n`);
