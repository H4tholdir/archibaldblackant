#!/bin/bash
# Setup script to install disk cleanup automation on VPS
# Run this once: bash vps-scripts/setup-cleanup-cron.sh

set -e

SCRIPT_DIR="/home/deploy/archibald-app/vps-scripts"
CLEANUP_SCRIPT="$SCRIPT_DIR/docker-cleanup.sh"
CRON_JOB="0 2 * * * $CLEANUP_SCRIPT >> /home/deploy/archibald-app/logs/docker-cleanup-cron.log 2>&1"

echo "=== Setting up Docker cleanup automation ==="

# Make cleanup script executable
chmod +x "$CLEANUP_SCRIPT"
echo "✓ Made cleanup script executable"

# Create logs directory
mkdir -p /home/deploy/archibald-app/logs
echo "✓ Created logs directory"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$CLEANUP_SCRIPT"; then
    echo "⚠ Cron job already exists, skipping..."
else
    # Add cron job (run daily at 2 AM)
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✓ Added daily cron job (runs at 2 AM)"
fi

# Configure Docker daemon for automatic cleanup
DOCKER_DAEMON_CONFIG="/etc/docker/daemon.json"
if [ -f "$DOCKER_DAEMON_CONFIG" ]; then
    echo "⚠ Docker daemon config exists, please manually add log rotation and storage settings"
    echo "Recommended settings:"
    cat <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-opts": [
    "dm.basesize=10G"
  ]
}
EOF
else
    echo "✓ Creating Docker daemon config with log rotation..."
    sudo bash -c 'cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF'
    sudo systemctl restart docker
    echo "✓ Docker daemon configured and restarted"
fi

# Run initial cleanup
echo ""
echo "Running initial cleanup..."
"$CLEANUP_SCRIPT"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Disk cleanup automation is now configured:"
echo "  - Daily cleanup runs at 2:00 AM"
echo "  - Logs: /home/deploy/archibald-app/logs/docker-cleanup.log"
echo "  - Manual run: $CLEANUP_SCRIPT"
echo ""
echo "To view cron jobs: crontab -l"
echo "To view cleanup logs: tail -f /home/deploy/archibald-app/logs/docker-cleanup.log"
