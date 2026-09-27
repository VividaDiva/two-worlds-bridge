import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("new rooms are empty; both people's chat and AI replies survive in History and after restart", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-room-test-"));
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  // Exercise the actual server and persistence with a deterministic AI boundary.
  // No SDKs, credentials, model requests, or production session files are used.
  const mock = `
    export const readLine = async () => ({ asks: [], refuses: [] });
    export const chooseBuild = async () => ({ id: null });
    export const speak = async () => "Test AI reply";
    export const readPicture = async () => { throw Error("unexpected image call"); };
    export const relay = async () => "Test relay";
    export const sketch = async () => { throw Error("unexpected sketch call"); };
    // Condition B and the Wall, stubbed the same way.
    export const readLineB = async () => ({ asks: [], refuses: [], beyond: "" });
    export const chooseBuildB = async () => ({ id: null, why: "", alt: null });
    export const propose = async () => "Test AI proposal";
    export const wallHear = async () => ({ cards: [], updates: [], tools: [], ask: "" });
    export const wallDecide = async () => ({ decisions: [], conflicts: [], checks: null });
    export const relayFromWall = async () => "Test relay";
  `;
  const hook = path.join(dir, "mock-builder.mjs");
  fs.writeFileSync(hook, `import { registerHooks } from "node:module";
    registerHooks({resolve(s, c, next) {
      return s === "./builder.mjs" && c.parentURL.endsWith("/usertest/server.mjs")
        ? {url: ${JSON.stringify("data:text/javascript," + encodeURIComponent(mock))}, shortCircuit: true}
        : next(s, c);
    }});`);
  let child;
  async function start() {
    child = spawn(process.execPath, ["--import", hook, path.join(here, "server.mjs")], {
      env: { ...process.env, PORT: String(port), ANTHROPIC_API_KEY: "test-placeholder",
        SESSIONS_DIR: path.join(dir, "sessions"), UPLOADS_DIR: path.join(dir, "uploads"),
        PUBLIC_URL: `http://127.0.0.1:${port}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("server startup timeout")), 5000);
      let output = "";
      child.stdout.on("data", chunk => {
        output += chunk;
        if (output.includes("Facilitator console:")) { clearTimeout(timer); resolve(); }
      });
      child.once("exit", code => { clearTimeout(timer); reject(Error(`server exited: ${code}`)); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
    });
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
  const request = (url, options = {}) => fetch(`http://127.0.0.1:${port}${url}`, options);
  const get = async url => (await request(url)).json();
  async function post(url, body) {
    const response = await request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function freshDesk() {
    const response = await request("/desk", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const id = /^\/j\/([a-z0-9]+)\/both$/.exec(response.headers.get("location"))[1];
    for (const role of ["A", "B", "host"]) {
      const state = await get(`/api/state?room=${id}&role=${role}`);
      assert.deepEqual(state.lines, []);
      assert.equal(state.shape, null);
      assert.equal(state.step, 0);
    }
    return id;
  }
  try {
    await start();
    const options = await get("/api/options");
    const argument = options.arguments.find(a => !a.upload).id;
    const { room } = await post("/api/create", { argument, route: "confer" });
    await post("/api/say", { room, role: "A", text: "First participant's idea" });
    await post("/api/say", { room, role: "B", text: "Second participant's idea" });
    await post("/api/say", { room, role: "A", text: "Our shared proposal", mode: "build" });
    let saved;
    for (let i = 0; i < 50; i++) {
      saved = await get(`/api/export?room=${room}&format=json`);
      if (saved.transcript.some(e => e.text === "Test AI reply")) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.deepEqual(saved.transcript.map(e => e.who), ["A", "B", "A", "builder"]);
    const first = await freshDesk();
    const second = await freshDesk();
    assert.notEqual(first, second);
    assert.notEqual(first, room);
    const { room: third } = await post("/api/create", { argument, route: "confer" });
    assert.deepEqual((await get(`/api/state?room=${third}&role=host`)).lines, []);
    assert.deepEqual((await get(`/api/export?room=${room}&format=json`)).transcript, saved.transcript);
    assert.ok((await get("/api/sessions")).some(s => s.room === room && s.lines === 3));
    assert.ok((await request(`/api/export?room=${room}&format=md`)).ok);
    assert.equal((await get(`/api/state?room=${room}&role=host`)).lines.length, 4);
    await stop();
    await start();
    assert.deepEqual((await get(`/api/export?room=${room}&format=json`)).transcript, saved.transcript);
    assert.equal((await get(`/api/state?room=${room}&role=host`)).lines.length, 4);
    assert.notEqual(await freshDesk(), room);
  } finally {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("switching rooms removes old chat and drafts while all three new views load", () => {
  const html = fs.readFileSync(path.join(here, "app.html"), "utf8");
  const source = html.slice(html.indexOf("let stopBoth = [];"), html.indexOf("// Every use case, always switchable."));
  const app = { innerHTML: "old conversation and composers" };
  const both = { A: {}, B: {}, host: {} };
  const listeners = [];
  let closed = 0;
  const context = vm.createContext({ app, both, seen: { A: 3 }, drafts: { A: "old draft" },
    document: { getElementById: () => ({}) }, bothView() {},
    listen(room, role, callback) { listeners.push({ room, role, callback }); return () => closed++; },
  });
  vm.runInContext(source + '\nwatchBoth("first"); watchBoth("second");', context);
  assert.equal(closed, 3);
  assert.equal(both.A, null);
  assert.equal(both.B, null);
  assert.equal(both.host, null);
  assert.equal(Object.keys(context.drafts).length, 0);
  assert.equal(Object.keys(context.seen).length, 0);
  assert.ok(!app.innerHTML.includes("old conversation"));
  assert.ok(app.innerHTML.includes("Previous conversations are saved in History"));
  assert.deepEqual(listeners.slice(-3).map(l => [l.room, l.role]), [["second", "A"], ["second", "B"], ["second", "host"]]);
});
