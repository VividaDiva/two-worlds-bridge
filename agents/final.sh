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
  "places 5 given" "places 5 swapped" "places 5 separate" "places 5 together" "places 5 alone" \
  "loads 3 given"  "loads 3 swapped"  "loads 3 separate"  "loads 3 together"  "loads 3 alone" \
  "refs 9 given"   "refs 9 swapped"   "refs 9 separate"   "refs 9 together"   "refs 9 alone" \
  "pairs 2 given"  "pairs 2 swapped"  "pairs 2 separate"  "pairs 2 together"  "pairs 2 alone" \
  "agreed 1 given" "agreed 1 swapped" "agreed 1 separate" "agreed 1 together" "agreed 1 alone" \
  | xargs -P "$CONC" -L1 "$0" --one

echo "FINAL BATCH COMPLETE in $(( ($(date +%s) - started) / 60 ))m"
