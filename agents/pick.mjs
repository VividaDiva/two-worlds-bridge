// The batch log names the file each cell wrote. That is the list to inline:
// one consistent set, one code version. Picking "newest by mtime" put a
// mixture on the page — descape.mjs and rescore.mjs bumped mtimes when
// they rewrote old recordings, floating stale runs to the top and
// displacing fresh ones; and later smoke tests are newer still.
import fs from "node:fs";
const files = fs.readFileSync("sessions/batch/final.txt", "utf8")
  .split("\n").filter(l => l.includes("session written to"))
  .map(l => l.trim().replace("session written to ", ""));
if (files.length !== 15) { console.error("EXPECTED 15, GOT " + files.length); process.exit(1); }
for (const p of files) {
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  const n = (s.transcript || []).filter(x => x.who === "A" || x.who === "B").length;
  console.log(`  ${(s.meta.scenario + "/" + s.meta.case).padEnd(18)} ${n} turns   ${s.meta.ranAt.slice(0, 16)}`);
}
fs.writeFileSync("/tmp/final.txt", files.join("\n"));
