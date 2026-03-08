#!/bin/zsh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PID_DIR="$ROOT/.dev/pids"

stop_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
    fi
    rm -f "$pid_file"
    echo "[$name] stopped"
  fi
}

stop_pid sphere-viz
stop_pid sphere-bridge

docker compose -f "$ROOT/docker-compose.fullstack.yml" down
