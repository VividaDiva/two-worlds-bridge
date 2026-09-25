#!/bin/zsh
# Keeps the user test reachable: restarts the server if it stops answering,
# and replaces the quick tunnel when it dies or Cloudflare forgets it
# ("Unauthorized: Tunnel not found"). A quick tunnel gets a new address each
# time; the server reads the newest one from the log on every request, so the
# facilitator console always hands out links that work.
#
#   nohup ./keepalive.sh > /tmp/keepalive.log 2>&1 &
cd "$(dirname "$0")/.." || exit 1
PORT=${PORT:-8780}
LOG=/tmp/tunnel2.log
say() { echo "$(date '+%F %T') $*"; }

start_server() {
  say "starting server"
  nohup node --env-file=.env usertest/server.mjs >> /tmp/usertest-server.log 2>&1 &
}
start_tunnel() {
  pkill -f "cloudflared tunnel --url http://localhost:$PORT" 2>/dev/null
  rm -f "$LOG"
  say "starting tunnel"
  nohup cloudflared tunnel --url "http://localhost:$PORT" --logfile "$LOG" > /tmp/tunnel2.out 2>&1 &
  for i in {1..30}; do
    u=$(grep -ho 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" /tmp/tunnel2.out 2>/dev/null | tail -1)
    [ -n "$u" ] && { say "tunnel up: $u"; return; }
    sleep 2
  done
  say "tunnel gave no address"
}

while true; do
  if ! curl -s -o /dev/null --max-time 3 "http://localhost:$PORT/"; then
    start_server
    for i in {1..20}; do curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/" && break; sleep 1; done
  fi
  if ! pgrep -f "cloudflared tunnel --url http://localhost:$PORT" >/dev/null; then
    start_tunnel
  elif [ "$(tail -n 20 "$LOG" 2>/dev/null | grep -c 'Tunnel not found')" -ge 3 ]; then
    say "tunnel expired"
    start_tunnel
  fi
  sleep 20
done
