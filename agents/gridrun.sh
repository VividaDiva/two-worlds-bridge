#!/bin/bash
# Nine cases x five arguments x four casts, at four rounds each.
#
# Every role is given a stated aim in plain words — the `told` goals. The loose
# briefs, where each of them got a life and no goal and the need was read off
# the life afterwards, are not used here.
#
# `refs` is the exception and not a loose run either: its goal is one of the two
# drawings, and the need is read off the picture rather than off a sentence.
# --drawings is passed here rather than left to the caller, because that is
# exactly how the drawings row went missing once already.
cd "$(dirname "$0")"
mkdir -p sessions/batch
CASES="chain both via-1 via-2 confer only-1 only-2 all"
if [ "$1" = "--one" ]; then
  S="$2"; C="$3"; P="$4"
  LOG="sessions/batch/link-$S-$C-p$P.txt"
  # Already ran and wrote a session: leave it alone. Lets the grid be restarted
  # at a different width without paying for every cell again.
  if [ -f "$LOG" ] && grep -q "session written" "$LOG"; then echo "$S/$C cast$(( $P + 1 )) skip"; exit; fi
  if [ "$S" = "refs" ]; then GOALS="--goals loose --drawings"; else GOALS="--goals told"; fi
  node --env-file=.env run.mjs --a openai --b claude --machine gemini \
    --scenario "$S" --case "$C" --pair "$P" $GOALS \
    --speech free --builder model \
    > "$LOG" 2>&1
  echo "$S/$C cast$(( $P + 1 )) exit=$?"; exit
fi
for S in places loads agreed pairs refs; do for C in $CASES; do for P in 0 1 2 3; do echo "$S $C $P"; done; done; done \
  | xargs -P 20 -n 3 "$0" --one
