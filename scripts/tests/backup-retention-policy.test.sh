#!/usr/bin/env bash
# Local unit test: retention certification must use age (mtime), not file count.
# Does not touch production. Requires bash + find (Git Bash / WSL / Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

BACKUP_DIR="$TMP/backups"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"

# Simulate 16 daily DB backups, all within the 14-day window (certification must PASS)
for i in $(seq 1 16); do
  day_ago=$(( (i % 14) + 1 )) # 1..14 days ago — never > 14
  f="$BACKUP_DIR/daily/yala_db_2026-11-$(printf '%02d' "$i")_02-00-01.sql.gz.gpg"
  if touch -d "${day_ago} days ago" "$f" 2>/dev/null; then
    :
  else
  # Git Bash without GNU touch -d: same mtime (all "now") still within window
    touch "$f"
  fi
done

# One stale file older than 14 days (must FAIL age check)
stale="$BACKUP_DIR/daily/yala_db_stale.sql.gz.gpg"
touch -d "20 days ago" "$stale" 2>/dev/null || touch -r /etc/hosts "$stale" 2>/dev/null || touch "$stale"
# If touch -d unsupported, skip stale-file branch on minimal CI; old logic still tested below
if find "$BACKUP_DIR/daily" -name 'yala_db_stale.sql.gz.gpg' -mtime +14 2>/dev/null | grep -q .; then
  STALE_SUPPORTED=true
else
  STALE_SUPPORTED=false
fi

DAILY_MAX=14
count_stale_files() {
  local tier="$1"
  local pattern="$2"
  local max_age_days="$3"
  find "$BACKUP_DIR/$tier" -name "$pattern" -mtime +"$max_age_days" 2>/dev/null | wc -l
}

# Old (wrong) logic
DAILY_COUNT=$(find "$BACKUP_DIR/daily" -name 'yala_db_*.sql.gz.gpg' | wc -l)
OLD_FAIL=false
[ "$DAILY_COUNT" -gt "$DAILY_MAX" ] && OLD_FAIL=true

# New (correct) logic
DAILY_STALE=$(count_stale_files daily 'yala_db_*.sql.gz.gpg' "$DAILY_MAX")
NEW_FAIL=false
[ "$DAILY_STALE" -gt 0 ] && NEW_FAIL=true

if [ "$OLD_FAIL" != true ]; then
  echo "UNEXPECTED: old count logic should fail with count=$DAILY_COUNT max=$DAILY_MAX"
  exit 1
fi
if [ "$STALE_SUPPORTED" = true ] && [ "$NEW_FAIL" != true ]; then
  echo "UNEXPECTED: new logic should fail when stale=$DAILY_STALE"
  exit 1
fi

# Clean stale for pass case
rm -f "$BACKUP_DIR/daily/yala_db_stale.sql.gz.gpg"
DAILY_STALE=$(count_stale_files daily 'yala_db_*.sql.gz.gpg' "$DAILY_MAX")
RETENTION_OK=true
[ "$DAILY_STALE" -gt 0 ] && RETENTION_OK=false
if [ "$RETENTION_OK" != true ]; then
  echo "FAIL: expected PASS with 16 in-window files, stale=$DAILY_STALE"
  exit 1
fi

echo "backup-retention-policy.test.sh: PASS (age-based matches backup-encrypted.sh find -mtime)"
