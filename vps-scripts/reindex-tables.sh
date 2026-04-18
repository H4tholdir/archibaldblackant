#!/bin/bash
# Nightly PostgreSQL REINDEX for Archibald VPS
# Rebuilds B-tree indexes on high-write tables to prevent corruption
# caused by SIGKILL during index page splits.
# Scheduled at 3:30 AM UTC daily (after docker-cleanup at 2 AM).
#
# SAFE: REINDEX TABLE CONCURRENTLY does NOT lock reads or writes.

set -euo pipefail

LOG_FILE="/home/deploy/archibald-app/logs/reindex.log"
COMPOSE_FILE="/home/deploy/archibald-app/docker-compose.yml"
DB_USER="archibald"
DB_NAME="archibald"

# Tables with the highest write rate — most likely to suffer index corruption.
# Add more if new high-write tables are introduced.
TABLES=(
  "agents.order_articles"
  "agents.customers"
  "agents.order_records"
  "agents.customer_addresses"
  "agents.fresis_discounts"
)

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S UTC')] $1" | tee -a "$LOG_FILE"
}

run_psql() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$DB_USER" -d "$DB_NAME" -c "$1"
}

log "=== Nightly REINDEX Started ==="

for TABLE in "${TABLES[@]}"; do
  log "Reindexing $TABLE ..."
  START=$(date +%s)

  if run_psql "REINDEX TABLE CONCURRENTLY $TABLE;" >> "$LOG_FILE" 2>&1; then
    ELAPSED=$(( $(date +%s) - START ))
    log "  OK — ${TABLE} reindexed in ${ELAPSED}s"
  else
    log "  ERROR — REINDEX failed for ${TABLE} (see above)"
  fi
done

log "=== Nightly REINDEX Completed ==="
echo "" >> "$LOG_FILE"

exit 0
