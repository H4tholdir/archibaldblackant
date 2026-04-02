#!/bin/sh
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="archibald_backup_${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "[$(date)] Starting PostgreSQL backup..."

# Dump + compress
PGPASSWORD="${PG_PASSWORD}" pg_dump \
  -h "${PG_HOST:-postgres}" \
  -U "${PG_USER:-archibald}" \
  -d "${PG_DATABASE:-archibald}" \
  --no-password \
  | gzip > "${TMPFILE}"

echo "[$(date)] Dump created: ${TMPFILE} ($(du -sh ${TMPFILE} | cut -f1))"

# Upload to Hetzner Object Storage (S3-compatible)
rclone copy "${TMPFILE}" "hetzner:${HETZNER_BUCKET}/backups/" \
  --s3-endpoint="${HETZNER_S3_ENDPOINT}" \
  --s3-access-key-id="${HETZNER_ACCESS_KEY}" \
  --s3-secret-access-key="${HETZNER_SECRET_KEY}" \
  --s3-provider=Other

echo "[$(date)] Upload completed to hetzner:${HETZNER_BUCKET}/backups/${FILENAME}"

# Cleanup local tmp
rm "${TMPFILE}"

# Rotate: keep only last 30 backups
echo "[$(date)] Rotating old backups (keep last 30)..."
rclone ls "hetzner:${HETZNER_BUCKET}/backups/" \
  --s3-endpoint="${HETZNER_S3_ENDPOINT}" \
  --s3-access-key-id="${HETZNER_ACCESS_KEY}" \
  --s3-secret-access-key="${HETZNER_SECRET_KEY}" \
  --s3-provider=Other \
  | sort | head -n -30 | awk '{print $2}' | while read f; do
    rclone delete "hetzner:${HETZNER_BUCKET}/backups/${f}" \
      --s3-endpoint="${HETZNER_S3_ENDPOINT}" \
      --s3-access-key-id="${HETZNER_ACCESS_KEY}" \
      --s3-secret-access-key="${HETZNER_SECRET_KEY}" \
      --s3-provider=Other
    echo "[$(date)] Deleted old backup: ${f}"
  done

echo "[$(date)] Backup job completed successfully."
