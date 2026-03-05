#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo is required but was not found in PATH" >&2
  exit 1
fi

RUN_TESTS=1
RUN_SETUP=1
SNAPSHOT_PATH="${METACANON_SNAPSHOT_PATH:-$HOME/.metacanon_ai/runtime_snapshot.json}"
LOAD_EXISTING=1
GLOBAL_PROVIDER=""
CLOUD_PRIORITY=""
SMOKE_QUERY=""
GROK_LIVE=0
SNAPSHOT_ENCRYPTION=""
SNAPSHOT_PASSPHRASE=""
AUTO_SAVE=""
SECRET_BACKEND=""
RETENTION_DAYS=""
LOG_LEVEL=""

usage() {
  cat <<'USAGE'
usage: scripts/install_metacanon.sh [options]

options:
  --snapshot <path>         snapshot path (default: $HOME/.metacanon_ai/runtime_snapshot.json)
  --provider <id>           global provider id
  --cloud-priority <csv>    cloud provider order
  --smoke-query <text>      run post-setup smoke query
  --grok-live               enable live grok transport in setup
  --snapshot-encryption     enable encrypted snapshot mode
  --no-snapshot-encryption  disable encrypted snapshot mode
  --snapshot-passphrase <p> set snapshot passphrase
  --auto-save               enable auto-save snapshots
  --no-auto-save            disable auto-save snapshots
  --secret-backend <mode>   keychain_only | encrypted_file_only | dual_write
  --retention-days <n>      observability retention days
  --log-level <level>       error | warn | info | debug | trace
  --skip-tests              skip cargo test
  --skip-setup              only build/test; do not run installer setup command
  --no-load-existing        do not load existing snapshot during setup
  -h, --help                show help

secrets:
  pass keys via env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY,
  MOONSHOT_KIMI_API_KEY (or MOONSHOT_API_KEY), GROK_API_KEY (or XAI_API_KEY)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot)
      SNAPSHOT_PATH="${2:-}"
      shift 2
      ;;
    --provider)
      GLOBAL_PROVIDER="${2:-}"
      shift 2
      ;;
    --cloud-priority)
      CLOUD_PRIORITY="${2:-}"
      shift 2
      ;;
    --smoke-query)
      SMOKE_QUERY="${2:-}"
      shift 2
      ;;
    --grok-live)
      GROK_LIVE=1
      shift
      ;;
    --snapshot-encryption)
      SNAPSHOT_ENCRYPTION="on"
      shift
      ;;
    --no-snapshot-encryption)
      SNAPSHOT_ENCRYPTION="off"
      shift
      ;;
    --snapshot-passphrase)
      SNAPSHOT_PASSPHRASE="${2:-}"
      shift 2
      ;;
    --auto-save)
      AUTO_SAVE="on"
      shift
      ;;
    --no-auto-save)
      AUTO_SAVE="off"
      shift
      ;;
    --secret-backend)
      SECRET_BACKEND="${2:-}"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="${2:-}"
      shift 2
      ;;
    --log-level)
      LOG_LEVEL="${2:-}"
      shift 2
      ;;
    --skip-tests)
      RUN_TESTS=0
      shift
      ;;
    --skip-setup)
      RUN_SETUP=0
      shift
      ;;
    --no-load-existing)
      LOAD_EXISTING=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown option '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

echo "==> Building release binary"
cargo build --release

if [[ "$RUN_TESTS" -eq 1 ]]; then
  echo "==> Running test suite"
  cargo test
fi

if [[ "$RUN_SETUP" -eq 1 ]]; then
  echo "==> Running installer setup"
  CMD=("$ROOT_DIR/target/release/metacanon" "setup" "--snapshot" "$SNAPSHOT_PATH")
  if [[ "$LOAD_EXISTING" -eq 1 ]]; then
    CMD+=("--load-existing")
  else
    CMD+=("--no-load-existing")
  fi
  if [[ -n "$GLOBAL_PROVIDER" ]]; then
    CMD+=("--provider" "$GLOBAL_PROVIDER")
  fi
  if [[ -n "$CLOUD_PRIORITY" ]]; then
    CMD+=("--cloud-priority" "$CLOUD_PRIORITY")
  fi
  if [[ -n "$SMOKE_QUERY" ]]; then
    CMD+=("--smoke-query" "$SMOKE_QUERY")
  fi
  if [[ "$GROK_LIVE" -eq 1 ]]; then
    CMD+=("--grok-live")
  fi
  if [[ "$SNAPSHOT_ENCRYPTION" == "on" ]]; then
    CMD+=("--snapshot-encryption")
  elif [[ "$SNAPSHOT_ENCRYPTION" == "off" ]]; then
    CMD+=("--no-snapshot-encryption")
  fi
  if [[ -n "$SNAPSHOT_PASSPHRASE" ]]; then
    CMD+=("--snapshot-passphrase" "$SNAPSHOT_PASSPHRASE")
  fi
  if [[ "$AUTO_SAVE" == "on" ]]; then
    CMD+=("--auto-save")
  elif [[ "$AUTO_SAVE" == "off" ]]; then
    CMD+=("--no-auto-save")
  fi
  if [[ -n "$SECRET_BACKEND" ]]; then
    CMD+=("--secret-backend" "$SECRET_BACKEND")
  fi
  if [[ -n "$RETENTION_DAYS" ]]; then
    CMD+=("--retention-days" "$RETENTION_DAYS")
  fi
  if [[ -n "$LOG_LEVEL" ]]; then
    CMD+=("--log-level" "$LOG_LEVEL")
  fi

  "${CMD[@]}"
fi

echo "==> Complete"
echo "Binary: $ROOT_DIR/target/release/metacanon"
echo "Snapshot: $SNAPSHOT_PATH"
