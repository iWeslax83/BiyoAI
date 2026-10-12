#!/usr/bin/env bash
# Proves that the newest backup can actually be restored: loads it into a
# throwaway database, counts rows, then drops that database. The live
# database is not touched.
#
#   cd /opt/biyoai && scripts/restore-check.sh
set -euo pipefail

BIYOAI_DIR="${BIYOAI_DIR:-/opt/biyoai}"
cd "$BIYOAI_DIR"

LATEST=$(ls -1t "$BIYOAI_DIR"/backups/biyoai-*.sql 2>/dev/null | head -n 1 || true)
if [ -z "$LATEST" ]; then
  echo "Yedek bulunamadı: $BIYOAI_DIR/backups" >&2
  exit 1
fi

CHECK_DB="biyoai_restore_check"
DB_EXEC=(docker compose exec -T db)

cleanup() {
  "${DB_EXEC[@]}" dropdb -U biyoai --if-exists "$CHECK_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
"${DB_EXEC[@]}" createdb -U biyoai "$CHECK_DB"
"${DB_EXEC[@]}" psql -U biyoai -v ON_ERROR_STOP=1 -q "$CHECK_DB" < "$LATEST" >/dev/null

echo "Yedek: $LATEST"
"${DB_EXEC[@]}" psql -U biyoai -tA "$CHECK_DB" -c \
  "select 'sources=' || count(*) from sources union all
   select 'chunks=' || count(*) from chunks union all
   select 'qa_log=' || count(*) from qa_log union all
   select 'feedback=' || count(*) from feedback union all
   select 'teacher=' || count(*) from teacher"
echo "Geri yükleme başarılı."
