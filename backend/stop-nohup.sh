#!/usr/bin/env bash
# Stop backend started by start-nohup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
PORT="${PORT:-8005}"
PID_FILE="$LOG_DIR/backend-${PORT}.pid"
if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file at $PID_FILE"
  exit 0
fi
PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  echo "Stopping PID $PID"
  kill "$PID" || true
  sleep 2
  kill -9 "$PID" 2>/dev/null || true
else
  echo "PID $PID not running"
fi
rm -f "$PID_FILE"
echo "Done"
