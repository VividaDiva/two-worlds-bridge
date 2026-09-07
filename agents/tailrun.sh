#!/bin/bash
# together and alone under the rebuilt goals. They sit outside gridrun.sh
# because neither is about who can hear whom, but their goals changed with
# everything else and the old recordings no longer match the table.
cd "$(dirname "$0")"
mkdir -p sessions/batch
if [ "$1" = "--one" ]; then
  S="$2"; C="$3"; P="$4"
  EXTRA=""; [ "$S" = "refs" ] && EXTRA="--drawings"
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$S" --case "$C" --pair "$P" $EXTRA \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "sessions/batch/tail-$S-$C-p$P.txt" 2>&1
  echo "$S/$C cast$(( $P + 1 )) exit=$?"; exit
fi
for S in places loads agreed pairs refs; do for C in together alone; do for P in 0 1 2 3; do echo "$S $C $P"; done; done; done \
  | xargs -P 5 -n 3 "$0" --one
