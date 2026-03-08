#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export EMAIL_ADAPTER_PORT="${EMAIL_ADAPTER_PORT:-3310}"
export EMAIL_ADAPTER_HOST="${EMAIL_ADAPTER_HOST:-127.0.0.1}"
export EMAIL_ADAPTER_PROVIDER="${EMAIL_ADAPTER_PROVIDER:-stub}"
export EMAIL_ADAPTER_TOKEN="${EMAIL_ADAPTER_TOKEN:-local-email-adapter-token}"
export EMAIL_ADAPTER_STUB_INBOX_JSON="${EMAIL_ADAPTER_STUB_INBOX_JSON:-{
  \"primary\": [
    {
      \"messageId\": \"demo-1\",
      \"from\": \"ops@metacanon.ai\",
      \"subject\": \"Welcome to MetaCanon\",
      \"preview\": \"This is a local adapter stub message.\",
      \"receivedAt\": \"2026-03-06T09:00:00.000Z\"
    },
    {
      \"messageId\": \"demo-2\",
      \"from\": \"alerts@metacanon.ai\",
      \"subject\": \"Action required\",
      \"preview\": \"Review your runtime configuration.\",
      \"receivedAt\": \"2026-03-06T09:15:00.000Z\"
    }
  ]
}"}"

echo "[email-adapter] provider=${EMAIL_ADAPTER_PROVIDER} host=${EMAIL_ADAPTER_HOST} port=${EMAIL_ADAPTER_PORT}"
npm run dev:email-adapter -w engine
