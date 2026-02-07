#!/bin/bash
# Monitora deployment in tempo reale

SSH_KEY="/tmp/archibald_vps"
VPS_HOST="deploy@91.98.136.198"
TARGET_COMMIT="7897202"

echo "🚀 MONITORAGGIO DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Target commit: $TARGET_COMMIT"
echo "GitHub Actions: https://github.com/H4tholdir/archibaldblackant/actions"
echo ""

# Funzione per verificare commit VPS
check_vps_commit() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
        "cd /home/deploy/archibald-app && git log -1 --oneline" 2>/dev/null | awk '{print $1}'
}

# Funzione per verificare container status
check_containers() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
        "cd /home/deploy/archibald-app && docker compose ps --format '{{.Name}}\t{{.Status}}' 2>/dev/null | grep -E 'backend|frontend'"
}

# Funzione per verificare log WebSocket
check_websocket_logs() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_HOST" \
        "cd /home/deploy/archibald-app && docker compose logs backend --tail=20 --since=2m 2>/dev/null | grep -iE 'websocket.*initialized|🔌'"
}

echo "⏳ Attendo che GitHub Actions completi il build (stimato: 2-5 minuti)..."
echo ""

COUNTER=0
MAX_WAIT=600  # 10 minuti max

while [ $COUNTER -lt $MAX_WAIT ]; do
    CURRENT_COMMIT=$(check_vps_commit)

    echo "[$COUNTER s] VPS commit: $CURRENT_COMMIT"

    if [ "$CURRENT_COMMIT" = "$TARGET_COMMIT" ]; then
        echo ""
        echo "✅ DEPLOYMENT COMPLETATO!"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "📊 Status Container:"
        check_containers
        echo ""
        echo "🔌 Log WebSocket:"
        check_websocket_logs | head -5
        echo ""
        echo "🎯 PROSSIMI PASSI:"
        echo "1. Verifica admin panel: https://formicanera.com/admin"
        echo "2. WebSocket status dovrebbe essere 🟢 HEALTHY"
        echo "3. Effettua login e controlla connessione"
        echo ""
        exit 0
    fi

    sleep 10
    COUNTER=$((COUNTER + 10))
done

echo ""
echo "⚠️  TIMEOUT: Deployment non completato in 10 minuti"
echo "Verifica manualmente: https://github.com/H4tholdir/archibaldblackant/actions"
