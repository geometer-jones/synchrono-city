#!/usr/bin/env bash
set -euo pipefail

STRFRY_BIND="${STRFRY_BIND:-0.0.0.0}"
STRFRY_PORT="${STRFRY_PORT:-8080}"
STRFRY_DB="${STRFRY_DB:-/var/lib/strfry}"
CONCIERGE_RELAY_AUTH_URL="${CONCIERGE_RELAY_AUTH_URL:-http://concierge:3000/internal/relay/authorize}"

mkdir -p "${STRFRY_DB}"

cat >/etc/strfry.conf <<EOF
db = "${STRFRY_DB}"

relay {
  bind = "${STRFRY_BIND}"
  port = ${STRFRY_PORT}

  writePolicy {
    plugin = "CONCIERGE_RELAY_AUTH_URL=${CONCIERGE_RELAY_AUTH_URL} /usr/local/bin/relay-shim"
    timeoutSeconds = 10
  }
}
EOF

exec /usr/local/bin/strfry --config /etc/strfry.conf relay
