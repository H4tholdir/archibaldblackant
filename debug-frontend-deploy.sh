#!/bin/bash
# Script di debug per verificare stato deploy frontend su VPS

echo "🔍 Debug Frontend Deploy"
echo "======================="
echo ""

# Connetti al VPS e verifica
ssh -i ~/archibald_vps deploy@91.98.136.198 << 'ENDSSH'
  echo "📦 Verifica immagini Docker..."
  docker images | grep archibald-frontend | head -3
  echo ""

  echo "🐳 Verifica container frontend..."
  docker ps | grep frontend
  echo ""

  echo "📅 Data ultimo pull immagine frontend..."
  docker inspect ghcr.io/h4tholdir/archibald-frontend:latest | grep Created
  echo ""

  echo "📝 Log ultimi 20 righe frontend..."
  docker compose -f /home/deploy/archibald-app/docker-compose.yml logs --tail=20 frontend
  echo ""

  echo "✅ Fatto!"
ENDSSH
