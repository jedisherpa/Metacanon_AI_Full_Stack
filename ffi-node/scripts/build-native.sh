#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${NODE_ROOT}/.." && pwd)"
RUST_CRATE_ROOT="${REPO_ROOT}/metacanon-core"

cd "${RUST_CRATE_ROOT}"

case "$(uname -s)" in
  Darwin)
    echo "Building metacanon_ai with N-API exports (macOS dynamic lookup mode)..."
    RUSTFLAGS="-C link-arg=-Wl,-undefined,dynamic_lookup" cargo build --release --features napi
    NATIVE_LIB="${RUST_CRATE_ROOT}/target/release/libmetacanon_ai.dylib"
    ;;
  Linux)
    echo "Building metacanon_ai with N-API exports..."
    cargo build --release --features napi
    NATIVE_LIB="${RUST_CRATE_ROOT}/target/release/libmetacanon_ai.so"
    ;;
  *)
    echo "Unsupported OS for this build script: $(uname -s)"
    exit 1
    ;;
esac

if [[ ! -f "${NATIVE_LIB}" ]]; then
  echo "Expected build output not found: ${NATIVE_LIB}"
  exit 1
fi

cp "${NATIVE_LIB}" "${NODE_ROOT}/metacanon_ai.node"
echo "Wrote ${NODE_ROOT}/metacanon_ai.node"
