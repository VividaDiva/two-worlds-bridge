// Two people and a builder, in a room.
//
//   node --env-file=../.env usertest/server.mjs
//
// The facilitator opens the console, picks an argument and a route, and gets
// two links. Each person opens their own and sees only what their route lets
// them see: their own goal, whatever the other one said if they are allowed to
// hear it, and whatever the builder said if they are allowed to hear that.
// Nobody is shown the latent need their goal implies, and neither is Role 3.
//
// The key lives in this process. Participants never hold it and never see it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkCtx, hear, newTurn, build, provenance } from "../engine.mjs";
import { ARGUMENTS, ROUTES, NAME, FEATURES, KIT, propsOf } from "./kit.mjs";
import { readLine, chooseBuild, speak, readPicture } from "./builder.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8780);
fs.mkdirSync(path.join(here, "uploads"), { recursive: true });
fs.mkdirSync(path.join(here, "sessions"), { recursive: true });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("No ANTHROPIC_API_KEY. Run with:  node --env-file=../.env usertest/server.mjs");
  process.exit(1);
}

const rooms = new Map();
const streams = new Map();            // room id -> Set of { res, role }
const code = () => Math.random().toString(36).slice(2, 7);

const other = r => (r === "A" ? "B" : "A");
const phaseOf = (room, i) => i < (ROUTES[room.route].confer || 0) ? "confer" : "main";

// What one person is allowed to see of one line. The host sees everything;
// that is the point of the host view.
function visible(room, entry, role) {
  if (role === "host") return true;
  if (entry.who === role) return true;
  const see = ROUTES[room.route].see[role] || { hears: false, echo: false };
  if (entry.who === "builder") return !!see.echo;
  // The confer half is the two of them talking to each other, so both see it
  // whatever the route says about the main half.
  return entry.phase === "confer" ? true : !!see.hears;
}

function view(room, role) {
  const arg = ARGUMENTS[room.argument], route = ROUTES[room.route];
  const script = route.script;
  const turn = room.turn < script.length ? script[room.turn] : null;
  return {
    room: room.id, argument: room.argument, route: room.route,
    title: arg.title, blurb: arg.blurb, arrow: route.arrow, note: route.note,
    role,
    goal: role === "host" ? null : arg[role].goal,
    upload: !!arg.upload,
    uploaded: role === "host"
      ? { A: !!room.uploads.A, B: !!room.uploads.B }
      : !!room.uploads[role],
    picture: role === "host" ? null : (room.uploads[role] || null),
    needsUpload: !!arg.upload && role !== "host" && !room.uploads[role],
    turn, yourTurn: turn === role,
    phase: room.turn < script.length ? phaseOf(room, room.turn) : "done",
    conferTurns: route.confer || 0,
    step: room.turn, of: script.length,
    // Which sides somebody has already taken, so one link can be sent to both
    // people and the join screen can show what is left.
    claimed: { A: !!room.claimed?.A, B: !!room.claimed?.B },
    standing: room.standing ? NAME(room.standing) : null,
    // The crossing itself, so it can be drawn rather than only named, and the
    // ground under it, because how deep the gap is depends on what the two of
    // them claimed was down there.
    shape: room.ctx.design ? room.ctx.design.shape : null,
    world: { ...room.ctx.world },
    // Which of them asked for each property of what stands. This is the whole
    // question when an agent has two principals instead of one, so it is worth
    // showing: it is the only place you can see whose meaning it acted on.
    provenance: role === "host" ? provenance(room.ctx).feats : null,
    thinking: room.thinking,
    finished: room.finished,
    score: room.finished ? room.score : null,
    lines: room.transcript.filter(e => visible(room, e, role))
      .map(e => ({ who: e.who, text: e.text, phase: e.phase, built: e.built || null,
        // It laid something and would not say why. Distinct from saying nothing,
        // and the trace should not show an empty bubble as though it had.
        ...(e.failed ? { failed: e.failed } : {}),
        // What it read out of that line. These are the latent keys, so they go
        // to the facilitator alone — showing a participant the vocabulary it is
        // scored against would teach them the words the study is about them not
        // having. The dashboard draws its agent panels from the host stream, so
        // it loses nothing by this.
        ...(role === "host" && e.taken ? { taken: e.taken } : {}) })),
  };
}

