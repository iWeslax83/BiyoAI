#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/biyoai/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)

docker compose exec -T db pg_dump -U biyoai biyoai > "$BACKUP_DIR/biyoai-$STAMP.sql"

# Keep the last 30 backups
ls -1t "$BACKUP_DIR"/biyoai-*.sql | tail -n +31 | xargs -r rm --
