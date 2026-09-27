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

Ending a session writes `sessions/<room>.json`: who said what, in what order,
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
- Rooms live in memory. Restarting the server ends any session in progress —
  finish a session before restarting.
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
