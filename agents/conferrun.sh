#!/bin/bash
# Re-run the `together` row after the build was deferred to the end of it.
# One job per (argument, cast). Written as a script rather than an xargs -I{}
# line: that form hit "command line cannot be assembled, too long" and three of
# four jobs never started, silently.
cd "$(dirname "$0")"
mkdir -p sessions/batch
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$2" --case together --pair "$3" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/confer-$2-p$3.txt" 2>&1
  echo "$2 cast$(( $3 + 1 )) exit=$?"; exit
fi
for S in places loads agreed pairs refs; do for P in 0 1 2 3; do echo "$S $P"; done; done \
  | xargs -P 5 -n 2 "$0" --one
