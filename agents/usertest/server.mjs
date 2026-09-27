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
import { readLine, chooseBuild, speak, readPicture, relay, sketch, readLineB, chooseBuildB, propose,
         wallHear, wallDecide, relayFromWall, chooseBuildT, readPictureToolkit, toolkitReply } from "./builder.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8780);
// Overridable so a test run can keep its sessions and pictures out of the real
// ones — the history page reads whatever is in SESSIONS.
const SESSIONS = process.env.SESSIONS_DIR || path.join(here, "sessions");
const UPLOADS = process.env.UPLOADS_DIR || path.join(here, "uploads");
fs.mkdirSync(path.join(UPLOADS), { recursive: true });
fs.mkdirSync(path.join(SESSIONS), { recursive: true });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("No ANTHROPIC_API_KEY. Run with:  node --env-file=../.env usertest/server.mjs");
  process.exit(1);
}

// The address people outside this network can use, which is what every link
// handed out should carry — not whatever address the facilitator happened to
// open the page on. PUBLIC_URL pins one; otherwise it is read from the quick
// tunnel's log on every request, because a quick tunnel gets a new address each
// time it starts.
const TUNNEL_LOG = process.env.TUNNEL_LOG || "/tmp/tunnel2.log";
// The use cases the desk offers. The others stay in the code, and every room
// already run on them still opens — they are just not offered for new rooms.
// STUDY_ARGUMENTS=places,loads,agreed,pairs,refs puts them all back.
const STUDY = (process.env.STUDY_ARGUMENTS || "pairs,refs").split(",").map(x => x.trim()).filter(x => x in ARGUMENTS);
function publicUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  try {
    const found = fs.readFileSync(TUNNEL_LOG, "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    return found ? found[found.length - 1] : null;
  } catch { return null; }
}

const modeOf = room => room.agent || "both";
const rooms = new Map();
// Profiles associate independent conversations without mixing their transcripts.
const PROFILES = path.join(SESSIONS, "..", "profiles.json");
let profiles = fs.existsSync(PROFILES) ? JSON.parse(fs.readFileSync(PROFILES,"utf8")) : [
  {id:"user1",name:"用户 1",sessions:[]}, {id:"user2",name:"用户 2",sessions:[]}
];
// A profile is a collaboration pair, not an individual participant.
profiles = profiles.map((u,i)=>({...u,participants:u.participants || [1,u.id==="user2"?2:u.id==="user1"?3:i+2]}));
function saveProfiles() {
  fs.writeFileSync(PROFILES+".tmp",JSON.stringify(profiles,null,2));
  fs.renameSync(PROFILES+".tmp",PROFILES);
}
function profileRoom(argument,route,agent) {
  let id=code();
  while(rooms.has(id)||fs.existsSync(path.join(SESSIONS,`${id}.json`))) id=code();
  const r={id,argument,route,agent,ctx:mkCtx(),turn:0,transcript:[],uploads:{},standing:null,
    thinking:false,finished:false,sketches:[],wall:agent==="toolkit"?newWall():null,control:null,retro:{},createdAt:new Date().toISOString()};
  record(r); rooms.set(id,r); streams.set(id,new Set()); return id;
}
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
  if(profiles.some(u=>u.sessions.some(x=>x.room===room.id && x.historical))) room={...room,finished:true,archived:true};
  const arg = ARGUMENTS[room.argument], route = ROUTES[room.route];
  const inspect = role === "host" || !!route.develop || !!route.open;
  const script = route.script;
  // On the open routes nobody waits for a turn: both talk as they like and
  // confirm a decision to the builder when they have one.
  const open = !!route.open, dev = !!route.develop;
  const turn = open ? null : (room.turn < script.length ? script[room.turn] : null);
  return {
    room: room.id, argument: room.argument, route: room.route, archived:!!room.archived,
    title: arg.title, blurb: arg.blurb, arrow: route.arrow, note: route.note,
    role,
    goal: role === "host" ? null : arg[role].goal,
    upload: !!arg.upload,
    uploaded: role === "host"
      ? { A: !!room.uploads.A, B: !!room.uploads.B }
      : !!room.uploads[role],
    picture: role === "host" ? null : (room.uploads[role] || null),
    needsUpload: !!arg.upload && role !== "host" && !room.uploads[role],
    // Shown means handed over as this person's turn — not merely brought along.
    shown: role === "host" ? null : room.transcript.some(e => e.who === role && e.upload),
    defer: !!route.defer,
    turn, open, yourTurn: open ? !room.finished && role !== "host" : turn === role,
    // How many lines this person has in the route at all; 0 on the routes they
    // are not part of, so the page can say so instead of waiting on them.
    speaks: role === "host" ? null : open ? 1 : script.filter(x => x === role).length,
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
    provenance: role === "host" ? (modeOf(room) === "toolkit" ? [] : room.wall ? wallProvenance(room) : provenance(room.ctx).feats) : null,
    thinking: room.thinking,
    // Condition B. Both people see the bridge, what it has, what changed, the
    // AI's reading of every line (marked as its guess), and at the end what was
    // left unresolved. On every other route these stay with the facilitator.
    develop: dev,
    // With the wall on, the builder keeps a card per need. The facilitator
    // always sees the wall; on condition B both people do — it is the thing they
    // respond to. On the other routes a person's page stays as it was.
    agent: modeOf(room),
    control: room.control && (role === "host" || dev) ? {
      standing: room.control.standing ? NAME(room.control.standing) : null,
      shape: room.control.ctx.design ? room.control.ctx.design.shape : null,
      world: { ...room.control.ctx.world },
      provenance: role === "host" ? provenance(room.control.ctx).feats : null,
      lines: room.control.lines,
      score: room.finished ? (room.controlScore || null) : null,
    } : null,
    wall: room.wall && (role === "host" || dev) ? room.wall : null,
    sheet: room.wall && (role === "host" || dev) ? room.wall.sheet || [] : null,
    // What both people accepted onto the sheet, sorted into what the drawing
    // can show as an added layer and what it cannot (rules, mostly).
    sheetDrawn: room.wall && (role === "host" || dev) ? sheetDrawn(room) : null,
    retro: role === "host" ? (room.retro || {}) : room.retro && room.retro[role] ? { [role]: room.retro[role] } : {},
    bothSpoke: dev ? bothSpoke(room) : null,
    props: dev && room.ctx.design ? room.ctx.design.has.map(f => ({ key: f, text: FEATURES[f] })) : [],
    unresolved: dev ? unresolved(room) : null,
    // A drawing made from the words alone, beside the crossing made from the
    // keys. Facilitator only, like the keys: it is a check on the pipeline, not
    // part of the conversation.
    sketching: !!room.sketching,
    sketchError: role === "host" ? (room.sketchError || null) : null,
    sketches: role === "host" ? (room.sketches || []).map(k => ({ n: k.n, at: k.at, turn: k.turn, lines: k.lines, retrospective: !!k.retrospective, source:k.source, references:k.references })) : null,
    finished: room.finished,
    score: room.finished ? room.score : null,
    lines: room.transcript.map((e, i) => ({ e, i })).filter(({ e }) => visible(room, e, role))
      .map(({ e, i }) => ({ who: e.who, text: e.text, phase: e.phase, built: e.built || null,
        ...(e.decision ? { decision: true } : {}),
        ...(e.talk ? { talk: true } : {}),
        ...(e.upload ? { upload: true } : {}),
        ...(e.relay ? { relay: true, about: e.about } : {}),
        // It laid something and would not say why. Distinct from saying nothing,
        // and the trace should not show an empty bubble as though it had.
        ...(e.failed ? { failed: e.failed } : {}),
        // What it read out of that line. These are the latent keys, so they go
        // to the facilitator alone — showing a participant the vocabulary it is
        // scored against would teach them the words the study is about them not
        // having. The dashboard draws its agent panels from the host stream, so
        // it loses nothing by this.
        ...((role === "host" || dev) && e.taken ? { taken: e.taken, asks: e.asks || [], refuses: e.refuses || [] } : {}),
        // What keys alone heard in the same line, kept beside the wall's hearing.
        ...((role === "host" || dev) && e.keysRead ? { keysRead: e.keysRead } : {}),
        // The wall's trace for this line: which cards it made, which tools fired,
        // and the question it asked, if the route allowed one.
        ...((role === "host" || dev || route.open) && e.cards ? { cards: e.cards, tools: e.tools || [], ask: e.ask || "", memberCheck: e.memberCheck || "" } : {}),
        ...((role === "host" || dev) && e.steps ? { steps: e.steps } : {}),
        // Condition B: the line's number (to answer or correct it), what it asked
        // for that no key carries, what it was about, what it built on, how it
        // was corrected, and for the AI's lines what changed and what else it offered.
        ...(inspect ? { i,
          ...(e.interpretations ? {interpretations:e.interpretations} : {}),
          ...(e.decisionSnapshot ? {decisionSnapshot:e.decisionSnapshot} : {}),
          ...(e.beyond ? { beyond: e.beyond } : {}),
          ...(e.part ? { part: e.part } : {}),
          ...(Number.isInteger(e.replyTo) ? { replyTo: e.replyTo } : {}),
          ...(e.corrected ? { corrected: e.corrected, was: e.was || null } : {}),
          ...(e.prefer ? { prefer: e.prefer } : {}),
          ...(e.proposal ? { proposal: true } : {}),
          ...(e.diff ? { diff: e.diff } : {}),
          ...(e.alt ? { alt: e.alt, altTaken: e.altTaken || null } : {}),
          ...(e.chosenBy ? { chosenBy: e.chosenBy } : {}),
          ...(e.sheet ? { sheet: e.sheet } : {}) } : {}),
        // What it saw in that person's picture, for the facilitator's trace.
        ...(role === "host" && e.picture ? { picture: e.picture } : {}) })),
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
    route: room.route, arrow: route.arrow, version: route.develop ? "B" : "A",
    agent: modeOf(room), wall: room.wall || null, retro: room.retro || {},
    sheetDrawn: room.wall ? sheetDrawn(room) : null,
    control: room.control ? { standingId: room.control.standing, lines: room.control.lines,
                              standing: room.control.standing ? NAME(room.control.standing) : null,
                              shape: room.control.ctx.design ? room.control.ctx.design.shape : null,
                              world: { ...room.control.ctx.world }, score: room.controlScore || null } : null,
    createdAt: room.createdAt, updatedAt: new Date().toISOString(),
    finished: room.finished,
    // Enough to carry on from, not only to read back.
    turn: room.turn, claimed: room.claimed || {}, standingId: room.standing,
    goals: { A: arg.A.goal, B: arg.B.goal },
    // The pictures are theirs; the record keeps what was read off them, not the
    // image. The files already on disk are gitignored.
    uploads: Object.fromEntries(Object.entries(room.uploads)
      .map(([k, v]) => [k, { shape: v.shape, needs: v.needs, description: v.description, saw: v.saw }])),
    transcript: room.transcript.map(e => ({ ...e })),
    standing: room.standing ? NAME(room.standing) : null,
    shape: room.ctx.design ? room.ctx.design.shape : null,
    // The ground under it, so the crossing can be drawn again from the record.
    world: { ...room.ctx.world },
    provenance: modeOf(room) === "toolkit" ? [] : room.wall ? wallProvenance(room) : provenance(room.ctx).feats,
    // Needs met so far, even before End is pressed; `finished` says which.
    score: room.score || scoreRoom(room),
    // The sketches are files beside the pictures; the record keeps when and
    // from how much of the chat each was drawn, and the prompt it was drawn from.
    sketches: (room.sketches || []).map(k => ({ n: k.n, at: k.at, turn: k.turn, lines: k.lines, media: k.media, prompt: k.prompt, retrospective: !!k.retrospective, source: k.source, references:k.references, model: k.model })),
  };
  // Written aside and moved into place, so a restart mid-write leaves the last
  // good record rather than half of a new one.
  const file = path.join(SESSIONS, `${room.id}.json`);
  fs.writeFileSync(file + ".tmp", JSON.stringify(rec, null, 2));
  fs.renameSync(file + ".tmp", file);
}

