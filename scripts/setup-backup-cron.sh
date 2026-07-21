#!/bin/bash
# Install Yala nightly encrypted backup + morning backup monitor cron.
set -euo pipefail

BACKUP_SCRIPT="/opt/yala/scripts/backup-encrypted.sh"
MONITOR_SCRIPT="/opt/yala/scripts/backup-monitor.sh"
BACKUP_KEY_FILE="/home/yala/.backup.key"
CRON_USER="${CRON_USER:-root}"
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"
MONITOR_SCHEDULE="${MONITOR_SCHEDULE:-0 8 * * *}"

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "ERROR: $BACKUP_SCRIPT not found" >&2
  exit 1
fi
chmod +x "$BACKUP_SCRIPT" "$MONITOR_SCRIPT" 2>/dev/null || true

if [ ! -f "$BACKUP_KEY_FILE" ]; then
  echo "Generating backup encryption key at $BACKUP_KEY_FILE"
  openssl rand -base64 32 > "$BACKUP_KEY_FILE"
  chmod 600 "$BACKUP_KEY_FILE"
  chown yala:yala "$BACKUP_KEY_FILE" 2>/dev/null || true
fi

mkdir -p /home/yala/backups/{daily,weekly,monthly,staging}
chown -R yala:yala /home/yala/backups 2>/dev/null || true

ENV_VARS="BACKUP_ENCRYPTION_KEY=\$(cat $BACKUP_KEY_FILE) DB_CONTAINER=yala-postgres-1 REDIS_CONTAINER=yala-redis-1 MEDIA_DIR=/opt/yala/backend/taxi/media BACKUP_DIR=/home/yala/backups"
BACKUP_LINE="$BACKUP_SCHEDULE $ENV_VARS $BACKUP_SCRIPT >> /home/yala/backups/cron.log 2>&1"
MONITOR_LINE="$MONITOR_SCHEDULE $MONITOR_SCRIPT >> /home/yala/backups/monitor.log 2>&1"

(crontab -u "$CRON_USER" -l 2>/dev/null || true) | grep -v "$BACKUP_SCRIPT" | grep -v "$MONITOR_SCRIPT" | { cat; echo "$BACKUP_LINE"; echo "$MONITOR_LINE"; } | crontab -u "$CRON_USER" -

echo "Installed backup cron for $CRON_USER:"
crontab -u "$CRON_USER" -l | grep -E "backup-encrypted|backup-monitor"
