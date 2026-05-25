#!/bin/bash
# Ripristina modalità diretta quando Komet sblocca l'IP del VPS.
# Uso: bash scripts/disable-relay-mode.sh ~/archibald_vps
# Prerequisito: SSH key disponibile al percorso passato come argomento.

set -euo pipefail

SSH_KEY="${1:-$HOME/archibald_vps}"
VPS="deploy@91.98.136.198"

if [ ! -f "$SSH_KEY" ]; then
  echo "Errore: SSH key non trovata in $SSH_KEY"
  echo "Uso: bash $0 <percorso-ssh-key>"
  exit 1
fi

echo "==> Connessione al VPS..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS" 'bash -s' <<'REMOTE'
set -euo pipefail
APP_DIR="/home/deploy/archibald-app"
COMPOSE="docker compose -f $APP_DIR/docker-compose.yml"

echo "--- Reset circuit breaker e sync_paused_users ---"
$COMPOSE exec -T postgres psql -U archibald -d archibald -c "
  UPDATE system.agent_circuit_state
  SET state='closed', consecutive_erp_failures=0, next_probe_at=NULL, updated_at=NOW();
  DELETE FROM system.sync_paused_users;
  SELECT 'OK: ' || COUNT(*) || ' agenti ripristinati' FROM system.agent_circuit_state WHERE state='closed';
"

echo "--- Rimozione rotta ERP via relay ---"
ip route del 4.231.124.90/32 via 10.10.0.2 dev wg0 2>/dev/null && echo "Rotta rimossa." || echo "Rotta non presente (OK)."

echo "--- Reset BOT_RELAY_TIMEOUT_MULTIPLIER a 1.0 ---"
if [ -f "$APP_DIR/.env" ]; then
  sed -i 's/^BOT_RELAY_TIMEOUT_MULTIPLIER=.*/BOT_RELAY_TIMEOUT_MULTIPLIER=1.0/' "$APP_DIR/.env"
  echo "Multiplier reset."
fi

echo "--- Riavvio backend ---"
$COMPOSE restart backend
echo "Backend riavviato."

echo ""
echo "==> Modalità diretta ripristinata."
echo "    AdaptiveScheduler riprende automaticamente le sync in background."
REMOTE
