#!/usr/bin/env bash
set -euo pipefail

# VPS Deployment Script for Unified Operation Queue
# Usage: ./scripts/deploy-vps.sh [step]
# Steps: setup | migrate-schema | copy-data | migrate-data | verify | deploy | all

VPS_HOST="${VPS_HOST:-deploy@91.98.136.198}"
SSH_KEY="${SSH_KEY:-/tmp/archibald_vps}"
REMOTE_APP_DIR="/home/deploy/archibald-app"
LOCAL_TMP="/tmp/archibald-migration"

step="${1:-all}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

case "$step" in
  setup|all)
    log "Step 1: Setting up PostgreSQL and Redis on VPS..."
    log "  Copying docker-compose.yml to VPS..."
    scp -i "$SSH_KEY" archibald-web-app/docker-compose.yml "$VPS_HOST:$REMOTE_APP_DIR/"
    scp -i "$SSH_KEY" archibald-web-app/.env.production "$VPS_HOST:$REMOTE_APP_DIR/.env.production"

    log "  Starting PostgreSQL and Redis containers..."
    ssh -i "$SSH_KEY" "$VPS_HOST" "cd $REMOTE_APP_DIR && docker compose up -d postgres redis"
    ssh -i "$SSH_KEY" "$VPS_HOST" "cd $REMOTE_APP_DIR && docker compose exec postgres pg_isready -U archibald"
    log "  PostgreSQL and Redis are running."
    ;;&

  migrate-schema|all)
    log "Step 2: Running PostgreSQL schema migrations..."
    ssh -i "$SSH_KEY" "$VPS_HOST" "cd $REMOTE_APP_DIR && npx tsx src/db/migrate.ts"
    log "  Schema migrations complete."
    ;;&

  copy-data|all)
    log "Step 3: Copying SQLite databases from VPS..."
    mkdir -p "$LOCAL_TMP"
    for db in orders-new customers users products prices; do
      log "  Copying $db.db..."
      scp -i "$SSH_KEY" "$VPS_HOST:$REMOTE_APP_DIR/data/$db.db" "$LOCAL_TMP/$db.db"
    done
    log "  All databases copied to $LOCAL_TMP/"
    ;;&

  migrate-data|all)
    log "Step 4: Running SQLite-to-PostgreSQL data migration..."
    log "  IMPORTANT: Ensure DATA_DIR points to $LOCAL_TMP in the migration script"
    npx tsx archibald-web-app/backend/src/scripts/archive/migrate-sqlite-to-pg.ts
    log "  Data migration complete."
    ;;&

  verify|all)
    log "Step 5: Verifying data integrity..."
    ssh -i "$SSH_KEY" "$VPS_HOST" "cd $REMOTE_APP_DIR && docker compose exec postgres psql -U archibald -d archibald -c \"
      SELECT 'agents.users' AS tbl, COUNT(*) FROM agents.users
      UNION ALL SELECT 'agents.customers', COUNT(*) FROM agents.customers
      UNION ALL SELECT 'agents.order_records', COUNT(*) FROM agents.order_records
      UNION ALL SELECT 'shared.products', COUNT(*) FROM shared.products
      UNION ALL SELECT 'shared.prices', COUNT(*) FROM shared.prices
      ORDER BY tbl;
    \""
    log "  Verify counts match original SQLite databases."
    ;;&

  deploy|all)
    log "Step 6: Deploying new backend..."
    ssh -i "$SSH_KEY" "$VPS_HOST" "cd $REMOTE_APP_DIR && docker compose up -d --build backend"
    log "  Waiting for backend health check..."
    sleep 10
    ssh -i "$SSH_KEY" "$VPS_HOST" "curl -sf http://localhost:3000/api/health && echo ' OK' || echo ' FAILED'"
    log "  Deployment complete."
    ;;

  *)
    echo "Usage: $0 [setup|migrate-schema|copy-data|migrate-data|verify|deploy|all]"
    exit 1
    ;;
esac

log "Done!"
