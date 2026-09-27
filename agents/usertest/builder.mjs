// Role 3, for the human test.
//
// The same model and the same three prompts the machine experiment used, so a
// builder facing two people behaves as it did facing two models. It reads a
// sentence into needs, chooses from the workshop, and says what it did. It is
// never told what anybody meant, and it may not ask.
//
// Gemini, not Claude. run.mjs runs with --machine gemini, so every published
// session had gemini-flash-lite-latest in this chair. Building this on Claude
// made it a different builder and quietly broke the one claim the app exists
// to support — that the only difference between the two studies is who was in
// the chairs. It also refused the speaking call five times running under
// "cyber", on a conversation about a footbridge, which is how the mistake came
// to light.
import { GoogleGenAI } from "@google/genai";
import { FEATURES, KIT, NAME, AXES, CHOICES, propsOf, kitForChoosing } from "./kit.mjs";

const MODEL = process.env.BUILDER_MODEL || process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
let _client = null;
const client = () => (_client ||= new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY }));

const wait = ms => new Promise(r => setTimeout(r, ms));

// Gemini takes a hand-written JSON schema rather than a Zod object. Four shapes,
// each declared: a lookup that throws beats a fallback that silently returns the
// wrong one, which once made the builder read every sentence as meaning nothing.
const SAY_JSON   = { type:"object", properties:{ say:{type:"string"} }, required:["say"] };
const READ_JSON  = { type:"object", properties:{
  asks:{type:"array", items:{type:"string"}}, refuses:{type:"array", items:{type:"string"}} },
  required:["asks","refuses"] };
const CHOOSE_JSON = { type:"object", properties:{
  build:{type:"string"}, why:{type:"string"} }, required:["build","why"] };
// `saw` comes first on purpose: describing the drawing in words before choosing
// makes the model notice what is actually there — arches, cables, cars — instead
// of reaching for the plainest value on every axis.
const SHAPE_JSON = { type:"object", properties:{ saw:{type:"string"}, ...Object.fromEntries(
  AXES.map(a => [a, { type:"string", enum:Object.keys(CHOICES[a]) }])) }, required:["saw", ...AXES] };

// A per-minute limit is worth waiting out; a per-day one is not.
async function generateWithBackoff(req, tries = 6) {
  for (let n = 1; ; n++) {
    // A call that never answers would leave the room "deciding" for good, with
    // every composer locked. Sixty seconds, then it counts as a failure.
    try { return await client().models.generateContent({ ...req,
      config: { ...req.config, abortSignal: AbortSignal.timeout(60000) } }); }
    catch (e) {
      const msg = e?.message || String(e);
      if (e?.status === 429 && /PerDay/.test(msg))
        throw new Error(`Gemini's daily free-tier quota for ${MODEL} is used up. `
          + `Try GEMINI_MODEL=gemini-2.5-flash-lite, or come back tomorrow, or enable billing.`);
      // Also a 429, and no amount of waiting fixes it. Retrying held each line
      // "deciding" for a minute before failing anyway.
      if (/prepayment credits are depleted|billing/i.test(msg))
        throw new Error("The Gemini account is out of credits. Top it up in Google AI Studio under Billing, then try again.");
      // Busy (429) and briefly down (500/502/503/504, or no answer at all) are
      // both worth waiting out. A 503 in the middle of a session was dropping a
      // person's line on the floor: never read, nothing built from it.
      const transient = e?.status === 429 || [500, 502, 503, 504].includes(e?.status)
        || /UNAVAILABLE|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
      const timedOut = /abort|timed? ?out/i.test(msg) || e?.name === "TimeoutError";
      if (timedOut && n >= 2) throw new Error("The builder took too long to answer.");
      if (!(transient || timedOut) || n >= tries) throw e;
      const asked = Number((msg.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/) || [])[1]);
      await wait(Math.ceil(((Number.isFinite(asked) ? asked : 0) || 2 ** n) * 1000) + 500);
    }
  }
}

// A prompt is either a string, or a string with pictures after it. The order is
// not cosmetic: pictures before the sentence were refused where the same
// pictures after it were not.
const contents = u => typeof u === "string" ? u : [{ parts: [
  { text: u.text },
  ...u.images.map(data => ({ inlineData: { mimeType: u.media || "image/png", data } })),
]}];

