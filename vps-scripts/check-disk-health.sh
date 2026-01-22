#!/bin/bash
# Disk Health Monitoring Script
# Checks disk usage and sends alerts if threshold is exceeded
# Can be run via cron more frequently (e.g., every hour)

set -e

ALERT_THRESHOLD=85  # Send alert if disk usage exceeds 85%
LOG_FILE="/home/deploy/archibald-app/logs/disk-health.log"

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check disk usage
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_AVAIL=$(df -h / | tail -1 | awk '{print $4}')

log "Disk usage: ${DISK_USAGE}% (${DISK_AVAIL} available)"

if [ "$DISK_USAGE" -ge "$ALERT_THRESHOLD" ]; then
    log "⚠️ WARNING: Disk usage (${DISK_USAGE}%) exceeds alert threshold (${ALERT_THRESHOLD}%)"

    # Get Docker disk usage
    DOCKER_USAGE=$(docker system df --format "{{.Type}}: {{.Size}}" | tee -a "$LOG_FILE")

    # Send notification (if webhook is configured)
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        MESSAGE=$(cat <<EOF
⚠️ **Archibald VPS Disk Alert**

**Disk Usage:** ${DISK_USAGE}%
**Available:** ${DISK_AVAIL}
**Threshold:** ${ALERT_THRESHOLD}%

**Action Required:** Consider running manual cleanup or checking for large files.

Run: \`bash /home/deploy/archibald-app/vps-scripts/docker-cleanup.sh\`
EOF
)
        curl -H "Content-Type: application/json" \
             -X POST \
             -d "{\"content\": \"$MESSAGE\"}" \
             "$DISCORD_WEBHOOK_URL" 2>&1 | tee -a "$LOG_FILE"
    else
        log "No DISCORD_WEBHOOK_URL configured, skipping notification"
    fi

    # Show top disk usage directories
    log "Top 10 disk usage directories:"
    du -h --max-depth=2 /home/deploy 2>/dev/null | sort -hr | head -10 | tee -a "$LOG_FILE"
else
    log "✓ Disk usage healthy (below ${ALERT_THRESHOLD}% threshold)"
fi

exit 0
