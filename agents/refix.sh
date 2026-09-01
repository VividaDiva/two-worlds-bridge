#!/bin/bash
# places and agreed again, after their briefs were corrected: role 1 in `places`
# now varies by place rather than by person, and `agreed` pairs its two columns
# by index so the opposites actually oppose. Both builders, same seeds in each
# pair — that pairing is what lets the two be compared at all.
cd "$(dirname "$0")"
OUT=sessions/batch
mkdir -p "$OUT"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine "$4" \
    --scenario "$2" --seed "$3" --case "$5" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/fix-$2-$4-$5.txt" 2>&1
  echo "$2/$5 ($4) exit=$?"; exit
fi
rm -f "$OUT"/fix-*.txt
for M in claude gemini; do
  printf '%s\n' \
    "places 1 $M given"  "places 4 $M swapped"  "places 7 $M separate" \
    "places 10 $M together" "places 13 $M alone" \
    "agreed 0 $M given"  "agreed 1 $M swapped"  "agreed 2 $M separate" \
    "agreed 3 $M together"  "agreed 4 $M alone"
done | xargs -P 5 -n 4 "$0" --one