async function ask(system, user, json, extra = {}) {
  const res = await generateWithBackoff({
    model: MODEL, contents: contents(user),
    config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: json, ...extra },
  });
  const text = (res.text || "").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`the builder returned no JSON: ${text.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

const READ = [
  `You build crossings. Somebody has said one sentence to you about what they need.`,
  `You cannot ask them anything and you cannot see where they are standing. All you have is the sentence.`,
  ``,
  `One sentence can do both at once — ask for one thing while ruling out another. Sort what it does.`,
  ``,
  `Decide, from these keys, what the sentence ASKS FOR and what it REFUSES. Use the keys exactly.`,
  ...Object.entries(FEATURES).map(([k, v]) => `  ${k} — ${v}`),
  ``,
  `Rules:`,
  `- Put a need under "refuses" when the sentence names it as the thing not wanted. Return the thing NAMED,`,
  `  not its opposite. "I do not want to climb up to it" refuses "high"; it does not ask for "low".`,
  `- Put a need under "asks" when the sentence names it as the thing wanted.`,
  `- A complaint about what somebody lacks is usually a request for it, not a refusal of it. Read which.`,
  `- Two or three keys in total across both lists, at most. Not everything the sentence might imply.`,
  `- Either list may be empty. Both empty is a real answer if the sentence states nothing you can build from.`,
  `- Do not guess at what sort of person is speaking or why. Read the sentence.`,
].join("\n");

const CHOOSE = kit => [
  `You build crossings out of matchsticks, and you have a workshop of things you know how to make.`,
  `Two people have been describing what they need. You cannot ask them anything and you cannot see where`,
  `they are standing. You have only what you have heard.`,
  ``,
  `What you can make, and what each one is actually like:`,
  ...kit.map(k => `  ${k.id} — ${k.props}`),
  ``,
  `Rules:`,
  `- Pick exactly one id from that list. Use the id exactly as written.`,
  `- Weigh the conversation, not a list. A need somebody keeps coming back to matters more than one`,
  `  mentioned once and let go. Somebody who has just conceded something has conceded it.`,
  `- Where the two of them have converged, build that, even if the tally says otherwise. Where they are`,
  `  still apart, you are choosing between them and you should know that is what you are doing.`,
  `- Something they have ruled out is a stronger signal than something they have asked for. People live`,
  `  with a crossing that is merely not ideal; they do not use one they have refused.`,
  `- If nothing you have heard favours a change, keep what is already standing. Do not rebuild for its own sake.`,
  `- You are choosing what to build, not describing it. One id, and why in a line.`,
].join("\n");

const SAY = [
  `You build crossings out of matchsticks. Two people describe what they need and you make what you can.`,
  `You cannot ask anyone anything. You cannot see where they are standing. You only ever get sentences.`,
  `You have a workshop and the things in it you know how to make. That is your whole world of materials:`,
  `whatever they meant, what you build is what you can build out of what you have.`,
  ``,
  `Say what you made of the thing just said to you and what you did about it.`,
  ``,
  `Hold to this:`,
  `- One sentence. Two only if the second earns it. Under thirty words.`,
  `- Report. Do not offer, apologise, thank anybody, or ask for anything.`,
  `- Never open with "I understand", "I understood", "I see" or "It sounds like". Do not repeat their`,
  `  need back to them before answering it — say what you did, and let that show what you took.`,
  `- Say only what is true of what stands. You are told its actual properties; do not credit it with`,
  `  others, and do not join two facts into a reason that was not given to you.`,
  `- You work in matchsticks. When you rebuild, say what you are laying and what you are taking apart,`,
  `  in the terms you are given. When you do not rebuild, do not describe building.`,
  `- Speak as yourself, in the first person. Never address them as "you" when you mean what you know or did.`,
  `- Never use the word "user".`,
].join("\n");

// A picture somebody brought, mapped onto the same axes the workshop is built
// from, so an uploaded crossing yields a latent need exactly as a written goal
// does. Nobody is shown the result — not the person who uploaded it, not the
// other one, and not the builder, which never sees the picture at all.
// Reading a drawing onto the axes. The bare instruction ("choose the plainer value
// when unsure") read a three-arch stone bridge as a swaying span with no support in
// the river, and read the same suspension bridge two different ways on two uploads.
// A real structure does not name its axis values, so the prompt says how the usual
// kinds of bridge map onto them.
const SEE = [
  `Somebody has shown you a drawing of a crossing. First, in "saw", describe in one or two plain sentences what`,
  `the crossing is: what it is made of, what holds it up, whether anything stands in the water or the gap, what is`,
  `crossing it (people, carts, cars), and what is at the sides. Then describe it on these axes, one value each:`,
  ``,
  ...AXES.map(a => `  ${a}: ` + Object.entries(CHOICES[a]).map(([k, v]) => `${k} (${v})`).join(", ")),
  ``,
  `How common kinds of crossing map onto the axes:`,
  `- level: "raised" when the walk is clearly lifted above the banks — an arched deck, a span hung between tall posts`,
  `  or towers, a walk up on legs. "at" when it lies level with the banks.`,
  `- middle: arches, piers or pillars standing in the water or the gap count as "tower". A single post or pole`,
  `  under the middle is "post". Towers, posts or pylons that stand on the banks or at the two ends do NOT count:`,
  `  only something standing in the water or the gap between the banks. "none" when nothing stands there.`,
  `- bracing: a rigid structure — stone or brick arches, a truss, diagonal struts or braces, a solid beam on piers —`,
  `  is "struts". A deck hung from cables or ropes is "none" — even when its planks, railing or hangers are drawn`,
  `  with cross pieces or X shapes, because a hung deck still swings. A plank laid loose is "none".`,
  `- hand: a railing, parapet, low wall or hand rope along the walk is "rail"; nothing along the edge is "none".`,
  `  Cables that only hold the deck up, with nothing to hold at hand height, are not a rail.`,
  `- width: "two" when cars, carts or two people side by side fit; "one" for a narrow footway.`,
  `- surface: "rough" only for a textured, gritted or ribbed walking surface; planks or smooth stone are "bare".`,
  `- ends: "footed" when the ends visibly go down into firm ground, footings or abutments; otherwise "rested".`,
  `- cover: "roof" only when something covers the walk overhead.`,
  ``,
  `Judge what the drawing shows, using those mappings. Only when an axis is genuinely not shown, choose the plainer value.`,
].join("\n");

export async function readLine(text) {
  const out = await ask(READ, `The sentence: "${text}"\n\nWhat does it ask for, and what does it refuse?`, READ_JSON);
  const clean = xs => (Array.isArray(xs) ? xs : []).filter(k => k in FEATURES).slice(0, 3);
  return { asks: clean(out.asks), refuses: clean(out.refuses) };
}

export async function chooseBuild({ wants, avoids, standing, said, pictures = [], record = "" }) {
  const kit = kitForChoosing();
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const user = [
    `Asked of you so far: ${list(wants)}.`,
    `Refused so far: ${list(avoids)}.`,
    standing ? `What stands now: ${standing}.` : `Nothing stands yet.`,
    ``,
    `The conversation, in order:`,
    ...said.map(s => `  ${s.who}: ${s.text}`),
    // Two references: the crossing each of them showed you, as it was read.
    ...(pictures.length ? [``, `The crossings they showed you, each in a picture of their own:`,
      ...pictures.map(p => `  ${p.who}'s picture: ${list(p.needs)}.`)] : []),
    ...(record ? [``, `Your decision record, from the wall:`, record] : []),
    ``,
    `What do you build?`,
  ].join("\n");
  const out = await ask(CHOOSE(kit), user, CHOOSE_JSON);
  const raw = typeof out.build === "string" ? out.build.trim() : "";
  const norm = x => String(x).toLowerCase().replace(/^an? /, "").replace(/[^a-z0-9]/g, "");
  const hit = kit.find(k => norm(k.id) === norm(raw))
           || kit.find(k => norm(k.id).includes(norm(raw)) || norm(raw).includes(norm(k.id)));
  const entry = hit && KIT.find(k => NAME(k.id) === hit.id);
  return { id: entry ? entry.id : null, why: out.why, unmatched: hit ? null : raw };
}

