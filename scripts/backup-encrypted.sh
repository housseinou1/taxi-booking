#!/bin/bash
# Encrypted Yala backup + restore verification.
# Requires: BACKUP_ENCRYPTION_KEY (passphrase) in the environment or /home/yala/.backup.key
# Cron example: 0 2 * * * BACKUP_ENCRYPTION_KEY=... /opt/yala/scripts/backup-encrypted.sh

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
MEDIA_DIR="${MEDIA_DIR:-/opt/yala/backend/taxi/media}"
DB_CONTAINER="${DB_CONTAINER:-yala-postgres-1}"
DB_NAME="${DB_NAME:-yala_db}"
DB_USER="${DB_USER:-yala_user}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$BACKUP_DIR/backup-encrypted.log"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"

mkdir -p "$BACKUP_DIR"

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
fi

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "[$DATE] ERROR: BACKUP_ENCRYPTION_KEY not set" | tee -a "$LOG_FILE"
  exit 1
fi

echo "[$DATE] ── Encrypted backup started ──" | tee -a "$LOG_FILE"

RAW_DB="$BACKUP_DIR/yala_db_$DATE.sql.gz"
ENC_DB="$RAW_DB.gpg"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$RAW_DB"
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase "$BACKUP_ENCRYPTION_KEY" \
  -o "$ENC_DB" "$RAW_DB"
rm -f "$RAW_DB"
echo "[$DATE] Encrypted DB backup: $ENC_DB" | tee -a "$LOG_FILE"

if [ -d "$MEDIA_DIR" ]; then
  RAW_MEDIA="$BACKUP_DIR/yala_media_$DATE.tar.gz"
  ENC_MEDIA="$RAW_MEDIA.gpg"
  tar -czf "$RAW_MEDIA" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase "$BACKUP_ENCRYPTION_KEY" \
    -o "$ENC_MEDIA" "$RAW_MEDIA"
  rm -f "$RAW_MEDIA"
  echo "[$DATE] Encrypted media backup: $ENC_MEDIA" | tee -a "$LOG_FILE"
fi

# Restore test: decrypt to stdout and validate gzip header
RESTORE_TMP="$BACKUP_DIR/.restore_test_$DATE.sql.gz"
gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" \
  -o "$RESTORE_TMP" "$ENC_DB"
if gunzip -t "$RESTORE_TMP"; then
  echo "[$DATE] Restore decrypt test PASSED" | tee -a "$LOG_FILE"
else
  echo "[$DATE] ERROR: Restore decrypt test FAILED" | tee -a "$LOG_FILE"
  rm -f "$RESTORE_TMP"
  exit 1
fi
rm -f "$RESTORE_TMP"

find "$BACKUP_DIR" -name "yala_db_*.sql.gz.gpg" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "yala_media_*.tar.gz.gpg" -mtime +"$RETENTION_DAYS" -delete
echo "[$DATE] ── Encrypted backup completed ──" | tee -a "$LOG_FILE"
