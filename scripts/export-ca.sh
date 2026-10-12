#!/usr/bin/env bash
# Saves the top certificate of the chain a host presents to certs/extra-ca.pem,
# so the app container can trust a network that inspects HTTPS traffic
# (common on school and government networks).
#
#   scripts/export-ca.sh [host]        # default host: api.groq.com
#
# IMPORTANT: this trusts whatever your network presents. Check the printed
# subject/fingerprint with the network administrator before using the file.
set -euo pipefail

HOST="${1:-api.groq.com}"
BIYOAI_DIR="${BIYOAI_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
OUT="$BIYOAI_DIR/certs/extra-ca.pem"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Only the certificates of the presented chain: s_client repeats the server
# certificate after the chain ("Server certificate"), which must be skipped.
echo | openssl s_client -showcerts -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
  | awk -v dir="$TMP" '
      /^Server certificate/ { exit }
      /-----BEGIN CERTIFICATE-----/ { n++; file = sprintf("%s/cert%02d.pem", dir, n); inblock = 1 }
      inblock { print > file }
      /-----END CERTIFICATE-----/ { inblock = 0; close(file) }
    '

LAST="$(ls -1 "$TMP"/cert*.pem 2>/dev/null | tail -n 1 || true)"
if [ -z "$LAST" ]; then
  echo "$HOST için sertifika alınamadı." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
cp "$LAST" "$OUT"
echo "Kaydedildi: $OUT"
echo "Konu:      $(openssl x509 -in "$OUT" -noout -subject)"
echo "Veren:     $(openssl x509 -in "$OUT" -noout -issuer)"
echo "Parmak izi: $(openssl x509 -in "$OUT" -noout -fingerprint -sha256)"
echo
echo "Bu sertifikanın ağ yöneticisinin verdiğiyle aynı olduğunu doğrula."
