#!/bin/bash
# Configure offsite encrypted backup upload (DigitalOcean Spaces / S3-compatible via rclone).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yala}"
ENV_FILE="${BACKUP_OFFSITE_ENV:-/home/yala/.backup-offsite.env}"
RCLONE_REMOTE="${RCLONE_REMOTE:-do-spaces}"
SPACES_ENDPOINT="${SPACES_ENDPOINT:-fra1.digitaloceanspaces.com}"
SPACES_BUCKET="${SPACES_BUCKET:-yala-backups-prod}"
SPACES_REGION="${SPACES_REGION:-fra1}"

echo "── Yala offsite backup setup ──"

if ! command -v rclone >/dev/null 2>&1; then
  echo "Installing rclone..."
  apt-get update -qq && apt-get install -y -qq rclone
fi

mkdir -p /home/yala/backups/{daily,weekly,monthly,staging}
chmod 700 /home/yala/backups

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# Offsite backup — DigitalOcean Spaces (S3-compatible)
# Set SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY before running setup.
SPACES_ENDPOINT=${SPACES_ENDPOINT}
SPACES_BUCKET=${SPACES_BUCKET}
SPACES_REGION=${SPACES_REGION}
BACKUP_OFFSITE_REMOTE=${RCLONE_REMOTE}:${SPACES_BUCKET}
DAILY_RETENTION_DAYS=14
WEEKLY_RETENTION_WEEKS=8
MONTHLY_RETENTION_MONTHS=12
APP_DIR=${APP_DIR}
EOF
  chmod 600 "$ENV_FILE"
  echo "Created template $ENV_FILE"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  BACKUP_OFFSITE_REMOTE="${RCLONE_REMOTE}:${SPACES_BUCKET}"
fi

REMOTE_NAME="${BACKUP_OFFSITE_REMOTE%%:*}"

configure_rclone_remote() {
  if [ -z "${SPACES_ACCESS_KEY_ID:-}" ] || [ -z "${SPACES_SECRET_ACCESS_KEY:-}" ]; then
    echo "ERROR: SPACES_ACCESS_KEY_ID and SPACES_SECRET_ACCESS_KEY required in $ENV_FILE" >&2
    echo "Create keys: DigitalOcean Control Panel → API → Spaces access keys" >&2
    exit 2
  fi

  rclone config delete "$REMOTE_NAME" 2>/dev/null || true
  rclone config create "$REMOTE_NAME" s3 \
    provider=DigitalOcean \
    env_auth=false \
    access_key_id="$SPACES_ACCESS_KEY_ID" \
    secret_access_key="$SPACES_SECRET_ACCESS_KEY" \
    endpoint="${SPACES_ENDPOINT}" \
    acl=private \
    no_check_bucket=true
}

if ! rclone listremotes 2>/dev/null | grep -q "^${REMOTE_NAME}:$"; then
  configure_rclone_remote
fi

rclone mkdir "${BACKUP_OFFSITE_REMOTE}/daily" 2>/dev/null || true
rclone mkdir "${BACKUP_OFFSITE_REMOTE}/weekly" 2>/dev/null || true
rclone mkdir "${BACKUP_OFFSITE_REMOTE}/monthly" 2>/dev/null || true

TEST_FILE="/home/yala/backups/.offsite-test-$(date +%s)"
echo "offsite-test-$(date -Iseconds)" > "$TEST_FILE"
rclone copyto "$TEST_FILE" "${BACKUP_OFFSITE_REMOTE}/.connectivity-test" --retries 3
rclone delete "${BACKUP_OFFSITE_REMOTE}/.connectivity-test" 2>/dev/null || true
rm -f "$TEST_FILE"

echo "Offsite remote OK: $BACKUP_OFFSITE_REMOTE"

BACKUP_SCRIPT="$APP_DIR/scripts/backup-encrypted.sh"
MONITOR_SCRIPT="$APP_DIR/scripts/backup-monitor.sh"
BACKUP_KEY_FILE="/home/yala/.backup.key"
CRON_USER="${CRON_USER:-root}"

ENV_VARS="set -a; . $ENV_FILE; set +a; BACKUP_ENCRYPTION_KEY=\$(tr -d '\\r\\n' < $BACKUP_KEY_FILE)"
BACKUP_LINE="0 2 * * * $ENV_VARS DB_CONTAINER=yala-postgres-1 REDIS_CONTAINER=yala-redis-1 MEDIA_DIR=$APP_DIR/backend/taxi/media BACKUP_DIR=/home/yala/backups $BACKUP_SCRIPT >> /home/yala/backups/cron.log 2>&1"
MONITOR_LINE="0 8 * * * set -a; . $ENV_FILE; set +a; $MONITOR_SCRIPT >> /home/yala/backups/monitor.log 2>&1"

(crontab -u "$CRON_USER" -l 2>/dev/null || true) | grep -v "backup-encrypted.sh" | grep -v "backup-monitor.sh" | { cat; echo "$BACKUP_LINE"; echo "$MONITOR_LINE"; } | crontab -u "$CRON_USER" -

echo "Cron updated with offsite env sourcing."
crontab -u "$CRON_USER" -l | grep -E "backup-encrypted|backup-monitor"
