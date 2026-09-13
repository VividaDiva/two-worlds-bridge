// Role 3, for the human test.
//
// The three calls are the ones run.mjs makes, with the same system prompts, so
// a builder facing two people behaves as it did facing two models. It reads a
// sentence into needs, chooses from the workshop, and says what it did. It is
// never told what anybody meant, and it may not ask.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { FEATURES, KIT, NAME, AXES, CHOICES, propsOf, kitForChoosing } from "./kit.mjs";

const MODEL = process.env.BUILDER_MODEL || "claude-opus-5";
const anthropic = new Anthropic();

const Read   = z.object({ asks: z.array(z.string()), refuses: z.array(z.string()) });
const Choose = z.object({ build: z.string(), why: z.string() });
const Say    = z.object({ say: z.string() });
const Shape  = z.object(Object.fromEntries(
  AXES.map(a => [a, z.enum(Object.keys(CHOICES[a]))])));

// A prompt is either a string or a string with pictures after it. The order is
// not cosmetic: pictures before the sentence were refused where the same
// pictures after it were not.
const content = u => typeof u === "string" ? u : [
  { type: "text", text: u.text },
  ...u.images.map(data => ({ type: "image",
    source: { type: "base64", media_type: u.media || "image/png", data } })),
];

// Refusals here are intermittent and clear on a retry more often than not.
// Always the same model: swapping would mean comparing two builders without
// saying so.
async function ask(system, user, schema) {
  let r = await anthropic.beta.messages.parse({
    model: MODEL, max_tokens: 8192, system,
    messages: [{ role: "user", content: content(user) }],
    output_config: { format: betaZodOutputFormat(schema) },
  });
  for (let n = 0; n < 4 && r.stop_reason === "refusal"; n++) {
    r = await anthropic.beta.messages.parse({
      model: MODEL, max_tokens: 8192, system,
      messages: [{ role: "user", content: content(user) }],
      output_config: { format: betaZodOutputFormat(schema) },
    });
  }
  if (r.stop_reason === "refusal")
    throw new Error(`the builder declined five times running (${r.stop_details?.category ?? "unknown"})`);
  if (r.parsed_output) return r.parsed_output;
  if (r.stop_reason === "max_tokens") throw new Error("the builder was cut off at max_tokens");
  const text = (r.content || []).filter(c => c.type === "text").map(c => c.text).join("").trim();
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error(`the builder returned no JSON: ${text.slice(0, 120)}`);
  return schema.parse(JSON.parse(json[0]));
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
const SEE = [
  `Somebody has shown you a picture of a crossing. Describe it on these axes, choosing one value for each.`,
  ``,
  ...AXES.map(a => `  ${a}: ` + Object.entries(CHOICES[a]).map(([k, v]) => `${k} (${v})`).join(", ")),
  ``,
  `Judge only what you can see. If the picture does not settle an axis, choose the plainer value.`,
].join("\n");

export async function readLine(text) {
  const out = await ask(READ, `The sentence: "${text}"\n\nWhat does it ask for, and what does it refuse?`, Read);
  const clean = xs => (Array.isArray(xs) ? xs : []).filter(k => k in FEATURES).slice(0, 3);
  return { asks: clean(out.asks), refuses: clean(out.refuses) };
}

export async function chooseBuild({ wants, avoids, standing, said }) {
  const kit = kitForChoosing();
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const user = [
    `Asked of you so far: ${list(wants)}.`,
    `Refused so far: ${list(avoids)}.`,
    standing ? `What stands now: ${standing}.` : `Nothing stands yet.`,
    ``,
    `The conversation, in order:`,
    ...said.map(s => `  ${s.who}: ${s.text}`),
    ``,
    `What do you build?`,
  ].join("\n");
  const out = await ask(CHOOSE(kit), user, Choose);
  const norm = x => String(x).toLowerCase().replace(/^an? /, "").replace(/[^a-z0-9]/g, "");
  const hit = kit.find(k => norm(k.id) === norm(out.build))
           || kit.find(k => norm(k.id).includes(norm(out.build)) || norm(out.build).includes(norm(k.id)));
  const entry = hit && KIT.find(k => NAME(k.id) === hit.id);
  return { id: entry ? entry.id : null, why: out.why, unmatched: hit ? null : out.build };
}

export async function speak({ said, took, before, after, props, wants, avoids, changed }) {
  const list = ks => ks.length ? ks.map(f => FEATURES[f]).join("; ") : "nothing yet";
  const bits = [
    `They said: "${said}"`,
    `You took it to be about: ${took.length ? list(took) : "nothing you can build from"}.`,
    ``,
    changed ? `You have rebuilt. It was ${before || "nothing at all"}. It is now ${after}.`
            : `You changed nothing, and why is the only thing worth saying.`,
    `What ${after} actually is: ${list(props)}.`,
    ``,
    `Asked of you so far: ${list(wants)}.`,
    `Refused so far: ${list(avoids)}.`,
    ``,
    `Say your piece.`,
  ].join("\n");
  const out = await ask(SAY, bits, Say);
  return typeof out.say === "string" ? out.say.trim() : "";
}

// Returns the eight axes and the needs they imply. Used on upload only.
export async function readPicture(base64, media) {
  const out = await ask(SEE, { text: "What is this crossing like?", images: [base64], media }, Shape);
  const shape = Object.fromEntries(AXES.map(a => [a, out[a]]));
  return { shape, needs: propsOf(shape) };
}
