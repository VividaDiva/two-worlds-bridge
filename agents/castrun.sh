#!/bin/bash
# One cell: PAIR scenario case. Kept as a script rather than an xargs -I line,
# which once refused the whole command as too long to assemble and silently
# started three jobs out of four.
cd "$(dirname "$0")"
PAIR=$1 ./gridrun.sh --one "$2" "$3"
