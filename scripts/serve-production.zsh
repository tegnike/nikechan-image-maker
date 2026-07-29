#!/bin/zsh

set -euo pipefail

readonly PROJECT_DIR="/Users/your-name/WorkSpace/nikechan-image-maker"
readonly NODE_BIN="/Users/your-name/.nvm/versions/node/v22.21.1/bin/node"
readonly TSX_CLI="$PROJECT_DIR/node_modules/tsx/dist/cli.mjs"

# The asset library lives on T7. Stay alive while the disk is detached and
# start serving automatically as soon as it is mounted again.
until /sbin/mount | /usr/bin/grep -Fq " on /Volumes/EXTERNAL_VOLUME "; do
  /bin/sleep 10
done

if [[ ! -x "$NODE_BIN" ]]; then
  print -u2 "Node.js was not found: $NODE_BIN"
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
