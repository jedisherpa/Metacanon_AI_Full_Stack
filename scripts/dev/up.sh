#!/bin/zsh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PID_DIR="$ROOT/.dev/pids"
LOG_DIR="$ROOT/.dev/logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

ensure_node_service_deps() {
  local name="$1"
  local workdir="$2"
  if [[ -d "$workdir/node_modules" ]]; then
    return 0
  fi

  echo "[$name] installing dependencies"
  (
    cd "$workdir"
    npm install --no-fund --no-audit
  )
}

build_node_service() {
  local name="$1"
  local workdir="$2"
  echo "[$name] building"
  (
    cd "$workdir"
    npm run build
  )
}

start_node_service() {
  local name="$1"
  local workdir="$2"
  local health_url="$3"
  shift 3
  local pid_file="$PID_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if [[ -n "$health_url" ]] && curl -sf "$health_url" >/dev/null 2>&1; then
    echo "[$name] already reachable at $health_url"
    return 0
  fi

  ensure_node_service_deps "$name" "$workdir"
  build_node_service "$name" "$workdir"

  (
    cd "$workdir"
    nohup "$@" >"$log_file" 2>&1 < /dev/null &
    echo $! > "$pid_file"
  )

  local attempts=0
  until curl -sf "$health_url" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge 20 ]]; then
      echo "[$name] failed to become healthy"
      tail -n 80 "$log_file" 2>/dev/null || true
      return 1
    fi
    sleep 1
  done
  echo "[$name] reachable at $health_url"
}

wait_for_engine() {
  local attempts=0
  until curl -sf http://localhost:3101/health >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge 40 ]]; then
      echo "[engine-api] health check failed after ${attempts} attempts"
      return 1
    fi
    sleep 2
  done
  echo "[engine-api] healthy"
}

echo "[fullstack] starting postgres"
docker compose -f "$ROOT/docker-compose.fullstack.yml" up -d db

echo "[fullstack] running engine migrations"
docker compose -f "$ROOT/docker-compose.fullstack.yml" run --rm engine-migrate

echo "[fullstack] starting sphere-engine services"
docker compose -f "$ROOT/docker-compose.fullstack.yml" up -d engine-api engine-worker
wait_for_engine

start_node_service sphere-bridge "$ROOT/sphere-bridge" "http://localhost:3013/health" npm run start
start_node_service sphere-viz "$ROOT/sphere-viz" "http://localhost:3020" npm run start

echo

echo "Sphere Engine: http://localhost:3101"
echo "Sphere Bridge: http://localhost:3013/health"
echo "SphereViz:      http://localhost:3020"
