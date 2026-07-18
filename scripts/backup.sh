#!/usr/bin/env bash
# Nightly Postgres backup to S3-compatible storage (Cloudflare R2 / Backblaze B2).
# Costs pennies per month; a lounge's entire business record lives in this DB.
#
# Setup on the VPS:
#   1. apt-get install -y awscli   (or use rclone)
#   2. Set the env vars below in /etc/easyserve-backup.env (chmod 600)
#   3. Cron:  0 6 * * *  . /etc/easyserve-backup.env && /path/to/scripts/backup.sh
#      (06:00 UTC = after closing time in WAT)
#
# Required env:
#   BACKUP_S3_ENDPOINT   e.g. https://<account>.r2.cloudflarestorage.com
#   BACKUP_S3_BUCKET     e.g. easyserve-backups
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
#   POSTGRES_CONTAINER   default: easyserve-db-1
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-easyserve-db-1}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="/tmp/easyserve-${STAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

echo "Dumping database…"
docker exec "$CONTAINER" pg_dump -U easyserve easyserve | gzip > "$FILE"

echo "Uploading $(du -h "$FILE" | cut -f1) to ${BACKUP_S3_BUCKET}…"
aws s3 cp "$FILE" "s3://${BACKUP_S3_BUCKET}/db/easyserve-${STAMP}.sql.gz" \
  --endpoint-url "$BACKUP_S3_ENDPOINT"

# Also back up uploaded menu images (volume mounted at backend/static)
if docker volume inspect easyserve_uploads >/dev/null 2>&1; then
  UPLOADS_FILE="/tmp/easyserve-uploads-${STAMP}.tar.gz"
  docker run --rm -v easyserve_uploads:/data alpine tar czf - -C /data . > "$UPLOADS_FILE"
  aws s3 cp "$UPLOADS_FILE" "s3://${BACKUP_S3_BUCKET}/uploads/easyserve-uploads-${STAMP}.tar.gz" \
    --endpoint-url "$BACKUP_S3_ENDPOINT"
  rm -f "$UPLOADS_FILE"
fi

# Prune local temp + old remote backups
rm -f "$FILE"
CUTOFF="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)"
aws s3 ls "s3://${BACKUP_S3_BUCKET}/db/" --endpoint-url "$BACKUP_S3_ENDPOINT" \
  | awk '{print $4}' \
  | while read -r key; do
      day="$(echo "$key" | sed -E 's/easyserve-([0-9]{8}).*/\1/')"
      if [[ -n "$day" && "$day" < "$CUTOFF" ]]; then
        aws s3 rm "s3://${BACKUP_S3_BUCKET}/db/${key}" --endpoint-url "$BACKUP_S3_ENDPOINT"
      fi
    done

echo "Backup complete: easyserve-${STAMP}.sql.gz"
