#!/bin/bash
# The same ten cases, with each role given a stated aim in plain words instead
# of a life to read a need off. Nothing is scripted: they are two models with
# one goal each, talking freely.
cd "$(dirname "$0")"
mkdir -p sessions/batch
CASES="open r2-blind r1-blind words bridge bridge-1 bridge-2 silent together alone"
if [ "$1" = "--one" ]; then
  S="$2"; C="$3"; P="$4"
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$S" --case "$C" --pair "$P" \
    --goals told --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/told-$S-$C-p$P.txt" 2>&1
  echo "$S/$C cast$(( $P + 1 )) exit=$?"; exit
fi
for S in places loads agreed pairs; do for C in $CASES; do for P in 0 1 2 3; do echo "$S $C $P"; done; done; done \
  | xargs -P 5 -n 3 "$0" --one
