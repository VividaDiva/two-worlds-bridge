#!/bin/bash
cd "$(dirname "$0")"
LOG=sessions/batch/log.txt
: > "$LOG"
for run in 1 2 3; do
  for sc in places loads refs; do
    for cs in given swapped separate; do
      echo "[$(date +%H:%M:%S)] $sc/$cs run $run" >> "$LOG"
      node --env-file=.env run.mjs --a openai --b claude --machine claude \
        --scenario "$sc" --case "$cs" --turns 22 2>&1 \
        | grep -E "is standing|It ended|Role 3 took|silent|retry" >> "$LOG" 2>&1
      echo "" >> "$LOG"
    done
  done
done
echo "[$(date +%H:%M:%S)] BATCH COMPLETE" >> "$LOG"
