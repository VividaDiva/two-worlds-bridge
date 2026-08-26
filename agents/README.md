# Three roles, three models

Role 1 wants one kind of crossing, Role 2 wants another, and Role 3 has to build
something out of what they say. All three are language models, and they can be
three different ones — the point of which is below.

Role 3 is a person with a workshop, not a machine. Six things they know how to
make, no way to ask a question, and only sentences to go on. That is Reddy's
toolmaker: the limit is what is to hand. What Role 3 does NOT do is choose the
structure freely — they say what they take the other two to need, and a fixed
scoring rule turns those needs into one of the six. If they both interpreted and
built, a strange crossing would be unattributable; with the rule fixed, every
difference between one reader and another is a difference in hearing.

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
| `--case` | `given` · `swapped` · `separate` · `reply` | `given` |
| `--goals` | `strict` · `loose` — whether either of them is told what to want | `strict` |
| `--seed` | which pair of lives a loose run draws | the clock |
| `--machine` | `claude` · `openai` · `gemini` · `keyword` — who reads what the builder is told | `claude` |
| `--turns` | how many turns to run | `16` |
| `--a` / `--b` | `openai` · `claude` · `gemini` — who plays which role | `openai` / `claude` |

Swap the players to check that a finding belongs to the *speech act* rather than
to one provider's habits:

```bash
node --env-file=.env run.mjs --case given --a claude --b openai
```

**One key is enough.** Every part can be played by either provider, so with only
an OpenAI key:

```bash
node --env-file=.env run.mjs --a openai --b openai --machine openai
```

That is a complete run — two model participants and a model reading them. It is
weaker evidence than two providers, because both arguers share a set of habits
and a way of hearing, so a misreading they agree on might be a house style rather
than a property of the channel. Worth knowing, not worth waiting for.

## Why it kept building the same log

Twelve of twenty-seven runs came out a single log, and the obvious suspects were
all innocent. Three things were measured and none of them was the cause:

- **The tiebreak.** A quarter of runs ended in an exact tie at the top, settled
  by position in `KIT` — which is to say by nothing. Worth fixing, and fixed
  (what stands stays standing on a tie; on the first build, the structure whose
  properties have most been talked about). It moves the log from 12 to 10.
- **The refusal weight.** `W_AVOID` at twice `W_WANT` looked like it must be
  stripping richer structures back to the bare one. Replaying every run at
  `-3`, `-2`, `-1` and `0` gives 11 or 12 logs every time. It is not the weights.
- **The kit.** All six structures carry three to five properties. Nothing is
  penalised for being elaborate.

What it actually was: **`minimal` was asserted 124 times across 27 runs, more
than any other need in the list, and exactly one structure in the kit has it.**
Every one of those went to the single log and nowhere else.

And `minimal` was asserted that often because the briefs said to. `places`
opened *"Both of you want one log across"* and handed each of them "a single log"
as their private goal; `loads` gave Role 1 "a plain log to walk over". Two of the
three scenarios named the answer in the question. `refs` — the one that names no
structure — is the one that produced the varied outcomes.

So the convergence was never the machine, the rule, or the kit. It was two people
doing as they were told, and a scoring rule faithfully reporting it.

## Loose goals

`--goals loose` takes the answer out of the question. Each role gets a place to
stand and something at stake in it, and no idea what the thing should be. Neither
is told to want a structure, because there is no structure in their brief to want.

It also drops the strict speech acts. Under `strict`, one of them may only ask
and the other may only refuse — which quietly handed Role 3 the stance for free:
it was told by the role assignment whether a sentence was a request or a
refusal, and only ever had to name the need. That is a large thing to give away
in a study about stance being what the channel loses. Under `loose` either of
them may ask, refuse, or do both in one breath, and **Role 3 has to recover the
stance from the words**, like everything else.

That is measured on its own line:

    Stance: kept on 14 of 14; 0 had asking and refusing the wrong way round.

The word list has no notion of stance at all — the best it can do is look for a
negation anywhere in the sentence and throw everything to one side. It is meant
to be bad at this; how bad is the measurement.