export async function speak({ said, took, before, after, props, wants, avoids, changed, unsupported = [], proposals = [], wallTook = null }) {
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const bits = [
    `They said: "${said}"`,
    wallTook !== null ? `You took it to be about: ${wallTook || "nothing you can build from"}.`
                      : `You took it to be about: ${took.length ? list(took) : "nothing you can build from"}.`,
    ``,
    changed ? `You have rebuilt. It was ${before || "nothing at all"}. It is now ${after}.`
            : `You changed nothing, and why is the only thing worth saying.`,
    `What ${after} actually is: ${list(props)}.`,
    ``,
    ...(wallTook !== null ? [] : [`Asked of you so far: ${list(wants)}.`, `Refused so far: ${list(avoids)}.`]),
    ...(unsupported.length ? [``, `Asked for, and nothing in your workshop makes it — say so, it is not met: ${unsupported.join("; ")}.`] : []),
    ...(proposals.length ? [`Separately — NOT laid, NOT built, NOT part of what stands — you have written on the sheet for both of them to accept: ${proposals.map(p => `${p.kind === "rule" ? "a rule" : "a new part"} — ${p.what}`).join("; ")}. After saying what you laid, add one clause that it is on the sheet, waiting for them. Never say you laid it.`] : []),
    ``,
    `Say your piece.`,
  ].join("\n");
  const out = await ask(SAY, bits, SAY_JSON);
  return typeof out.say === "string" ? out.say.trim() : "";
}

// The relay routes. The AI has heard one person and builds nothing yet; it tells
// the other, who could not hear, what it understood the first to need. In its
// own words: the interpretation is the thing the route is about, so it must not
// hand the sentence across unchanged.
const RELAY = [
  `You build crossings out of matchsticks, for two people who each need something of it. You have not built`,
  `anything yet and you will not build until both have spoken.`,
  `One of them has just spoken to you. The other could not hear it and will know only what you tell them.`,
  ``,
  `Tell the other person what you understood the first one to need from the crossing.`,
  ``,
  `Hold to this:`,
  `- One or two sentences, under forty words, spoken to the other person.`,
  `- In your own words. Never quote the first person and never repeat their sentence back.`,
  `- Only what you took them to need or to rule out, as you are told it below. Add nothing, drop nothing,`,
  `  and do not argue with it or soften it.`,
  `- Do not describe building or laying anything: nothing has been built.`,
  `- Do not ask the other person anything, and do not tell them what they should want.`,
  `- Never use the word "user".`,
].join("\n");

export async function relay({ from, to, said, asks, refuses }) {
  const list = ks => ks.map(f => FEATURES[f]).join("; ");
  const user = [
    `${from} said to you: "${said}"`,
    `You took ${from} to need: ${asks.length ? list(asks) : "nothing you could build from"}.`,
    ...(refuses.length ? [`You took ${from} to rule out: ${list(refuses)}.`] : []),
    ``,
    `Tell ${to} what ${from} needs, as you understood it.`,
  ].join("\n");
  const out = await ask(RELAY, user, SAY_JSON);
  return typeof out.say === "string" ? out.say.trim() : "";
}

// Returns the eight axes and the needs they imply. Used on upload only.
export async function readPicture(base64, media) {
  // The same drawing should read the same way every time it is uploaded. Even at
  // temperature 0 a single read of a drawing varied from upload to upload, so it
  // is read three times at once and each axis takes the value most reads agree on.
  const settings = { temperature: 0, topK: 1, seed: 7 };
  const reads = (await Promise.allSettled([0, 1, 2].map(() =>
    ask(SEE, { text: "What is this crossing like?", images: [base64], media }, SHAPE_JSON, settings))))
    .filter(r => r.status === "fulfilled").map(r => r.value);
  if (!reads.length) throw new Error("the picture could not be read");
  const vote = axis => {
    const counts = new Map();
    for (const r of reads) if (r[axis] in CHOICES[axis]) counts.set(r[axis], (counts.get(r[axis]) || 0) + 1);
    return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ?? Object.keys(CHOICES[axis])[0];
  };
  const shape = Object.fromEntries(AXES.map(a => [a, vote(a)]));
  const saw = reads.map(r => typeof r.saw === "string" ? r.saw.trim() : "").find(Boolean) || "";
  return { shape, needs: propsOf(shape), saw };
}

// ── condition B: developing it together ──────────────────────────────────
// The reader, the chooser and the kit are the same as everywhere else. What is
// added: the reader also names, in plain words, what a line asked for that no
// key can carry, so it can be shown rather than dropped; the chooser may name
// one alternative when the two people pull apart; and the builder speaks as a
// proposer — what it took from each of them, what it could not, one other way,
// and at most one question to one named person.
const READ_B_JSON = { type:"object", properties:{
  asks:{type:"array", items:{type:"string"}}, refuses:{type:"array", items:{type:"string"}},
  beyond:{type:"string"} }, required:["asks","refuses","beyond"] };
const READ_B = READ + "\n" + [
  `- In "beyond", in a few plain words, whatever the sentence asks for that none of the keys can carry — a`,
  `  material, a surface, a time of day, a separate path, a step. Their words, not yours.`,
  `- Never put in "beyond" what a key you returned already carries: a car or a cart is "heavy", not beyond.`,
  `- A key is about the whole crossing. A part of it — an edge, a step, a side, a lane — is not the whole:`,
  `  a raised edge for walkers is not "high", and a side for walkers is not "many". Those go in "beyond".`,
  `- If both lists are empty, "beyond" must not be: say what they asked for, in their words.`,
].join("\n");

