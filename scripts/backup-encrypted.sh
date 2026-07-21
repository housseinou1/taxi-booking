#!/bin/bash
# Yala production backup: PostgreSQL, Redis, Media, Config — encrypted, tiered retention, offsite.
#
# Required: BACKUP_ENCRYPTION_KEY in env or /home/yala/.backup.key (mode 600)
# Optional offsite (rclone): BACKUP_OFFSITE_REMOTE=e.g. do-spaces:yala-backups-prod
#
# Retention (defaults match launch certification):
#   Daily:   14 days  -> $BACKUP_DIR/daily/
#   Weekly:  8 weeks  -> $BACKUP_DIR/weekly/  (Sunday)
#   Monthly: 12 months -> $BACKUP_DIR/monthly/ (1st of month)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yala}"
BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
MEDIA_DIR="${MEDIA_DIR:-$APP_DIR/backend/taxi/media}"
DB_CONTAINER="${DB_CONTAINER:-yala-postgres-1}"
REDIS_CONTAINER="${REDIS_CONTAINER:-yala-redis-1}"
DB_NAME="${DB_NAME:-yala_db}"
DB_USER="${DB_USER:-yala_user}"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"
STATUS_FILE="${BACKUP_STATUS_FILE:-$BACKUP_DIR/backup-status.json}"
LOG_FILE="$BACKUP_DIR/backup-encrypted.log"

DAILY_RETENTION_DAYS="${DAILY_RETENTION_DAYS:-14}"
WEEKLY_RETENTION_WEEKS="${WEEKLY_RETENTION_WEEKS:-8}"
MONTHLY_RETENTION_MONTHS="${MONTHLY_RETENTION_MONTHS:-12}"

DATE=$(date +%Y-%m-%d_%H-%M-%S)
DAY_OF_WEEK=$(date +%u)   # 7 = Sunday
DAY_OF_MONTH=$(date +%d)

mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly,staging}

write_status() {
  local status="$1"
  local message="$2"
  local offsite="${3:-unknown}"
  cat > "$STATUS_FILE" <<EOF
{"status":"$status","message":"$message","timestamp":"$(date -Iseconds)","last_success":"${LAST_SUCCESS:-}","host":"$(hostname)","offsite":"$offsite","retention":{"daily":$DAILY_RETENTION_DAYS,"weekly":$WEEKLY_RETENTION_WEEKS,"monthly":$MONTHLY_RETENTION_MONTHS}}
EOF
}

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY="$(tr -d '\r\n' < "$KEY_FILE")"
fi

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  BACKUP_ENCRYPTION_KEY="$(printf '%s' "$BACKUP_ENCRYPTION_KEY" | tr -d '\r\n')"
fi

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  write_status "failed" "BACKUP_ENCRYPTION_KEY not set" "n/a"
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

write_manifest() {
  local dir="$1"
  local manifest="$dir/manifest_${DATE}.sha256"
  (
    cd "$dir"
    shopt -s nullglob
    for f in yala_*_${DATE}.*; do
      sha256sum "$f"
    done
  ) > "$manifest"
  echo "$manifest"
}

echo "[$DATE] ── Encrypted backup started ──" | tee -a "$LOG_FILE"
write_status "running" "Backup in progress" "${BACKUP_OFFSITE_REMOTE:-none}"

STAGING="$BACKUP_DIR/staging/$DATE"
mkdir -p "$STAGING"
OFFSITE_OK=true
OFFSITE_STATE="not_configured"
[ -n "${BACKUP_OFFSITE_REMOTE:-}" ] && OFFSITE_STATE="pending"

# ── PostgreSQL ────────────────────────────────────────────────────────────────
RAW_DB="$STAGING/yala_db.sql.gz"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$RAW_DB"
ENC_DB="$STAGING/yala_db.sql.gz.gpg"
encrypt_file "$RAW_DB" "$ENC_DB"
echo "[$DATE] DB backup: $ENC_DB ($(du -h "$ENC_DB" | awk '{print $1}'))" | tee -a "$LOG_FILE"

# ── Redis (RDB snapshot) ───────────────────────────────────────────────────────
ENC_REDIS=""
RAW_REDIS="$STAGING/yala_redis.rdb"
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE >/dev/null || true
sleep 2
if docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$RAW_REDIS" 2>/dev/null; then
  ENC_REDIS="$STAGING/yala_redis.rdb.gpg"
  encrypt_file "$RAW_REDIS" "$ENC_REDIS"
  echo "[$DATE] Redis backup: $ENC_REDIS" | tee -a "$LOG_FILE"
