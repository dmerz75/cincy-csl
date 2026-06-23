#!/usr/bin/env bash
# Start the backend FastAPI server in the project venv.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT_DIR/.venv"

# Fall back to legacy venv/ name if .venv doesn't exist
if [ ! -d "$VENV" ]; then
  VENV="$ROOT_DIR/venv"
fi

if [ ! -d "$VENV" ]; then
  echo "Virtualenv not found — create one with: python -m venv .venv" >&2
  exit 1
fi

PORT="${PORT:-8000}"

# Kill any process already occupying the port (including reloader children)
EXISTING_PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$EXISTING_PIDS" ]; then
  echo "Port $PORT in use (PIDs: $EXISTING_PIDS) — killing..."
  echo "$EXISTING_PIDS" | xargs kill -TERM 2>/dev/null || true
  # Wait up to 5 s for the port to free
  for i in 1 2 3 4 5; do
    sleep 1
    lsof -ti :"$PORT" &>/dev/null || break
  done
  # Force-kill anything still holding the port
  REMAINING=$(lsof -ti :"$PORT" 2>/dev/null || true)
  [ -n "$REMAINING" ] && echo "$REMAINING" | xargs kill -KILL 2>/dev/null || true
fi

echo "Activating venv and starting uvicorn on port $PORT..."
. "$VENV/bin/activate"
exec env PYTHONPATH="$ROOT_DIR" uvicorn cincy_csl.api.app:app --reload --port "$PORT" --app-dir "$ROOT_DIR"
