#!/bin/bash
# The refs row again, with the two roles shown crossings instead of told about
# them. Written to pic-*.txt so the published set is not overwritten.
cd "$(dirname "$0")"
OUT=sessions/batch
mkdir -p "$OUT"
if [ "$1" = "--one" ]; then
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario refs --seed "$2" --case "$3" --pictures \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/pic-refs-$3.txt" 2>&1
  echo "refs/$3 exit=$?"; exit
fi
rm -f "$OUT"/pic-refs-*.txt
printf '%s\n' "3 given" "6 swapped" "9 separate" "12 together" "15 alone" \
  | xargs -P 5 -n 2 "$0" --one
