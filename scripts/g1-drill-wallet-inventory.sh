#!/usr/bin/env bash
# G1 prep: restore latest encrypted DB into an ephemeral Postgres (never touches yala_db).
# Runs wallet duplicate inventory SQL equivalent to migration 0022 pre-flight.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"
DRILL_NAME="yala-g1-drill-postgres-$$"

cleanup() {
  docker rm -f "$DRILL_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ] && [ -f "$KEY_FILE" ]; then
  BACKUP_ENCRYPTION_KEY="$(tr -d '\r\n' < "$KEY_FILE")"
fi
[ -n "${BACKUP_ENCRYPTION_KEY:-}" ] || { echo "ABORT: BACKUP_ENCRYPTION_KEY missing"; exit 1; }

LATEST=$(ls -t "$BACKUP_DIR/daily"/yala_db_*.sql.gz.gpg 2>/dev/null | head -1)
[ -f "$LATEST" ] || { echo "ABORT: no encrypted daily DB backup"; exit 1; }

WORKDIR=$(mktemp -d)
PASSFILE="$WORKDIR/.pass"
printf '%s' "$BACKUP_ENCRYPTION_KEY" > "$PASSFILE"
chmod 600 "$PASSFILE"
gpg --batch --yes --decrypt --passphrase-file "$PASSFILE" \
  -o "$WORKDIR/restore.sql.gz" "$LATEST"
gunzip -t "$WORKDIR/restore.sql.gz"

echo "── drill restore (isolated) archive=$(basename "$LATEST") ──"
docker run -d --name "$DRILL_NAME" \
  -e POSTGRES_PASSWORD=drill \
  -e POSTGRES_DB=drill \
  -e POSTGRES_USER=yala_user \
  postgres:15-alpine >/dev/null
sleep 6
docker exec "$DRILL_NAME" psql -U yala_user -d drill -c "SELECT 1" >/dev/null
gunzip -c "$WORKDIR/restore.sql.gz" | docker exec -i "$DRILL_NAME" psql -U yala_user -d drill >/dev/null

TABLES=$(docker exec "$DRILL_NAME" psql -U postgres -d drill -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
WALLET_ROWS=$(docker exec "$DRILL_NAME" psql -U postgres -d drill -tAc \
  "SELECT COUNT(*) FROM payments_wallettransaction" 2>/dev/null || echo 0)
DUP_GROUPS=$(docker exec "$DRILL_NAME" psql -U postgres -d drill -tAc \
  "SELECT COUNT(*) FROM (
     SELECT wallet_id, reference FROM payments_wallettransaction
     WHERE reference IS NOT NULL AND length(trim(reference)) > 0
     GROUP BY wallet_id, reference HAVING COUNT(*) > 1
   ) s" 2>/dev/null || echo 0)

echo "drill_public_tables=$TABLES"
echo "wallet_transaction_rows=$WALLET_ROWS"
echo "duplicate_reference_groups=$DUP_GROUPS"
echo "migration_0022_preflight=$([ "$DUP_GROUPS" = "0" ] && echo PASS || echo REVIEW)"

rm -rf "$WORKDIR"
echo "G1_DRILL_INVENTORY_OK"
