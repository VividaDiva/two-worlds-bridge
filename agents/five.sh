#!/bin/bash
# All five cases the page defines, in the design we actually agreed:
# nobody told what to want, no key list while composing, ground free to describe,
# and Role 3 choosing from the conversation rather than from a tally.
# Seed held constant within a scenario so the case is the only thing moving.
cd "$(dirname "$0")"
LOG=sessions/batch/five.txt
: > "$LOG"
run () {   # scenario seed case
  echo "[$(date +%H:%M:%S)] $1 / $3  (seed $2)" >> "$LOG"
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario "$1" --seed "$2" --case "$3" \
    --goals loose --speech free --builder model --turns 10 --confer 6 >> "$LOG" 2>&1
  echo "  exit=$?" >> "$LOG"; echo "" >> "$LOG"
}
for pair in "places 5" "loads 3" "refs 9"; do
  set -- $pair
  for cs in given swapped separate together alone; do run "$1" "$2" "$cs"; done
done
echo "[$(date +%H:%M:%S)] FIVE-CASE BATCH COMPLETE" >> "$LOG"