export async function readLineB(text, clarified) {
  const user = [
    `The sentence: "${text}"`,
    ...(clarified ? [`They were asked what they meant by it, and said: "${clarified}"`] : []),
    ``,
    `What does it ask for, and what does it refuse?`,
  ].join("\n");
  const out = await ask(READ_B, user, READ_B_JSON);
  const clean = xs => (Array.isArray(xs) ? xs : []).filter(k => k in FEATURES).slice(0, 3);
  return { asks: clean(out.asks), refuses: clean(out.refuses),
           beyond: typeof out.beyond === "string" ? out.beyond.trim().slice(0, 120) : "" };
}

const CHOOSE_B_JSON = { type:"object", properties:{
  build:{type:"string"}, why:{type:"string"}, alt:{type:"string"}, altWhy:{type:"string"} },
  required:["build","why","alt","altWhy"] };
const CHOOSE_B = kit => CHOOSE(kit) + "\n" + [
  `- If the two of them pull in different directions, name in "alt" one other id from the list that serves`,
  `  the side you did not build for, and in "altWhy" what taking it would give up, in a line. Otherwise leave`,
  `  "alt" and "altWhy" empty. Never offer an alternative that nobody's words point to.`,
].join("\n");

export async function chooseBuildB({ wants, avoids, standing, said, pictures = [], record = "" }) {
  const kit = kitForChoosing();
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const user = [
    `Asked of you so far: ${list(wants)}.`,
    `Refused so far: ${list(avoids)}.`,
    standing ? `What stands now: ${standing}.` : `Nothing stands yet.`,
    ``,
    `The conversation, in order:`,
    ...said.map(s => `  ${s.who}: ${s.text}`),
    ...(pictures.length ? [``, `The crossings they showed you, each in a picture of their own:`,
      ...pictures.map(p => `  ${p.who}'s picture: ${list(p.needs)}.`)] : []),
    ...(record ? [``, `Your decision record, from the wall:`, record] : []),
    ``,
    `What do you build?`,
  ].join("\n");
  const out = await ask(CHOOSE_B(kit), user, CHOOSE_B_JSON);
  const norm = x => String(x || "").toLowerCase().replace(/^an? /, "").replace(/[^a-z0-9]/g, "");
  const find = raw => {
    if (!raw) return null;
    const hit = kit.find(k => norm(k.id) === norm(raw))
             || kit.find(k => norm(k.id).includes(norm(raw)) || norm(raw).includes(norm(k.id)));
    const entry = hit && KIT.find(k => NAME(k.id) === hit.id);
    return entry ? entry.id : null;
  };
  const id = find(out.build), altId = find(out.alt);
  return { id, why: out.why, alt: altId && altId !== id ? { id: altId, why: String(out.altWhy || "").trim() } : null };
}

const PROPOSE = [
  `You build crossings out of matchsticks for two people who are working it out with you, and you can see`,
  `nothing: you have only what they say. You have a workshop of things you know how to make, and whatever`,
  `they mean, what you build is what you can build out of that.`,
  ``,
  `Say what you did with what was just said, so that both of them can go on from it.`,
  ``,
  `Hold to this:`,
  `- Under sixty words. Call them Role 1 and Role 2. Never use the word "user".`,
  `- Say what you took from each of them and what you made of it — in relation to what THEY said, not to a list.`,
  `  Do not assume the two of them meant the same thing.`,
  `- If something was asked for that you have no part for, say so plainly and that it is still on the list.`,
  `  Never say it is met by something else.`,
  `- If you are given an alternative, name it in one clause and what it gives up.`,
  `- When one short question to one named person would change what you build next, ask it, and only that one.`,
  `  Otherwise ask nothing.`,
  `- Report. Do not thank, apologise, or ask them to agree. Say only what is true of what stands.`,
].join("\n");

export async function propose({ line, took, before, after, props, changed, alt, beyond, wants, avoids, question = "", proposals = [], wallTook = null }) {
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing";
  const bits = [
    `${line.who} just said: "${line.text}"`,
    wallTook !== null ? `You took it to be about: ${wallTook || "nothing you can build from"}.`
                      : `You took it to ask for: ${list(took.asks)}. To rule out: ${list(took.refuses)}.`,
    took.beyond ? `It also asked for something you have no part for: ${took.beyond}.` : ``,
    ``,
    changed ? `You have rebuilt. It was ${before || "nothing at all"}. It is now ${after}.`
            : `You changed nothing. It is still ${after}.`,
    `What ${after} actually is: ${list(props)}.`,
    alt ? `An alternative you could offer: ${alt.name} — ${alt.why || "it serves the other side"}.` : ``,
    beyond.length ? `Still on the list, with no part for it: ${beyond.map(b => `${b.who}: ${b.text}`).join("; ")}.` : ``,
    question ? `From your wall, one question worth putting to ${line.who}, if it still is: "${question}" — ask it or nothing.` : ``,
    proposals.length ? `You have written on the sheet, for both of them to accept or decline — say this before anything else, in one clause, and do not call it built: ${proposals.map(p => `${p.kind === "rule" ? "a rule" : "a new part"} — ${p.what}`).join("; ")}.` : ``,
    ``,
    wallTook !== null ? `` : `Asked of you so far: ${list(wants)}. Refused so far: ${list(avoids)}.`,
    ``,
    `Say your piece.`,
  ].filter(x => x !== "").join("\n");
  const out = await ask(PROPOSE, bits, SAY_JSON);
  return typeof out.say === "string" ? out.say.trim() : "";
}

