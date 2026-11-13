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
import {createAutoToolkit,REPLAY_EXCLUDED_ROUTES} from "./auto-toolkit.mjs";
import {feedbackHandler,feedbackFiles,readFeedback} from "./feedback.mjs";
import {applyNeedUpdates,publishClarification} from "./toolkit-state.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkCtx, hear, newTurn, build, provenance } from "../engine.mjs";
import { ARGUMENTS, ROUTES, NAME, FEATURES, KIT, propsOf } from "./kit.mjs";
import { readLine, chooseBuild, speak, readPicture, relay, sketch, readLineB, chooseBuildB, propose,
         wallHear, wallDecide, relayFromWall, chooseBuildT, readPictureToolkit, toolkitReply, sameNeed, consolidate, readKano, KANO_RANK, looksLikeRule, POSITIONS } from "./builder.mjs";

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
let autoToolkit = null;
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
    autoToolkit: autoToolkit?.latest(room.id) || null, replayOf: room.replayOf || null,
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
    place: room.place || "confirm",
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
    // The read-back, as a card rather than a sentence: the named parts this
    // person owns that are drawn but not yet confirmed, numbered as on the
    // picture. Only where the route lets them hear the builder at all.
    readback: readbackFor(room, role),
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
        ...(e.clarification ? {clarification:true,questionFor:e.questionFor,questionStatus:e.questionStatus} : {}),
        ...(e.understandingUpdate ? {understandingUpdate:true} : {}),
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
    autoReplayEnabled:!!room.autoReplayEnabled, replayOf:room.replayOf || null,
    agent: modeOf(room), place: room.place || "confirm", family: room.family || null, wall: room.wall || null, retro: room.retro || {},
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
  autoToolkit?.observe(room);
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
// When a sheet item counts. With the toolkit on, a named part is the owner's
// word placed on the drawing, so the owner's yes confirms it — the other person
// can agree or object, and an objection is kept, not a veto. With the wall
// beside the keys (the older design) both people must accept.
const ownerOf = (room, p) => p.owner || room.wall?.cards.find(c => c.id === p.cardId)?.who || null;
const confirmed = (room, p) => modeOf(room) === "toolkit"
  ? !!(ownerOf(room, p) ? p.accepted[ownerOf(room, p)] : (p.accepted.A && p.accepted.B))
  : !!(p.accepted.A && p.accepted.B);
// What is on the sheet and not yet confirmed.
const pending = room => (room.wall?.sheet || []).filter(p => !confirmed(room, p) && !p.declined);

