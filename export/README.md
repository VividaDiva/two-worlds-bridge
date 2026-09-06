# Two Worlds Bridge — recorded runs

Three people and one crossing. Two of them describe what they need; the third
builds and may ask nothing. Nobody but the builder may name a part. Every
sentence here was generated at run time — nothing is scripted.

    role 1  gpt-4o                 role 2  claude-opus-5      role 3  gemini-flash-lite
    (except in the "voices swapped" arrangement, which no longer exists — see Limits)

200 runs = **4 casts × 5 arguments × 10 cases**, run 2026-09-04-06.

---

## Reading the conversations

`conversations.html` — open it in a browser. Pick an argument, a case and a cast
and read the exchange: what each person said, what they said they meant (asked
after, never shown to the builder), and what the builder took them to mean, with
the misses marked. In `pairs` the speaker's name is shown, because a role there
is two people taking turns. It prints cleanly if you want to annotate on paper.

## One PNG per conversation

    cd agents && node shoot.mjs ../export/png          # all 200
    cd agents && node shoot.mjs ../export/png --only refs   # one argument

Full height, nothing cut off, at 2x. The title of each is the argument, the
case and the cast; the filename is `argument__case__castN.png`. They come to
about 278MB for the set, so they are not in the repo — the script is, and takes
a couple of minutes.

It drives Chrome's debug protocol rather than `--screenshot`, which only
captures the window and would cut every conversation short.

## The three files

### `runs.csv` — one row per conversation (200)

| column | meaning |
|---|---|
| `run_id` | matches the session JSON in `agents/sessions/` |
| `cast` | 0–3. Which pair of lives. Same argument, same case, different two people |
| `argument` | `places` `loads` `agreed` `pairs` `refs` — what they disagree about |
| `case`, `case_label` | which of the ten ways of hearing each other |
| `role1_hears_other`, `role1_hears_builder` | what role 1 could hear. Same for role 2 |
| `opens` | who spoke first |
| `built_id`, `built_name` | the crossing that ended up standing. `builtB_*` only when `solo` |
| `role1_needs`, `role2_needs` | the latent need, in engine feature keys. **Never shown to anybody in the run** |
| `role1_met`, `role2_met` | which of those the built crossing actually has |
| `ceiling_n` | the most any ONE crossing could have served of both roles at once. **Not always the total** — some pairs want things no single crossing holds (`many` and `light`, `low` and `high`). Score against this, not against `role1_needs_n + role2_needs_n` |
| `role1_spoke`, `role1_lost` | turns that produced a sentence, and turns lost. **Read the Limits section before using these** |
| `said`, `caught`, `partly`, `invented` | the builder's reading: sentences it heard, took exactly right, took partly right, and properties it credited that nobody stated |
| `wordlist_agreed` | how often a keyword reader would have agreed with the model reader |

### `turns.csv` — one row per turn (3,530)

`speaker` is `role1`, `role2` or `builder`. For a role, `text` is what they
said; for the builder, `text` is what it said and `standing_after` is what
stands. `meant` is what the speaker said they meant, asked after the fact;
`taken` is what the builder took them to mean — the gap between those two
columns is the whole subject. `persona` is filled only in `pairs`.
`phase` is `confer` for the private half of the `together` case.

### `needs.csv` — one row per need (960)

The unit the scoring works in: `run_id`, `role`, `need`, `need_meaning`, `met`.
960 = 200 runs × 2 roles × ~2 needs (`pairs` has 4 per role: two people each).

---

## How to score it

A raw percentage means nothing on its own, because arguments differ in how
easy their needs are to hit by accident. `refs` wants rare properties, `pairs`
wants common ones. Compare each against its own chance floor:

1. Within one argument, take the needs and the built crossings.
2. Shuffle which crossing goes with which need-set, many times.
3. The mean of the shuffled rates is that argument's chance floor.
4. The real rate minus that floor is the effect.

Pooling across arguments without doing this per-argument manufactures
significance — the arguments have floors from about 30% to about 65%.

**A single cast cannot be scored this way.** One cast gives an argument only
two distinct need-sets, so the shuffle has nothing to work with and every
argument comes out at exactly its floor. Four casts is the minimum for the test
to have any resolution.

---

## Limits — read before drawing conclusions

**1. Role 2 lost 23.7% of its turns; role 1 lost none.**

    role 1 (gpt-4o)         spoke 971, lost   0
    role 2 (claude-opus-5)  spoke 739, lost 230

All 230 losses are Claude declining a conversation about footbridges under a
"cyber" classification, after seven retries. Role 2 gets about three quarters
as many sentences into the room as role 1.

**2. Worse: the loss tracks the case.** Role 2's turns lost, by case:

    r2-builder 50%   alone 42%   open-2nd 28%   open-1st 26%   r1-builder 24%
    r1-role2   23%   r1-role2-2nd 19%   r1-builder-2nd 11%   r2-role1 7%   together 3%

Any comparison between cases is therefore partly a comparison of how often role
2 was allowed to speak. **The asymmetric cases (1–8) are confounded, not merely
underpowered.** Fixing this needs a control run with the same model in both
seats, which has not been done.

**3. The needs are an interpretation.** Every `role1_needs` value is a reading
of a situation written in prose, made by Claude, not something the run
measured. A different reading moves the scores. They are in
`agents/run.mjs` under `LOOSE_SCENARIOS` and are worth disagreeing with.

**4. There is no model-vs-role control.** An earlier design had a case that
swapped which model sat in which seat; the ten cases do not. So "role 1's needs
transmit better" and "gpt-4o's needs transmit better" cannot be distinguished
in this data.

**5. `agreed` is not comparable with the other four.** Both roles there share
one need by construction, so it cannot say whose need was served.

**6. Earlier findings are not in this file.** Results from before 2026-09-04
were produced under a five-case design with a different `pairs` and a cast that
changed with the case. They are not comparable and are not included.

---

## What the scoring gives, on this data

Computed the way described above — permuting within each argument, 20,000 shuffles:

| argument | met | its chance floor | above | p |
|---|---|---|---|---|
| `agreed` | 58% | 48% | **+9.8** | <0.0001 |
| `places` | 57% | 49% | **+7.6** | 0.006 |
| `refs`   | 34% | 31% | +2.9 | 0.22 |
| `pairs`  | 57% | 54% | +2.8 | 0.089 |
| `loads`  | 56% | 53% | +2.1 | 0.22 |

Pooled, stratified by argument: **53.2% against a 48.5% floor, +4.7 points, p = 0.0001.**

Two of five arguments transmit above chance on their own. Note `refs` has by far
the lowest absolute rate (34%) because its needs are rare properties — its floor
is 31%, so its shortfall is about the difficulty of the target, not only about
the channel.

`pairs` is worth a note. Under an earlier design its two needs belonged to one
narrator speaking for an absent person, and it scored +10 at p = 0.005 — the best
of the five. Rewritten so the two are separate people taking turns through one
mouth, who never hear each other, it falls to +2.8 and stops being significant.
The earlier figure looks like a narrator averaging two people into one reasonable
request, not like something transmitting.

All of this is subject to the confound in Limits 1 and 2. It is a real result for
the arguments, and not yet a safe one for comparisons between cases.