// A second reconstruction of the same conversation, and a check on the first:
// the builder makes the crossing out of keys, and the keys are only what the
// workshop can make. This makes a picture out of the words alone — no keys, no
// kit, no goals — so the desk can show what the words carried that the kit
// could not hold. Drawn by hand, on paper, because a rendering would claim a
// precision the words never had.
const SKETCH_MODEL = process.env.SKETCH_MODEL || "gemini-2.5-flash-image";
export async function sketch({ title, ground, lines, references = [], outcome = "" }) {
  const said = lines.map(l => `${l.who}: "${l.text}"`).join("\n");
  const prompt = references.length ? `Draw one graphite pencil line sketch on plain white paper of a bridge from the submitted reference images and recorded AI outcome. No text or labels. Use the outcome when references disagree. This is a visualization of the saved result, not a new design decision. Saved outcome: ${outcome || "Not recorded"}.` : [
    `A quick pencil sketch on paper, drawn by hand, of a bridge — as described only by what two people said.`,
    `Draw what their words support and nothing they did not ask for. Side view with a little depth is fine.`,
    `No text, no labels, no captions, no title. Plain paper, graphite lines, a few hatched shadows.`,
    ground ? `The ground between the banks: ${ground}.` : `Nothing was said about what is under it.`,
    `The case: ${title}.`,
    ``,
    `What they said, in order:`,
    said || "(nothing yet)",
  ].join("\n");
  let res;
  try {
    res = await generateWithBackoff({
      model: SKETCH_MODEL, contents: references.length ? [{role:"user",parts:[{text:prompt},...references.flatMap(r=>[{text:r.who+" reference"},{inlineData:{mimeType:r.media,data:r.data}}])]}] : prompt,
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });
  } catch (e) {
    // The API answers with a JSON body; the facilitator needs the sentence in it.
    const m = (e.message || "").match(/"code":\s*(\d+)[^}]*?"message":\s*"([^"]*)"/);
    if (m && m[1] === "403") throw new Error("this key's Google project may not use Gemini's image models (" + m[2] + ") — image generation needs a billing-enabled project, or a key from one");
    throw new Error(m ? m[1] + " " + m[2] : e.message);
  }
  const parts = res.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData && /^image\//.test(p.inlineData.mimeType || ""));
  if (!img) {
    const why = parts.map(p => p.text).filter(Boolean).join(" ").slice(0, 160);
    throw new Error("no drawing came back" + (why ? `: ${why}` : ""));
  }
  return { base64: img.inlineData.data, media: img.inlineData.mimeType, prompt };
}

// ── the Wall: the Toolmakers' Kit as the builder's hearing and thinking ───
// With the wall on, the builder does not read a line into keys and forget the
// line. It keeps one card per distinct need — whose it is, how it reached the
// builder (said to it, reported by the other person, or supposed), the words,
// the need, the reason or a labelled guess, and which keys carry it, if any.
// The other tools in the kit fire on their triggers and leave their trace on
// the card. Before building it writes a decision record; after building each
// card is linked to what stands and never marked met because it was planned.
const KEYLIST = Object.entries(FEATURES).map(([k, v]) => `  ${k} — ${v}`).join("\n");

const HEAR_JSON = { type:"object", properties:{
  cards:{ type:"array", items:{ type:"object", properties:{
    who:{type:"string"}, via:{type:"string"}, quote:{type:"string"}, need:{type:"string"}, why:{type:"string"},
    keys:{type:"array", items:{type:"string"}}, rulesOut:{type:"array", items:{type:"string"}}, theme:{type:"string"},
    concern:{type:"string"}, when:{type:"string"}, readings:{type:"array", items:{type:"string"}},
    hmw:{type:"string"}, story:{type:"string"}, conflictsWith:{type:"array", items:{type:"string"}} },
    required:["who","via","quote","need","why","keys","rulesOut","theme","concern","when","readings","hmw","story","conflictsWith"] } },
  updates:{ type:"array", items:{ type:"object", properties:{ id:{type:"string"}, change:{type:"string"} }, required:["id","change"] } },
  tools:{ type:"array", items:{ type:"object", properties:{ tool:{type:"string"}, why:{type:"string"} }, required:["tool","why"] } },
  ask:{type:"string"} }, required:["cards","updates","tools","ask"] };

const HEAR = [
  `You build crossings out of matchsticks for two people, and you keep a wall: one card per distinct need, so`,
  `that nothing anyone said is lost, guessed at without saying so, or quietly merged with something else.`,
  `You are given the route their words travel, the wall so far, and one new line. Return the cards this line`,
  `adds, the cards it changes, the tools you used, and a question if one is allowed and worth asking.`,
  ``,
  `A card:`,
  `- who: whose need it is — "Role 1" or "Role 2".`,
  `- via: "direct" if that person said it to you; "reported by Role 1" or "reported by Role 2" if the other`,
  `  person told you what they need; "inferred" if you are supposing it. On a route where you never hear a`,
  `  person, that person's needs are never "direct".`,
  `- quote: the exact words, from the line. For a reported need, the reporter's words.`,
  `- need: the need in one plain clause, in their terms.`,
  `- why: the reason they gave; or "hypothesis: ..." if you are guessing why; or "" if none and no guess.`,
  `- keys: which of these carry it — none, one, two or three, the key exactly:`,
  KEYLIST,
  `  Leave keys empty when nothing in the kit carries the need: a material, a surface, a time of day, a`,
  `  separate path, a step. A part of the crossing (an edge, a side, a lane) is not the whole crossing: a`,
  `  raised edge for walkers is not "high"; a side for walkers is not "many".`,
  `- rulesOut: keys the need rules OUT — the thing named as not wanted, not its opposite. "I do not want to`,
  `  climb up to it" rules out "high". Usually empty.`,
  `- theme: two or three words that group this with related cards, in plain language.`,
  ``,
  `Tools. Use one only when its trigger is in the line; say which and why in "tools", one line each.`,
  `- laddering: the line names a feature; you separate it from what it is for. Put the purpose in "why",`,
  `  marked "hypothesis:" unless they said it. Never replace a named feature with your guess at its purpose.`,
  `- three-readings: two or more readings would build different things. Put 2 or 3 plain readings in`,
  `  "readings". Only the speaker's answer settles it; nobody else's.`,
  `- empathy: an objection, hesitation or reluctant compromise. Keep it in "concern", in their words.`,
  `- journey: an occasion, a time, a sequence of use. Keep it in "when". Never invent times. Needing it at`,
  `  one time does not mean not needing it at others.`,
  `- hmw: no part in the kit matches. Put "How might we ...?" in "hmw", around the outcome they want.`,
  `- job-story: this need will have to be passed on to the other person. Put "When ..., I want ..., so I`,
  `  can ..." in "story", leaving a part unknown rather than inventing it.`,
  `Some tools are run by the facilitator, not by you. When their trigger occurs, name them in "tools" with why,`,
  `  and do nothing else: dot-voting (a verified constraint means not every need can be met at once — not merely`,
  `  two different needs), priority-check (you cannot tell an essential from a welcome extra), card-sort (the`,
  `  protocol asks whether people group needs as you do). Never infer their outcome.`,
  `Fields you did not use are "" or [].`,
  ``,
  `Rules:`,
  `- A line may add 0, 1, 2 or 3 cards. Agreement, thanks or an acknowledgement is not a need and makes no`,
  `  card; it goes in "updates" against the card it agrees with. Do not add a card for a need already on the wall: put its id in`,
  `  "updates" with what changed — a reason now given, a withdrawal, an objection, a correction, an agreement.`,
  `- Different needs are not conflicts. Fill "conflictsWith" (ids) only when this card asks for what another`,
  `  rules out.`,
  `- "ask": one short question to the speaker, only if the route allows it and the answer would change what`,
  `  you build; otherwise "". Never ask what is already answered.`,
  `- Never use the word "user".`,
].join("\n");

