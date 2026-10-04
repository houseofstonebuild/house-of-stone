#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 24 from https://nodejs.org/en/download, then open this file again."
  read -r -p "Press Enter to close. "
  exit 1
fi
node scripts/setup.mjs
node --env-file-if-exists=.env server.mjs
