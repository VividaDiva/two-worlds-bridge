#!/bin/bash
# Five arguments, five cases, one cell each.
#
# Three seats, three companies: role 1 gpt-4o, role 2 claude-opus-5, role 3
# gemini-flash-lite. No model shares a lexicon with any other, which is the
# thing the instrument is supposed to be measuring the absence of.
#
# The cast is fixed per argument and does NOT vary with the case, so a
# difference between two cases belongs to the protocol and nothing else.
# PAIR=1 (2, 3) reruns the whole grid with the next pair of lives — a
# replicate, and the way to tell a finding about the protocol from a finding
# about these two people.
#
#   PAIR=1 ./fullrun.sh
#   MACHINES="gemini claude" ./fullrun.sh    # add the shared-model comparison
cd "$(dirname "$0")"
OUT=sessions/batch
PAIR=${PAIR:-0}
MACHINES=${MACHINES:-gemini}
mkdir -p "$OUT"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine "$3" \
    --scenario "$2" --case "$4" --pair "$PAIR" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/p$PAIR-$2-$3-$4.txt" 2>&1
  echo "$2/$4 ($3) exit=$?"; exit
fi
for M in $MACHINES; do
  for S in places loads agreed pairs refs; do
    for C in given swapped separate together alone; do echo "$S $M $C"; done
  done
done | xargs -P 5 -n 3 "$0" --one
