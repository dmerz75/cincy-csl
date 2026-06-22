#!/usr/bin/env bash
# Start the frontend dev server (Vite) in `web/`.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"

if [ ! -d "$WEB_DIR" ]; then
  echo "web/ directory not found at $WEB_DIR" >&2
  exit 1
fi

cd "$WEB_DIR"
echo "Installing npm deps (if needed) and starting dev server on 5173..."
npm install --silent
exec npm run dev