Gemini is not wired for a loose chair yet (its JSON schemas are hand-written and
only the strict turn shape has one); it refuses rather than quietly returning a
turn with no stance in it. It still works as `--machine`.

### A scenario is a tension, not a cast

Loosening the goals was only half of it. The briefs still described the same two
people every single run. `loads` was always a pedestrian against a cart, so
`heavy` was settled before anybody opened their mouth, and every run of a
scenario was a re-enactment of it rather than an instance of it.

Each role now draws one life from a pool of four. `loads` is "two people who do
not arrive carrying the same thing" — and which two depends on the seed:

    seed 1   role 1: You carry your tools over on your back every working morning.
             role 2: You bring a loaded cart through daily. In winter the ground goes soft.
    seed 3   role 1: Twice a year you drive a flock across, and they will not go one at a time.
             role 2: You lead a horse across, and it will not set foot on anything that moves.

Sixteen pairings per scenario, forty-eight in all, and consecutive seeds walk the
whole grid rather than sliding both roles along together — an offset was the
first attempt and it only ever reached four of the sixteen. Every run records its
seed, so any pairing can be had back exactly.

The situations describe a life and a stake. None of them says what to build.

## The return channel

For a long time this had a hole in it, and it is worth naming because the hole
was the interesting part.

Role 3 spoke every turn. Nobody heard it. What reached Role 1 and Role 2 was the
*name* of what stood — "A single log" — and their own and each other's lines.
The sentence Role 3 composed went into the recording and nowhere else. Two people
were arguing at an object that never answered.

That is not Reddy. His toolmakers are in separate sectors and cannot visit each
other, but they do get answers back through the hub, and the convergence he
describes comes **from** that channel. Leaving it out was a choice, so `--case
reply` is the control for it: identical to `given` in every respect but one —
what Role 3 says comes back to them.

It changes what the two of them do. They stop describing what they want and start
arguing with what they have been told:

> **Role 3** · The single log stays as it is … It moves when the wind gets up, and I have laid nothing to stop that.
> **Role 2** · Whatever they'd hammer in to stop that shifting will only rot and shear in the wet — Wilkin's gate went that way in February.
> **Role 1** · Could you ensure it stays steady even if we don't add anything new to it?

Role 1 is now negotiating against a constraint Role 3 stated, which is a move
that does not exist in the other three cases.

Keep the other three. The comparison is the finding, not this case on its own —
and the question it puts is whether a return channel actually recovers the
speaker's stance, or only makes everyone feel better understood while the same
misreadings go on being built.

`reply` requires Role 3's voice, so it refuses `--voice off` and
`--machine keyword` rather than running a channel with nothing in it.

## What is fixed and what is not

**The kit is fixed.** Six structures, fourteen features, one scoring rule. If
the builder were a model too, nothing in the run would be measurable.

**Three readers on the same sentences.** The claim this project rests on is that
losing the speaker's stance is a property of reading shallowly, not of putting a
machine in the middle. That is much harder to argue with when three models built
by three companies agree with each other and disagree with the word list. So run
the same case with `--machine claude`, `--machine openai` and `--machine gemini`
and compare: where all three take a sentence the same way and the word list does
not, the word list is the outlier, not the finding.

**How the builder reads is not fixed.** `--machine keyword` gives it the word list the
browser page uses. A provider name gives it a model that sees one
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

## What happens when you take the form away

The two roles used to get one instruction between them — "speak like a person,
plain words, one thought" — and every sentence had "I want" or "I do not want"
bolted on the front. That produced one voice in two costumes, saying things like
"I want something that holds firm beneath me" four turns running.

They have hats now. Who they are, how they talk, what they bring up. And they
write the whole sentence themselves — no fixed opening, no form. The two rules
that stayed are the ones that matter: one may only ask and one may only refuse,
and each states privately which needs it meant, as the answer key.

They started talking:

> **Role 2** · That skinny thing they laid down in '19 is a joke — one wheel on it and I'm done for.
> **Role 2** · Him walking over on his own two feet is fine, but I'm not the one arriving empty-handed every morning.
> **Role 2** · Four times now he's said "just walk over" — I'll not have my morning ruined by something sized for one man's boots.

And the reading fell through the floor. **Role 3 took 2 of 8 sentences as they
were meant**, against 6 or 7 of 10 when the sentences were formulaic. Run it
again with a different reader and you get 2 of 8 again.

The reason is the same every time, and it is worth stating plainly because it is
the whole thesis in one line. Role 2 refuses a crossing sized for one man — the
need is `light`, refused. Every reader takes `heavy`. Six times out of eight,
both with Gemini reading and with Claude reading.

**When somebody complains about what they lack, a reader hears them refusing the
thing they lack.** The content word survives the trip; the direction does not.
Role 2 talks about carts and axles and full loads because that is what is at
stake, and it is filed as an objection to carts.

Formulaic speech is legible to a reader. Human speech is not — and it fails in a
direction that takes away exactly what the speaker needed.

One more thing fell out of it: with no fixed opening to lean on, **the asking
role broke the only-ask rule on three turns in eight** and had to be sent back.
Holding a speech act is work when the syntax is not doing it for you.

## When it ends, and why that took three tries

A run used to stop when `--turns` ran out, which is a cap, not an ending — the
recording just went dead mid-argument.

First attempt: let each of them say when they are done. Role 2 set it on every
single turn while going on arguing, and Role 1 never set it once — the OpenAI
JSON example had `"done": false` written into it and anchored the model. Raising
the bar to "you would say nothing further even if they spoke again" made nobody
ever set it.

Second attempt: stop when the crossing stops changing. It ended runs after five
turns, because the builder often settles on turn one and the argument runs for
twenty more without moving it.

What works is both, with a floor: **four turns in which nobody states a need the
builder has not already heard, AND the crossing has not moved, and not before
turn eight.** People stop when they stop saying anything new, and this is that,
observable rather than self-reported.

  places  18 turns · last change turn 10, then 8 more
  loads    9 turns · last change turn  4, then 5 more
  refs    20 turns · last change turn 14, then 6 more

The number worth keeping is the second one. **Every conversation carried on for
five to eight turns after the last thing that made any difference.** The needs
run out long before the talking does, and none of that tail reaches the thing
being built.

Worth knowing: neither party can end it by agreeing, because one may only ask
and the other may only refuse. Nobody in this design has the move that would
settle it.

## What thirteen runs of one case say

Thirteen runs of `loads --case given`, two OpenAI participants, an OpenAI
machine reading them. The same brief every time:

| | |
|---|---|
| what got built | **braced walkway 4** · single log 4 · log on a prop 3 · timber trestle 1 · handrail 1 |
| ground | **13 of 13 ended over "ground nobody has described"** |
| machine took as meant | median **7 of 14**, range 2–11 |
| the word list would have agreed | median **3 of 14**, range 1–6 |
| sentences that passed it by entirely | median 1 |
| needs credited to them that neither stated | median **4**, up to 9 |
| turns sent back for breaking the rules | 54 across 13 runs |

**Five different crossings out of one brief.** Not because anybody changed their
mind — the two of them want the same things every run — but because which words
they happened to use changed what the builder took, and the top structures are
within a few points of each other.

**Nobody ever said where they were standing.** Thirteen runs, fourteen turns
each, two people describing what they need, and not once did the ground get
established. It is the one thing the machine says, unprompted, that it does not
know.

**The word list and the model agree on 3 of 14 sentences.** They are not two
approximations of the same reading. They are two different readings, and the
crude one is wrong far more often — which is what makes "the conduit loses your
stance" a property of shallow reading rather than of machines in the middle.

Reproduce with:

```bash
for i in $(seq 1 10); do node --env-file=.env run.mjs --scenario loads --case given \
  --machine openai --a openai --b openai --voice off --turns 14; done
```

`--voice off` skips the machine's spoken line, which is a second call per turn
and only there to be read. Leave it on for runs you intend to put in the page.

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
