#!/bin/bash
# Do the four cases actually diverge once nobody is told what to want?
# Scenario held constant and the seed held constant across all four cases, so
# the case is the only thing moving within each block of four.
cd "$(dirname "$0")"
LOG=sessions/batch/sweep.txt
: > "$LOG"
for seed in 2 6 11; do
  for cs in given swapped separate reply; do
    echo "[$(date +%H:%M:%S)] $cs seed $seed" >> "$LOG"
    node --env-file=.env run.mjs --a openai --b claude --machine claude \
      --scenario loads --case "$cs" --goals loose --speech free \
      --seed "$seed" --turns 12 >> "$LOG" 2>&1
    echo "  exit=$?" >> "$LOG"; echo "" >> "$LOG"
  done
done
echo "[$(date +%H:%M:%S)] SWEEP COMPLETE" >> "$LOG"
