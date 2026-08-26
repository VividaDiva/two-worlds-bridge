#!/bin/bash
# Refill the runs the first batch lost. Unlike batch.sh, this keeps stderr:
# the original piped stdout+stderr through grep, so five failures vanished
# without a trace and looked like clean exits.
cd "$(dirname "$0")"
LOG=sessions/batch/refill.txt
: > "$LOG"
run_one () {
  echo "[$(date +%H:%M:%S)] $1/$2 attempt $3" >> "$LOG"
  node --env-file=.env run.mjs --a openai --b claude --machine claude \
    --scenario "$1" --case "$2" --turns 22 >> "$LOG" 2>&1
  echo "  exit=$?" >> "$LOG"
  echo "" >> "$LOG"
}
for cs in swapped separate; do
  for n in 1 2; do
    run_one refs "$cs" "$n"
  done
done
echo "[$(date +%H:%M:%S)] REFILL COMPLETE" >> "$LOG"