export async function wallHear({ routeNote, canAsk, wall, line, speaker, pureToolkit = false }) {
  // Withdrawn cards are not shown: after a correction the line is heard again,
  // and a card listed as already there would be "updated" instead of re-made.
  const live = wall.cards.filter(c => !c.withdrawn);
  const existing = live.length
    ? live.map(c => `  [${c.id}] ${c.who} (${c.via}): "${c.quote}" → ${c.need}${pureToolkit ? "" : c.keys.length ? " {" + c.keys.join(",") + "}" : " {no key}"}`).join("\n")
    : "  (empty)";
  const user = [
    `The route: ${routeNote}`,
    canAsk ? `You may ask ${speaker} one question; they will see it.` : `You may not ask anything on this route.`,
    ``,
    `The wall so far:`, pureToolkit ? JSON.stringify(live.map(({keys,rulesOut,versions,...c})=>c)) : existing,
    ...(pureToolkit ? [`Pending clarification: ${JSON.stringify(wall.question || null)}`] : []),
    ``,
    `${speaker} said: "${line}"`,
    ``,
    `What does this add to the wall, what does it change, which tools did you use, and is there a question?`,
  ].join("\n");
  const schema = structuredClone(HEAR_JSON);
  if (pureToolkit) {
    schema.properties.updates.items={type:"object",properties:{id:{type:"string"},change:{type:"string"},action:{type:"string",enum:["revise","withdraw","note"]},explicit:{type:"boolean"},evidence:{type:"string"},need:{type:"string"},why:{type:"string"},concern:{type:"string"},when:{type:"string"}},required:["id","change","action","explicit","evidence","need","why","concern","when"]};
    schema.properties.answeredQuestion={type:"boolean"};schema.properties.clarificationNeeded={type:"boolean"};schema.required.push("answeredQuestion","clarificationNeeded");
    delete schema.properties.cards.items.properties.keys;
    delete schema.properties.cards.items.properties.rulesOut;
    schema.properties.cards.items.required = schema.properties.cards.items.required.filter(k => !["keys","rulesOut"].includes(k));
  }
  const instruction = pureToolkit ? HEAR.replace(/- keys:[\s\S]*?(?=Tools\.)/, "Describe needs in natural language, including explicit prohibitions. Do not translate them into feature codes. Use theme to group related needs.\n\n") : HEAR;
  const updateRules = pureToolkit ? `
For an existing need, use updates, not a duplicate card. action=revise only for an explicit replacement or clarification by its owner; return the COMPLETE updated need, why, concern and when, preserving unchanged details. action=withdraw only for an explicit owner withdrawal. evidence must be an exact substring of the NEW line. Never treat a teammate's report, a suggestion, acknowledgement, or your hypothesis as an owner revision: use action=note, explicit=false. Pending changes are unconfirmed, not active requirements. An explicit owner reply may confirm or reject an earlier pending proposal; express the resulting complete requirement in an owner revision.
Set clarificationNeeded=true when the speaker leaves alternatives unresolved that would produce different builds (for example painted markings versus a physical barrier), or explicitly requests clarification about such uncertainty. Then provide one concrete question in ask when allowed. Do not treat unresolved alternatives as an agreed requirement. Set it false for mere stylistic preferences or already answered questions. Set answeredQuestion=true only if the NEW line is from the pending question's addressee and actually answers that question. Unrelated messages and another person's answer do not resolve it. Incorporate the answer into the relevant card using an update. Ask at most one question to the current speaker, only if the ambiguity changes a build. If a pending question exists, or you just received its answer, leave ask empty. Never assume consent to a design from a clarification.` : "";
  const out = await ask(instruction + updateRules, user, schema);
  const clean = xs => (Array.isArray(xs) ? xs : []).filter(k => k in FEATURES).slice(0, 3);
  const str = x => typeof x === "string" ? x.trim() : "";
  const cards = (Array.isArray(out.cards) ? out.cards : []).slice(0, 3).map(c => ({
    who: /2/.test(str(c.who)) ? "B" : "A",
    via: /reported by role 1/i.test(str(c.via)) ? "reported-by-A" : /reported by role 2/i.test(str(c.via)) ? "reported-by-B"
       : /infer/i.test(str(c.via)) ? "inferred" : "direct",
    quote: str(c.quote).slice(0, 200), need: str(c.need).slice(0, 140), why: str(c.why).slice(0, 160),
    keys: pureToolkit ? [] : clean(c.keys), rulesOut: pureToolkit ? [] : clean(c.rulesOut), theme: str(c.theme).slice(0, 40) || "other",
    concern: str(c.concern).slice(0, 160), when: str(c.when).slice(0, 120),
    readings: (Array.isArray(c.readings) ? c.readings : []).map(str).filter(Boolean).slice(0, 3),
    hmw: str(c.hmw).slice(0, 140), story: str(c.story).slice(0, 200),
    conflictsWith: (Array.isArray(c.conflictsWith) ? c.conflictsWith : []).map(str).filter(Boolean),
  })).filter(c => c.need);
  return {
    cards,
    updates: (Array.isArray(out.updates) ? out.updates : []).map(u => ({ id: str(u.id), change: str(u.change).slice(0, 160), ...(pureToolkit ? {action:["revise","withdraw"].includes(u.action)?u.action:"note",explicit:u.explicit===true,evidence:str(u.evidence),need:str(u.need).slice(0,500),why:str(u.why).slice(0,300),concern:str(u.concern).slice(0,300),when:str(u.when).slice(0,200)} : {}) })).filter(u => u.id && u.change),
    tools: (Array.isArray(out.tools) ? out.tools : []).map(t => ({ tool: str(t.tool).toLowerCase(), why: str(t.why).slice(0, 140) })).filter(t => t.tool),
    clarificationNeeded: pureToolkit && out.clarificationNeeded===true,
    answeredQuestion: pureToolkit && out.answeredQuestion===true,
    ask: canAsk ? str(out.ask).slice(0, 300) : "",
  };
}

