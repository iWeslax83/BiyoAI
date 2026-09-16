#!/usr/bin/env bash
set -euo pipefail

URL="http://localhost:3000/api/health"

if ! curl -fsS --max-time 5 "$URL" > /dev/null; then
  echo "$(date -Iseconds) BiyoAI health check failed, restarting" >> /var/log/biyoai-health.log
  cd /opt/biyoai
  docker compose restart app
fi
