#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v corepack >/dev/null 2>&1; then
  corepack enable > /dev/null 2>&1 || true
fi

if [ -f "package-lock.json" ]; then
  npm ci --include-workspace-root --install-links
else
  npm install --include-workspace-root --install-links
fi
