#!/bin/bash
# Docker Cleanup Script for Archibald VPS
# Prevents disk space exhaustion by cleaning unused Docker resources
# Run daily via cron: 0 2 * * * /home/deploy/archibald-app/vps-scripts/docker-cleanup.sh

set -e

LOG_FILE="/home/deploy/archibald-app/logs/docker-cleanup.log"
ALERT_THRESHOLD=80  # Alert if disk usage exceeds 80%
PRUNE_THRESHOLD=70  # Run aggressive cleanup if usage exceeds 70%

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Docker Cleanup Script Started ==="

# Check disk usage before cleanup
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
log "Current disk usage: ${DISK_USAGE}%"

# Always run basic cleanup (safe for production)
log "Running basic Docker cleanup (unused containers, networks, dangling images)..."
docker system prune -f 2>&1 | tee -a "$LOG_FILE"

# If disk usage is above prune threshold, run aggressive cleanup
if [ "$DISK_USAGE" -ge "$PRUNE_THRESHOLD" ]; then
    log "Disk usage (${DISK_USAGE}%) exceeds prune threshold (${PRUNE_THRESHOLD}%). Running aggressive cleanup..."

    # Remove unused images (not just dangling)
    log "Removing unused images..."
    docker image prune -a -f 2>&1 | tee -a "$LOG_FILE"

    # Remove build cache older than 7 days
    log "Removing old build cache..."
    docker builder prune -f --filter "until=168h" 2>&1 | tee -a "$LOG_FILE"
fi

# Check disk usage after cleanup
NEW_DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
FREED=$((DISK_USAGE - NEW_DISK_USAGE))
log "Disk usage after cleanup: ${NEW_DISK_USAGE}% (freed ${FREED}%)"

# Alert if disk usage is still above threshold
if [ "$NEW_DISK_USAGE" -ge "$ALERT_THRESHOLD" ]; then
    log "WARNING: Disk usage (${NEW_DISK_USAGE}%) still above alert threshold (${ALERT_THRESHOLD}%)"

    # Send notification (if webhook is configured)
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        curl -H "Content-Type: application/json" \
             -X POST \
             -d "{\"content\": \"⚠️ **Archibald VPS Disk Alert**\nDisk usage: ${NEW_DISK_USAGE}%\nThreshold: ${ALERT_THRESHOLD}%\nAutomatic cleanup completed but disk is still high.\"}" \
             "$DISCORD_WEBHOOK_URL" 2>&1 | tee -a "$LOG_FILE"
    fi
fi

# Log Docker system disk usage
log "Docker disk usage breakdown:"
docker system df 2>&1 | tee -a "$LOG_FILE"

log "=== Docker Cleanup Script Completed ==="
echo "" >> "$LOG_FILE"

exit 0
