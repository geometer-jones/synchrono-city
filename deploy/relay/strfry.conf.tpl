db = "${STRFRY_DB}"

relay {
  bind = "${STRFRY_BIND}"
  port = ${STRFRY_PORT}

  writePolicy {
    plugin = "CONCIERGE_RELAY_AUTH_URL=${CONCIERGE_RELAY_AUTH_URL} /usr/local/bin/relay-shim"
    timeoutSeconds = 10
  }
}
