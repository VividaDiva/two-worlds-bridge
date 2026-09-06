#!/usr/bin/env node
// Full-height PNG of every conversation.
//
// Chrome's --screenshot only captures the window, so a long conversation gets
// cut off. This talks to the debug protocol instead and asks for the page
// beyond the viewport, which is the only way to get the whole thing in one
// image. Node has a WebSocket built in, so there is nothing to install.
//
//   node shoot.mjs [outDir] [--only places]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "../export/png";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const PAGE = "file://" + path.resolve("../export/conversations.html");
const PORT = 9333, WIDTH = 900;

const ARGS = ["places", "loads", "agreed", "pairs", "refs"];
const CASES = ["r2-builder", "r2-role1", "open-1st", "r1-builder", "r1-role2",
               "open-2nd", "r1-role2-2nd", "r1-builder-2nd", "together", "alone"];

fs.mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, "--disable-gpu",
  "--hide-scrollbars", "--force-color-profile=srgb",
  `--window-size=${WIDTH},1200`, "--user-data-dir=" + fs.mkdtempSync("/tmp/shoot-"),
  "about:blank",
], { stdio: "ignore" });

const wait = ms => new Promise(r => setTimeout(r, ms));
const targets = async () => (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const n = ++id;
  pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
});

async function main() {
  for (let i = 0; i < 60; i++) { try { await targets(); break; } catch { await wait(250); } }
  const t = (await targets()).find(x => x.type === "page");
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener("open", r));
  ws.addEventListener("message", e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  });
  await send("Page.enable");

  let n = 0, failed = 0;
  for (const a of ARGS) {
    if (only && a !== only) continue;
    for (const c of CASES) for (const k of [0, 1, 2, 3]) {
      const url = `${PAGE}?arg=${a}&case=${c}&cast=${k}&bare=1`;
      await send("Page.navigate", { url });
      await wait(320);
      // measure what the page actually is, then ask for exactly that
      const { result } = await send("Runtime.evaluate", {
        expression: `JSON.stringify({h: document.documentElement.scrollHeight,
                     ok: !!document.querySelector('.setup')})`,
        returnByValue: true,
      });
      const { h, ok } = JSON.parse(result.value);
      if (!ok) { failed++; console.error(`  no conversation: ${a}/${c}/cast${k + 1}`); continue; }
      const shot = await send("Page.captureScreenshot", {
        format: "png", captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: WIDTH, height: h, scale: 2 },
      });
      const name = `${a}__${c}__cast${k + 1}.png`;
      fs.writeFileSync(path.join(outDir, name), Buffer.from(shot.data, "base64"));
      n++;
      if (n % 25 === 0) console.log(`  ${n} written…`);
    }
  }
  console.log(`done: ${n} images, ${failed} missing`);
  ws.close(); chrome.kill();
}
main().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
