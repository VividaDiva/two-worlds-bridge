#!/bin/bash
# The eight channel cases x five arguments x four casts.
#
# `refs` runs from the two drawings, never from a text memory. It is passed here
# rather than left to the caller because that is exactly how the drawings row
# went missing: the grid was re-run without --drawings and every image run in
# the set was quietly replaced by the written version.
#
# `together` and `alone` are not in this grid. Neither is about who can hear
# whom, and neither changed when the channel model did.
cd "$(dirname "$0")"
mkdir -p sessions/batch
CASES="open r2-blind r1-blind words bridge bridge-1 bridge-2 silent"
if [ "$1" = "--one" ]; then
  S="$2"; C="$3"; P="$4"
  EXTRA=""
  [ "$S" = "refs" ] && EXTRA="--drawings"
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$S" --case "$C" --pair "$P" $EXTRA \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/link-$S-$C-p$P.txt" 2>&1
  echo "$S/$C cast$(( $P + 1 )) exit=$?"; exit
fi
for S in places loads agreed pairs refs; do for C in $CASES; do for P in 0 1 2 3; do echo "$S $C $P"; done; done; done \
  | xargs -P 5 -n 3 "$0" --one
