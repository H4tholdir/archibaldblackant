# VPS Disk Cleanup Automation

This directory contains scripts to prevent disk space exhaustion on the Archibald VPS (the issue that has occurred 3 times).

## Problem

Docker images and build cache accumulate over time, filling the 75GB disk. When disk reaches 100%, SQLite fails with `SQLITE_IOERR_SHMSIZE` errors and the backend crashes.

## Solution

Automated daily cleanup of unused Docker resources with monitoring and alerts.

## Scripts

### 1. `docker-cleanup.sh`

Main cleanup script that runs daily at 2 AM.

**What it does:**
- Basic cleanup: Removes stopped containers, unused networks, dangling images
- Aggressive cleanup (if disk > 70%): Removes unused images and old build cache
- Logs all operations to `/home/deploy/archibald-app/logs/docker-cleanup.log`
- Sends alerts if disk usage remains above 80% after cleanup

**Manual run:**
```bash
bash /home/deploy/archibald-app/vps-scripts/docker-cleanup.sh
```

### 2. `check-disk-health.sh`

Monitoring script that checks disk usage and sends alerts.

**What it does:**
- Checks current disk usage
- Alerts if usage exceeds 85%
- Logs to `/home/deploy/archibald-app/logs/disk-health.log`
- Shows top disk-consuming directories

**Manual run:**
```bash
bash /home/deploy/archibald-app/vps-scripts/check-disk-health.sh
```

**Recommended:** Add to cron to run hourly:
```bash
0 * * * * /home/deploy/archibald-app/vps-scripts/check-disk-health.sh >> /home/deploy/archibald-app/logs/disk-health-cron.log 2>&1
```

### 3. `setup-cleanup-cron.sh`

One-time setup script to install the automation.

**What it does:**
- Makes scripts executable
- Creates log directories
- Installs daily cron job (2 AM)
- Configures Docker daemon with log rotation
- Runs initial cleanup

## Installation on VPS

1. SSH into VPS:
```bash
ssh -i ~/.ssh/vps_archibald_ed25519 deploy@91.98.136.198
```

2. Navigate to app directory:
```bash
cd /home/deploy/archibald-app
```

3. Pull latest code:
```bash
git pull origin master
```

4. Run setup script:
```bash
bash vps-scripts/setup-cleanup-cron.sh
```

5. (Optional) Add hourly health checks:
```bash
(crontab -l 2>/dev/null; echo "0 * * * * /home/deploy/archibald-app/vps-scripts/check-disk-health.sh >> /home/deploy/archibald-app/logs/disk-health-cron.log 2>&1") | crontab -
```

## Configuration

### Discord Webhook Alerts (Optional)

To receive Discord notifications when disk usage is high:

1. Create a Discord webhook in your server
2. Add to environment:
```bash
echo 'export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN"' >> ~/.bashrc
source ~/.bashrc
```

### Thresholds

Edit scripts to adjust thresholds:
- `docker-cleanup.sh`: `PRUNE_THRESHOLD=70` (when to run aggressive cleanup)
- `docker-cleanup.sh`: `ALERT_THRESHOLD=80` (when to send alerts)
- `check-disk-health.sh`: `ALERT_THRESHOLD=85` (monitoring threshold)

## Monitoring

### View cleanup logs:
```bash
tail -f /home/deploy/archibald-app/logs/docker-cleanup.log
```

### View health check logs:
```bash
tail -f /home/deploy/archibald-app/logs/disk-health.log
```

### Check disk usage:
```bash
df -h /
```

### Check Docker disk usage:
```bash
docker system df
```

### View cron jobs:
```bash
crontab -l
```

## Manual Cleanup (Emergency)

If disk is critically full (>95%):

```bash
# Stop non-critical containers
docker compose stop frontend

# Aggressive cleanup
docker system prune -a -f --volumes

# Remove old images
docker image prune -a -f

# Clear build cache
docker builder prune -a -f

# Restart containers
docker compose up -d
```

## Prevention Best Practices

1. **Daily cleanup runs automatically at 2 AM**
2. **Hourly health checks** (if configured)
3. **Docker log rotation** (max 10MB per file, 3 files)
4. **CI/CD optimization**: Consider cleaning old images in GitHub Actions
5. **Monitor logs regularly** for unusual disk usage patterns

## Troubleshooting

### Cron job not running?

Check cron service:
```bash
sudo systemctl status cron
```

Check cron logs:
```bash
grep CRON /var/log/syslog
```

### Scripts not executable?

```bash
chmod +x /home/deploy/archibald-app/vps-scripts/*.sh
```

### Docker daemon config issues?

```bash
sudo systemctl restart docker
docker info
```

## History

- **2026-01-22**: Disk full issue occurred for 3rd time, automated cleanup implemented
- **Previous occurrences**: Manual cleanup required twice before

This automation should prevent future disk exhaustion issues.
