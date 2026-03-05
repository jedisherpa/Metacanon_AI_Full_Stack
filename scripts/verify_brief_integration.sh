#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ok() {
  printf 'PASS: %s\n' "$1"
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

require_path() {
  local rel="$1"
  local abs="$ROOT/$rel"
  [[ -e "$abs" ]] || fail "missing $rel"
  ok "found $rel"
}

require_pattern() {
  local rel="$1"
  local pattern="$2"
  local abs="$ROOT/$rel"
  [[ -f "$abs" ]] || fail "missing file $rel"
  rg -n --quiet "$pattern" "$abs" || fail "pattern '$pattern' not found in $rel"
  ok "pattern '$pattern' in $rel"
}

printf 'Verifying brief integration in %s\n' "$ROOT"

# Repository directories
for repo in \
  metacanon-core \
  sphere-engine-server \
  sphere-skin-council-nebula \
  sphere-tma-app \
  metacanon-installer \
  metacanon-code-api; do
  require_path "$repo"
done

# Core layering essentials
require_path "metacanon-core/src/genesis.rs"
require_path "metacanon-core/src/compute.rs"
require_path "metacanon-core/src/torus.rs"
require_path "metacanon-core/src/secrets.rs"
require_path "metacanon-core/src/fhe.rs"
require_path "metacanon-core/src/task_sub_sphere.rs"
require_path "metacanon-core/src/sub_sphere_torus.rs"
require_path "metacanon-core/src/observability.rs"
require_path "metacanon-core/src/communications.rs"

# Installer dependency to core
require_pattern \
  "metacanon-installer/desktop/src-tauri/Cargo.toml" \
  "metacanon-core\\.git"

# Code API endpoint contracts
require_pattern "metacanon-code-api/src/server.ts" "/api/v1/manifest"
require_pattern "metacanon-code-api/src/server.ts" "/api/v1/snippet/:id"
require_path "metacanon-code-api/code-map.yaml"

# Governance payload for sphere engine server
require_path "sphere-engine-server/governance/governance.yaml"

# Follow-up brief integration docs
require_path "SUBJECT_METACANON_DEVELOPER_EVALUATION_NEXT_STEPS_2026-03-05.md"
require_path "docs/WEBSITE_DUAL_MODE_BACKEND_RESPONSE.md"
require_path "docs/WEBSITE_DUAL_MODE_IMPLEMENTATION_PLAN.md"

ok "brief integration checks complete"