// Which of the route's people this speaker may be asked a question: only where
// the route lets them hear the builder at all, and only where the conversation
// goes on afterwards.
const canAskOn = (room, who) => {
  const r = ROUTES[room.route];
  return !!(!ARGUMENTS[room.argument].upload && r.open && r.see[who] && r.see[who].echo);
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
  const norm = t => String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  // One thing is one card per person. Each need just heard is checked against
  // the wall: the same thing said again by its owner is a note on their card;
  // the other person's word for the same thing is a card of its own that will
  // share the part (sameAs). The wording check is a fallback for the model's.
  let same = heard.cards.map(() => "");
  if (modeOf(room) === "toolkit" && heard.cards.length && activeCards(room).length) {
    try { same = await sameNeed({ wall: room.wall, cards: heard.cards }); } catch (e) { console.error(`same-need check ${room.id}: ${e.message}`); }
  }
  for (const [k, c] of heard.cards.entries()) {
    const twin = same[k] ? room.wall.cards.find(x => x.id === same[k] && !x.withdrawn) : null;
    const again = modeOf(room) === "toolkit" && ((twin && twin.who === c.who) ? twin
      : room.wall.cards.find(x => !x.withdrawn && x.who === c.who && (norm(x.need) === norm(c.need) || (norm(c.need).length > 12 && (norm(x.need).includes(norm(c.need)) || norm(c.need).includes(norm(x.need)))))));
    if (again) { again.changes.push({ at, line: index, change: "said again: " + c.quote, status: "note" }); continue; }
    if (twin) c.sameAs = twin.id;
    const id = "n" + (room.wall.cards.length + 1);
    // On a route where this speaker cannot have heard the other, a card about
    // the other person can only be reported or inferred — never direct.
    // ...and nobody reports their own need: what the speaker says of themselves is direct.
    const via = c.who === line.who ? "direct" : c.via === "direct" ? `reported-by-${line.who}` : c.via;
    room.wall.cards.push({ ...c, id, via, line: index, at, met: null, changes: [], withdrawn: false });
    ids.push(id);
  }
  if(modeOf(room)==="toolkit" && heard.clarificationNeeded && !heard.ask && canAskOn(room,line.who)) {
    const c=room.wall.cards.find(c=>ids.includes(c.id) && c.who===line.who && (c.readings?.length || c.concern)) || room.wall.cards.find(c=>ids.includes(c.id) && c.who===line.who);
    if(c) heard.ask=`Could you clarify what you mean by “${c.need}”${c.readings?.length ? ` — ${c.readings.join(" or ")}` : c.concern ? `, particularly “${c.concern}”` : ""}?`;
  }
  const revision = modeOf(room) === "toolkit" ? applyNeedUpdates(room.wall,heard.updates,{who:line.who,text:line.text,line:index,at}) : null;
  for (const u of revision ? [] : heard.updates) {
    const card = room.wall.cards.find(c => c.id === u.id);
    if (card) { card.changes.push({ at, line: index, change: u.change }); if (/withdr|no longer|drop/i.test(u.change)) card.withdrawn = true; }
  }
  if(revision?.applied.length && ROUTES[room.route].open) room.transcript.push({who:"builder",phase:"main",understandingUpdate:true,text:"Updated " + WHO[line.who] + "’s needs: " + revision.applied.map(id=>{const c=room.wall.cards.find(c=>c.id===id);return c.withdrawn ? "withdrawn: " + c.need : c.need;}).join("; ") + ". This updates my understanding, not the bridge.",built:null,at});
  if(modeOf(room)==="toolkit") publishClarification(room,line,heard,canAskOn(room,line.who));
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
  captureReading(room,line,{kind:"toolkit",cards:room.wall.cards.filter(c=>affected.has(c.id)),tools,updates:heard.updates.map(u=>({...u,...(revision ? {status:room.wall.cards.find(c=>c.id===u.id)?.changes.filter(x=>x.line===index).at(-1)?.status || "pending"} : {})})),ask:heard.ask,memberCheck});
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
// What reached the builder, in order: the same hearing boundary the builder and the sketch keep.
function heardLines(room) {
  const route = ROUTES[room.route];
  return room.transcript.filter(e => ["A", "B"].includes(e.who) && e.phase !== "confer" && (!route.reads || route.reads === e.who) && !e.upload && e.text)
    .map(e => ({ who: WHO[e.who], text: e.text + (e.corrected ? " — clarified: " + e.corrected : "") }));
}
// A part is as important as the most important card it carries.
function kanoOf(room, p) {
  const byId = Object.fromEntries((room.wall?.cards || []).map(c => [c.id, c]));
  const levels = [p.cardId, ...(p.aliases || []).map(a => a.cardId)].map(id => byId[id]?.kano?.level).filter(Boolean);
  return levels.sort((a, b) => KANO_RANK[a] - KANO_RANK[b])[0] || "";
}
// Musts the drawing does not carry: never silently gone, always listed.
function mustOpen(room) {
  if (modeOf(room) !== "toolkit" || !room.wall) return [];
  const none = new Set((room.wall.record?.decisions || []).filter(d => d.response === "none").map(d => d.id));
  return activeCards(room).filter(c => c.kano?.level === "must" && none.has(c.id)).map(c => ({ id: c.id, who: c.who, need: c.need, why: c.kano.why }));
}
const activeCards = room => room.wall ? room.wall.cards.filter(c => !c.withdrawn) : [];
// Accepted sheet items the drawing can show: a footway, a gate, a kerb, a
// sealed surface. Everything else accepted is listed as not drawable.
function sheetDrawn(room) {
  const out = { footway: false, gate: false, kerb: false, sealed: false, drawn: [], other: [], named: [] };
  if (modeOf(room) === "toolkit") {
    // Named parts: drawn as soon as they are proposed, dashed and labelled with
    // the owner's word; solid once the owner confirms the position. A rule is a
    // sign. Anything without a primitive is listed as not drawable.
    for (const p of room.wall?.sheet || []) {
      if (p.declined) continue;
      const who = ownerOf(room, p);
      const status = room.place === "direct" ? "placed" : confirmed(room, p) ? "confirmed" : p.objection ? "objected" : "proposed";
      if (p.primitive) out.named.push({ id: p.id, label: p.label || p.what, what: p.what, kind: p.kind, kano: kanoOf(room, p), primitive: p.primitive, position: p.position || "", who, status, objection: p.objection || null, aliases: (p.aliases || []).filter(a => a.label).map(a => ({ who: a.who, label: a.label })) });
      else out.other.push({ what: p.label || p.what, kind: p.kind });
    }
    // Most important first: the numbers on the picture follow the priority.
    const rank = k => k in KANO_RANK ? KANO_RANK[k] : 2;
    out.named = out.named.map((n, i) => [n, i]).sort((a, b) => rank(a[0].kano) - rank(b[0].kano) || a[1] - b[1]).map(x => x[0]);
    out.mustOpen = mustOpen(room);
    out.drawn = out.named.map(n => ({ what: n.label, as: n.primitive, who: n.who, status: n.status, kano: n.kano }));
    return out;
  }
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

// Mostly the same words, once the small ones are dropped: "trucks in the center
// lane" and "trucks allowed only in the center lane" are one thing.
const SMALL = new Set("a an the and or of to in on at for with by from as is are be it its no not only so that this these those we i you my our your".split(" "));
function sameWords(a, b) {
  const w = t => new Set(String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(x => x && !SMALL.has(x)));
  const A = w(a), B = w(b); if (!A.size || !B.size) return false;
  const both = [...A].filter(x => B.has(x)).length;
  return both / Math.min(A.size, B.size) >= 0.67 && both >= 2;
}

// What a person is asked to confirm: their own named parts, drawn as proposals,
// with the number each carries on the picture. Nothing where the route keeps
// the builder's words from them.
function readbackFor(room, role) {
  if (modeOf(room) !== "toolkit" || !room.wall || (role !== "A" && role !== "B")) return null;
  if (!ROUTES[room.route].see?.[role]?.echo || room.finished) return null;
  if (room.place === "direct") return [];          // placed as said; nothing to ask
  const named = sheetDrawn(room).named;
  return named.map((n, i) => ({ ...n, n: i + 1 })).filter(n => n.who === role && n.status !== "confirmed");
}

// The decision record, before a build; rendered for the chooser as well.
async function decideWall(room) {
  if (!room.wall) return { record: "", unsupported: [], proposals: [] };
  // Kano, read from the talk: which needs each person will not do without.
  // Read again before every build, because the evidence grows as they talk.
  if (modeOf(room) === "toolkit") {
    try {
      const got = await readKano({ wall: room.wall, lines: heardLines(room) });
      for (const c of room.wall.cards) if (got[c.id]) c.kano = { ...got[c.id], at: Date.now() };
    } catch (e) { console.error(`kano ${room.id}: ${e.message}`); }
  }
  const rec = await wallDecide({ wall: room.wall, standing: room.standing ? NAME(room.standing) : null,
                                 props: room.ctx.design ? room.ctx.design.has : [], pureToolkit: modeOf(room) === "toolkit" });
  // Every card gets a decision. A model that drops cards is asked once more
  // about just those; what it still leaves out is recorded as undecided, so the
  // record never silently shrinks the wall.
  if (modeOf(room) === "toolkit") {
    const decided = new Set(rec.decisions.map(d => d.id));
    const missing = activeCards(room).filter(c => !decided.has(c.id)).map(c => c.id);
    if (missing.length) {
      try {
        const more = await wallDecide({ wall: room.wall, standing: room.standing ? NAME(room.standing) : null,
                                        props: room.ctx.design ? room.ctx.design.has : [], pureToolkit: true, only: missing });
        for (const d of more.decisions) if (!decided.has(d.id)) { rec.decisions.push(d); decided.add(d.id); }
        rec.conflicts.push(...more.conflicts);
      } catch (e) { console.error(`second decision pass ${room.id}: ${e.message}`); }
      for (const id of missing) if (!decided.has(id)) rec.decisions.push({ id, response: "none", what: "left undecided by the builder", uncertainty: "no decision was returned for this card", label: "", primitive: "", position: "", undecided: true });
      if (rec.checks) rec.checks.nothingLost = rec.decisions.filter(d => d.undecided).length === 0;
      rec.secondPass = { asked: missing, decided: missing.filter(id => decided.has(id)) };
    }
    // A "rule" that names no ban, limit, time or turn is a thing on the bridge:
    // asked once more as a part. What the model still calls a rule stays one.
    const byId = Object.fromEntries(activeCards(room).map(c => [c.id, c]));
    const misruled = rec.decisions.filter(d => d.response === "rule" && byId[d.id] && !looksLikeRule(byId[d.id])).map(d => d.id);
    if (misruled.length) {
      try {
        const again = await wallDecide({ wall: room.wall, standing: room.standing ? NAME(room.standing) : null,
                                         props: room.ctx.design ? room.ctx.design.has : [], pureToolkit: true, only: misruled, notRules: true });
        for (const d of again.decisions) if (misruled.includes(d.id) && d.response !== "rule") rec.decisions[rec.decisions.findIndex(x => x.id === d.id)] = d;
      } catch (e) { console.error(`rule recheck ${room.id}: ${e.message}`); }
      rec.ruleRecheck = { asked: misruled, changed: misruled.filter(id => rec.decisions.find(d => d.id === id)?.response !== "rule") };
    }
  }
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
    if (room.wall.sheet.some(p => p.cardId === d.id && p.declined && !p.superseded)) { d.response = "none"; continue; }
    // With the toolkit on, the item is named and placed: the label is the owner's
    // word (never overwritten once they have renamed it), a rule is a sign.
    const toolkit = modeOf(room) === "toolkit";
    const placed = toolkit ? {
      label: d.label || d.what, owner: byId[d.id].who,
      primitive: d.response === "rule" ? "sign" : d.primitive || "",
      position: d.response === "rule" ? "ends" : d.position || "",
    } : {};
    const had = room.wall.sheet.find(p => p.cardId === d.id && !p.declined)
             || room.wall.sheet.find(p => !p.declined && (p.aliases || []).some(a => a.cardId === d.id));
    if (had) {
      if (had.cardId === d.id) {
        had.kind = d.response; had.what = d.what;
        // Once placed (direct) or confirmed, a part stays where it is; its word stays theirs.
        if (toolkit) { had.owner = placed.owner;
                       const settled = confirmed(room, had) || room.place === "direct";
                       if (!settled && !had.renamed) had.label = placed.label;
                       if (!settled) { had.primitive = placed.primitive; had.position = placed.position; } }
      }
      continue;
    }
    // Another word for a part already on the sheet: one part, both words.
    // The model says so with sameAs; failing that, the same primitive at the
    // same place with mostly the same words is taken as the same thing.
    if (toolkit && !d.sameAs && byId[d.id].sameAs) {
      const viaCard = room.wall.sheet.find(p => !p.declined && (p.cardId === byId[d.id].sameAs || (p.aliases || []).some(a => a.cardId === byId[d.id].sameAs)));
      if (viaCard) d.sameAs = viaCard.id;
    }
    if (toolkit && !d.sameAs && placed.primitive) {
      const twin = room.wall.sheet.find(p => !p.declined && p.primitive === placed.primitive && p.position === placed.position && sameWords(p.label || p.what, placed.label));
      if (twin && twin.cardId !== d.id) d.sameAs = twin.id;
    }
    if (toolkit && d.sameAs) {
      const same = room.wall.sheet.find(p => p.id === d.sameAs && !p.declined);
      if (same && same.cardId !== d.id) {
        // the card follows the part; its word is kept only when it is a different word
        (same.aliases ||= []).push({ cardId: d.id, who: byId[d.id].who, label: placed.label === (same.label || same.what) ? "" : placed.label, at: Date.now() });
        continue;
      }
    }
    room.wall.sheet.push({ id: "s" + (room.wall.sheet.length + 1), cardId: d.id, kind: d.response, what: d.what,
                           by: "AI", proposedAt: Date.now(), accepted: {}, declined: false, ...placed });
  }
  // One thing, one part. The sheet is read as a whole and parts that are the
  // same thing fold into one: the earliest (or a confirmed one) stays, the
  // others' words hang on it as aliases, and their cards follow it.
  if (modeOf(room) === "toolkit" && room.wall.sheet.filter(p => !p.declined && p.primitive).length >= 2) {
    try {
      for (const g of await consolidate({ sheet: room.wall.sheet })) {
        const items = g.map(id => room.wall.sheet.find(p => p.id === id)).filter(p => p && !p.declined);
        if (items.length < 2) continue;
        const keep = items.find(p => confirmed(room, p)) || items.find(p => kanoOf(room, p) === "must") || items[0];
        for (const p of items) {
          if (p === keep) continue;
          (keep.aliases ||= []).push({ cardId: p.cardId, who: p.owner, label: p.label || p.what, at: Date.now() },
                                     ...(p.aliases || []));
          p.declined = true; p.superseded = true; p.mergedInto = keep.id;
        }
        // The same person's second word for the same thing is not a second word, just the same thing said again.
        keep.aliases = (keep.aliases || []).filter((a, i, all) => a.who !== keep.owner || (a.label && a.label !== (keep.label || keep.what))).filter((a, i, all) => all.findIndex(b => b.who === a.who && b.label === a.label) === i);
      }
    } catch (e) { console.error(`consolidate ${room.id}: ${e.message}`); }
  }
  if (modeOf(room) === "toolkit") for (const p of room.wall.sheet) p.kano = kanoOf(room, p);
  const record = rec.decisions.map(d => `  [${d.id}] ${byId[d.id].need}${byId[d.id].kano ? " {" + byId[d.id].kano.level + "}" : ""} → ${d.response}: ${d.what}${d.uncertainty ? " (unsure: " + d.uncertainty + ")" : ""}`).join("\n")
    + (rec.conflicts.length ? "\n  conflicts: " + rec.conflicts.map(c => `${c.a}×${c.b} ${c.note}`).join("; ") : "")
    + (rec.whole ? "\n  the bridge as one, from both people's stories: " + rec.whole : "");
  const unsupported = rec.decisions.filter(d => d.response === "none").map(d => byId[d.id].need);
  return { record, unsupported, proposals: pending(room).map(p => ({ kind: p.kind, what: p.what, label: p.label, primitive: p.primitive, position: p.position, who: ownerOf(room, p) })) };
}

// After a build: every card against what stands. Met only when every key it
// carries is there; never because it was planned.
function linkWall(room) {
  if (!room.wall) return;
  if (modeOf(room) === "toolkit") {
    // A named part is "confirmed" when its owner says the position is right,
    // "objected" when the other person says no, otherwise "proposed" — drawn in
    // every case but the declined one. Nothing here is "met": that is theirs to say.
    for (const c of room.wall.cards) {
      const item = (room.wall.sheet || []).find(p=>p.cardId===c.id && !p.declined)
                || (room.wall.sheet || []).find(p=>!p.declined && (p.aliases || []).some(a => a.cardId === c.id));
      c.met = c.withdrawn ? null : item ? (room.place === "direct" ? "placed" : confirmed(room, item) ? "confirmed" : item.objection ? "objected" : "proposed") : "unverified";
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
    // Talk the AI can hear is taken in and remembered. On the route where the AI
    // is in the room for all of it (`all`), once both have spoken it also
    // revises after every line, so what it heard is on the picture at once;
    // Confirm still marks a decision. Elsewhere the next confirmed decision
    // builds from everything heard so far.
    if (line.talk && !(route.hearsTalk && bothSpoke(room))) { room.thinking = false; return; }
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
  // A roof is kept only for someone who asked to be covered.
  if (toolkit && room.ctx.design && room.ctx.design.shape.cover === "roof") {
    const said = activeCards(room).map(c => `${c.need} ${c.quote || ""} ${c.why || ""}`).join(" ");
    if (!/\b(cover\w*|roof\w*|shelter\w*|shade\w*|rain\w*|canop\w*|awning\w*)\b/i.test(said)) {
      const want = { ...room.ctx.design.shape, cover: "open" };
      room.ctx.design = KIT.find(k => Object.keys(want).every(a => k.shape[a] === want[a])) || room.ctx.design;
    }
  }
  // A span that opens for boats can carry no roof and no tower in its gap.
  if (toolkit && room.ctx.design && room.wall.sheet.some(p => !p.declined && p.primitive === "lift")) {
    const want = { ...room.ctx.design.shape, cover: "open", middle: "none" };
    room.ctx.design = KIT.find(k => Object.keys(want).every(a => k.shape[a] === want[a])) || room.ctx.design;
  }
  room.standing = room.ctx.design?.id || null;
  const named = toolkit ? pending(room).filter(p => p.primitive).map(p => ({ label: p.label || p.what, kind: p.kind, primitive: p.primitive, position: p.position, owner: WHO[ownerOf(room, p)], canHear: canAskOn(room, ownerOf(room, p)) })) : [];
  const text = toolkit ? await toolkitReply({cards:activeCards(room),record:room.wall.record,before:before ? NAME(before):null,after:room.standing ? NAME(room.standing):null,change:clarification || line?.text,question:"",named,direct:room.place === "direct"})
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
  if (modeOf(room) === "toolkit") return activeCards(room).map(c=>({kind:"unverified",who:WHO[c.who],text:c.need})).concat(pending(room).map(p=>({kind:"pending",what:p.label || p.what,pkind:p.kind,owner:WHO[ownerOf(room,p)],accepted:Object.keys(p.accepted).filter(k=>p.accepted[k]).map(k=>WHO[k])})));

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
    proposed: pending(room).map(p => ({ id: p.id, kind: p.kind, what: p.label || p.what, primitive: p.primitive || "", position: p.position || "" })),
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
      rooms.set(rec.room, { id: rec.room, argument: rec.argument, route: rec.route, agent: rec.agent || "both", place: rec.place || "confirm", ...(rec.family ? { family: rec.family } : {}), ctx,
        turn: rec.turn ?? rec.transcript.filter(e => e.who !== "builder").length,
        transcript: rec.transcript, uploads, standing: rec.standingId ?? null, thinking: false,
        finished: !!rec.finished, score: rec.finished ? rec.score : undefined,
        autoReplayEnabled:!!rec.autoReplayEnabled,replayOf:rec.replayOf || null,
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
  // Explicitly approved study UI origin; no wildcard or credentialed CORS.
  const studyOrigin = req.headers.origin === 'https://vividadiva.github.io';
  const studyRead = ['/api/state','/api/users','/api/feedback','/api/options','/api/sessions','/api/export','/events'].includes(url.pathname) || /^\/sketch\/[a-z0-9]+\/\d+\.png$/.test(url.pathname);
  const studyWrite = ['/api/auto-toolkit/retry','/api/feedback','/api/users','/api/switch','/api/create','/api/claim','/api/upload','/api/say','/api/sketch','/api/correct','/api/prefer','/api/retro','/api/accept','/api/finish'].includes(url.pathname);
  if(studyOrigin && ((studyRead&&['GET','HEAD'].includes(req.method))||(studyWrite&&req.method==='POST')||((studyRead||studyWrite)&&req.method==='OPTIONS'))){
    res.setHeader('Access-Control-Allow-Origin','https://vividadiva.github.io');res.setHeader('Vary','Origin');
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods',studyWrite?'GET, POST, OPTIONS':'GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return;}
  }

  if(req.method === "POST") {
    let data; try { data=await body(req); } catch { return json(res,400,{error:"Invalid request"}); }
    if(data.room && profiles.some(u=>u.sessions.some(x=>x.room===data.room && x.historical)) && !["/api/switch","/api/feedback"].includes(url.pathname))
      return json(res,409,{error:"This historical record is read-only. Switch to Toolkit to start the comparison."});
  }

  const p = url.pathname;
  if (await feedbackHandler({req,res,url,here,sessions:SESSIONS,rooms,body,view,json})) return;


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

  if (p === "/api/users" && req.method === "GET") return json(res,200,profiles.map(u=>({...u,sessions:u.sessions.map(x=>{
    const room=rooms.get(x.room);
    return {...x,hasContent:!!room?.transcript.length,feedbackReady:room ? !!room.standing&&!!room.sketches?.length : undefined};
  })})));
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

  if (p === "/api/auto-toolkit/retry" && req.method === "POST") {
    const {room}=await body(req);
    try {return json(res,200,autoToolkit.retry(room));}catch(e){return json(res,409,{error:e.message});}
  }
  if (p === "/api/options") return json(res, 200, {
    publicUrl: publicUrl(),
    arguments: Object.entries(ARGUMENTS).filter(([k]) => STUDY.includes(k)).map(([k, v]) => ({ id: k, title: v.title, blurb: v.blurb, upload: !!v.upload })),
    routes: Object.entries(ROUTES).map(([k, v]) => ({ id: k, arrow: v.arrow, note: v.note })),
  });

  if (p === "/api/create" && req.method === "POST") {
    const { argument, route, agent = "toolkit", place = "confirm", from } = await body(req);
    if (!["toolkit","keys"].includes(agent)) return json(res, 400, {error:"choose toolkit or keys for a new room"});
    // How a named part lands: "confirm" draws it dashed and asks its owner;
    // "direct" draws it solid at once — the process is updated, nobody is asked.
    if (!["confirm","direct"].includes(place)) return json(res, 400, {error:"place is confirm or direct"});
    if (!ARGUMENTS[argument] || !ROUTES[route]) return json(res, 400, { error: "unknown argument or route" });
    // Rooms opened from one another on their own form a family: switching path
    // or process returns to the family's existing room for it instead of
    // starting an empty one, so nothing said in either is left behind.
    const origin = from && rooms.get(from);
    const family = origin ? (origin.family || origin.id) : null;
    if (family) {
      // the one with the most said in it, so an empty duplicate never hides the real conversation
      const sibling = [...rooms.values()].filter(x => (x.family || x.id) === family && x.route === route && (x.agent || "both") === agent && (x.place || "confirm") === place && x.argument === argument && !x.finished)
        .sort((a, b) => b.transcript.length - a.transcript.length)[0];
      if (sibling) return json(res, 200, { room: sibling.id, existing: true });
    }
    // Never reuse the name of a session already on disk, or its record goes.
    let id = code();
    while (rooms.has(id) || fs.existsSync(path.join(SESSIONS, `${id}.json`))) id = code();
    rooms.set(id, { id, argument, route, agent, place, ...(family ? { family } : {}), ctx: mkCtx(), turn: 0, transcript: [],
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
                   feedbackCount:feedbackFiles(SESSIONS,s.room).length,
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
    if(!md)rec.feedback=readFeedback(SESSIONS,id);
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

    if (r.agent === "keys") r.autoReplayEnabled = true;

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
      if (decide || hears) enqueue(r, async () => { await builderTurn(r, line); push(id); });
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
    if (r.sketching) return json(res,409,{error:"Still drawing the last sketch"});
    json(res,200,{ok:true});
    try { await generateSketch(r); } catch(e) { console.error(`sketch ${id}: ${e.message}`); }
    return;
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
    const { room: id, role, item, ok, label, position } = await body(req);
    const r = rooms.get(id);
    if (!r || !r.wall) return json(res, 404, { error: "no such room, or no wall" });
    if (role !== "A" && role !== "B") return json(res, 400, { error: "unknown role" });
    if (r.finished) return json(res, 409, { error: "this session is over" });
    const it = (r.wall.sheet || []).find(p => p.id === item);
    if (!it) return json(res, 404, { error: "nothing by that name on the sheet" });
    if (modeOf(r) === "toolkit") {
      // Named parts. The owner's word, the owner's yes.
      const owner = ownerOf(r, it), mine = owner === role;
      const newLabel = typeof label === "string" ? label.trim().slice(0, 60) : "";
      if (newLabel && mine && newLabel !== (it.label || it.what)) {
        (it.renamed ||= []).push({ from: it.label || it.what, to: newLabel, by: role, at: Date.now() });
        it.label = newLabel;
        r.transcript.push({ who: role, text: `Call it: ${newLabel}.`, phase: "main", talk: true, sheet: it.id, at: Date.now() });
      } else if (newLabel && !mine) return json(res, 403, { error: "only its owner can rename it" });
      // Moving it is the owner saying where it goes: the new position, confirmed.
      if (typeof position === "string" && position) {
        if (!mine) return json(res, 403, { error: "only its owner can move it" });
        if (!POSITIONS.includes(position)) return json(res, 400, { error: "no such position" });
        it.position = position; it.accepted = { ...it.accepted, [role]: true }; it.decidedAt = Date.now();
        r.transcript.push({ who: role, text: `Put it ${position}: ${it.label || it.what}.`, phase: "main", talk: true, sheet: it.id, at: Date.now() });
        linkWall(r); push(id);
        return json(res, 200, { ok: true, status: "confirmed", position });
      }
      if (ok === false && mine) { it.declined = true; it.declinedBy = role; it.accepted = {}; }
      else if (ok === false) { it.objection = { by: role, at: Date.now() }; }
      else if (ok !== undefined && ok !== null) { it.accepted = { ...it.accepted, [role]: true }; if (!mine) it.objection = null; }
      if (ok !== undefined && ok !== null) {
        it.decidedAt = Date.now();
        const name = it.label || it.what;
        r.transcript.push({ who: role, text: mine ? (ok === false ? `Not there: ${name}.` : `That is where it goes: ${name}.`)
                                                  : (ok === false ? `I object to: ${name}.` : `Fine by me: ${name}.`),
                            phase: "main", talk: true, sheet: it.id, at: Date.now() });
      }
      linkWall(r); push(id);
      return json(res, 200, { ok: true, status: it.declined ? "declined" : confirmed(r, it) ? "confirmed" : it.objection ? "objected" : "proposed", label: it.label || it.what });
    }
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

async function runAutoToolkit(job, update) {
  if(REPLAY_EXCLUDED_ROUTES.has(job.route))throw Error('AI relay routes require a new live Toolkit conversation and are not replayed.');
  let target = job.target && rooms.get(job.target);
  // A completed input replay can resume just its image step after an image error.
  if (!target?.replayOf?.inputComplete || target.replayOf.hash !== job.id) {
    const id = profileRoom(job.argument, job.route, 'toolkit');
    target = rooms.get(id);
    target.finished = true; // Replay is a comparison record, never a live participant conversation.
    target.replayOf = {room:job.source,hash:job.id,kind:'fixed-transcript',inputComplete:false,
      note:'Human words replayed from Control. AI responses are newly generated. Participants did not respond to these Toolkit replies.'};
    record(target); update({target:id,progress:0});
    const owner=profiles.find(p=>p.sessions.some(s=>s.room===job.source));
    if(owner){owner.sessions.unshift({argument:job.argument,route:job.route,agent:'toolkit',room:id,label:'Auto replay · '+new Date().toLocaleString(),replaySource:job.source});saveProfiles();}
    const indices=new Map();
    for (const original of job.lines) {
      const line={...original,at:Date.now(),sourceAt:original.at};
      indices.set(original.sourceIndex,target.transcript.length);
      if(Number.isInteger(line.replyTo))line.replyTo=indices.get(line.replyTo);
      target.transcript.push(line);target.turn++;
      const before=target.transcript.length;
      // Corrections are input, not Control's prior interpretation.
      if(line.corrected)line.text=original.text+' — clarified: '+line.corrected;
      try { if(ROUTES[target.route].develop) await developTurn(target,line); else await builderTurn(target,line); }
      finally {line.text=original.text;}
      const failure=target.transcript.slice(before).find(e=>e.failed);
      if(failure){push(target.id);throw Error('Toolkit reading/build failed: '+failure.failed);}
      update({progress:target.turn});push(target.id);
    }
    if(!target.standing)throw Error('Toolkit did not produce a bridge. The replay is preserved for inspection.');
    target.replayOf.inputComplete=true;push(target.id);
  }
  update({status:'sketching'});
  if(!target.sketches?.length)await generateSketch(target);
  if(target.sketchError||!target.sketches?.length)throw Error('Toolkit sketch failed: '+(target.sketchError||'no saved image'));
  target.replayOf.completedAt=new Date().toISOString();push(target.id);
}

// What the toolkit hands the sketch: every need in its owner's words, most
// important first (Kano, read from the talk), the named parts and where they sit,
// and the rules — which are rules, not boards with writing on them. Unconfirmed
// is a note, never a reason to leave a thing out. The kit's shape is not here.
function toolkitUnderstanding(r) {
  if (!r.wall) return "";
  const sheet = (r.wall.sheet || []).filter(p => !p.declined);
  // Every person's need is listed in their own words, even one folded into
  // another person's part: folding is for the matchsticks, not for the picture.
  const partOf = id => sheet.find(p => p.cardId === id || (p.aliases || []).some(a => a.cardId === id));
  const needs = activeCards(r).map(c => {
    const part = partOf(c.id), level = c.kano?.level || (part ? kanoOf(r, part) : "");
    const unsure = part ? !(r.place === "direct" || confirmed(r, part)) : c.met !== "placed" && c.met !== "confirmed";
    return { c, part, level: level || "", unsure };
  });
  const rank = l => l in KANO_RANK ? KANO_RANK[l] : 1.5;
  needs.sort((a, b) => rank(a.level) - rank(b.level));
  const say = x => `- ${WHO[x.c.who]}: ${x.c.need}${x.c.why ? " — " + x.c.why : ""}${x.unsure ? " (not yet confirmed)" : ""}`;
  const group = (title, lv) => { const g = needs.filter(x => lv.includes(x.level) && x.part?.kind !== "rule"); return g.length ? [title, ...g.map(say)] : []; };
  const rules = needs.filter(x => x.part?.kind === "rule");
  const rec = r.wall.record || {};
  return [
    ...(rec.whole ? [`The bridge as one structure — draw this first, and draw everything below as part of it, never as a separate object:`, rec.whole, ...(rec.hmw ? [`(It answers: ${rec.hmw})`] : []), ``] : []),
    `What the toolkit understood, most important first, each need in the words of the person who asked for it:`,
    ...group(`MUST-HAVE — draw every one of these clearly, confirmed or not; the bridge is wrong without them:`, ["must"]),
    ...group(`More is better — draw as well as fits:`, ["performance"]),
    ...group(`Not yet ranked — draw if it fits:`, [""]),
    ...group(`Nice to have — only where it does not crowd a must-have:`, ["attractive", "indifferent"]),
    ...(rules.length ? [`Operating rules — how the bridge is used, not structures. Do not draw signboards or writing for them; draw them only if a rule implies a structure:`, ...rules.map(say)] : []),
  ].join("\n");
}
// Whether there is water under it, from what the toolkit heard: the keys builder
// sets this through its keys, and the toolkit has none.
function toolkitGround(r, lines) {
  const text = [...lines.map(l => l.text), ...activeCards(r).map(c => c.need + " " + (c.why || "") + " " + (c.quote || ""))].join(" ").toLowerCase();
  const water = /\b(water|river|stream|creek|canal|ships?|boats?|sail|flood|current|swim|harbou?r)\b/.test(text) || !!r.ctx?.world?.water;
  const rock = /\b(rock|cliff|ravine|gorge|canyon|chasm)\b/.test(text) || !!r.ctx?.world?.rock;
  return water && rock ? "water at the bottom of a drop in rock" : water ? "water" : rock ? "a drop in rock" : "";
}

async function generateSketch(r) {
  if(r.sketching)throw Error('Still drawing the last sketch');
  const route=ROUTES[r.route];
  // Preserve the same hearing boundary as the builder (especially private discussion).
  const heard=r.transcript.filter(e=>['A','B'].includes(e.who)&&e.phase!=='confer'&&(!route.reads||route.reads===e.who));
  const lines=heard.filter(e=>!e.upload&&e.text).map(e=>({who:WHO[e.who],text:e.text+(e.corrected?' — clarified: '+e.corrected:'')}));
  const references=[...new Set(heard.filter(e=>e.upload).map(e=>e.who))].map(role=>({who:WHO[role],media:r.uploads[role]?.media,data:r.uploads[role]?.dataUrl?.split(',')[1]})).filter(x=>x.data);
  if(!lines.length&&!references.length)throw Error('No input has reached the AI on this route yet');
  r.sketching=true;r.sketchError=null;push(r.id);
  try {
    // The toolkit's own understanding, short and most important first — never the
    // kit's shape, which is the keys builder's approximation, not what was said.
    const latest=r.agent==='toolkit'?'':r.transcript.filter(e=>e.who==='builder'&&e.built&&!e.failed&&!e.clarification&&!e.understandingUpdate).at(-1)?.text||'';
    const outcome=r.agent==='toolkit'?toolkitUnderstanding(r):latest;
    const ground=r.agent==='toolkit'?toolkitGround(r,lines):r.ctx.world.water?'water':r.ctx.world.rock?'a drop in rock':'';
    const out=await sketch({title:ARGUMENTS[r.argument].title,ground,lines,references,process:r.agent,outcome});
    const n=(r.sketches||[]).length+1;
    const file=path.join(UPLOADS,`${r.id}-sketch-${n}.png`);
    fs.writeFileSync(file+'.tmp',Buffer.from(out.base64,'base64'));fs.renameSync(file+'.tmp',file);
    (r.sketches||=[]).push({n,at:Date.now(),turn:r.turn,lines:lines.length,media:out.media,prompt:out.prompt,source:r.agent==='toolkit'?'toolkit understanding: the whole bridge (how-might-we answer) + Kano-ranked needs in their words; no kit shape, no transcript':'route-visible conversation',references:references.length});
  }catch(e){r.sketchError=e.message;throw e;}finally{r.sketching=false;push(r.id);}
}

const back = restore();
autoToolkit=createAutoToolkit({file:path.join(SESSIONS,'automation','toolkit-jobs.json'),execute:runAutoToolkit,delay:Number(process.env.AUTO_TOOLKIT_DELAY_MS||2500),onChange:source=>{if(rooms.has(source))push(source);}});
autoToolkit.start();
srv.listen(PORT, () => {
  console.log(`\n  Two worlds, one builder — user test`);
  console.log(`  ${back} room${back === 1 ? "" : "s"} brought back from sessions/`);
  console.log(`  Facilitator console:  http://localhost:${PORT}/\n`);
});
