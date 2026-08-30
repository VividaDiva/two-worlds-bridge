// The per-cell run files name what each cell wrote — one consistent set, one
// code version. Never file mtime: descape.mjs and rescore.mjs bump those when
// they rewrite old recordings, which once put a mixture of code versions on
// the page.
import fs from "node:fs";
const files = [];
for (const f of fs.readdirSync("sessions/batch").filter(x => /^run-.*\.txt$/.test(x))) {
  const m = fs.readFileSync("sessions/batch/" + f, "utf8").match(/session written to (\S+)/);
  if (m) files.push(m[1]);
}
files.sort();
for (const p of files) {
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  const n = (s.transcript || []).filter(x => x.who === "A" || x.who === "B").length;
  console.log(`  ${(s.meta.scenario + "/" + s.meta.case).padEnd(18)} ${String(n).padStart(2)} turns`);
}
fs.writeFileSync("/tmp/final.txt", files.join("\n"));
console.log(`\n  ${files.length} cells`);
