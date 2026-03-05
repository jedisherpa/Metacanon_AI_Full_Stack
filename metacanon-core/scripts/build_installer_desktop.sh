#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/paulcooper/Documents/Codex Master Folder"
APP_DIR="$ROOT/installer-ui/desktop"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required" >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo is required" >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -d node_modules ]]; then
  echo "==> Installing npm dependencies"
  npm install
fi

echo "==> Building MetaCanon Installer bundle"
npm run tauri:build

echo "==> Bundle output"
find "$APP_DIR/src-tauri/target/release/bundle" -maxdepth 3 -type f 2>/dev/null || true
