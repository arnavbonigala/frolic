#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
deps="$HOME/.capy/work/deps"
if [ ! -d "$deps/node_modules/yaml" ]; then
  mkdir -p "$deps"
  npm install --prefix "$deps" --silent --no-fund --no-audit yaml@2
fi
node "$here/lint.mjs" "$@"
echo "--- revyl backend validation (needs revyl auth login) ---"
if revyl auth status >/dev/null 2>&1; then
  revyl test validate "$here/flows"/*.yaml
else
  echo "skipped: revyl CLI is not authenticated on this machine"
fi
