#!/bin/bash
# Monitor deploy progress - controlla quando il nuovo deploy è completato

echo "🔍 MONITORAGGIO DEPLOY - Commit de071b4"
echo "========================================"
echo ""
echo "Controllo ogni 30s fino a quando VPS ha commit de071b4..."
echo "Premi Ctrl+C per interrompere"
echo ""

TARGET_COMMIT="de071b4"
CHECK_INTERVAL=30

while true; do
  TIMESTAMP=$(date '+%H:%M:%S')

  # Controlla commit su VPS
  CURRENT_COMMIT=$(ssh -i ~/archibald_vps deploy@91.98.136.198 \
    'cd /home/deploy/archibald-app && git log -1 --format="%h"' 2>/dev/null)

  if [ "$CURRENT_COMMIT" = "$TARGET_COMMIT" ]; then
    echo ""
    echo "✅ [$TIMESTAMP] DEPLOY COMPLETATO!"
    echo "✅ VPS ha commit: $CURRENT_COMMIT"
    echo ""
    echo "📊 Verifica finale..."

    ssh -i ~/archibald_vps deploy@91.98.136.198 << 'ENDSSH'
      cd /home/deploy/archibald-app
      echo "📅 Container frontend creato:"
      docker inspect archibald-frontend --format '{{.Created}}' | cut -d'T' -f1-2

      echo ""
      echo "🏷️ Image revision label:"
      docker inspect ghcr.io/h4tholdir/archibald-frontend:latest \
        --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' || echo "No label"

      echo ""
      echo "✅ Ora puoi:"
      echo "1. Hard refresh browser (Cmd+Shift+R)"
      echo "2. DevTools → Application → Clear site data"
      echo "3. Verificare modifiche widget visibili"
ENDSSH

    break
  else
    echo "⏳ [$TIMESTAMP] In attesa... VPS commit: $CURRENT_COMMIT (target: $TARGET_COMMIT)"
    echo "   Workflow CD in esecuzione (8-10 min totali)..."
    sleep $CHECK_INTERVAL
  fi
done

echo ""
echo "🎉 Monitoraggio completato!"
