#!/usr/bin/env bash
# Run the API and the web app together. Ctrl-C stops both.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -d "$ROOT/backend/.venv" ]]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  npm install --prefix "$ROOT/frontend"
fi

cleanup() {
  kill 0
}
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && exec "$ROOT/backend/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000) &
(cd "$ROOT/frontend" && exec npm run dev -- --host 127.0.0.1 --port 5173) &
wait
