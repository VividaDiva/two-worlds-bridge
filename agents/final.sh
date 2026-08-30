#!/bin/bash
# Four arguments now, five cases each. Everything is re-run because the brief
# changed for all of them: they are told they want the thing built and can
# give something up to get the rest, where before they were told they were
# not designing it — which had them lobbying for their own constraint instead
# of trying to get anything built.
cd "$(dirname "$0")"
OUT=sessions/batch

if [ "$1" = "--one" ]; then
  sc=$2; seed=$3; cs=$4
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario "$sc" --seed "$seed" --case "$cs" \
    --goals loose --speech free --builder model --turns 10 --confer 6 \
    > "$OUT/run-$sc-$cs.txt" 2>&1
  code=$?
  printf '%s %s/%s exit=%s\n' "$(date +%H:%M:%S)" "$sc" "$cs" "$code"
  exit $code
fi

CONC=${CONC:-5}
mkdir -p "$OUT"; rm -f "$OUT"/run-*.txt
started=$(date +%s)
printf '%s\n' \
  "places 5 given" "places 5 swapped" "places 5 separate" "places 5 together" "places 5 alone" \
  "loads 3 given"  "loads 3 swapped"  "loads 3 separate"  "loads 3 together"  "loads 3 alone" \
  "refs 9 given"   "refs 9 swapped"   "refs 9 separate"   "refs 9 together"   "refs 9 alone" \
  "pairs 2 given"  "pairs 2 swapped"  "pairs 2 separate"  "pairs 2 together"  "pairs 2 alone" \
  | xargs -P "$CONC" -L1 "$0" --one

LOG="$OUT/final.txt"; : > "$LOG"
for f in "$OUT"/run-*.txt; do
  echo "===== $(basename "$f" .txt | sed 's/^run-//') =====" >> "$LOG"
  cat "$f" >> "$LOG"; echo "" >> "$LOG"
done
echo "FINAL BATCH COMPLETE in $(( ($(date +%s) - started) / 60 ))m" | tee -a "$LOG"
