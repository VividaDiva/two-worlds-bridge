#!/bin/bash
# The three `together` runs again, so they carry the survival chain, plus the two
# `swapped` cells lost to the classifier last time — a refusing participant now
# costs a turn instead of the whole run, so these should survive.
cd "$(dirname "$0")"
LOG=sessions/batch/chain.txt
: > "$LOG"
run () {
  echo "[$(date +%H:%M:%S)] $1 / $3  (seed $2)" >> "$LOG"
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario "$1" --seed "$2" --case "$3" \
    --goals loose --speech free --builder model --turns 10 --confer 6 >> "$LOG" 2>&1
  echo "  exit=$?" >> "$LOG"; echo "" >> "$LOG"
}
run places 5 together
run loads  3 together
run refs   9 together
run loads  3 swapped
run refs   9 swapped
echo "[$(date +%H:%M:%S)] CHAIN BATCH COMPLETE" >> "$LOG"
