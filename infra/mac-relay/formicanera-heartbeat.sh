#!/bin/bash
# Invia heartbeat al VPS Formicanera ogni volta che viene chiamato (ogni 60s via LaunchDaemon).
# Eseguito solo se WireGuard è attivo (rilevato dalla presenza di un'interfaccia utun* con peer).

# Carica RELAY_SECRET dall'ambiente di sistema
if [ -f /etc/formicanera-env ]; then
  # shellcheck disable=SC1091
  source /etc/formicanera-env
fi

if [ -z "${RELAY_SECRET:-}" ]; then
  echo "[formicanera-heartbeat] RELAY_SECRET non trovato in /etc/formicanera-env — uscita." >&2
  exit 1
fi

# Controlla se WireGuard è attivo (la connessione crea un'interfaccia utun*)
WG_ACTIVE=$(ifconfig 2>/dev/null | grep -c 'utun' || true)
if [ "$WG_ACTIVE" -eq 0 ]; then
  exit 0  # WireGuard non attivo, nessun heartbeat
fi

# Invia heartbeat
curl -sf \
  -X POST "https://formicanera.com/api/internal/relay-heartbeat" \
  -H "Authorization: Bearer ${RELAY_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"source":"mac-relay"}' \
  --max-time 5 \
  --retry 2 \
  --retry-delay 1 \
  > /dev/null 2>&1 || true

exit 0
