#!/bin/bash
# The whole grid: five arguments, five cases, both builders.
#
# The cast is fixed per argument and does NOT vary with the case — that is the
# point of the run. Previously each case drew a different seed, so `given` and
# `together` differed in both the protocol and the two people speaking, and no
# difference between them belonged to either. Now only the protocol moves.
# --pair 1..3 reruns the whole grid with the next pair of lives, as a replicate.
cd "$(dirname "$0")"
OUT=sessions/batch
PAIR=${PAIR:-0}
mkdir -p "$OUT"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine "$3" \
    --scenario "$2" --case "$4" --pair "$PAIR" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/p$PAIR-$2-$3-$4.txt" 2>&1
  echo "$2/$4 ($3) exit=$?"; exit
fi
rm -f "$OUT"/p$PAIR-*.txt
for M in claude gemini; do
  for S in places loads agreed pairs refs; do
    for C in given swapped separate together alone; do echo "$S $M $C"; done
  done
done | xargs -P 5 -n 3 "$0" --one
