#!/usr/bin/env bash
# systemd ExecStart: login shell so PATH includes nvm/node if configured in ~/.bashrc.
set -euo pipefail
BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash -lc "cd \"${BACKEND_DIR}\" && exec node src/server.js"
