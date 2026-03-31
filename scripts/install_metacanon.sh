#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SNAPSHOT_PATH="${METACANON_SNAPSHOT:-$HOME/.metacanon_ai/runtime_snapshot.json}"

cd "$PROJECT_DIR"

echo "=== Building release binary ==="
cargo build --release

echo "=== Running tests ==="
cargo test --all-targets

echo "=== Running installer setup ==="
cargo run --release -- setup \
  --snapshot "$SNAPSHOT_PATH" \
  --load-existing \
  "$@"

echo "=== Done ==="
echo "Snapshot: $SNAPSHOT_PATH"
