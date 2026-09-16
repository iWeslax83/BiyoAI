#!/usr/bin/env bash
set -euo pipefail

cd /opt/biyoai

BACKUP_DIR="/opt/biyoai/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
FINAL_FILE="$BACKUP_DIR/biyoai-$STAMP.sql"
TMP_FILE="$FINAL_FILE.tmp"

docker compose exec -T db pg_dump -U biyoai biyoai > "$TMP_FILE"
mv "$TMP_FILE" "$FINAL_FILE"

# Keep the last 30 backups (guarded so a fresh install with <31 backups doesn't abort under set -e)
if [ "$(ls -1 "$BACKUP_DIR"/biyoai-*.sql 2>/dev/null | wc -l)" -gt 30 ]; then
  ls -1t "$BACKUP_DIR"/biyoai-*.sql | tail -n +31 | xargs -r rm -- || true
fi
