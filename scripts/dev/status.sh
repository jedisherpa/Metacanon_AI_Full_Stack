#!/bin/zsh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PID_DIR="$ROOT/.dev/pids"

check_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$name.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    echo "$name: running (pid $(cat "$pid_file"))"
  else
    echo "$name: not running"
  fi
}

check_http() {
  local label="$1"
  local url="$2"
  if curl -sf "$url" >/dev/null 2>&1; then
    echo "$label: healthy ($url)"
  else
    echo "$label: unavailable ($url)"
  fi
}

docker compose -f "$ROOT/docker-compose.fullstack.yml" ps

echo
check_pid sphere-bridge
check_pid sphere-viz

echo
check_http sphere-engine http://localhost:3101/health
check_http sphere-bridge http://localhost:3013/health
check_http sphere-viz http://localhost:3020
