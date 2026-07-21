#!/bin/bash
# Yala production backup: PostgreSQL + Redis + Media, encrypted, tiered retention, optional offsite.
#
# Required: BACKUP_ENCRYPTION_KEY in env or /home/yala/.backup.key (mode 600)
# Optional offsite (rclone): BACKUP_OFFSITE_REMOTE=e.g. do-spaces:yala-backups
#
# Retention:
#   Daily backups:   30 days  -> $BACKUP_DIR/daily/
#   Weekly backups:  12 weeks -> $BACKUP_DIR/weekly/  (Sunday)
#   Monthly backups: 12 months -> $BACKUP_DIR/monthly/ (1st of month)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
MEDIA_DIR="${MEDIA_DIR:-/opt/yala/backend/taxi/media}"
DB_CONTAINER="${DB_CONTAINER:-yala-postgres-1}"
REDIS_CONTAINER="${REDIS_CONTAINER:-yala-redis-1}"
DB_NAME="${DB_NAME:-yala_db}"
DB_USER="${DB_USER:-yala_user}"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"
STATUS_FILE="${BACKUP_STATUS_FILE:-$BACKUP_DIR/backup-status.json}"
LOG_FILE="$BACKUP_DIR/backup-encrypted.log"

DAILY_RETENTION_DAYS="${DAILY_RETENTION_DAYS:-30}"
WEEKLY_RETENTION_WEEKS="${WEEKLY_RETENTION_WEEKS:-12}"
MONTHLY_RETENTION_MONTHS="${MONTHLY_RETENTION_MONTHS:-12}"

DATE=$(date +%Y-%m-%d_%H-%M-%S)
DAY_OF_WEEK=$(date +%u)   # 7 = Sunday
DAY_OF_MONTH=$(date +%d)

mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly,staging}

write_status() {
  local status="$1"
  local message="$2"
  cat > "$STATUS_FILE" <<EOF
{"status":"$status","message":"$message","timestamp":"$(date -Iseconds)","last_success":"${LAST_SUCCESS:-}","host":"$(hostname)"}
EOF
}

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
fi

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  write_status "failed" "BACKUP_ENCRYPTION_KEY not set"
  echo "[$DATE] ERROR: BACKUP_ENCRYPTION_KEY not set" | tee -a "$LOG_FILE"
  exit 1
fi

encrypt_file() {
  local src="$1"
  local dest="$2"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    -o "$dest" "$src"
  rm -f "$src"
}

echo "[$DATE] ── Encrypted backup started ──" | tee -a "$LOG_FILE"
write_status "running" "Backup in progress"

STAGING="$BACKUP_DIR/staging/$DATE"
mkdir -p "$STAGING"

# ── PostgreSQL ────────────────────────────────────────────────────────────────
RAW_DB="$STAGING/yala_db.sql.gz"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$RAW_DB"
ENC_DB="$STAGING/yala_db.sql.gz.gpg"
encrypt_file "$RAW_DB" "$ENC_DB"
echo "[$DATE] DB backup: $ENC_DB ($(du -h "$ENC_DB" | awk '{print $1}'))" | tee -a "$LOG_FILE"

# ── Redis (RDB snapshot) ───────────────────────────────────────────────────────
RAW_REDIS="$STAGING/yala_redis.rdb"
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE >/dev/null || true
sleep 2
docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$RAW_REDIS" 2>/dev/null || {
  echo "[$DATE] WARN: Redis RDB copy failed (non-fatal)" | tee -a "$LOG_FILE"
  RAW_REDIS=""
}
if [ -n "$RAW_REDIS" ] && [ -f "$RAW_REDIS" ]; then
  ENC_REDIS="$STAGING/yala_redis.rdb.gpg"
  encrypt_file "$RAW_REDIS" "$ENC_REDIS"
  echo "[$DATE] Redis backup: $ENC_REDIS" | tee -a "$LOG_FILE"
fi

# ── Media ────────────────────────────────────────────────────────────────────
ENC_MEDIA=""
if [ -d "$MEDIA_DIR" ]; then
  RAW_MEDIA="$STAGING/yala_media.tar.gz"
  tar -czf "$RAW_MEDIA" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
  ENC_MEDIA="$STAGING/yala_media.tar.gz.gpg"
  encrypt_file "$RAW_MEDIA" "$ENC_MEDIA"
  echo "[$DATE] Media backup: $ENC_MEDIA ($(du -h "$ENC_MEDIA" | awk '{print $1}'))" | tee -a "$LOG_FILE"
fi

# ── Restore drill (decrypt + validate DB archive only) ─────────────────────────
RESTORE_TMP="$STAGING/.restore_test.sql.gz"
gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" -o "$RESTORE_TMP" "$ENC_DB"
if gunzip -t "$RESTORE_TMP"; then
  echo "[$DATE] Restore decrypt test PASSED" | tee -a "$LOG_FILE"
else
  write_status "failed" "Restore decrypt test failed"
  echo "[$DATE] ERROR: Restore decrypt test FAILED" | tee -a "$LOG_FILE"
  rm -rf "$STAGING"
  exit 1
fi
rm -f "$RESTORE_TMP"

# ── Publish to retention tiers ─────────────────────────────────────────────────
publish() {
  local tier_dir="$1"
  cp "$ENC_DB" "$tier_dir/yala_db_${DATE}.sql.gz.gpg"
  [ -f "$ENC_REDIS" ] && cp "$ENC_REDIS" "$tier_dir/yala_redis_${DATE}.rdb.gpg"
  [ -n "$ENC_MEDIA" ] && [ -f "$ENC_MEDIA" ] && cp "$ENC_MEDIA" "$tier_dir/yala_media_${DATE}.tar.gz.gpg"
}

publish "$BACKUP_DIR/daily"
if [ "$DAY_OF_WEEK" = "7" ]; then
  publish "$BACKUP_DIR/weekly"
fi
if [ "$DAY_OF_MONTH" = "01" ]; then
  publish "$BACKUP_DIR/monthly"
fi

# ── Retention cleanup ─────────────────────────────────────────────────────────
find "$BACKUP_DIR/daily" -type f -mtime +"$DAILY_RETENTION_DAYS" -delete
find "$BACKUP_DIR/weekly" -type f -mtime +$(( WEEKLY_RETENTION_WEEKS * 7 )) -delete
find "$BACKUP_DIR/monthly" -type f -mtime +$(( MONTHLY_RETENTION_MONTHS * 31 )) -delete
find "$BACKUP_DIR/staging" -mindepth 1 -maxdepth 1 -type d -mtime +2 -exec rm -rf {} +

# ── Off-server upload (optional rclone) ───────────────────────────────────────
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$BACKUP_DIR/daily/" "${BACKUP_OFFSITE_REMOTE}/daily/" --max-age 48h >> "$LOG_FILE" 2>&1 || {
    echo "[$DATE] WARN: Offsite upload failed" | tee -a "$LOG_FILE"
    write_status "warning" "Backup OK but offsite upload failed"
  }
  echo "[$DATE] Offsite upload complete -> $BACKUP_OFFSITE_REMOTE" | tee -a "$LOG_FILE"
elif [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  echo "[$DATE] WARN: rclone not installed; skipping offsite upload" | tee -a "$LOG_FILE"
fi

rm -rf "$STAGING"
LAST_SUCCESS="$(date -Iseconds)"
write_status "ok" "Backup completed successfully"
echo "[$DATE] ── Encrypted backup completed ──" | tee -a "$LOG_FILE"
