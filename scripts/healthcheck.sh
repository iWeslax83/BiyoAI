#!/usr/bin/env bash
set -euo pipefail

BIYOAI_DIR="${BIYOAI_DIR:-/opt/biyoai}"
URL="http://localhost:3000/api/health"

if ! curl -fsS --max-time 5 "$URL" > /dev/null; then
  echo "$(date -Iseconds) BiyoAI health check failed, restarting" >> "$BIYOAI_DIR/biyoai-health.log" || true
  cd "$BIYOAI_DIR"
  docker compose restart app
fi
