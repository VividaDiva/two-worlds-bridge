#!/bin/bash
# The same twenty-five cells with Gemini building instead of Claude, so the two
# sets can be compared. Written to gem-*.txt rather than run-*.txt: the current
# set is the published one and must not be overwritten by a comparison.
cd "$(dirname "$0")"
OUT=sessions/batch
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$2" --seed "$3" --case "$4" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/gem-$2-$4.txt" 2>&1
  echo "$2/$4 exit=$?"; exit
fi
CONC=${CONC:-4}
rm -f "$OUT"/gem-*.txt
printf '%s\n' \
  "places 1 given" "places 4 swapped" "places 7 separate" "places 10 together" "places 13 alone" \
  "loads 2 given"  "loads 5 swapped"  "loads 8 separate"  "loads 11 together"  "loads 14 alone" \
  "refs 3 given"   "refs 6 swapped"   "refs 9 separate"   "refs 12 together"  "refs 15 alone" \
  "pairs 0 given"  "pairs 5 swapped"  "pairs 9 separate"  "pairs 13 together" "pairs 2 alone" \
  "agreed 1 given" "agreed 6 swapped" "agreed 10 separate" "agreed 14 together" "agreed 3 alone" \
  | xargs -P "$CONC" -L1 "$0" --one
echo "GEMINI-BUILDER BATCH COMPLETE"
