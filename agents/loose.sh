#!/bin/bash
# Does taking the answer out of the briefs break the log's grip? Nine runs, three
# per scenario, each on a different seed so no two draw the same pair of lives.
cd "$(dirname "$0")"
LOG=sessions/batch/loose.txt
: > "$LOG"
for seed in 1 5 9; do
  for sc in places loads refs; do
    echo "[$(date +%H:%M:%S)] $sc seed $seed" >> "$LOG"
    node --env-file=.env run.mjs --a openai --b claude --machine claude \
      --scenario "$sc" --case reply --goals loose --seed "$seed" --turns 14 >> "$LOG" 2>&1
    echo "  exit=$?" >> "$LOG"; echo "" >> "$LOG"
  done
done
echo "[$(date +%H:%M:%S)] LOOSE BATCH COMPLETE" >> "$LOG"
