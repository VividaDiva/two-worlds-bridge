# Two models arguing, and a third reading them

Role 1 and Role 2 played by two different providers. The machine between them
builds with the same deterministic kit the browser simulation uses — and, like
the simulation, it is told nothing about what anybody meant. It gets the
sentence.

The scripted version in the browser shows the mechanism is **possible**, and is
reproducible and shareable. This shows whether it **happens** when the language
is real.

## Setup

```bash
cd agents
npm install
cp .env.example .env      # then put your keys in it
```

`.env` is gitignored. Keys are read from the environment and never written to a
session file.

```bash
node --env-file=.env run.mjs --scenario places --case given --machine llm
```

| Flag | Values | Default |
|---|---|---|
| `--scenario` | `places` · `loads` · `refs` | `places` |
| `--case` | `given` · `swapped` · `separate` | `given` |
| `--machine` | `llm` · `keyword` — how the builder reads what it is told | `llm` |
| `--turns` | how many turns to run | `16` |
| `--a` / `--b` | `openai` · `claude` — who plays which role | `openai` / `claude` |

Swap the players to check that a finding belongs to the *speech act* rather than
to one provider's habits:

```bash
node --env-file=.env run.mjs --case given --a claude --b openai
```

## What is fixed and what is not

**The kit is fixed.** Six structures, fourteen features, one scoring rule. If
the builder were a model too, nothing in the run would be measurable.

**How the builder reads is not.** `--machine keyword` gives it the word list the
browser page uses. `--machine llm` gives it a language model that sees one
sentence at a time, with no memory of the conversation and no idea who is
speaking — a builder parsing a request, not a third party following an argument.
Both readings are computed and recorded every turn, whichever one is driving, so
a session tells you where they diverged.

**Nobody's intention reaches the builder.** Each participant states the needs it
means by its sentence. That goes into the session file as the answer key and
nowhere else. It is what "the machine took 6 of 13 sentences as they were meant"
is measured against.

**Constraints are enforced, not requested.** Every turn is checked: no structure
or ground may be named, the fixed opening may not be repeated, a refuser may not
smuggle a request in as a double negative, and something must be meant. A turn
that breaks a rule is sent back with the specific violation, up to four times.
Violations are recorded — *how often each model breaks the rule it was given* is
a finding in itself.

## Know what the crude reader scores first

No keys needed. This pulls every written sentence out of the browser page along
with the need it was written to state, runs the word list over it, and reports
how often they agree:

```bash
node read-check.mjs
```

At the time of writing: **216 sentences, 77% taken as meant, 12% taken as
something else entirely.** It is deafest to `steady` (8/18), `light` (10/21) and
`guarded` (10/18) — which are exactly the needs whose words are shared with
other needs.

That is the number a language model has to beat, and the more interesting
question is not whether it beats it but *whether it fails on the same sentences*.
Add `--misses` to see every one the word list gets backwards.

## One run proves nothing

Two model participants make every run different in ways you do not control. A
single run per case is an anecdote. Run each case ten times and compare:

```bash
for i in $(seq 1 10); do node --env-file=.env run.mjs --case given; done
for i in $(seq 1 10); do node --env-file=.env run.mjs --case separate; done
```

Each run writes `sessions/<scenario>-<case>-<timestamp>.json` with the full
transcript, both readings of every sentence, the outcome, the provenance
breakdown, the word ledger and the rule violations.

## Putting a run into the page

The page has to stay one file that makes no network call — that is what lets it
be shared as a link with no key anywhere near it. So sessions are not fetched,
they are written in:

```bash
node inline-session.mjs                     # every session in ./sessions
node inline-session.mjs sessions/one.json   # just this one
node inline-session.mjs --clear             # take them back out
```

A **Recorded runs** tab appears in the page once there is something in it, and
disappears again when there is not. Re-run this after regenerating the page from
its source, or the sessions go with it.

## Status

The engine matches the browser build: given the same features it reaches the
same structures and the same provenance. `read-check.mjs` and
`inline-session.mjs` have both been run, and the replay path has been checked
end to end with a fixture.

`run.mjs` runs as far as the first API call and is stopped there by a 401 —
`.env` still holds the example's placeholder values. **Put real keys in it and
the run proceeds.** Three things had to be fixed to get that far, and they are
worth knowing about if you upgrade anything:

- Structured output is under `beta` in SDK 0.71: `client.beta.messages.parse`,
  not `client.messages.parse`.
- The Zod helper is `@anthropic-ai/sdk/helpers/beta/zod`, exporting
  `betaZodOutputFormat`.
- That helper calls `z.toJSONSchema`, which is Zod 4, and it resolves its own
  copy of `zod` — so the `zod/v4` subpath of a Zod 3 install does not reach it.
  This package now depends on `zod@^4`.

Opus 5 runs adaptive thinking when `thinking` is omitted. A refusal is surfaced
as an error rather than quietly rerouted: a silent fallback would mean comparing
two different players without knowing it.

The OpenAI half is written from general knowledge of that SDK rather than from a
bundled specification. Check the call shape and the model name against their
current documentation before reading much into a result.
