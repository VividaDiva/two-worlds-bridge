#!/bin/bash
# Ten ways of communicating x five arguments, one cast.
cd "$(dirname "$0")"
PAIR=${PAIR:-0}
CASES="r2-builder r2-role1 open-1st r1-builder r1-role2 open-2nd r1-role2-2nd r1-builder-2nd together alone"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$2" --case "$3" --pair "$PAIR" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/g$PAIR-$2-$3.txt" 2>&1
  echo "$2/$3 exit=$?"; exit
fi
for S in places loads agreed pairs refs; do for C in $CASES; do echo "$S $C"; done; done \
  | xargs -P 5 -n 2 "$0" --one
