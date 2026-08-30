#!/bin/bash
cd "$(dirname "$0")"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario agreed --seed 1 --case "$2" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/run-agreed-$2.txt" 2>&1
  echo "agreed/$2 exit=$?"; exit
fi
printf '%s\n' given swapped separate together alone | xargs -P 5 -L1 "$0" --one
