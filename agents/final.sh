#!/bin/bash
# The fifteen cells again, against everything that changed: forty-eight
# crossings, two-or-three sentences a turn, the return channel on cases 1 and 2,
# and Role 3 actually choosing instead of having its answer discarded.
cd "$(dirname "$0")"
LOG=sessions/batch/final.txt
: > "$LOG"
run () {
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
echo "[$(date +%H:%M:%S)] FINAL BATCH COMPLETE" >> "$LOG"
