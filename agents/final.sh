#!/bin/bash
# All five arguments, five cases each, against both fixes: ties now answer what
# the current turn asked for instead of freezing on the first thing built, and
# each speaker sees the exchange in order rather than three parallel lists.
cd "$(dirname "$0")"
OUT=sessions/batch

if [ "$1" = "--one" ]; then
  sc=$2; seed=$3; cs=$4
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario "$sc" --seed "$seed" --case "$cs" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/run-$sc-$cs.txt" 2>&1
  printf '%s %s/%s exit=%s\n' "$(date +%H:%M:%S)" "$sc" "$cs" "$?"
  exit
fi

CONC=${CONC:-5}
mkdir -p "$OUT"; rm -f "$OUT"/run-*.txt
started=$(date +%s)
printf '%s\n' \
  "places 1 given" "places 4 swapped" "places 7 separate" "places 10 together" "places 13 alone" \
  "loads 2 given"  "loads 5 swapped"  "loads 8 separate"  "loads 11 together"  "loads 14 alone" \
  "refs 3 given"   "refs 6 swapped"   "refs 9 separate"   "refs 12 together"  "refs 15 alone" \
  "pairs 0 given"  "pairs 5 swapped"  "pairs 9 separate"  "pairs 13 together" "pairs 2 alone" \
  "agreed 1 given" "agreed 6 swapped" "agreed 10 separate" "agreed 14 together" "agreed 3 alone" \
  | xargs -P "$CONC" -L1 "$0" --one

echo "FINAL BATCH COMPLETE in $(( ($(date +%s) - started) / 60 ))m"