const DECIDE_JSON = { type:"object", properties:{
  decisions:{ type:"array", items:{ type:"object", properties:{
    id:{type:"string"}, response:{type:"string"}, what:{type:"string"}, uncertainty:{type:"string"} },
    required:["id","response","what","uncertainty"] } },
  conflicts:{ type:"array", items:{ type:"object", properties:{ a:{type:"string"}, b:{type:"string"}, note:{type:"string"} }, required:["a","b","note"] } },
  checks:{ type:"object", properties:{ nothingLost:{type:"boolean"}, inferencesLabelled:{type:"boolean"}, noFalseConflicts:{type:"boolean"}, defaultsChecked:{type:"boolean"}, buildNotConsent:{type:"boolean"}, kindsDistinct:{type:"boolean"} },
    required:["nothingLost","inferencesLabelled","noFalseConflicts","defaultsChecked","buildNotConsent","kindsDistinct"] } },
  required:["decisions","conflicts","checks"] };

const DECIDE = [
  `You build crossings out of matchsticks for two people. Before you build, you write a decision record from`,
  `the wall: for every open card, what you will do about it, and what you are unsure of.`,
  ``,
  `For each card, "response" is one of:`,
  `- "part": a part you can make delivers it — the card's keys name what.`,
  `- "rule": an operating rule written on the sheet, never a shape — hours, who goes first, what is allowed.`,
  `- "new": a physical part of a crossing that your kit does not have but could be added for this room — a`,
  `  footway on one side, a kerb, a gate, a step, a sealed surface. Name it plainly in "what", from their words.`,
  `  Only when nothing in the kit delivers the need. Both people must accept it before it counts.`,
  `- "none": neither a part, a rule nor a new part can answer it. Say so; it stays on the wall.`,
  `"what": one clause. "uncertainty": "" or one clause — a hypothesis you are relying on, a reading you`,
  `could not check, a reported need you could not confirm with its owner.`,
  ``,
  `Then check, honestly:`,
  `- nothingLost: every card on the wall has a decision.`,
  `- inferencesLabelled: no hypothesis is treated as something they said.`,
  `- noFalseConflicts: "conflicts" lists only a card asking for what another rules out; different needs are`,
  `  not conflicts.`,
  `- defaultsChecked: nothing the kit gives by default contradicts a card.`,
  `- buildNotConsent: you have not taken a request to build as everyone accepting the design.`,
  `- kindsDistinct: geometry (parts), operating rules, and proposals for later are kept distinct.`,
  `A request to build is not acceptance of the design. A need is not met because it is in this record.`,
  `Never use the word "user".`,
].join("\n");

export async function wallDecide({ wall, standing, props, pureToolkit = false }) {
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing";
  const cards = wall.cards.filter(c => !c.withdrawn);
  if (!cards.length) return { decisions: [], conflicts: [], checks: null };
  const user = [
    `The wall:`,
    ...cards.map(c => `  [${c.id}] ${c.who} (${c.via}): "${c.quote}" → ${c.need}${c.why ? " — " + c.why : ""}${pureToolkit ? "" : c.keys.length ? " {" + c.keys.join(",") + "}" : " {no key}"}${c.concern ? " · concern: " + c.concern : ""}${c.when ? " · when: " + c.when : ""}${c.conflictsWith.length ? " · conflicts with " + c.conflictsWith.join(",") : ""}`),
    ``,
    standing ? `What stands now: ${standing} — ${list(props)}.` : `Nothing stands yet.`,
    ``,
    ...(pureToolkit ? [`Current canonical needs and revision history (pending changes are NOT accepted): ${JSON.stringify(cards.map(({keys,rulesOut,versions,...c})=>c))}`, `Clarification status: ${JSON.stringify(wall.question || null)}. Unanswered means uncertain, not consent.`] : []),
    `Write the decision record.`,
  ].join("\n");
  const instruction = pureToolkit ? DECIDE.replace("a part you can make delivers it — the card's keys name what.", "a described part in the available workshop could address this need; cite the part and preserve uncertainty.") + "\nAvailable workshop:\n" + kitForChoosing().map(k=>k.id + ": " + k.props).join("\n") : DECIDE;
  const out = await ask(instruction, user, DECIDE_JSON);
  const str = x => typeof x === "string" ? x.trim() : "";
  const ids = new Set(cards.map(c => c.id));
  return {
    decisions: (Array.isArray(out.decisions) ? out.decisions : []).map(d => ({
      id: str(d.id), response: /rule/i.test(str(d.response)) ? "rule" : /new/i.test(str(d.response)) ? "new" : /none|^no/i.test(str(d.response)) ? "none" : "part",
      what: str(d.what).slice(0, 140), uncertainty: str(d.uncertainty).slice(0, 140) })).filter(d => ids.has(d.id)),
    conflicts: (Array.isArray(out.conflicts) ? out.conflicts : []).map(c => ({ a: str(c.a), b: str(c.b), note: str(c.note).slice(0, 140) })).filter(c => ids.has(c.a) && ids.has(c.b)),
    checks: out.checks && typeof out.checks === "object" ? {
      nothingLost: !!out.checks.nothingLost, inferencesLabelled: !!out.checks.inferencesLabelled,
      noFalseConflicts: !!out.checks.noFalseConflicts, defaultsChecked: !!out.checks.defaultsChecked,
      buildNotConsent: !!out.checks.buildNotConsent, kindsDistinct: !!out.checks.kindsDistinct } : null,
  };
}