// Every session is kept on disk as it happens, not only when somebody presses
// End: a room lives in memory, and a restart or a closed laptop would otherwise
// take the whole conversation with it. Rewritten on every change, which is every
// push, so the file is never more than one change behind the screen.
function record(room) {
  const arg = ARGUMENTS[room.argument], route = ROUTES[room.route];
  const rec = {
    room: room.id, argument: room.argument, title: arg.title,
    route: room.route, arrow: route.arrow,
    createdAt: room.createdAt, updatedAt: new Date().toISOString(),
    finished: room.finished,
    // Enough to carry on from, not only to read back.
    turn: room.turn, claimed: room.claimed || {}, standingId: room.standing,
    goals: { A: arg.A.goal, B: arg.B.goal },
    // The pictures are theirs; the record keeps what was read off them, not the
    // image. The files already on disk are gitignored.
    uploads: Object.fromEntries(Object.entries(room.uploads)
      .map(([k, v]) => [k, { shape: v.shape, needs: v.needs }])),
    transcript: room.transcript.map(e => ({ ...e })),
    standing: room.standing ? NAME(room.standing) : null,
    shape: room.ctx.design ? room.ctx.design.shape : null,
    // The ground under it, so the crossing can be drawn again from the record.
    world: { ...room.ctx.world },
    provenance: provenance(room.ctx).feats,
    // Needs met so far, even before End is pressed; `finished` says which.
    score: room.score || scoreRoom(room),
  };
  // Written aside and moved into place, so a restart mid-write leaves the last
  // good record rather than half of a new one.
  const file = path.join(here, "sessions", `${room.id}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(rec, null, 2));
  fs.renameSync(file + ".tmp", file);
}

const WHO = { A: "Role 1", B: "Role 2", builder: "Role 3 (builder)" };
const clock = t => (t ? new Date(t).toLocaleTimeString() : "");

// The same record, as something a person can read.
function toMarkdown(s) {
  const out = [
    `# ${s.title} — room ${s.room}`, "",
    `- Route: ${s.arrow}`,
    `- Started: ${s.createdAt ? new Date(s.createdAt).toLocaleString() : "?"}`,
    `- Last change: ${new Date(s.updatedAt).toLocaleString()}`,
    `- Ended: ${s.finished ? "yes" : "no — saved as it stood"}`, "",
    `## Goals`, "",
    `**Role 1:** ${s.goals.A}`, "",
    `**Role 2:** ${s.goals.B}`, "",
    `## Conversation`, "",
  ];
  for (const e of s.transcript) {
    out.push(`**${WHO[e.who] || e.who}**${e.phase === "confer" ? " (to each other)" : ""} · ${clock(e.at)}  `,
             e.failed ? "_It laid something and would not say why._" : (e.text || "_(nothing)_"));
    if (e.taken && e.taken.length) out.push("", `> read as: ${e.taken.join(", ")}`);
    if (e.who === "builder" && e.built) out.push("", `> built: ${e.built}`);
    out.push("");
  }
  out.push(`## What stands`, "", s.standing || "nothing built", "");
  if (s.provenance && s.provenance.length) {
    out.push(`### Where it came from`, "");
    for (const x of s.provenance)
      out.push(`- ${x.byA && x.byB ? "both" : x.byA ? "Role 1" : x.byB ? "Role 2" : "neither of them"} — ${x.description}`);
    out.push("");
  }
  if (s.score) {
    out.push(`## Needs met${s.finished ? "" : " so far"}`, "");
    for (const r of ["A", "B"]) {
      const p = s.score.per[r];
      out.push(`**${WHO[r]} — ${p.met} of ${p.of}**`, "");
      for (const n of p.needs) out.push(`- ${n.met ? "✓" : "✗"} ${n.text}`);
      out.push("");
    }
  }
  return out.join("\n");
}

function push(roomId) {
  const room = rooms.get(roomId);
  try { record(room); } catch (e) { console.error(`could not save ${roomId}: ${e.message}`); }
  for (const s of streams.get(roomId) || [])
    s.res.write(`data: ${JSON.stringify(view(room, s.role))}\n\n`);
}

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const body = req => new Promise((resolve, reject) => {
  let b = ""; req.on("data", d => { b += d; if (b.length > 3e7) reject(new Error("too big")); });
  req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
});

