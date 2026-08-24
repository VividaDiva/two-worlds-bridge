# Two models, one machine

Role 1 and Role 2 played by two different providers, arguing through the same
deterministic builder the browser simulation uses.

The scripted version in the browser shows the mechanism is **possible** and is
reproducible and shareable. This shows whether it **happens** when the language
is real — and if two systems that were never aligned with each other still end
up with the machine building something neither of them named, that is a much
stronger claim than a script demonstrating it.

## Setup

```bash
cd agents
npm install
cp .env.example .env      # then put your keys in it
```

`.env` is gitignored. Keys are read from the environment and never written to a
session file.

```bash
node --env-file=.env run.mjs --scenario places --case given
```

| Flag | Values | Default |
|---|---|---|
| `--scenario` | `places` · `loads` · `refs` | `places` |
| `--case` | `given` · `swapped` · `separate` | `given` |
| `--turns` | how many turns to run | `16` |
| `--a` / `--b` | `openai` · `claude` — who plays which role | `openai` / `claude` |

Swap the players to check that a finding belongs to the *speech act* rather than
to one provider's habits:

```bash
node --env-file=.env run.mjs --case given --a claude --b openai
```

## What is fixed and what is not

**The machine is deterministic and unchanged.** If both participants *and* the
builder were models, nothing in the run would be measurable. With the builder
fixed, the question is clean: what do two real language producers do to it?

**Each participant returns what it says and what it means.** Free text would
leave us guessing what an utterance asserted, and the word ledger and provenance
measures would stop being evidence. So every turn comes back as

```json
{ "say": "to get over without ending up soaked to the knees",
  "asserts": ["water"] }
```

The model writes the sentence; it also declares the intent. Only the wording is
generated.

**Constraints are enforced, not requested.** Every turn is checked: no structure
or ground may be named, the fixed opening may not be repeated, a refuser may not
smuggle a request in as a double negative, and something must be asserted. A turn
that breaks a rule is sent back with the specific violation, up to four times.
Violations are recorded in the session file — *how often each model breaks the
rule it was given* is a finding in itself.

## One run proves nothing

Two model participants make every run different in ways you do not control. A
single run per case is an anecdote. Run each case ten times and compare
distributions:

```bash
for i in $(seq 1 10); do node --env-file=.env run.mjs --case given; done
for i in $(seq 1 10); do node --env-file=.env run.mjs --case separate; done
```

Each run writes `sessions/<scenario>-<case>-<timestamp>.json` containing the full
transcript, every assertion, the outcome, the provenance breakdown, the word
ledger and the rule violations.

## Status

The engine is tested and matches the browser build: given the same assertions it
reaches the same structures and the same provenance. **The two API calls are
untested** — writing them needed no keys, running them does, and the keys are
yours. Expect to fix small things on first run.

The Anthropic half is written against the current SDK (`messages.parse` with a
Zod output format; Opus 5 runs adaptive thinking when `thinking` is omitted). A
refusal is surfaced as an error rather than quietly rerouted to another model — a
silent fallback would mean comparing two different players without knowing it.

The OpenAI half is written from general knowledge of that SDK rather than from a
bundled specification. Check the call shape and the model name against their
current documentation before reading much into a result.
