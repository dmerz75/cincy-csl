#!/usr/bin/env bash
# Start the backend FastAPI server in the project venv.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT_DIR/venv"

if [ ! -d "$VENV" ]; then
  echo "Virtualenv not found at $VENV — create one with: python -m venv venv" >&2
  exit 1
fi

echo "Activating venv and starting uvicorn on port 8000..."
. "$VENV/bin/activate"
exec uvicorn cincy_csl.api.app:app --reload --port 8000
