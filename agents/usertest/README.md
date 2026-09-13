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
