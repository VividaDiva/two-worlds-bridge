#!/bin/bash
# The whole grid again — five arguments, five cases, both builders — now that
# every life carries a latent need, `places` varies by place, `agreed` pairs its
# opposites, and the builder is no longer handed sentences to repeat.
# Seeds are the published ones throughout, except `agreed`, which needs 0-4 to
# reach all four of its opposed pairs.
cd "$(dirname "$0")"
OUT=sessions/batch
mkdir -p "$OUT"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine "$4" \
    --scenario "$2" --seed "$3" --case "$5" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/all-$2-$4-$5.txt" 2>&1
  echo "$2/$5 ($4) exit=$?"; exit
fi
rm -f "$OUT"/all-*.txt
for M in claude gemini; do
  printf '%s\n' \
    "places 1 $M given" "places 4 $M swapped" "places 7 $M separate" "places 10 $M together" "places 13 $M alone" \
    "loads 2 $M given"  "loads 5 $M swapped"  "loads 8 $M separate"  "loads 11 $M together" "loads 14 $M alone" \
    "agreed 0 $M given" "agreed 1 $M swapped" "agreed 2 $M separate" "agreed 3 $M together" "agreed 4 $M alone" \
    "pairs 0 $M given"  "pairs 5 $M swapped"  "pairs 9 $M separate"  "pairs 13 $M together" "pairs 2 $M alone" \
    "refs 3 $M given"   "refs 6 $M swapped"   "refs 9 $M separate"   "refs 12 $M together"  "refs 15 $M alone"
done | xargs -P 5 -n 4 "$0" --one
