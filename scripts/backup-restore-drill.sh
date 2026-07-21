#!/bin/bash
# Disaster recovery drill: decrypt latest backup, verify checksums, measure restore time.
# Does NOT overwrite production database unless DRILL_FULL_RESTORE=1.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"
DRILL_LOG="$BACKUP_DIR/restore-drill.log"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
SOURCE="${BACKUP_SOURCE:-local}"  # local | offsite

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY="$(tr -d '\r\n' < "$KEY_FILE")"
fi

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  BACKUP_ENCRYPTION_KEY="$(printf '%s' "$BACKUP_ENCRYPTION_KEY" | tr -d '\r\n')"
fi

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY not set" | tee -a "$DRILL_LOG"
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

fetch_latest_db() {
  local latest=""
  if [ "$SOURCE" = "offsite" ] && [ -n "${BACKUP_OFFSITE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
    latest=$(rclone lsf "${BACKUP_OFFSITE_REMOTE}/daily/" --include "yala_db_*.sql.gz.gpg" 2>/dev/null | sort | tail -1)
    if [ -n "$latest" ]; then
      rclone copyto "${BACKUP_OFFSITE_REMOTE}/daily/$latest" "$WORKDIR/$latest"
      echo "$WORKDIR/$latest"
      return
    fi
  fi
  latest=$(ls -t "$BACKUP_DIR/daily"/yala_db_*.sql.gz.gpg 2>/dev/null | head -1)
  if [ -z "$latest" ]; then
    latest=$(ls -t "$BACKUP_DIR"/yala_db_*.sql.gz.gpg 2>/dev/null | head -1)
  fi
  echo "$latest"
}

LATEST=$(fetch_latest_db)
if [ -z "$LATEST" ] || [ ! -f "$LATEST" ]; then
  echo "[$DATE] FAIL: No encrypted DB backup found (source=$SOURCE)" | tee -a "$DRILL_LOG"
  exit 1
fi

STAMP=$(basename "$LATEST" | sed -n 's/yala_db_\(.*\)\.sql\.gz\.gpg/\1/p')
MANIFEST="$(dirname "$LATEST")/manifest_${STAMP}.sha256"
if [ -f "$MANIFEST" ]; then
  (cd "$(dirname "$LATEST")" && sha256sum -c "$(basename "$MANIFEST")") >> "$DRILL_LOG" 2>&1 && \
    echo "[$DATE] PASS: checksum manifest verified" | tee -a "$DRILL_LOG" || {
      echo "[$DATE] FAIL: checksum manifest mismatch" | tee -a "$DRILL_LOG"
      exit 1
    }
else
  echo "[$DATE] WARN: no manifest for $LATEST" | tee -a "$DRILL_LOG"
fi

echo "[$DATE] DR drill started — archive: $LATEST (source=$SOURCE)" | tee -a "$DRILL_LOG"
START=$(date +%s.%N)

PASSFILE="$WORKDIR/.pass"
printf '%s' "$BACKUP_ENCRYPTION_KEY" > "$PASSFILE"
chmod 600 "$PASSFILE"
gpg --batch --yes --decrypt --passphrase-file "$PASSFILE" \
  -o "$WORKDIR/restore.sql.gz" "$LATEST"
gunzip -t "$WORKDIR/restore.sql.gz"
BYTES=$(gzip -l "$WORKDIR/restore.sql.gz" | tail -1 | awk '{print $2}')

DECRYPT_END=$(date +%s.%N)
DECRYPT_SEC=$(awk "BEGIN {printf \"%.3f\", $DECRYPT_END - $START}")

echo "[$DATE] PASS: decrypt + gzip valid, uncompressed ~${BYTES} bytes, decrypt_s=${DECRYPT_SEC}s" | tee -a "$DRILL_LOG"

FULL_RESTORE_SEC=""
if [ "${DRILL_FULL_RESTORE:-0}" = "1" ]; then
  RESTORE_START=$(date +%s.%N)
  DRILL_CONTAINER="yala-drill-postgres-$$"
  docker run -d --name "$DRILL_CONTAINER" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:15-alpine
  sleep 5
  gunzip -c "$WORKDIR/restore.sql.gz" | docker exec -i "$DRILL_CONTAINER" psql -U postgres -d drill >/dev/null
  TABLES=$(docker exec "$DRILL_CONTAINER" psql -U postgres -d drill -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  docker rm -f "$DRILL_CONTAINER" >/dev/null
  RESTORE_END=$(date +%s.%N)
  FULL_RESTORE_SEC=$(awk "BEGIN {printf \"%.3f\", $RESTORE_END - $RESTORE_START}")
  echo "[$DATE] PASS: full restore drill, public tables=$TABLES, restore_s=${FULL_RESTORE_SEC}s" | tee -a "$DRILL_LOG"
fi

TOTAL_END=$(date +%s.%N)
TOTAL_SEC=$(awk "BEGIN {printf \"%.3f\", $TOTAL_END - $START}")

REPORT="$BACKUP_DIR/restore-drill-${DATE}.json"
cat > "$REPORT" <<EOF
{"timestamp":"$(date -Iseconds)","source":"$SOURCE","archive":"$LATEST","bytes_uncompressed":$BYTES,"decrypt_seconds":$DECRYPT_SEC,"full_restore_seconds":${FULL_RESTORE_SEC:-null},"total_seconds":$TOTAL_SEC,"pass":true}
EOF

echo "[$DATE] DR drill completed successfully (total_s=${TOTAL_SEC})" | tee -a "$DRILL_LOG"
echo "$REPORT"
