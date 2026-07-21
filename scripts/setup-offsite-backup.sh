#!/bin/bash
# Configure offsite encrypted backup upload (DigitalOcean Spaces / S3-compatible via rclone).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yala}"
ENV_FILE="${BACKUP_OFFSITE_ENV:-/home/yala/.backup-offsite.env}"
RCLONE_REMOTE="${RCLONE_REMOTE:-do-spaces}"

echo "── Yala offsite backup setup ──"

if ! command -v rclone >/dev/null 2>&1; then
  echo "Installing rclone..."
  apt-get update -qq && apt-get install -y -qq rclone
fi

mkdir -p /home/yala/backups
chmod 700 /home/yala/backups

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# Offsite backup configuration (source before backup cron runs)
# Example DigitalOcean Spaces:
#   RCLONE_CONFIG_DO_SPACES_TYPE=s3
#   RCLONE_CONFIG_DO_SPACES_PROVIDER=DigitalOcean
#   RCLONE_CONFIG_DO_SPACES_ACCESS_KEY_ID=your_key
#   RCLONE_CONFIG_DO_SPACES_SECRET_ACCESS_KEY=your_secret
#   RCLONE_CONFIG_DO_SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
#   RCLONE_CONFIG_DO_SPACES_ACL=private
BACKUP_OFFSITE_REMOTE=do-spaces:yala-backups-prod
EOF
  chmod 600 "$ENV_FILE"
  echo "Created template $ENV_FILE — add Spaces credentials before first upload."
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  echo "ERROR: BACKUP_OFFSITE_REMOTE not set in $ENV_FILE" >&2
  exit 1
fi

REMOTE_NAME="${BACKUP_OFFSITE_REMOTE%%:*}"
if ! rclone listremotes 2>/dev/null | grep -q "^${REMOTE_NAME}:$"; then
  echo "WARN: rclone remote '$REMOTE_NAME' not configured."
  echo "Run: rclone config create $REMOTE_NAME s3 provider=DigitalOcean env_auth=false \\"
  echo "  access_key_id=KEY secret_access_key=SECRET endpoint=nyc3.digitaloceanspaces.com acl=private"
  exit 2
fi

# Test upload path
TEST_FILE="/home/yala/backups/.offsite-test-$(date +%s)"
echo "offsite-test" > "$TEST_FILE"
rclone copyto "$TEST_FILE" "${BACKUP_OFFSITE_REMOTE}/.connectivity-test" --retries 3
rclone delete "${BACKUP_OFFSITE_REMOTE}/.connectivity-test" 2>/dev/null || true
rm -f "$TEST_FILE"

echo "Offsite remote OK: $BACKUP_OFFSITE_REMOTE"

# Patch cron to source offsite env
BACKUP_SCRIPT="$APP_DIR/scripts/backup-encrypted.sh"
MONITOR_SCRIPT="$APP_DIR/scripts/backup-monitor.sh"
BACKUP_KEY_FILE="/home/yala/.backup.key"
CRON_USER="${CRON_USER:-root}"

ENV_VARS="set -a; . $ENV_FILE; set +a; BACKUP_ENCRYPTION_KEY=\$(cat $BACKUP_KEY_FILE)"
BACKUP_LINE="0 2 * * * $ENV_VARS DB_CONTAINER=yala-postgres-1 REDIS_CONTAINER=yala-redis-1 MEDIA_DIR=$APP_DIR/backend/taxi/media BACKUP_DIR=/home/yala/backups $BACKUP_SCRIPT >> /home/yala/backups/cron.log 2>&1"
MONITOR_LINE="0 8 * * * set -a; . $ENV_FILE; set +a; $MONITOR_SCRIPT >> /home/yala/backups/monitor.log 2>&1"

(crontab -u "$CRON_USER" -l 2>/dev/null || true) | grep -v "backup-encrypted.sh" | grep -v "backup-monitor.sh" | { cat; echo "$BACKUP_LINE"; echo "$MONITOR_LINE"; } | crontab -u "$CRON_USER" -

echo "Cron updated with offsite env sourcing."
crontab -u "$CRON_USER" -l | grep -E "backup-encrypted|backup-monitor"
