#!/bin/bash
# Non-destructive disaster recovery drill: decrypt latest DB backup and validate integrity.
# Does NOT overwrite production database.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"
DRILL_LOG="$BACKUP_DIR/restore-drill.log"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY="$(cat "$KEY_FILE")"
fi

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY not set" | tee -a "$DRILL_LOG"
  exit 1
fi

LATEST=$(ls -t "$BACKUP_DIR/daily"/yala_db_*.sql.gz.gpg 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  LATEST=$(ls -t "$BACKUP_DIR"/yala_db_*.sql.gz.gpg 2>/dev/null | head -1)
fi
if [ -z "$LATEST" ]; then
  echo "[$DATE] FAIL: No encrypted DB backup found" | tee -a "$DRILL_LOG"
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "[$DATE] DR drill started — archive: $LATEST" | tee -a "$DRILL_LOG"
gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" \
  -o "$WORKDIR/restore.sql.gz" "$LATEST"
gunzip -t "$WORKDIR/restore.sql.gz"
BYTES=$(gzip -l "$WORKDIR/restore.sql.gz" | tail -1 | awk '{print $2}')
echo "[$DATE] PASS: decrypt + gzip valid, uncompressed ~${BYTES} bytes" | tee -a "$DRILL_LOG"

# Optional: restore into ephemeral postgres container for full validation
if [ "${DRILL_FULL_RESTORE:-0}" = "1" ]; then
  DRILL_CONTAINER="yala-drill-postgres-$$"
  docker run -d --name "$DRILL_CONTAINER" -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=drill postgres:15-alpine
  sleep 5
  gunzip -c "$WORKDIR/restore.sql.gz" | docker exec -i "$DRILL_CONTAINER" psql -U postgres -d drill
  TABLES=$(docker exec "$DRILL_CONTAINER" psql -U postgres -d drill -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
  docker rm -f "$DRILL_CONTAINER"
  echo "[$DATE] PASS: full restore drill, public tables=$TABLES" | tee -a "$DRILL_LOG"
fi

echo "[$DATE] DR drill completed successfully" | tee -a "$DRILL_LOG"
