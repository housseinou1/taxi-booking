#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# YALA PRODUCTION BACKUP SCRIPT
# Runs inside DigitalOcean server via cron: 0 2 * * * /home/yala/backup.sh
# Retention: 7 days
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BACKUP_DIR="/home/yala/backups"
MEDIA_DIR="/home/yala/app/backend/taxi/media"
DB_CONTAINER="taxi-booking-postgres-1"
DB_NAME="yala_db"
DB_USER="yala_user"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H-%M-%S)
LOG_FILE="$BACKUP_DIR/backup.log"

mkdir -p "$BACKUP_DIR"

echo "[$DATE] ── Yala Backup Started ────────────────────────" >> "$LOG_FILE"

# ── 1. PostgreSQL dump ────────────────────────────────────────────────────────
DB_BACKUP="$BACKUP_DIR/yala_db_$DATE.sql.gz"
echo "[$DATE] Dumping PostgreSQL..." >> "$LOG_FILE"

docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DB_BACKUP"

if [ -f "$DB_BACKUP" ]; then
    SIZE=$(du -sh "$DB_BACKUP" | cut -f1)
    echo "[$DATE] DB backup OK: $DB_BACKUP ($SIZE)" >> "$LOG_FILE"
else
    echo "[$DATE] ERROR: DB backup failed!" >> "$LOG_FILE"
    exit 1
fi

# ── 2. Media files backup ─────────────────────────────────────────────────────
MEDIA_BACKUP="$BACKUP_DIR/yala_media_$DATE.tar.gz"
echo "[$DATE] Backing up media files..." >> "$LOG_FILE"

if [ -d "$MEDIA_DIR" ]; then
    tar -czf "$MEDIA_BACKUP" -C "$(dirname "$MEDIA_DIR")" "$(basename "$MEDIA_DIR")"
    SIZE=$(du -sh "$MEDIA_BACKUP" | cut -f1)
    echo "[$DATE] Media backup OK: $MEDIA_BACKUP ($SIZE)" >> "$LOG_FILE"
else
    echo "[$DATE] WARNING: Media directory not found at $MEDIA_DIR" >> "$LOG_FILE"
fi

# ── 3. Prune old backups (7-day retention) ────────────────────────────────────
echo "[$DATE] Pruning backups older than $RETENTION_DAYS days..." >> "$LOG_FILE"
find "$BACKUP_DIR" -name "yala_db_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "yala_media_*.tar.gz" -mtime +$RETENTION_DAYS -delete
echo "[$DATE] Pruning done." >> "$LOG_FILE"

# ── 4. Verify backup integrity ────────────────────────────────────────────────
echo "[$DATE] Verifying DB backup integrity..." >> "$LOG_FILE"
if gunzip -t "$DB_BACKUP" 2>/dev/null; then
    echo "[$DATE] Integrity check PASSED." >> "$LOG_FILE"
else
    echo "[$DATE] ERROR: Integrity check FAILED for $DB_BACKUP!" >> "$LOG_FILE"
    exit 1
fi

echo "[$DATE] ── Backup Completed Successfully ─────────────" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
