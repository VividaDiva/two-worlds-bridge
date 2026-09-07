#!/bin/bash
# The `refs` row run from your two drawings instead of a text memory.
# Ten cases x four casts. Each role is shown only its own image: with
# --drawings the runner passes situation and manner as null, so there is no
# written reference anywhere in the prompt.
cd "$(dirname "$0")"
mkdir -p sessions/batch
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario refs --case "$2" --pair "$3" --drawings \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/draw-refs-$2-p$3.txt" 2>&1
  echo "$2 cast$(( $3 + 1 )) exit=$?"; exit
fi
CASES="open r2-blind r1-blind words bridge bridge-1 bridge-2 silent together alone"
for C in $CASES; do for P in 0 1 2 3; do echo "$C $P"; done; done \
  | xargs -P 5 -n 2 "$0" --one
