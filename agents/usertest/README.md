# Collaboration studio

Two people and one AI builder. The studio stores independent conversations by collaboration pair, scenario, communication path and AI process (Control or Toolkit). Start with `all` for shared-screen sessions; one participant confirming asks the AI to build, not mutual consent.

Run from `agents/` with Node 24+: `node --env-file=.env usertest/server.mjs`. Use the existing `.env` configuration with GEMINI_API_KEY (or GOOGLE_API_KEY); the current server also checks ANTHROPIC_API_KEY at startup. Never commit credentials. This server imports the real Gemini builder; the design preview mock is not part of this repository.

Run checks: `node --test usertest/modes.test.mjs usertest/room-history.test.mjs usertest/toolkit-ui.test.mjs`.

`SESSIONS_DIR` and `UPLOADS_DIR` can isolate test data. The private `profiles.json` index lives one directory above SESSIONS_DIR. Session data, uploaded assets and profiles are ignored by Git. Back them up privately. The public studio has no participant authentication; access follows the existing facilitator deployment.

`live.html` on GitHub Pages redirects to the live.json tunnel address. GitHub Pages does not host the Node/API backend. The Mac server and Cloudflare tunnel must stay running; keepalive.sh maintains them and updates live.json. Opening the entry resumes profiles instead of creating a fresh room.

Historical mode provenance remains labeled unknown when absent. Retrospective sketches are marked separately from original study artifacts. Control and Toolkit can generate text and reference-image sketches; the latter use submitted images and the saved AI outcome. Do not interpret these visual probes as evidence of historical Toolkit use.

---

## Earlier experiment documentation

# The same study, with two people in the chairs

The experiment next door runs Role 1 and Role 2 as language models. This runs
them as people. Role 3 is still an AI, still building from their words alone,
still unable to ask anything — and still `gemini-flash-lite-latest`, the model
that sat in that chair for every published session, so the comparison holds.

Everything else is held the same on purpose — the five arguments, the goals,
the eight routes, the workshop of crossings, and the rule that nobody may name
a made thing. The vocabulary is imported from `../engine.mjs` rather than
copied, so the two sets of sessions can be laid side by side and the only
difference is who was in the chairs.

## Running a session

```bash
cd agents
node --env-file=.env usertest/server.mjs
```

Open **http://localhost:8780/**. Pick what they are arguing about and how their
words are allowed to travel, then open a room. You get two links — send one to
each person, on their own phone or laptop.

Opening `/desk` (the public `live.html` entry) starts a fresh room with an empty
chat. **New room** on the facilitator desk starts another room with the same
scenario and route. Previous conversations stay in **History**, including both
participants' messages and AI replies. Use a room-specific `/j/<room>/both`,
`/A`, or `/B` link to resume or refresh an existing session. A new room has new
participant links; existing participants remain in their original room.

The key stays in this process. Participants never hold it and never see it.

## What each person sees

Only what their route allows: their own goal, the other person's lines if they
are allowed to hear them, and the builder's lines if they are allowed to hear
those. The facilitator sees everything.

Nobody is shown the latent need their goal implies — not the person holding it,
not the other one, and not the builder. It surfaces once, in the facilitator's
view, after the session is ended.

## Two references

That argument asks each person to bring a picture of the crossing they have in
mind. Neither sees the other's, and the builder never sees either. When a
picture arrives it is read onto the same eight axes the workshop is built from,
which is where that person's latent need comes from — exactly as a written goal
supplies one in the other four arguments.

## What is kept

Each change saves `sessions/<room>.json`: who said what, in what order,
what the builder took each line to mean, what it built, and what each person
needed. Uploaded pictures are written to `uploads/`.

Both directories are gitignored. What people brought to a session and what they
said in it is theirs, not the repository's.

## Notes

- `PORT=8790 node --env-file=.env usertest/server.mjs` to move it.
- `BUILDER_MODEL=gemini-2.5-flash-lite` to change who builds. The default is
  `gemini-flash-lite-latest`, which is what sat in this chair for every
  published session of the machine experiment — `run.mjs` runs with
  `--machine gemini`, so Role 3 was never Claude.
- Saved rooms are restored after a server restart. History remains available;
  reopening the public entry still starts a fresh room.
- A line naming a made thing is refused back to the person with the word named,
  so they can say it another way. That is the rule working, not an error.

## Condition B: developing it together

The eight routes above are condition A: the AI builds from what it is handed,
and the two people never see the bridge. The ninth route, **develop**, is
condition B, and the only route that changes what a participant's page shows.

