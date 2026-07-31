#!/bin/zsh

set -euo pipefail

readonly PROJECT_DIR="${0:A:h:h}"
readonly NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
readonly TSX_CLI="$PROJECT_DIR/node_modules/tsx/dist/cli.mjs"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  print -u2 "Node.js was not found. Set NODE_BIN or add Node.js to PATH."
  exit 1
fi

if [[ ! -f "$TSX_CLI" ]]; then
  print -u2 "Dependencies are missing. Run npm install in $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"
export NODE_ENV=production
export PORT=4178
exec "$NODE_BIN" "$TSX_CLI" server/index.ts
