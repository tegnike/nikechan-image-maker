#!/bin/zsh

set -euo pipefail

readonly PROJECT_DIR="${0:A:h:h}"
readonly TSX_CLI="$PROJECT_DIR/node_modules/tsx/dist/cli.mjs"

node_bin="${NODE_BIN:-}"
if [[ -z "$node_bin" ]]; then
  required_major="$(<"$PROJECT_DIR/.nvmrc")"
  machine_arch="$(/usr/bin/arch)"
  [[ "$machine_arch" == "i386" || "$machine_arch" == "x86_64" ]] && machine_arch="x64"
  for candidate in "$HOME"/.nvm/versions/node/v${required_major}*/bin/node(N) /opt/homebrew/bin/node /usr/local/bin/node "${commands[node]:-}"; do
    if [[ -x "$candidate" ]] \
      && [[ "$("$candidate" -p 'process.versions.node.split(".")[0]')" == "$required_major" ]] \
      && [[ "$("$candidate" -p 'process.arch')" == "$machine_arch" ]]; then
      node_bin="$candidate"
      break
    fi
  done
fi
readonly NODE_BIN="$node_bin"

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
