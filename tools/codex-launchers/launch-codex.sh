#!/bin/zsh
set -euo pipefail

if [[ $# -lt 2 ]]; then
  print -u2 "usage: $0 <target-dir> <label>"
  exit 1
fi

TARGET_DIR="$1"
LABEL="$2"
CODEX_BIN="${CODEX_BIN:-$(command -v codex || true)}"

if [[ -z "$CODEX_BIN" ]]; then
  print -u2 "codex binary not found in PATH"
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  print -u2 "target directory does not exist: $TARGET_DIR"
  exit 1
fi

print "Launching Codex app for: $LABEL"
print "Target: $TARGET_DIR"

cd "$TARGET_DIR"
exec "$CODEX_BIN" -C "$TARGET_DIR" app