const WHO = { A: "Role 1", B: "Role 2", builder: "AI" };
const clock = t => (t ? new Date(t).toLocaleTimeString() : "");

// The same record, as something a person can read.
function toMarkdown(s) {
  const out = [
    `# ${s.title} — room ${s.room}`, "",
    `- Route: ${s.arrow}`, `- Processing mode: ${s.agent || "both (legacy)"}`,
    `- Started: ${s.createdAt ? new Date(s.createdAt).toLocaleString() : "?"}`,
    `- Last change: ${new Date(s.updatedAt).toLocaleString()}`,
    `- Ended: ${s.finished ? "yes" : "no — saved as it stood"}`, "",
    `## Goals`, "",
    `**Role 1:** ${s.goals.A}`, "",
    `**Role 2:** ${s.goals.B}`, "",
    `## Conversation`, "",
  ];
  for (const e of s.transcript) {
    out.push(`**${WHO[e.who] || e.who}**${e.relay ? ` (passing on ${WHO[e.about] || e.about})` : e.decision ? " (confirmed to the builder)" : e.phase === "confer" ? " (to each other)" : ""} · ${clock(e.at)}  `,
             e.failed ? "_It laid something and would not say why._" : (e.text || "_(nothing)_"));
    if (s.agent !== "toolkit" && e.taken && e.taken.length) out.push("", `> read as: ${e.taken.join(", ")}`);
    if (e.picture && e.picture.length) out.push("", `> saw in their picture: ${e.picture.join(", ")}`);
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

// One room, one line at a time. Two people typing at once on condition B would
// otherwise read and build in parallel over the same tally.
const enqueue = (room, fn) => (room.queue = (room.queue || Promise.resolve()).then(fn, fn));

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
const body = req => req.parsedBody || (req.parsedBody = new Promise((resolve, reject) => {
  let b = ""; req.on("data", d => { b += d; if (b.length > 3e7) reject(new Error("too big")); });
  req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
}));

// ── the wall ──────────────────────────────────────────────────────────────
// The Toolmakers' Kit as the builder's hearing and thinking. One card per need,
// kept for the room; the tools fire on their triggers and leave a trace on the
// card and in the log; before a build a decision record; after it, every card
// linked to what stands. The same tally and the same kit sit underneath, so a
// room with the wall on builds from the same keys as one with it off.
const newWall = () => ({ cards: [], log: [], record: null, sheet: [] });
// The control agent: the keys-only reader, its own tally, the same chooser with
// no record, the same speaker. It builds beside the toolkit agent from the same
// words, so a room shows two bridges from two hearings. Participants hear the
// toolkit agent; the control agent's lines are kept for the desk.
const newControl = () => ({ ctx: mkCtx(), standing: null, lines: [], seenPicture: {} });
const FACILITATOR_TOOLS = new Set(["dot-voting", "priority-check", "card-sort", "repertory-grid", "wizard-of-oz"]);
// What is on the sheet and still waiting for both of them.
const pending = room => (room.wall?.sheet || []).filter(p => !(p.accepted.A && p.accepted.B) && !p.declined);

// Which of the route's people this speaker may be asked a question: only where
// the route lets them hear the builder at all, and only where the conversation
// goes on afterwards.
const canAskOn = (room, who) => {
  const r = ROUTES[room.route];
  return !!(r.open && r.see[who] && r.see[who].echo);
};

// Hear one line, both ways. The keys-only reader — the one every recorded
// session used — reads it first and its reading is kept on the line for
// comparison; then the wall hears it, and the wall's keys are what feed the
// tally and the build. Two hearings of the same words, side by side.
function captureReading(room,line,reading) {
  const snapshots=line.interpretations ||= [];
  snapshots.push(structuredClone({version:snapshots.length+1,at:Date.now(),line:room.transcript.indexOf(line),who:line.who,source:line.upload ? "Submitted reference image" : line.text,...(line.upload && reading.kind === "toolkit" ? {observation:line.text} : {}),...reading}));
}
async function hearLine(room, line) {
  const dev = !!ROUTES[room.route].develop;
  if (modeOf(room) !== "toolkit") {
    const base = dev ? await readLineB(line.text) : await readLine(line.text);
    line.asks = base.asks; line.refuses = base.refuses; line.beyond = base.beyond || "";
    line.taken = [...base.asks,...base.refuses];
    if (modeOf(room) === "keys") { captureReading(room,line,{kind:"keys",asks:line.asks,refuses:line.refuses,beyond:line.beyond}); return; }
    line.keysRead = base;
    room.control ||= newControl();
    newTurn(room.control.ctx);
    hear(room.control.ctx, line.who, "want", base.asks);
    hear(room.control.ctx, line.who, "avoid", base.refuses);
  }
  room.wall ||= newWall();
  if (modeOf(room) === "toolkit") room.wall.kind = "toolkit";
  const route = ROUTES[room.route];
  const heard = await wallHear({
    pureToolkit: modeOf(room) === "toolkit",
    routeNote: `${route.arrow}. ${route.note}`,
    canAsk: canAskOn(room, line.who),
    wall: room.wall, line: line.text, speaker: WHO[line.who],
  });
  const at = Date.now(), index = room.transcript.indexOf(line);
  const ids = [];
  for (const c of heard.cards) {
    const id = "n" + (room.wall.cards.length + 1);
    // On a route where this speaker cannot have heard the other, a card about
    // the other person can only be reported or inferred — never direct.
    // ...and nobody reports their own need: what the speaker says of themselves is direct.
    const via = c.who === line.who ? "direct" : c.via === "direct" ? `reported-by-${line.who}` : c.via;
    room.wall.cards.push({ ...c, id, via, line: index, at, met: null, changes: [], withdrawn: false });
    ids.push(id);
  }
  for (const u of heard.updates) {
    const card = room.wall.cards.find(c => c.id === u.id);
    if (card) { card.changes.push({ at, line: index, change: u.change }); if (/withdr|no longer|drop/i.test(u.change)) card.withdrawn = true; }
  }
  const tools = heard.tools.map(t => ({ ...t, facilitatorRun: FACILITATOR_TOOLS.has(t.tool) }));
  // The member check: offered where the person can hear and answer; otherwise
  // the uncertainty is kept and said so.
  const memberCheck = canAskOn(room, line.who) ? "offered — they can correct what was taken" : "not possible on this route — uncertainty kept";
  room.wall.log.push({ at, line: index, who: line.who, tools, cards: ids, ask: heard.ask, memberCheck });
  const mine = room.wall.cards.filter(c => ids.includes(c.id));
  line.asks = [...new Set(mine.flatMap(c => c.keys))].slice(0, 3);
  line.refuses = [...new Set(mine.flatMap(c => c.rulesOut))].slice(0, 3);
  line.taken = [...line.asks, ...line.refuses];
  line.beyond = modeOf(room) === "toolkit" ? "" : mine.filter(c => !c.keys.length).map(c => c.need).join("; ");
  line.cards = ids; line.tools = tools; line.ask = heard.ask; line.memberCheck = memberCheck;
  const affected = new Set([...ids,...heard.updates.map(u=>u.id)]);
  captureReading(room,line,{kind:"toolkit",cards:room.wall.cards.filter(c=>affected.has(c.id)),tools,updates:heard.updates,ask:heard.ask,memberCheck});
}

// What the wall took from one line, in its own words — for the spoken line.
function wallTookOf(room, line) {
  const mine = room.wall ? room.wall.cards.filter(c => (line.cards || []).includes(c.id) && !c.withdrawn) : [];
  return mine.map(c => c.need + (c.rulesOut.length ? " (ruling out " + c.rulesOut.map(k => FEATURES[k]).join("; ") + ")" : "")).join("; ");
}
// Whose need each feature of the toolkit's bridge answers, read off the wall.
function wallProvenance(room) {
  if (!room.ctx.design) return [];
  return room.ctx.design.has.map(f => {
    const who = new Set(room.wall ? room.wall.cards.filter(c => !c.withdrawn && c.keys.includes(f)).map(c => c.who) : []);
    return { feature: f, description: FEATURES[f], byA: who.has("A"), byB: who.has("B") };
  });
}
const activeCards = room => room.wall ? room.wall.cards.filter(c => !c.withdrawn) : [];
// Accepted sheet items the drawing can show: a footway, a gate, a kerb, a
// sealed surface. Everything else accepted is listed as not drawable.
function sheetDrawn(room) {
  const out = { footway: false, gate: false, kerb: false, sealed: false, drawn: [], other: [] };
  for (const p of room.wall?.sheet || []) {
    if (p.declined || !(p.accepted.A && p.accepted.B)) continue;
    const w = p.what.toLowerCase(); let hit = null;
    if (p.kind === "new" && /footway|walkway|pavement|sidewalk|foot ?path|walking (side|lane|path)|pedestrian/.test(w)) hit = "footway";
    else if (p.kind === "new" && /gate|barrier/.test(w)) hit = "gate";
    else if (p.kind === "new" && /kerb|curb|step|raised edge/.test(w)) hit = "kerb";
    else if (p.kind === "new" && /seal|smooth|even surface|paved|cement|asphalt/.test(w)) hit = "sealed";
    if (hit) { out[hit] = true; out.drawn.push({ what: p.what, as: hit }); } else out.other.push({ what: p.what, kind: p.kind });
  }
  return out;
}

// The decision record, before a build; rendered for the chooser as well.
async function decideWall(room) {
  if (!room.wall) return { record: "", unsupported: [], proposals: [] };
  const rec = await wallDecide({ wall: room.wall, standing: room.standing ? NAME(room.standing) : null,
                                 props: room.ctx.design ? room.ctx.design.has : [], pureToolkit: modeOf(room) === "toolkit" });
  // A card no key carries cannot be answered with a part, whatever the record
  // says: the link to what stands is structural, and the record must agree.
  const keyless = new Set(room.wall.cards.filter(c => !c.keys.length).map(c => c.id));
  for (const d of modeOf(room) === "toolkit" ? [] : rec.decisions) {
    if (d.response === "part" && keyless.has(d.id)) d.response = "none";
    // ...and a need the kit already carries is answered with the part, never a new one.
    if (d.response === "new" && !keyless.has(d.id)) d.response = "part";
  }
  room.wall.record = { ...rec, at: Date.now() };
  const byId = Object.fromEntries(room.wall.cards.map(c => [c.id, c]));
  // Rules and new parts go on the sheet, once per card, to be accepted by both.
  // Nothing on the sheet counts as built until it is.
  room.wall.sheet = room.wall.sheet || [];
  for (const d of rec.decisions) {
    if (d.response !== "rule" && d.response !== "new") continue;
    // Declined once is declined: it is not put back on the sheet, and the
    // record says "none" for that card until somebody raises it again.
    if (room.wall.sheet.some(p => p.cardId === d.id && p.declined)) { d.response = "none"; continue; }
    const had = room.wall.sheet.find(p => p.cardId === d.id && !p.declined);
    if (had) { had.kind = d.response; had.what = d.what; continue; }
    room.wall.sheet.push({ id: "s" + (room.wall.sheet.length + 1), cardId: d.id, kind: d.response, what: d.what,
                           by: "AI", proposedAt: Date.now(), accepted: {}, declined: false });
  }
  const record = rec.decisions.map(d => `  [${d.id}] ${byId[d.id].need} → ${d.response}: ${d.what}${d.uncertainty ? " (unsure: " + d.uncertainty + ")" : ""}`).join("\n")
    + (rec.conflicts.length ? "\n  conflicts: " + rec.conflicts.map(c => `${c.a}×${c.b} ${c.note}`).join("; ") : "");
  const unsupported = rec.decisions.filter(d => d.response === "none").map(d => byId[d.id].need);
  return { record, unsupported, proposals: pending(room).map(p => ({ kind: p.kind, what: p.what })) };
}

// After a build: every card against what stands. Met only when every key it
// carries is there; never because it was planned.
function linkWall(room) {
  if (!room.wall) return;
  if (modeOf(room) === "toolkit") {
    for (const c of room.wall.cards) {
      const item = (room.wall.sheet || []).find(p=>p.cardId===c.id && !p.declined);
      c.met = c.withdrawn ? null : item ? (item.accepted.A && item.accepted.B ? "accepted-proposal" : "proposed") : "unverified";
    }
    return;
  }
  const has = room.ctx.design ? room.ctx.design.has : [];
  for (const c of room.wall.cards) {
    if (c.withdrawn) continue;
    const item = (room.wall.sheet || []).find(p => p.cardId === c.id && !p.declined);
    if (item) { c.met = item.accepted.A && item.accepted.B ? (item.kind === "rule" ? "met-by-rule" : "met-by-new") : "proposed"; continue; }
    // A card that only rules something out is met when that thing is absent.
    if (!c.keys.length && c.rulesOut.length) { c.met = c.rulesOut.some(k => has.includes(k)) ? "no" : "met"; continue; }
    if (!c.keys.length) { c.met = "unsupported"; continue; }
    const hit = c.keys.filter(k => has.includes(k)).length;
    c.met = hit === c.keys.length ? "met" : hit ? "partial" : "no";
    if (c.met === "met" && c.rulesOut.some(k => has.includes(k))) c.met = "partial";
  }
}

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
    // A drawing carries no sentence to read; everything it asks for comes from
    // the picture itself, folded in below.
    if (line.upload && modeOf(room) === "toolkit") {
      const saved = line.text;
      line.text = "Reference image (visual observation, not confirmed intention): " + (room.uploads[line.who]?.description || "No description available");
      try { await hearLine(room,line); } finally { line.text = saved; }
    } else if (line.upload) { line.asks = []; line.refuses = []; line.taken = []; } else await hearLine(room, line);
    const asks = line.asks, refuses = line.refuses;
    newTurn(room.ctx);
    hear(room.ctx, line.who, "want", asks);
    hear(room.ctx, line.who, "avoid", refuses);
    // Two references. The first time the builder hears from somebody it also
    // looks at the crossing they brought, and takes what the picture shows as
    // asked for. It only ever sees the picture of someone it can hear, so the
    // route still decides whose meaning reaches it. (It used to see neither
    // picture, so "build it like mine" gave it nothing at all.)
    const pic = room.uploads[line.who];
    if (pic && Array.isArray(pic.needs) && !room.seenPicture?.[line.who]) {
      room.seenPicture = { ...(room.seenPicture || {}), [line.who]: true };
      line.picture = pic.needs.filter(f => f in FEATURES);
      hear(room.ctx, line.who, "want", line.picture);
    }
    if(line.upload && modeOf(room) === "keys") captureReading(room,line,{kind:"keys",asks:line.picture || [],refuses:[],beyond:""});
    // Talk the AI can hear is taken in and remembered, and nothing is built from
    // it yet; the next confirmed decision builds from everything heard so far.
    if (line.talk) { room.thinking = false; return; }
    // Deferred and relay routes build once, after the last line. On a relay route
    // every line before that is passed on instead: the AI tells the one who could
    // not hear it what it understood, in its own words, and builds nothing.
    const once = route.defer || route.relay;
    if (once && room.turn < route.script.length) {
      if (route.relay) {
        const to = line.who === "A" ? "Role 2" : "Role 1", from = line.who === "A" ? "Role 1" : "Role 2";
        const text = modeOf(room) === "toolkit" ? await toolkitReply({cards:activeCards(room),record:null,relayTo:to}) : room.wall
          ? await relayFromWall({ from, to, cards: room.wall.cards.filter(c => (line.cards || []).includes(c.id)) })
          : await relay({ from, to, said: line.text, asks: [...asks, ...(line.picture || [])], refuses });
        if (room.control && line.keysRead) {
          try { room.control.lines.push({ at: Date.now(), afterLine: room.transcript.indexOf(line), relay: true, about: line.who,
            text: await relay({ from, to, said: line.text, asks: [...line.keysRead.asks, ...(line.picture || [])], refuses: line.keysRead.refuses }), built: null }); }
          catch (e) { room.control.lines.push({ at: Date.now(), failed: e.message, text: "", relay: true, built: null }); }
        }
        room.transcript.push({ who: "builder", text, phase: "main", relay: true, about: line.who,
                               built: null, at: Date.now() });
      }
      room.thinking = false;
      return;
    }
    // Built once, from everyone it heard, so that is what it reports on — not
    // only the last line.
    if (once) {
      const heard = room.transcript.filter(e => e.who !== "builder" && e.taken);
      await lay(room, null, [...new Set(heard.flatMap(e => [...e.taken, ...(e.picture || [])]))]);
    } else {
      await lay(room, line, [...asks, ...refuses, ...(line.picture || [])]);
    }
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

async function layExclusive(room,line,develop,clarification) {
  const toolkit = modeOf(room) === "toolkit";
  const before = room.standing, beforeHas = room.ctx.design?.has || [];
  const said = room.transcript.filter(e=>e.who!=="builder" && e.phase==="main" && (!ROUTES[room.route].reads || ROUTES[room.route].reads===e.who)).map(e=>({who:WHO[e.who],text:e.corrected ? e.text + " — clarified: " + e.corrected : e.text}));
  const plan = toolkit ? await decideWall(room) : null;
  const choose = toolkit ? await chooseBuildT({cards:activeCards(room),record:plan.record,standing:before ? NAME(before):null,said,pictures:[]})
    : await chooseBuild({wants:[...room.ctx.wants.keys()],avoids:[...room.ctx.avoids.keys()],standing:before ? NAME(before):null,said,pictures:Object.entries(room.uploads).filter(([r])=>room.seenPicture?.[r]).map(([r,p])=>({who:WHO[r],needs:p.needs || []}))});
  if (choose.id) room.ctx.design = KIT.find(k=>k.id===choose.id) || room.ctx.design;
  room.standing = room.ctx.design?.id || null;
  const text = toolkit ? await toolkitReply({cards:activeCards(room),record:room.wall.record,before:before ? NAME(before):null,after:room.standing ? NAME(room.standing):null,change:clarification || line?.text,question:line?.ask || ""})
    : await speak({said:clarification || line?.text || said.map(x=>x.text).join(" "),took:line?.taken || [],before:before ? NAME(before):null,after:room.standing ? NAME(room.standing):null,props:room.ctx.design?.has || [],wants:[...room.ctx.wants.keys()],avoids:[...room.ctx.avoids.keys()],changed:before!==room.standing});
  if (toolkit) linkWall(room);
  room.transcript.push({who:"builder",text,phase:"main",built:room.standing ? NAME(room.standing):null,proposal:develop,at:Date.now(),...(toolkit ? {decisionSnapshot:structuredClone({at:Date.now(),sourceLine:line ? room.transcript.indexOf(line):null,cards:room.wall.cards,record:room.wall.record,sheet:room.wall.sheet,before:before ? NAME(before):null,after:room.standing ? NAME(room.standing):null}),steps:stepsFor(room,line || {})} : {diff:diffOf(room,beforeHas,room.ctx.design?.has || [])})});
}

async function lay(room, line, took) {
  if (modeOf(room) !== "both") return layExclusive(room,line,false);
  const before = room.standing;
  const said = room.transcript.filter(e => e.who !== "builder" && e.phase === "main" && (!ROUTES[room.route].reads || ROUTES[room.route].reads === e.who))
                              .map(e => ({ who: e.who === "A" ? "Role 1" : "Role 2", text: e.text }));
  const pictures = Object.keys(room.seenPicture || {})
    .filter(r => room.uploads[r]?.needs)
    .map(r => ({ who: r === "A" ? "Role 1" : "Role 2", needs: room.uploads[r].needs }));
  const { record, unsupported, proposals } = await decideWall(room);
  const chose = await chooseBuildT({ cards: activeCards(room), record, standing: before ? NAME(before) : null, said, pictures });
  if (chose.id) room.ctx.design = KIT.find(k => k.id === chose.id);
  const after = room.ctx.design ? room.ctx.design.id : null;
  room.standing = after;
  const say = await speak({
    said: line ? line.text : said.map(s => s.text).join(" "),
    took, before: before ? NAME(before) : null, after: NAME(after),
    props: room.ctx.design ? room.ctx.design.has : [],
    wants: [], avoids: [], changed: before !== after, unsupported, proposals,
    wallTook: line ? wallTookOf(room, line) : activeCards(room).map(c => c.need).join("; "),
  });
  linkWall(room);
  room.transcript.push({ who: "builder", text: say, phase: "main", built: NAME(after), at: Date.now(),
                         ...(room.wall ? { steps: stepsFor(room, line || {}) } : {}) });
  try { await layControl(room, line, line && line.keysRead ? [...line.keysRead.asks, ...line.keysRead.refuses] : took); }
  catch (e) { room.control?.lines.push({ at: Date.now(), failed: e.message, text: "", built: room.control.standing ? NAME(room.control.standing) : null }); }
}

// ── condition B: developing it together ──────────────────────────────────
const bothSpoke = room => ["A", "B"].every(r => room.transcript.some(e => e.who === r && e.taken));

// The tally, rebuilt from the transcript in order — after a correction changes
// what an earlier line was taken to mean. What stands is kept, so the tie rule
// still favours it.
function replay(room) {
  const ctx = mkCtx(), seen = {};
  for (const e of room.transcript) {
    if (e.who === "builder" || !(e.asks || e.refuses)) continue;
    newTurn(ctx);
    hear(ctx, e.who, "want", e.asks || []);
    hear(ctx, e.who, "avoid", e.refuses || []);
    if (e.picture) { hear(ctx, e.who, "want", e.picture); seen[e.who] = true; }
  }
  ctx.design = room.ctx.design;
  room.ctx = ctx; room.seenPicture = seen;
}

// What changed between two builds, and who had named each thing. "none" is a
// property nobody asked for — the kit's doing, not theirs.
function diffOf(room, beforeHas, afterHas) {
  const named = f => { const s = new Set(modeOf(room) === "keys" ? room.transcript.filter(e=>(e.asks || []).includes(f)).map(e=>e.who) : activeCards(room).filter(c => c.keys.includes(f)).map(c => c.who)); return !s.size ? "none" : s.has("A") && s.has("B") ? "both" : s.has("A") ? "A" : "B"; };
  const refused = f => { const rs = new Set(room.transcript.filter(e => (e.refuses || []).includes(f)).map(e => e.who));
                         return !rs.size ? "none" : rs.size === 2 ? "both" : [...rs][0]; };
  return {
    added:   afterHas.filter(f => !beforeHas.includes(f)).map(f => ({ key: f, text: FEATURES[f], by: named(f) })),
    removed: beforeHas.filter(f => !afterHas.includes(f)).map(f => ({ key: f, text: FEATURES[f], by: refused(f) })),
  };
}

// Everything asked for that no key can carry, in their words, once each.
function openBeyond(room) {
  const seen = new Set(), out = [];
  for (const e of room.transcript)
    if (e.who !== "builder" && e.beyond && !seen.has(e.beyond.toLowerCase())) { seen.add(e.beyond.toLowerCase()); out.push({ who: WHO[e.who], text: e.beyond }); }
  return out;
}

// What is still open between them: a thing one asked for and the other ruled
// out, and anything asked for that nothing in the kit can make. Shown to both
// at the end. Silence is not agreement, so nothing here is closed by default.
function unresolved(room) {
  if (modeOf(room) === "toolkit") return activeCards(room).map(c=>({kind:"unverified",who:WHO[c.who],text:c.need})).concat(pending(room).map(p=>({kind:"pending",what:p.what,pkind:p.kind,accepted:Object.keys(p.accepted).filter(k=>p.accepted[k]).map(k=>WHO[k])})));

  const want = new Map(), refuse = new Map();
  for (const e of room.transcript) {
    if (e.who === "builder") continue;
    for (const f of e.asks || []) (want.get(f) || want.set(f, new Set()).get(f)).add(e.who);
    for (const f of e.refuses || []) (refuse.get(f) || refuse.set(f, new Set()).get(f)).add(e.who);
  }
  const out = [];
  for (const [f, w] of want) {
    const r = refuse.get(f);
    if (r && r.size) out.push({ kind: "conflict", key: f, text: FEATURES[f],
                                wantedBy: [...w].map(x => WHO[x]), refusedBy: [...r].map(x => WHO[x]) });
  }
  const settled = new Set((room.wall?.sheet || []).filter(p => p.accepted.A && p.accepted.B && !p.declined).map(p => p.cardId));
  const answered = new Set(room.wall ? room.wall.cards.filter(c => settled.has(c.id)).map(c => c.need.toLowerCase()) : []);
  for (const b of openBeyond(room)) if (!answered.has(b.text.toLowerCase())) out.push({ kind: "beyond", who: b.who, text: b.text });
  for (const p of pending(room)) out.push({ kind: "pending", what: p.what, pkind: p.kind, accepted: Object.keys(p.accepted).filter(k => p.accepted[k]).map(k => WHO[k]) });
  return out;
}

async function developTurn(room, line) {
  room.thinking = true; push(room.id);
  try {
    await hearLine(room, line);
    newTurn(room.ctx);
    hear(room.ctx, line.who, "want", line.asks);
    hear(room.ctx, line.who, "avoid", line.refuses);
    const pic = room.uploads[line.who];
    if (pic && Array.isArray(pic.needs) && !room.seenPicture?.[line.who]) {
      room.seenPicture = { ...(room.seenPicture || {}), [line.who]: true };
      line.picture = pic.needs.filter(f => f in FEATURES);
      hear(room.ctx, line.who, "want", line.picture);
    }
    push(room.id);
    // The first version waits until both have said something; after that every
    // message gets a revision — or a reason why nothing changed.
    if (!bothSpoke(room)) return;
    await layB(room, line);
  } catch (e) {
    room.transcript.push({ who: "builder", failed: e.message, text: "",
                           built: room.standing ? NAME(room.standing) : null, phase: "main", at: Date.now() });
  } finally { room.thinking = false; push(room.id); }
}

// Choose (with one alternative when they pull apart), then say what was done
// with what was just said — to both of them, in relation to what each said.
async function layB(room, line, said) {
  if (modeOf(room) !== "both") return layExclusive(room,line,true,said);
  const before = room.standing, beforeHas = room.ctx.design ? room.ctx.design.has.slice() : [];
  const conv = room.transcript.filter(e => e.who !== "builder" && e.phase === "main" && (!ROUTES[room.route].reads || ROUTES[room.route].reads === e.who))
    .map(e => ({ who: WHO[e.who], text: (e.part ? `[about ${FEATURES[e.part]}] ` : "") + e.text + (e.corrected ? ` — they clarified: "${e.corrected}"` : "") }));
  const pictures = Object.keys(room.seenPicture || {}).filter(r => room.uploads[r]?.needs)
    .map(r => ({ who: WHO[r], needs: room.uploads[r].needs }));
  const { record, proposals } = await decideWall(room);
  const chose = await chooseBuildT({ cards: activeCards(room), record, standing: before ? NAME(before) : null, said: conv, pictures });
  if (chose.id) room.ctx.design = KIT.find(k => k.id === chose.id);
  const after = room.ctx.design ? room.ctx.design.id : null;
  room.standing = after;
  const afterHas = room.ctx.design ? room.ctx.design.has.slice() : [];
  // An alternative is offered only when the two of them actually pull apart —
  // something one asked for and the other ruled out. The chooser was offering
  // one on the first build "which neither speaker requested".
  const apart = unresolved(room).some(u => u.kind === "conflict") || !!(room.wall?.record?.conflicts?.length);
  const alt = chose.alt && apart ? { id: chose.alt.id, name: NAME(chose.alt.id), why: chose.alt.why } : null;
  const text = await propose({
    line: { who: WHO[line.who], text: said || line.text },
    took: { asks: line.asks || [], refuses: line.refuses || [], beyond: line.beyond || "" },
    before: before ? NAME(before) : null, after: NAME(after), props: afterHas, changed: before !== after,
    alt, beyond: openBeyond(room), wants: [], avoids: [],
    question: line.ask || "", proposals, wallTook: wallTookOf(room, line),
  });
  linkWall(room);
  room.transcript.push({ who: "builder", text, phase: "main", built: NAME(after), proposal: true,
                         diff: diffOf(room, beforeHas, afterHas), alt, at: Date.now(),
                         ...(room.wall ? { steps: stepsFor(room, line) } : {}) });
  try { await layControl(room, line, line.keysRead ? [...line.keysRead.asks, ...line.keysRead.refuses] : []); }
  catch (e) { room.control?.lines.push({ at: Date.now(), failed: e.message, text: "", built: room.control.standing ? NAME(room.control.standing) : null }); }
}

// The control agent's build: same chooser, same speaker, no wall, no record.
async function layControl(room, line, took) {
  const c = room.control; if (!c) return;
  const before = c.standing;
  build(c.ctx);
  const said = room.transcript.filter(e => e.who !== "builder" && e.phase === "main" && (!ROUTES[room.route].reads || ROUTES[room.route].reads === e.who))
                              .map(e => ({ who: WHO[e.who], text: e.text }));
  const pictures = Object.keys(room.seenPicture || {}).filter(r => room.uploads[r]?.needs)
    .map(r => ({ who: WHO[r], needs: room.uploads[r].needs }));
  const chose = await chooseBuild({ wants: [...c.ctx.wants.keys()], avoids: [...c.ctx.avoids.keys()],
                                    standing: before ? NAME(before) : null, said, pictures });
  if (chose.id) c.ctx.design = KIT.find(k => k.id === chose.id);
  const after = c.ctx.design ? c.ctx.design.id : null;
  c.standing = after;
  const say = await speak({
    said: line ? line.text : said.map(x => x.text).join(" "), took,
    before: before ? NAME(before) : null, after: NAME(after), props: c.ctx.design ? c.ctx.design.has : [],
    wants: [...c.ctx.wants.keys()], avoids: [...c.ctx.avoids.keys()], changed: before !== after,
  });
  c.lines.push({ at: Date.now(), afterLine: line ? room.transcript.indexOf(line) : room.transcript.length - 1,
                 text: say, built: NAME(after), standingId: after });
}

// One line's worth of the agent's process, to show under its answer: what it
// heard, which tools fired, what it decided, what it proposed, what it built,
// and what still has no part.
function stepsFor(room, line) {
  if (!room.wall) return null;
  const mine = room.wall.cards.filter(c => (line.cards || []).includes(c.id));
  const rec = room.wall.record;
  const count = k => rec ? rec.decisions.filter(d => d.response === k).length : 0;
  return {
    heard: mine.map(c => c.need), tools: (line.tools || []).map(t => t.tool), asked: line.ask || "",
    decided: rec ? { part: count("part"), rule: count("rule"), new: count("new"), none: count("none") } : null,
    proposed: pending(room).map(p => ({ id: p.id, kind: p.kind, what: p.what })),
    unsupported: room.wall.cards.filter(c => !c.withdrawn && c.met === "unsupported").map(c => c.need),
  };
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
  return { built: room.standing ? NAME(room.standing) : null, has: got, per, ...(modeOf(room) === "toolkit" && arg.upload ? {unavailable:true,reason:"Toolkit image needs are recorded in natural language. Evaluate them with participants; no fixed-key image score is available."} : {}) };
}

// Rooms come back after a restart. Each is rebuilt from its record by hearing
// every line again in the order it was said — the same calls the builder's turn
// made — so what it wants, what it avoids and who named what are exactly as they
// were. What stands is put back as it stood rather than rebuilt, because it was
// the builder's choice and not the scoring rule's.
function restore() {
  const dir = path.join(SESSIONS), pics = path.join(UPLOADS);
  let n = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (!ARGUMENTS[rec.argument] || !ROUTES[rec.route]) continue;
      const ctx = mkCtx();
      const seenPicture = {};
      for (const e of rec.transcript) {
        if (e.who === "builder" || !(e.asks || e.refuses)) continue;
        newTurn(ctx);
        hear(ctx, e.who, "want", e.asks || []);
        hear(ctx, e.who, "avoid", e.refuses || []);
        if (e.picture) { hear(ctx, e.who, "want", e.picture); seenPicture[e.who] = true; }
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
      rooms.set(rec.room, { id: rec.room, argument: rec.argument, route: rec.route, agent: rec.agent || "both", ctx,
        turn: rec.turn ?? rec.transcript.filter(e => e.who !== "builder").length,
        transcript: rec.transcript, uploads, standing: rec.standingId ?? null, thinking: false,
        finished: !!rec.finished, score: rec.finished ? rec.score : undefined,
        claimed: rec.claimed || {}, createdAt: rec.createdAt, seenPicture,
        wall: rec.wall || null, retro: rec.retro || {},
        control: rec.control ? (() => { const c = newControl();
          for (const e of rec.transcript) { if (e.who === "builder" || !e.keysRead) continue;
            newTurn(c.ctx); hear(c.ctx, e.who, "want", e.keysRead.asks || []); hear(c.ctx, e.who, "avoid", e.keysRead.refuses || []); }
          c.ctx.design = KIT.find(k => k.id === rec.control.standingId) || null; c.standing = rec.control.standingId || null;
          c.lines = rec.control.lines || []; return c; })() : null,
        controlScore: rec.control?.score || undefined,
        sketches: (rec.sketches || []).filter(k => fs.existsSync(path.join(pics, `${rec.room}-sketch-${k.n}.png`))) });
      streams.set(rec.room, new Set());
      n++;
    } catch (e) { console.error(`could not restore ${f}: ${e.message}`); }
  }
  return n;
}

const srv = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if(req.method === "POST") {
    let data; try { data=await body(req); } catch { return json(res,400,{error:"Invalid request"}); }
    if(data.room && profiles.some(u=>u.sessions.some(x=>x.room===data.room && x.historical)) && !["/api/switch"].includes(url.pathname))
      return json(res,409,{error:"This historical record is read-only. Switch to Toolkit to start the comparison."});
  }

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
    const html = fs.readFileSync(path.join(here, "app.html"), "utf8");
    return res.end(html);
  }

  // The public entry always starts a fresh session. Existing room-specific
  // links still resume that room; its transcript remains available in History.
  if (req.method === "GET" && p === "/desk") {
    // A fresh room every time (the previous conversation stays in History), on
    // the same use case, route and agent as the last one opened.
    const last = [...rooms.values()].sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)))[0];
    const argument = last && STUDY.includes(last.argument) ? last.argument : STUDY[0], route = last?.route || Object.keys(ROUTES)[0];
    let id = code();
    while (rooms.has(id) || fs.existsSync(path.join(SESSIONS, `${id}.json`))) id = code();
    const agent = ["toolkit","keys"].includes(last?.agent) ? last.agent : "toolkit";
    const live = { id, argument, route, agent, ctx: mkCtx(), turn: 0, transcript: [], uploads: {}, standing: null,
      thinking: false, finished: false, sketches: [], wall: agent === "toolkit" ? newWall() : null, control: null, retro: {},
      createdAt: new Date().toISOString() };
    try { record(live); } catch (e) {
      console.error(`could not save ${id}: ${e.message}`);
      return json(res, 500, { error: "Could not save a new room. Please try again." });
    }
    rooms.set(id, live); streams.set(id, new Set());
    res.writeHead(302, { location: `/j/${live.id}/both`, "cache-control": "no-store" }); return res.end();
  }

  if (p === "/api/users" && req.method === "GET") return json(res,200,profiles.map(u=>({...u,sessions:u.sessions.map(x=>({...x,hasContent:!!rooms.get(x.room)?.transcript.length}))})));
  if (p === "/api/users" && req.method === "POST") {
    const n=profiles.length+1;
    const nextRole=Math.max(1,...profiles.flatMap(u=>u.participants))+1;
    const user={id:`user${n}`,name:`Role 1 & Role ${nextRole}`,participants:[1,nextRole],sessions:[]};
    profiles.push(user); saveProfiles(); return json(res,200,user);
  }
  if (p === "/api/switch" && req.method === "POST") {
    const {user,argument,agent,room,route:requestedRoute}=await body(req);
    const profile=profiles.find(x=>x.id===user);
    if(!profile || !STUDY.includes(argument) || !["keys","toolkit"].includes(agent)) return json(res,400,{error:"Unknown user, starting point or process"});
    if(requestedRoute !== undefined && !Object.hasOwn(ROUTES,requestedRoute)) return json(res,400,{error:"Unknown communication path"});
    const route=requestedRoute || (room ? profile.sessions.find(x=>x.room===room)?.route : profile.sessions.find(x=>x.argument===argument)?.route) || "all";
    let entry=profile.sessions.find(x=>x.argument===argument && x.agent===agent && x.route===route && (!room || x.room===room));
    if(room && !entry) return json(res,404,{error:"This record does not belong to this user and process"});
    if(!entry) {
      // Each path keeps its own Control and Toolkit conversations.
      entry={argument,route,agent,room:profileRoom(argument,route,agent)};
      profile.sessions.push(entry); saveProfiles();
    }
    return json(res,200,{...entry,user:profile.id});
  }

  if (p === "/api/options") return json(res, 200, {
    publicUrl: publicUrl(),
    arguments: Object.entries(ARGUMENTS).filter(([k]) => STUDY.includes(k)).map(([k, v]) => ({ id: k, title: v.title, blurb: v.blurb, upload: !!v.upload })),
    routes: Object.entries(ROUTES).map(([k, v]) => ({ id: k, arrow: v.arrow, note: v.note })),
  });

  if (p === "/api/create" && req.method === "POST") {
    const { argument, route, agent = "toolkit" } = await body(req);
    if (!["toolkit","keys"].includes(agent)) return json(res, 400, {error:"choose toolkit or keys for a new room"});
    if (!ARGUMENTS[argument] || !ROUTES[route]) return json(res, 400, { error: "unknown argument or route" });
    // Never reuse the name of a session already on disk, or its record goes.
    let id = code();
    while (rooms.has(id) || fs.existsSync(path.join(SESSIONS, `${id}.json`))) id = code();
    rooms.set(id, { id, argument, route, agent, ctx: mkCtx(), turn: 0, transcript: [],
                    uploads: {}, standing: null, thinking: false, finished: false,
                    sketches: [], wall: agent === "toolkit" ? newWall() : null, control: null, retro: {}, createdAt: new Date().toISOString() });
    streams.set(id, new Set());
    // Saved at once, so a room whose links are already out survives a restart
    // even before anybody has spoken in it.
    try { record(rooms.get(id)); } catch (e) { console.error(`could not save ${id}: ${e.message}`); }
    return json(res, 200, { room: id });
  }

  // Every session on record, newest first, read from disk so that rooms from
  // before a restart are still listed. Empty rooms — opened and never spoken in,
  // which is what switching the filters leaves behind — are left out.
  if (p === "/api/sessions") {
    const dir = path.join(SESSIONS);
    const list = fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
    }).filter(s => s && s.transcript)
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
    const file = path.join(SESSIONS, `${id}.json`);
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
    if (!["A","B"].includes(role)) return json(res,400,{error:"unknown role"});
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl || "");
    if (!m) return json(res, 400, { error: "that did not look like an image" });
    // Refused before the picture is read, so a drawing already handed over is
    // never read again and never quietly replaces the one the builder saw.
    if (ARGUMENTS[r.argument].upload && r.transcript.some(e => e.who === role && e.upload))
      return json(res, 409, { error: "you have already shown your drawing" });
    try {
      // Handing over a drawing brought earlier sends the same picture again.
      // It was read when it arrived, so it is not read a second time.
      const had = r.uploads[role];
      const read = had && had.dataUrl === dataUrl ? had : modeOf(r) === "toolkit" ? await readPictureToolkit(m[2], m[1]) : await readPicture(m[2], m[1]);
      fs.writeFileSync(path.join(UPLOADS, `${id}-${role}.${m[1].split("/")[1].replace("+xml", "")}`),
                       Buffer.from(m[2], "base64"));
      r.uploads[role] = { dataUrl, media: m[1], ...read };

      // On this argument the drawing is the whole turn — there is nothing to
      // type — so showing it is the line, and the route decides the rest: who
      // may go when, whose drawing the builder is given, and when it builds.
      if (ARGUMENTS[r.argument].upload) {
        const route = ROUTES[r.route];
        // A drawing brought before your turn is kept, and handed over when the
        // turn comes round. It used to be read, stored and then refused, which
        // left a picture on screen that had been given to nobody — and no way
        // to give it.
        const theirTurn = !r.finished
          && (route.open || (r.turn < route.script.length && route.script[r.turn] === role));
        if (!theirTurn) { push(id); return json(res, 200, { ok: true, shown: false }); }
        const line = { who: role, text: "(a drawing of the crossing they have in mind)", upload: true,
                       phase: route.open ? "main" : phaseOf(r, r.turn),
                       ...(route.open ? { decision: true } : {}), at: Date.now() };
        r.transcript.push(line);
        r.turn++;
        push(id);
        json(res, 200, { ok: true });
        await builderTurn(r, line);
        return push(id);
      }
      push(id);
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 502, { error: e.message }); }
  }

  if (p === "/api/say" && req.method === "POST") {
    const { room: id, role, text, mode, part, replyTo } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (r.finished) return json(res, 409, { error: "this session is over" });

    // Condition B. No turns and no Confirm: every line goes to everyone and is
    // read at once; the AI revises after each, once both have spoken. A line may
    // be about a part of what stands, or build on the other person's line.
    if (ROUTES[r.route].develop) {
      if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
      const said = String(text || "").trim();
      if (!said) return json(res, 400, { error: "say something first" });
      const on = Number.isInteger(replyTo) && r.transcript[replyTo];
      const line = { who: role, text: said, phase: "main", talk: true, at: Date.now(),
                     ...(part && part in FEATURES ? { part } : {}),
                     ...(on && on.who !== "builder" && on.who !== role ? { replyTo } : {}) };
      r.transcript.push(line);
      r.turn++;
      push(id);
      json(res, 200, { ok: true });
      enqueue(r, () => developTurn(r, line));
      return;
    }
    // Drawings only: the page shows no box here, and the server does not take a
    // typed line either, so the two cannot disagree.
    if (ARGUMENTS[r.argument].upload)
      return json(res, 409, { error: "this one is drawings only — show your drawing instead" });
    const script = ROUTES[r.route].script;

    // The open routes. Talk goes to the other person only, in any order and as
    // much as they like; the builder hears nothing but what one of them confirms
    // to it, and answers each confirmed decision in front of them both.
    if (ROUTES[r.route].open) {
      if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
      const said = String(text || "").trim();
      if (!said) return json(res, 400, { error: "say something first" });
      if (ARGUMENTS[r.argument].upload && !r.uploads[role])
        return json(res, 409, { error: "upload your picture first" });
      const decide = mode === "build";
      if (decide && r.thinking)
        return json(res, 409, { error: "the builder is still working on the last decision" });
      // On the all-in-one-room route the AI hears the talk too, so it is not
      // marked private; it is read as it arrives, and only a confirmed decision
      // makes it build.
      const hears = !!ROUTES[r.route].hearsTalk;
      const line = decide
        ? { who: role, text: said, phase: "main", decision: true, at: Date.now() }
        : { who: role, text: said, phase: hears ? "main" : "confer", talk: true, at: Date.now() };
      r.transcript.push(line);
      r.turn++;
      push(id);
      json(res, 200, { ok: true });
      if (decide || hears) { await builderTurn(r, line); push(id); }
      return;
    }

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
    if ((ROUTES[r.route].defer || ROUTES[r.route].relay) && r.turn >= script.length && !r.standing) {
      r.thinking = true; push(id);
      try { await lay(r, null, []); } catch (e) {
        r.transcript.push({ who: "builder", failed: e.message, text: "",
                            built: r.standing ? NAME(r.standing) : null,
                            phase: "main", at: Date.now() });
      } finally { r.thinking = false; }
    }
    return push(id);
  }

  // The AI draws the bridge from the chat alone — no keys, no kit — so the desk
  // can put the two reconstructions side by side. On the facilitator's request,
  // not on every turn: each drawing is an image-model call.
  if (p === "/api/sketch" && req.method === "POST") {
    const { room: id } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (r.sketching) return json(res, 409, { error: "still drawing the last one" });
    const lines = r.transcript.filter(e => e.who !== "builder" && !e.upload && e.text)
      .map(e => ({ who: WHO[e.who], text: e.text }));
    const references = [...new Set(r.transcript.filter(e=>e.upload && (!ROUTES[r.route].reads || ROUTES[r.route].reads===e.who)).map(e=>e.who))].map(role=>({who:WHO[role],media:r.uploads[role]?.media,data:r.uploads[role]?.dataUrl?.split(",")[1]})).filter(x=>x.data);
    if (!lines.length && !references.length) return json(res, 409, { error: "Add a message or submit a reference image first" });
    r.sketching = true; push(id);
    json(res, 200, { ok: true });
    try {
      const arg = ARGUMENTS[r.argument];
      const ground = r.ctx.world.water ? "water" : r.ctx.world.rock ? "a drop in rock" : "";
      const out = await sketch({ title: arg.title, ground, lines, references, outcome:r.transcript.filter(e=>e.who==="builder"&&e.text).at(-1)?.text || "" });
      const n = (r.sketches || []).length + 1;
      fs.writeFileSync(path.join(UPLOADS, `${id}-sketch-${n}.png`), Buffer.from(out.base64, "base64"));
      (r.sketches ||= []).push({ n, at: Date.now(), turn: r.turn, lines: lines.length, media: out.media, prompt: out.prompt, source:references.length ? "reference assets" : "conversation", references:references.length });
      r.sketchError = null;
    } catch (e) {
      // Not a line in the conversation: the drawing is the facilitator's check,
      // and a failed check must not appear in the record as something the AI said.
      r.sketchError = e.message;
    } finally { r.sketching = false; }
    return push(id);
  }
  const sk = p.match(/^\/sketch\/([a-z0-9]+)\/(\d+)\.png$/);
  if (sk && req.method === "GET") {
    const file = path.join(UPLOADS, `${sk[1]}-sketch-${sk[2]}.png`);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end("no such sketch"); }
    res.writeHead(200, { "content-type": "image/png", "cache-control": "private, max-age=31536000" });
    return res.end(fs.readFileSync(file));
  }

  // Condition B: a person says what they meant by one of their own lines. It is
  // read again with the clarification, the tally is rebuilt in order, and the
  // AI revises. What it was taken to mean before is kept on the line.
  if (p === "/api/correct" && req.method === "POST") {
    const { room: id, role, index, text } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (!ROUTES[r.route].develop) return json(res, 409, { error: "not on this route" });
    if (r.finished) return json(res, 409, { error: "this session is over" });
    const line = r.transcript[index];
    if (!line || line.who !== role) return json(res, 400, { error: "you can only correct your own line" });
    const meant = String(text || "").trim();
    if (!meant) return json(res, 400, { error: "say what you meant first" });
    json(res, 200, { ok: true });
    enqueue(r, async () => {
      r.thinking = true; push(id);
      try {
        line.was = { asks: line.asks || [], refuses: line.refuses || [], beyond: line.beyond || "" };
        if (r.wall) {
          // The cards this line made are withdrawn in favour of what they meant.
          for (const c of r.wall.cards) if ((line.cards || []).includes(c.id)) { c.withdrawn = true; c.changes.push({ at: Date.now(), line: index, change: "corrected: " + meant }); }
          const said = line.text; line.text = `${said} — what I meant: ${meant}`;
          await hearLine(r, line); line.text = said;
          for (const c of r.wall.cards) if ((line.cards || []).includes(c.id)) c.checked = { by: role, at: Date.now(), how: "correction" };
        } else {
          const read = await readLineB(line.text, meant);
          line.asks = read.asks; line.refuses = read.refuses; line.beyond = read.beyond;
          line.taken = [...read.asks, ...read.refuses];
          captureReading(r,line,{kind:"keys",source:line.text+" — clarified: "+meant,asks:line.asks,refuses:line.refuses,beyond:line.beyond});
        }
        line.corrected = meant;
        replay(r);
        push(id);
        if (bothSpoke(r)) await layB(r, line, `what I meant by "${line.text}" is: ${meant}`);
      } catch (e) {
        r.transcript.push({ who: "builder", failed: e.message, text: "",
                            built: r.standing ? NAME(r.standing) : null, phase: "main", at: Date.now() });
      } finally { r.thinking = false; push(id); }
    });
    return;
  }

  // Condition B: a person takes the alternative the AI offered. A human
  // decision, so nothing is chosen for them; the AI only says what now stands.
  if (p === "/api/prefer" && req.method === "POST") {
    const { room: id, role, build: pick } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (!ROUTES[r.route].develop) return json(res, 409, { error: "not on this route" });
    if (r.finished) return json(res, 409, { error: "this session is over" });
    if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
    const entry = KIT.find(k => k.id === pick);
    const offered = [...r.transcript].reverse().find(e => e.who === "builder" && e.alt && e.alt.id === pick && !e.altTaken);
    if (!entry || !offered) return json(res, 409, { error: "that was not offered" });
    const line = { who: role, text: `I'd rather try ${NAME(pick)}.`, phase: "main", talk: true, prefer: pick, at: Date.now() };
    r.transcript.push(line);
    r.turn++;
    push(id);
    json(res, 200, { ok: true });
    enqueue(r, async () => {
      r.thinking = true; push(id);
      try {
        offered.altTaken = role;
        const before = r.standing, beforeHas = r.ctx.design ? r.ctx.design.has.slice() : [];
        r.ctx.design = entry; r.standing = pick;
        const text = await propose({
          line: { who: WHO[role], text: line.text }, took: { asks: [], refuses: [], beyond: "" },
          before: before ? NAME(before) : null, after: NAME(pick), props: entry.has, changed: before !== pick,
          alt: null, beyond: openBeyond(r), wants: [], avoids: [], wallTook: "",
        });
        linkWall(r);
        r.transcript.push({ who: "builder", text, phase: "main", built: NAME(pick), proposal: true,
                            diff: diffOf(r, beforeHas, entry.has), alt: null, chosenBy: role, at: Date.now() });
      } catch (e) {
        r.transcript.push({ who: "builder", failed: e.message, text: "",
                            built: r.standing ? NAME(r.standing) : null, phase: "main", at: Date.now() });
      } finally { r.thinking = false; push(id); }
    });
    return;
  }

  // The retrospective walkthrough: after the session, each person says what
  // they see in the bridge and whether their needs are met — in their words,
  // kept apart from the score.
  if (p === "/api/retro" && req.method === "POST") {
    const { room: id, role, text } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
    if (!r.finished) return json(res, 409, { error: "not finished yet" });
    const said = String(text || "").trim();
    if (!said) return json(res, 400, { error: "say something first" });
    r.retro = { ...(r.retro || {}), [role]: { text: said, at: Date.now() } };
    push(id);
    return json(res, 200, { ok: true });
  }

  // A rule or a new part on the sheet counts only once both have accepted it.
  // A decline is recorded as a decline — not silence, not consent.
  if (p === "/api/accept" && req.method === "POST") {
    const { room: id, role, item, ok } = await body(req);
    const r = rooms.get(id);
    if (!r || !r.wall) return json(res, 404, { error: "no such room, or no wall" });
    if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
    if (r.finished) return json(res, 409, { error: "this session is over" });
    const it = (r.wall.sheet || []).find(p => p.id === item);
    if (!it) return json(res, 404, { error: "nothing by that name on the sheet" });
    if (ok === false) { it.declined = true; it.declinedBy = role; it.accepted = {}; }
    else { it.accepted = { ...it.accepted, [role]: true }; }
    it.decidedAt = Date.now();
    r.transcript.push({ who: role, text: `${ok === false ? "No to" : "Yes to"} ${it.kind === "rule" ? "the rule" : "adding"}: ${it.what}.`,
                        phase: "main", talk: true, sheet: it.id, at: Date.now() });
    linkWall(r);
    push(id);
    return json(res, 200, { ok: true });
  }

  if (p === "/api/finish" && req.method === "POST") {
    const { room: id } = await body(req);
    const r = rooms.get(id);
    if (!r) return json(res, 404, { error: "no such room" });
    r.finished = true;
    r.score = scoreRoom(r);
    if (r.control) { const keep = r.ctx; r.ctx = r.control.ctx; r.controlScore = scoreRoom(r); r.ctx = keep; }
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