// ── the builder's turn ────────────────────────────────────────────────────
// It reads the line, puts what it took into the context, builds, and says what
// it did. Under `defer` it holds off until the script has run out and then does
// all of that once, from everything at once.
async function builderTurn(room, line) {
  const route = ROUTES[room.route];
  const reads = !route.reads || route.reads === line.who;
  if (line.phase === "confer" || !reads) return;
  room.thinking = true; push(room.id);
  try {
    const { asks, refuses } = await readLine(line.text);
    line.taken = [...asks, ...refuses];
    // Kept apart as well, so a room can be heard again after a restart exactly
    // as it was heard the first time.
    line.asks = asks; line.refuses = refuses;
    newTurn(room.ctx);
    hear(room.ctx, line.who, "want", asks);
    hear(room.ctx, line.who, "avoid", refuses);
    if (route.defer && room.turn < route.script.length) { room.thinking = false; return; }
    await lay(room, line, [...asks, ...refuses]);
  } catch (e) {
    // A failure here is not something the agent said. It was going into the
    // transcript as a builder line, so the trace showed an exception where its
    // words belong — and with built:null, as though nothing had been laid, when
    // in fact the choosing and the building had both already succeeded and only
    // the sentence explaining them was refused.
    room.transcript.push({ who: "builder", failed: e.message, text: "",
                           built: room.standing ? NAME(room.standing) : null,
                           phase: "main", at: Date.now() });
  } finally { room.thinking = false; }
}

async function lay(room, line, took) {
  const before = room.standing;
  build(room.ctx);                                   // the scoring rule, to compare against
  const said = room.transcript.filter(e => e.who !== "builder" && e.phase === "main")
                              .map(e => ({ who: e.who === "A" ? "Role 1" : "Role 2", text: e.text }));
  const chose = await chooseBuild({
    wants: [...room.ctx.wants.keys()], avoids: [...room.ctx.avoids.keys()],
    standing: before ? NAME(before) : null, said,
  });
  if (chose.id) room.ctx.design = KIT.find(k => k.id === chose.id);
  const after = room.ctx.design ? room.ctx.design.id : null;
  room.standing = after;
  const say = await speak({
    said: line ? line.text : said.map(s => s.text).join(" "),
    took, before: before ? NAME(before) : null, after: NAME(after),
    props: room.ctx.design ? room.ctx.design.has : [],
    wants: [...room.ctx.wants.keys()], avoids: [...room.ctx.avoids.keys()],
    changed: before !== after,
  });
  room.transcript.push({ who: "builder", text: say, phase: "main", built: NAME(after), at: Date.now() });
}

// What each of them needed, and whether the thing that stands has it. Computed
// only at the end, and only ever shown in the host view.
function scoreRoom(room) {
  const arg = ARGUMENTS[room.argument];
  const shape = room.ctx.design ? room.ctx.design.shape : null;
  const hasProps = shape ? propsOf(shape) : [];
  const world = Object.keys(room.ctx.world || {}).filter(k => room.ctx.world[k]);
  const got = [...hasProps, ...world];
  const per = {};
  for (const r of ["A", "B"]) {
    const needs = (room.uploads[r] && room.uploads[r].needs) || arg[r].needs || [];
    per[r] = { needs: needs.map(f => ({ key: f, text: FEATURES[f], met: got.includes(f) })),
               met: needs.filter(f => got.includes(f)).length, of: needs.length };
  }
  return { built: room.standing ? NAME(room.standing) : null, has: got, per };
}

