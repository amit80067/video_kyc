#!/usr/bin/env bash
# Start Video KYC backend under nohup (survives SSH disconnect; logs to ../logs/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
cd "$(dirname "$0")"

PORT="${PORT:-8005}"
PID_FILE="$LOG_DIR/backend-${PORT}.pid"
LOG_FILE="$LOG_DIR/backend-nohup.log"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing backend PID $OLD_PID"
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Prefer a normal Node on PATH; fallback to node.
NODE_BIN="${NODE_BIN:-node}"

echo "Starting backend with: $NODE_BIN src/server.js (port $PORT)"
nohup env PORT="$PORT" "$NODE_BIN" src/server.js >>"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
echo "PID $NEW_PID written to $PID_FILE"
echo "Logs: $LOG_FILE"
