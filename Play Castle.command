#!/bin/bash
# Castle of the Crimson Moon — double-click launcher.
# Stops any previous server on the game port, starts a fresh one,
# and opens the game in your default browser.
# The server keeps running after this window closes.

cd "$(dirname "$0")"
PORT=8000

# Stop previous server (if any) on this port
PIDS=$(lsof -ti:$PORT)
if [ -n "$PIDS" ]; then
  echo "Stopping previous server (pid: $PIDS)..."
  kill $PIDS 2>/dev/null
  sleep 1
fi

# Start fresh, detached so it survives this window closing
nohup python3 -m http.server $PORT >/dev/null 2>&1 &
disown

sleep 1
open "http://localhost:$PORT"
echo ""
echo "  Castle of the Crimson Moon is running at http://localhost:$PORT"
echo "  (This window can be closed — the server stays up.)"