// Rooms come back after a restart. Each is rebuilt from its record by hearing
// every line again in the order it was said — the same calls the builder's turn
// made — so what it wants, what it avoids and who named what are exactly as they
// were. What stands is put back as it stood rather than rebuilt, because it was
// the builder's choice and not the scoring rule's.
function restore() {
  const dir = path.join(here, "sessions"), pics = path.join(here, "uploads");
  let n = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (!ARGUMENTS[rec.argument] || !ROUTES[rec.route]) continue;
      const ctx = mkCtx();
      for (const e of rec.transcript) {
        if (e.who === "builder" || !(e.asks || e.refuses)) continue;
        newTurn(ctx);
        hear(ctx, e.who, "want", e.asks || []);
        hear(ctx, e.who, "avoid", e.refuses || []);
      }
      Object.assign(ctx.world, rec.world || {});
      ctx.design = KIT.find(k => k.id === rec.standingId) || null;
      // The picture itself was never in the record; it is still on disk.
      const uploads = {};
      for (const [role, u] of Object.entries(rec.uploads || {})) {
        const pic = fs.readdirSync(pics).find(x => x.startsWith(`${rec.room}-${role}.`));
        const ext = pic ? pic.split(".").pop() : null;
        const media = ext ? `image/${ext === "svg" ? "svg+xml" : ext}` : null;
        uploads[role] = { ...u, media, dataUrl: pic
          ? `data:${media};base64,${fs.readFileSync(path.join(pics, pic)).toString("base64")}` : null };
      }
      rooms.set(rec.room, { id: rec.room, argument: rec.argument, route: rec.route, ctx,
        turn: rec.turn ?? rec.transcript.filter(e => e.who !== "builder").length,
        transcript: rec.transcript, uploads, standing: rec.standingId ?? null, thinking: false,
        finished: !!rec.finished, score: rec.finished ? rec.score : undefined,
        claimed: rec.claimed || {}, createdAt: rec.createdAt });
      streams.set(rec.room, new Set());
      n++;
    } catch (e) { console.error(`could not restore ${f}: ${e.message}`); }
  }
  return n;
}

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (req.method === "GET" && p === "/draw.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(here, "draw.js"), "utf8"));
  }

  // /j/<room>/A and /B are one person each, on their own device. /j/<room>/both
  // is the pair of them on one screen — two people at one laptop, or one person
  // testing alone. Each column still sees only what its own role is allowed to.
  if (req.method === "GET" && (p === "/" || p === "/sessions" || p === "/history" || /^\/history\/[a-z0-9]+$/.test(p) || /^\/j\/[a-z0-9]+(\/(A|B|both))?$/.test(p))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(path.join(here, "app.html"), "utf8"));
  }

  if (p === "/api/options") return json(res, 200, {
    arguments: Object.entries(ARGUMENTS).map(([k, v]) => ({ id: k, title: v.title, blurb: v.blurb, upload: !!v.upload })),
    routes: Object.entries(ROUTES).map(([k, v]) => ({ id: k, arrow: v.arrow, note: v.note })),
  });

  if (p === "/api/create" && req.method === "POST") {
    const { argument, route } = await body(req);
    if (!ARGUMENTS[argument] || !ROUTES[route]) return json(res, 400, { error: "unknown argument or route" });
    // Never reuse the name of a session already on disk, or its record goes.
    let id = code();
    while (rooms.has(id) || fs.existsSync(path.join(here, "sessions", `${id}.json`))) id = code();
    rooms.set(id, { id, argument, route, ctx: mkCtx(), turn: 0, transcript: [],
                    uploads: {}, standing: null, thinking: false, finished: false,
                    createdAt: new Date().toISOString() });
    streams.set(id, new Set());
    return json(res, 200, { room: id });
  }

  // Every session on record, newest first, read from disk so that rooms from
  // before a restart are still listed. Empty rooms — opened and never spoken in,
  // which is what switching the filters leaves behind — are left out.
  if (p === "/api/sessions") {
    const dir = path.join(here, "sessions");
    const list = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
    }).filter(s => s && s.transcript && s.transcript.length)
      .map(s => ({ room: s.room, title: s.title, arrow: s.arrow, createdAt: s.createdAt,
                   updatedAt: s.updatedAt, finished: s.finished, standing: s.standing,
                   lines: s.transcript.filter(e => e.who !== "builder").length,
                   live: rooms.has(s.room) && !s.finished }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return json(res, 200, list);
  }

  // One session, to keep: the chat as a readable page, or the whole record.
  if (p === "/api/export") {
    const id = url.searchParams.get("room") || "";
    const file = path.join(here, "sessions", `${id}.json`);
    if (!/^[a-z0-9]+$/.test(id) || !fs.existsSync(file))
      return json(res, 404, { error: "nothing saved for that room yet" });
    const rec = JSON.parse(fs.readFileSync(file, "utf8"));
    const md = url.searchParams.get("format") !== "json";
    res.writeHead(200, {
      "content-type": md ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="session-${id}.${md ? "md" : "json"}"`,
    });
    return res.end(md ? toMarkdown(rec) : JSON.stringify(rec, null, 2));
  }

  const room = rooms.get(url.searchParams.get("room") || "");
  if (p === "/api/state") {
    if (!room) return json(res, 404, { error: "no such room" });
    return json(res, 200, view(room, url.searchParams.get("role") || "host"));
  }

  if (p === "/events") {
    if (!room) return json(res, 404, { error: "no such room" });
    const role = url.searchParams.get("role") || "host";
    // A proxy in the way — a Cloudflare tunnel, in practice — will compress an
    // event stream and hold it back until it has enough to send, which for a
    // stream that speaks once a minute means never. `no-transform` stops the
    // compressing, X-Accel-Buffering stops the holding, the padding pushes the
    // first message past whatever it is still waiting to fill, and the heartbeat
    // keeps an idle connection from being closed in the quiet between turns.
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "content-encoding": "identity",
      connection: "keep-alive",
    });
    res.write(`:${" ".repeat(2048)}\n\n`);
    res.write(`data: ${JSON.stringify(view(room, role))}\n\n`);
    const entry = { res, role };
    streams.get(room.id).add(entry);
    const beat = setInterval(() => res.write(`: keepalive\n\n`), 15000);
    req.on("close", () => { clearInterval(beat); streams.get(room.id)?.delete(entry); });
    return;
  }

  // One link goes to both people and each takes a side. A side already taken is
  // reported back rather than refused outright: somebody reloading on a second
  // device, or swapping seats, should not be locked out of their own session.
  if (p === "/api/claim" && req.method === "POST") {
    const { room: id, role } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
    const taken = !!r.claimed?.[role];
    r.claimed = { ...(r.claimed || {}), [role]: true };
    push(id);
    return json(res, 200, { ok: true, wasTaken: taken });
  }

  if (p === "/api/upload" && req.method === "POST") {
    const { room: id, role, dataUrl } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl || "");
    if (!m) return json(res, 400, { error: "that did not look like an image" });
    try {
      const read = await readPicture(m[2], m[1]);
      fs.writeFileSync(path.join(here, "uploads", `${id}-${role}.${m[1].split("/")[1].replace("+xml", "")}`),
                       Buffer.from(m[2], "base64"));
      r.uploads[role] = { dataUrl, media: m[1], ...read };
      push(id);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 502, { error: e.message }); }
  }

  if (p === "/api/say" && req.method === "POST") {
    const { room: id, role, text } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (r.finished) return json(res, 409, { error: "this session is over" });
    const script = ROUTES[r.route].script;
    if (r.turn >= script.length) return json(res, 409, { error: "there are no turns left" });
    if (script[r.turn] !== role) return json(res, 409, { error: "it is not your turn" });
    const clean = String(text || "").trim();
    if (!clean) return json(res, 400, { error: "say something first" });
    if (ARGUMENTS[r.argument].upload && !r.uploads[role])
      return json(res, 409, { error: "upload your picture first" });

    const line = { who: role, text: clean, phase: phaseOf(r, r.turn), at: Date.now() };
    r.transcript.push(line);
    r.turn++;
    push(id);
    json(res, 200, { ok: true });

    await builderTurn(r, line);
    // A deferred route lays once, after the last line, from everything it heard.
    if (ROUTES[r.route].defer && r.turn >= script.length && !r.standing) {
      r.thinking = true; push(id);
      try { await lay(r, null, []); } catch (e) {
        r.transcript.push({ who: "builder", failed: e.message, text: "",
                            built: r.standing ? NAME(r.standing) : null,
                            phase: "main", at: Date.now() });
      } finally { r.thinking = false; }
    }
    return push(id);
  }

  if (p === "/api/finish" && req.method === "POST") {
    const { room: id } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    r.finished = true;
    r.score = scoreRoom(r);
    push(id);                                          // which also saves it
    return json(res, 200, r.score);
  }

  res.writeHead(404); res.end("not found");
});

const back = restore();
srv.listen(PORT, () => {
  console.log(`\n  Two worlds, one builder — user test`);
  console.log(`  ${back} room${back === 1 ? "" : "s"} brought back from sessions/`);
  console.log(`  Facilitator console:  http://localhost:${PORT}/\n`);
});
