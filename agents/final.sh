#!/bin/bash
# Fifteen conversations that have nothing to do with each other, run several at a
# time instead of one after another. An hour of wall clock was fifteen runs
# politely queuing; nothing about any of them is shared or ordered.
#
# No flock and no `wait -n`: macOS ships bash 3.2 and neither exists. xargs -P
# does, and gives a rolling window rather than lockstep batches. Each run writes
# its own file, so there is nothing to serialise and no lock to need.
#
#   ./final.sh          five at a time
#   CONC=3 ./final.sh   gentler on the rate limit
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
  | xargs -P "$CONC" -L1 "$0" --one

# One log at the end, in a fixed order, rather than fifteen writers interleaving.
LOG="$OUT/final.txt"; : > "$LOG"
for f in "$OUT"/run-*.txt; do
  echo "===== $(basename "$f" .txt | sed 's/^run-//') =====" >> "$LOG"
  cat "$f" >> "$LOG"; echo "" >> "$LOG"
done
echo "FINAL BATCH COMPLETE in $(( ($(date +%s) - started) / 60 ))m $(( ($(date +%s) - started) % 60 ))s" | tee -a "$LOG"