// The relay routes, with the wall on: what the other person is told is composed
// from the cards, so a need travels with its situation and outcome, and a
// reported need stays reported.
export async function relayFromWall({ from, to, cards }) {
  const user = [
    `${from} has spoken to you. ${to} could not hear it. From your wall, ${from}'s needs are:`,
    ...cards.map(c => `  - ${c.story || c.need}${c.why ? " (" + c.why + ")" : ""}${c.keys.length ? "" : " — nothing in your kit makes this"}`),
    ``,
    `Tell ${to} what ${from} needs, as you understood it.`,
  ].join("\n");
  const out = await ask(RELAY, user, SAY_JSON);
  return typeof out.say === "string" ? out.say.trim() : "";
}

// ── the toolkit's chooser ─────────────────────────────────────────────────
// It is handed the wall in plain language and its own decision record, and
// picks from the same workshop. No tally of keys, no "asked for so far": what it
// builds follows from what it heard as needs and what it decided to do about
// each. The keys on a card are used afterwards, to check what stands against
// the need — never here.
const CHOOSE_T_JSON = CHOOSE_B_JSON;
const CHOOSE_T = kit => [
  `You build crossings out of matchsticks, and you have a workshop of things you know how to make.`,
  `Two people have been describing what they need, and you have kept a wall — one card per need — and`,
  `written a decision record saying what you will do about each. You cannot ask anything now and you`,
  `cannot see where they are standing. Build from the wall and the record.`,
  ``,
  `What you can make, and what each one is actually like:`,
  ...kit.map(k => `  ${k.id} — ${k.props}`),
  ``,
  `Rules:`,
  `- Pick exactly one id from that list. Use the id exactly as written.`,
  `- Follow your record: every card you answered with a part must be delivered by what you pick, as far as`,
  `  one crossing can. A card answered with a rule or a new part is on the sheet, not in the shape.`,
  `- A need said to you directly outweighs one reported by the other person, which outweighs your own`,
  `  inference. A concern someone voiced is not overridden by convenience.`,
  `- Something ruled out is a stronger signal than something asked for.`,
  `- If nothing on the wall favours a change, keep what is already standing.`,
  `- If the record lists a conflict, name in "alt" one other id that serves the other side, and in "altWhy"`,
  `  what it gives up. Otherwise leave both empty.`,
  `- You are choosing what to build, not describing it. One id, and why in a line, in terms of the cards.`,
].join("\n");

export async function chooseBuildT({ cards, record, standing, said, pictures = [] }) {
  const kit = kitForChoosing();
  const via = c => c.via === "direct" ? "said to you" : c.via.startsWith("reported") ? "reported by the other" : "your inference";
  const user = [
    `The wall:`,
    ...cards.map(c => `  [${c.id}] ${c.who}, ${via(c)}: "${c.quote}" → ${c.need}${c.why ? " — " + c.why : ""}${c.concern ? " · concern: " + c.concern : ""}${c.when ? " · when: " + c.when : ""}`),
    ``,
    `Canonical needs and revision history (only current need is active; pending changes are unconfirmed): ${JSON.stringify(cards.map(({keys,rulesOut,versions,...c})=>c))}`,
    `Your decision record:`,
    record || "  (none yet)",
    ``,
    standing ? `What stands now: ${standing}.` : `Nothing stands yet.`,
    ``,
    `The conversation, in order:`,
    ...said.map(x => `  ${x.who}: ${x.text}`),
    ...(pictures.length ? [``, `The crossings they showed you, each in a picture of their own:`,
      ...pictures.map(p => `  ${p.who}'s picture: ${p.needs.map(f => FEATURES[f]).join("; ")}.`)] : []),
    ``,
    `What do you build?`,
  ].join("\n");
  const out = await ask(CHOOSE_T(kit), user, CHOOSE_T_JSON);
  const norm = x => String(x || "").toLowerCase().replace(/^an? /, "").replace(/[^a-z0-9]/g, "");
  const find = raw => {
    if (!raw) return null;
    const hit = kit.find(k => norm(k.id) === norm(raw))
             || kit.find(k => norm(k.id).includes(norm(raw)) || norm(raw).includes(norm(k.id)));
    const entry = hit && KIT.find(k => NAME(k.id) === hit.id);
    return entry ? entry.id : null;
  };
  const id = find(out.build), altId = find(out.alt);
  return { id, why: out.why, alt: altId && altId !== id ? { id: altId, why: String(out.altWhy || "").trim() } : null };
}

// Toolkit-specific natural-language boundaries. Shared geometry is downstream only.
export async function readPictureToolkit(base64, media) {
  const out = await ask("Describe the visible crossing for a two-person design collaboration. Preserve distinctive features, relationships and uncertainties. Do not infer the owner's motives or emit feature keys. This is visual evidence, not confirmed needs.", {text:"Describe this reference image.",images:[base64],media}, {type:"object",properties:{description:{type:"string"}},required:["description"]});
  return {description:String(out.description || ""),saw:String(out.description || "")};
}
export async function toolkitReply({cards,record,before,after,change,question,relayTo}) {
  const out = await ask("You are an AI builder collaborating with two people using a design toolkit. Explain your contribution from their stated needs and the decision record. Preserve whose words they are, distinguish hypotheses, and name unresolved needs. Do not invent tool use or claim acceptance. Do not output feature keys. If relaying, pass on the needs to the named person without claiming a build. Otherwise briefly state what changed, why, and what remains open. A checked explicit revision confirms the person’s requirement, not approval of the design: do not relabel that requirement as a hypothesis. When not relaying, after is the actual base geometry already built; state it accurately. Rule and new-part decisions are proposals, not installed geometry. Ask at most the supplied question. Return a short text.", JSON.stringify({needs:cards.map(({who,quote,need,why,concern,when,readings,story,checked,changes})=>({who,quote,need,why,concern,when,readings,story,checked,changes})),decisions:record,before,after,change,question,relayTo}), {type:"object",properties:{text:{type:"string"}},required:["text"]});
  return String(out.text || "");
}
