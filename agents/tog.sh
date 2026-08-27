#!/bin/bash
# The three `together` cells the speakFree split killed. Same settings as the
# twelve that survived, so the set stays comparable.
cd "$(dirname "$0")"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario "$2" --seed "$3" --case together \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/run-$2-together.txt" 2>&1
  echo "$2/together exit=$?"
  exit
fi
printf '%s\n' "places 5" "loads 3" "refs 9" | xargs -P 3 -L1 "$0" --one
