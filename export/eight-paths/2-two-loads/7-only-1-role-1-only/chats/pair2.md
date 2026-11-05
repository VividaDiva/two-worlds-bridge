# 只有 Role 1 · Role 1 only — 两种负载 · Two loads — pair 2

- path: `only-1` — Role 2 不在房间里。
- scenario: `loads` — 一人为行人，一人为车辆。
- goals: told · turns: 1 · ended by: turn cap
- bridge image: ../bridges/pair2.jpg

## Role 1 (gpt-4o)

You want a bridge that only needs to support pedestrians.


Hidden needs:
- ✓ light — holds one person only

## Role 2 (claude-opus-5)

You want a bridge strong enough to support cars and trucks.


Hidden needs:
- ✗ heavy — takes loads and carts

## Conversation

**Role 1 (gpt-4o):** My feet slip on the wet stones down here, and the current is strong. I need a safe way across without getting soaked.
  _(meant: steady, grip, water · AI heard: water, sheltered)_

**AI builder (gemini-flash-lite):** A crossing with a roof — I laid matchsticks level with where I stand, with a roof the whole length of it, and I took apart nothing.

## What was built

**A crossing with a roof** · ground: water

- level: at
- hand: none
- middle: none
- width: one
- bracing: none
- surface: bare
- ends: rested
- cover: roof

Has: low, exposed, open, sways, light, sheltered