Both people and the AI are in one conversation, with the bridge drawn on both
people's screens. Nobody waits for a turn. Once both have said something the
AI makes a first version; after that it revises after every message, and says
what it took from each of them, what it could not carry (in their words), and
— only when one of them asked for what the other ruled out — one other way.
Under each line each person sees what the AI took it to mean, marked as its
guess; on their own lines, **Not quite →** lets them say what they meant, the
line is read again, the earlier reading is kept, and the AI revises. The other
person's line has **Build on this**; a part of what stands can be tapped to
talk about it; an offered alternative has **Try this one**; either person can
**Finish**, and what is still open between them stays on the screen after.

What is held the same as condition A, on purpose: the five arguments and their
goals, the kit of crossings, the reader's rules for turning a sentence into
keys, the chooser's rules, the model, the scoring, and the records. What is
added to the reader is one field — what the sentence asked for that no key can
carry — and to the chooser one optional field, an alternative. The AI's
*speaking* prompt is different on this route: it proposes rather than reports.

Every line in a condition-B record carries `replyTo` (the line it built on),
`part` (the feature it was about), `corrected` and `was` (a correction and the
reading it replaced), `prefer` (an alternative taken); every AI line carries
`diff` (features added and removed, and who had named each) and `alt`. The
record is marked `version: "B"`. A room can be read afterwards for whether one
person developed the other's idea, whether an AI proposal drew a new
contribution, whether both could change the outcome, and what was left open.

For a comparison, pair `develop` with `both` on the same argument: two
separate contributions built once, against the same two people developing a
first version together.

## The Wall: hearing and thinking through the Toolmakers' Kit

On any route the desk's bar has a third row — **AI hears: keys only** or
**with the Wall**. With the wall on, the AI keeps one card per distinct need:
whose it is; how it reached the AI (said to it, reported by the other person,
or its own inference — on a route where it never hears Role 1, Role 1's needs
are never "said to it"); the words; the need in their terms; the reason they
gave or a hypothesis labelled as one; which keys carry it, or none; a theme.
The kit's tools fire on their triggers and leave a trace on the card and in a
log: laddering, three readings, empathy, journey, how-might-we, job story. A
question is asked only where the route lets that speaker hear the AI.

Before each build the AI writes a decision record — part, rule or none per
card, with any uncertainty, conflicts only where one card asks for what
another rules out, and four checks — which the chooser is handed as context.
After each build every card is linked to what stands, computed from keys:
met, partly met, not met, or no part for it. Nothing is met because it was
planned, and the spoken line has to name what it could not carry. On the
relay routes the message to the other person is composed from the cards.

The same keys feed the same tally, so what is built is chosen the same way
with the wall on or off; records carry `agent: "keys" | "wall"`. The
facilitator sees the wall, the tool trace and the record on the desk and in
history; on the `develop` route both people see it, and after Finish each is
asked to describe the bridge as they see it (the retrospective walkthrough,
kept apart from the score, under `retro`).

Not automated, by design: open card sort, dot voting, Kano, repertory grid,
Wizard of Oz. Those are research activities the facilitator runs.

### The sheet: every need gets a response

With the wall on, the decision record answers every card one of four ways:
a **part** from the kit; a **rule** — an operating rule written on the sheet,
never a shape (hours, who goes first); a **new part** — a physical part the kit
does not have but could be added for this room (a footway on one side, a
kerb, a gate, a step), named from their words; or **none**. Rules and new
parts go on the sheet, where either person can accept or decline them; one
counts only once both have accepted, a decline is recorded as a decline (by
whom), and a declined proposal is not put back. The card's status follows:
*proposed*, *met by a rule*, *met by a new part*, or *no part for it*.

Under each of the AI's answers on the `develop` route, and in the facilitator's
trace on every route, is what it did that turn: what it heard as needs, which
tools fired, what it decided (so many from the kit, so many rules, so many new
parts, so many with no part), what it proposed, what still has no part, and
what it asked. When the AI is unsure what someone meant it gives two or three
readings; the speaker taps one and the line is read again with it.

### The sheet, drawn

The crossing is drawn turned a little (an oblique view), so its width and
anything beside the walk can be seen. When both people have accepted a new
part from the sheet, it is drawn as an added layer in the wall's colour — a
footway as a dashed deck beside the walk, a gate as an upright at each end, a
kerb as a raised edge, a sealed surface as a wash. Rules stay as text. The
layer changes nothing about the kit, the choosing or the score; the control
agent's bridge never carries it. Under the drawing, a legend says what was
drawn from the sheet and what on the sheet cannot be drawn.