else
  echo "[$DATE] WARN: Redis RDB copy failed (non-fatal)" | tee -a "$LOG_FILE"
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

# ── Config bundle: env, docker-compose, nginx ────────────────────────────────
ENC_CONFIG=""
RAW_CONFIG="$STAGING/yala_config.tar.gz"
CONFIG_LIST=()
[ -f "$APP_DIR/docker-compose.yml" ] && CONFIG_LIST+=("docker-compose.yml")
[ -f "$APP_DIR/.env" ] && CONFIG_LIST+=(".env")
[ -f "$APP_DIR/backend/taxi/.env.production" ] && CONFIG_LIST+=("backend/taxi/.env.production")
[ -d "$APP_DIR/nginx" ] && CONFIG_LIST+=("nginx")

if [ "${#CONFIG_LIST[@]}" -gt 0 ]; then
  tar -czf "$RAW_CONFIG" -C "$APP_DIR" "${CONFIG_LIST[@]}"
  ENC_CONFIG="$STAGING/yala_config.tar.gz.gpg"
  encrypt_file "$RAW_CONFIG" "$ENC_CONFIG"
  echo "[$DATE] Config backup: $ENC_CONFIG ($(du -h "$ENC_CONFIG" | awk '{print $1}'))" | tee -a "$LOG_FILE"
else
  echo "[$DATE] WARN: No config files found under $APP_DIR" | tee -a "$LOG_FILE"
fi

# ── Restore drill (decrypt + validate DB archive only) ─────────────────────────
RESTORE_TMP="$STAGING/.restore_test.sql.gz"
gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" -o "$RESTORE_TMP" "$ENC_DB"
if gunzip -t "$RESTORE_TMP"; then
  echo "[$DATE] Restore decrypt test PASSED" | tee -a "$LOG_FILE"
else
  write_status "failed" "Restore decrypt test failed" "$OFFSITE_STATE"
  echo "[$DATE] ERROR: Restore decrypt test FAILED" | tee -a "$LOG_FILE"
  rm -rf "$STAGING"
  exit 1
fi
rm -f "$RESTORE_TMP"

# ── Publish to retention tiers ─────────────────────────────────────────────────
publish() {
  local tier_dir="$1"
  cp "$ENC_DB" "$tier_dir/yala_db_${DATE}.sql.gz.gpg"
  [ -n "$ENC_REDIS" ] && [ -f "$ENC_REDIS" ] && cp "$ENC_REDIS" "$tier_dir/yala_redis_${DATE}.rdb.gpg"
  [ -n "$ENC_MEDIA" ] && [ -f "$ENC_MEDIA" ] && cp "$ENC_MEDIA" "$tier_dir/yala_media_${DATE}.tar.gz.gpg"
  [ -n "$ENC_CONFIG" ] && [ -f "$ENC_CONFIG" ] && cp "$ENC_CONFIG" "$tier_dir/yala_config_${DATE}.tar.gz.gpg"
  write_manifest "$tier_dir"
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

# ── Off-server upload (rclone) ────────────────────────────────────────────────
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  OFFSITE_STATE="uploading"
  for tier in daily weekly monthly; do
    if [ -d "$BACKUP_DIR/$tier" ] && [ -n "$(ls -A "$BACKUP_DIR/$tier" 2>/dev/null || true)" ]; then
      rclone copy "$BACKUP_DIR/$tier/" "${BACKUP_OFFSITE_REMOTE}/${tier}/" \
        --include "yala_*_${DATE}.*" \
        --include "manifest_${DATE}.sha256" \
        --retries 3 >> "$LOG_FILE" 2>&1 || OFFSITE_OK=false
    fi
  done
  if [ "$OFFSITE_OK" = true ]; then
    OFFSITE_STATE="ok"
    echo "[$DATE] Offsite upload complete -> $BACKUP_OFFSITE_REMOTE" | tee -a "$LOG_FILE"
  else
    OFFSITE_STATE="failed"
    write_status "warning" "Backup OK but offsite upload failed" "$OFFSITE_STATE"
  fi
elif [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  OFFSITE_STATE="rclone_missing"
  echo "[$DATE] WARN: rclone not installed; skipping offsite upload" | tee -a "$LOG_FILE"
fi

rm -rf "$STAGING"
LAST_SUCCESS="$(date -Iseconds)"
write_status "ok" "Backup completed successfully" "$OFFSITE_STATE"
echo "[$DATE] ── Encrypted backup completed ──" | tee -a "$LOG_FILE"
