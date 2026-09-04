#!/bin/bash
# One case of `refs` with your own two drawings as the goals.
cd "$(dirname "$0")"
node --env-file=.env run.mjs --a openai --b claude --machine gemini \
  --scenario refs --case "$1" --drawings \
  --goals loose --speech free --builder model --pair 0 --turns 10 --confer 6 \
  > "sessions/batch/draw-refs-$1.txt" 2>&1
echo "$1 exit=$?"
