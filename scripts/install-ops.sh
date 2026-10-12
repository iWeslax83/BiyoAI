#!/usr/bin/env bash
# One-time setup on the school PC: starts BiyoAI at boot (systemd), checks
# its health every 5 minutes and takes a database backup every night.
#
#   sudo scripts/install-ops.sh            # install
#   scripts/install-ops.sh --dry-run       # show what would be done
set -euo pipefail

BIYOAI_DIR="${BIYOAI_DIR:-/opt/biyoai}"
DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

CRON_FILE="/etc/cron.d/biyoai"
UNIT_SRC="$BIYOAI_DIR/biyoai.service"
UNIT_DST="/etc/systemd/system/biyoai.service"

CRON_CONTENT="# BiyoAI: health check every 5 minutes, backup nightly at 03:15.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root $BIYOAI_DIR/scripts/healthcheck.sh
15 3 * * * root $BIYOAI_DIR/scripts/backup.sh
"

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

if [ "$DRY_RUN" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "Root yetkisi gerekli: sudo scripts/install-ops.sh" >&2
  exit 1
fi
if [ ! -f "$UNIT_SRC" ]; then
  echo "Bulunamadı: $UNIT_SRC (BIYOAI_DIR doğru mu?)" >&2
  exit 1
fi

run install -m 0644 "$UNIT_SRC" "$UNIT_DST"
run systemctl daemon-reload
run systemctl enable biyoai.service
run chmod +x "$BIYOAI_DIR/scripts/healthcheck.sh" "$BIYOAI_DIR/scripts/backup.sh" "$BIYOAI_DIR/scripts/restore-check.sh"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] $CRON_FILE dosyasına yazılacak:"
  printf '%s' "$CRON_CONTENT"
else
  printf '%s' "$CRON_CONTENT" > "$CRON_FILE"
  chmod 0644 "$CRON_FILE"
fi

echo "Tamam. Doğrulamak için:"
echo "  systemctl is-enabled biyoai.service"
echo "  cat $CRON_FILE"
echo "  $BIYOAI_DIR/scripts/backup.sh && $BIYOAI_DIR/scripts/restore-check.sh"
