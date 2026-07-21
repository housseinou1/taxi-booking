#!/bin/bash
# Offsite Backup Certification — production verification orchestrator.
set -euo pipefail
set +e  # certification collects all check results

APP_DIR="${APP_DIR:-/opt/yala}"
BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
ENV_FILE="${BACKUP_OFFSITE_ENV:-/home/yala/.backup-offsite.env}"
KEY_FILE="${BACKUP_KEY_FILE:-/home/yala/.backup.key}"
REPORT_JSON="${BACKUP_CERT_REPORT:-$BACKUP_DIR/offsite-certification.json}"
DATE=$(date -Iseconds)

PASS=true
NOTES=()

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-$(cat "$KEY_FILE" 2>/dev/null || true)}"

run_check() {
  local name="$1"
  shift
  set +e
  "$@"
  local rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    echo "PASS: $name"
    CHECKS+=("{\"name\":\"$name\",\"pass\":true}")
  else
    echo "FAIL: $name"
    CHECKS+=("{\"name\":\"$name\",\"pass\":false}")
    PASS=false
  fi
}

CHECKS=()

# 1. Encryption key present
run_check encryption_key_configured test -n "$BACKUP_ENCRYPTION_KEY"

# 2. Run backup
BACKUP_START=$(date +%s.%N)
if bash "$APP_DIR/scripts/backup-encrypted.sh" >> "$BACKUP_DIR/cert-backup.log" 2>&1; then
  echo "PASS: backup_run"
  CHECKS+=("{\"name\":\"backup_run\",\"pass\":true}")
else
  echo "FAIL: backup_run"
  CHECKS+=("{\"name\":\"backup_run\",\"pass\":false}")
  PASS=false
fi
BACKUP_END=$(date +%s.%N)

LATEST_DB=$(ls -t "$BACKUP_DIR/daily"/yala_db_*.sql.gz.gpg 2>/dev/null | head -1)
LATEST_CONFIG=$(ls -t "$BACKUP_DIR/daily"/yala_config_*.tar.gz.gpg 2>/dev/null | head -1)
LATEST_MEDIA=$(ls -t "$BACKUP_DIR/daily"/yala_media_*.tar.gz.gpg 2>/dev/null | head -1)
STAMP=""
if [ -n "$LATEST_DB" ]; then
  STAMP=$(basename "$LATEST_DB" | sed -n 's/yala_db_\(.*\)\.sql\.gz\.gpg/\1/p')
fi
MANIFEST="$BACKUP_DIR/daily/manifest_${STAMP}.sha256"

# 3. Artifact presence
run_check postgres_backup_present test -f "$LATEST_DB"
run_check media_backup_present test -f "$LATEST_MEDIA"
run_check config_backup_present test -f "$LATEST_CONFIG"
run_check manifest_present test -f "$MANIFEST"

# 4. GPG encryption header (symmetric AES256 packets begin with 0x8c)
run_check gpg_encryption_header bash -c "xxd -l 1 -p '$LATEST_DB' | grep -qi '^8c$'"

# 5. Checksum integrity
if (cd "$BACKUP_DIR/daily" && sha256sum -c "$(basename "$MANIFEST")" >> "$BACKUP_DIR/cert-checksum.log" 2>&1); then
  echo "PASS: checksum_integrity"
  CHECKS+=("{\"name\":\"checksum_integrity\",\"pass\":true}")
else
  echo "FAIL: checksum_integrity"
  CHECKS+=("{\"name\":\"checksum_integrity\",\"pass\":false}")
  PASS=false
fi

# 6. Offsite configured (remote name present AND rclone remote exists)
OFFSITE_CONFIGURED=false
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  REMOTE_NAME="${BACKUP_OFFSITE_REMOTE%%:*}"
  if rclone listremotes 2>/dev/null | grep -q "^${REMOTE_NAME}:$"; then
    OFFSITE_CONFIGURED=true
  fi
fi
run_check offsite_remote_configured test "$OFFSITE_CONFIGURED" = true

# 7. Offsite files present
OFFSITE_OK=false
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  OFFSITE_DB=$(rclone lsf "${BACKUP_OFFSITE_REMOTE}/daily/" --include "yala_db_${STAMP}.sql.gz.gpg" 2>/dev/null | head -1 || true)
  if [ -n "$OFFSITE_DB" ]; then
    OFFSITE_OK=true
  fi
fi
run_check offsite_daily_upload test "$OFFSITE_OK" = true

# 8. Restore drill (local + offsite)
DRILL_START=$(date +%s.%N)
if BACKUP_SOURCE=local bash "$APP_DIR/scripts/backup-restore-drill.sh" >> "$BACKUP_DIR/cert-drill.log" 2>&1; then
  echo "PASS: restore_drill_local"
  CHECKS+=("{\"name\":\"restore_drill_local\",\"pass\":true}")
else
  echo "FAIL: restore_drill_local"
  CHECKS+=("{\"name\":\"restore_drill_local\",\"pass\":false}")
  PASS=false
fi

if [ "$OFFSITE_OK" = true ]; then
  if BACKUP_SOURCE=offsite bash "$APP_DIR/scripts/backup-restore-drill.sh" >> "$BACKUP_DIR/cert-drill-offsite.log" 2>&1; then
    echo "PASS: restore_drill_offsite"
    CHECKS+=("{\"name\":\"restore_drill_offsite\",\"pass\":true}")
  else
    echo "FAIL: restore_drill_offsite"
    CHECKS+=("{\"name\":\"restore_drill_offsite\",\"pass\":false}")
    PASS=false
  fi
fi
DRILL_END=$(date +%s.%N)

# 9. Retention verification (directory counts within policy)
DAILY_COUNT=$(find "$BACKUP_DIR/daily" -name 'yala_db_*.sql.gz.gpg' 2>/dev/null | wc -l)
WEEKLY_COUNT=$(find "$BACKUP_DIR/weekly" -name 'yala_db_*.sql.gz.gpg' 2>/dev/null | wc -l)
MONTHLY_COUNT=$(find "$BACKUP_DIR/monthly" -name 'yala_db_*.sql.gz.gpg' 2>/dev/null | wc -l)
DAILY_MAX="${DAILY_RETENTION_DAYS:-14}"
WEEKLY_MAX="${WEEKLY_RETENTION_WEEKS:-8}"
MONTHLY_MAX="${MONTHLY_RETENTION_MONTHS:-12}"

RETENTION_OK=true
[ "$DAILY_COUNT" -gt "$DAILY_MAX" ] && RETENTION_OK=false
[ "$WEEKLY_COUNT" -gt "$WEEKLY_MAX" ] && RETENTION_OK=false
[ "$MONTHLY_COUNT" -gt "$MONTHLY_MAX" ] && RETENTION_OK=false
run_check retention_within_policy test "$RETENTION_OK" = true

# 10. Cron installed
run_check daily_cron_configured bash -c "crontab -l 2>/dev/null | grep -q backup-encrypted.sh"

# Sizes
DB_BYTES=$(stat -c%s "$LATEST_DB" 2>/dev/null || echo 0)
MEDIA_BYTES=$(stat -c%s "$LATEST_MEDIA" 2>/dev/null || echo 0)
CONFIG_BYTES=$(stat -c%s "$LATEST_CONFIG" 2>/dev/null || echo 0)
TOTAL_BYTES=$((DB_BYTES + MEDIA_BYTES + CONFIG_BYTES))

RESTORE_REPORT=$(ls -t "$BACKUP_DIR"/restore-drill-*.json 2>/dev/null | head -1)
RESTORE_SEC="null"
if [ -f "$RESTORE_REPORT" ]; then
  RESTORE_SEC=$(python3 -c "import json; print(json.load(open('$RESTORE_REPORT')).get('total_seconds','null'))")
fi

BACKUP_SEC=$(python3 - <<PY
print(round(float($BACKUP_END - $BACKUP_START), 2))
PY
)
DRILL_SEC=$(python3 - <<PY
print(round(float($DRILL_END - $DRILL_START), 2))
PY
)

VERDICT=$([ "$PASS" = true ] && echo PASS || echo FAIL)

cat > "$REPORT_JSON" <<EOF
{
  "timestamp": "$DATE",
  "verdict": "$VERDICT",
  "restore_duration_seconds": $RESTORE_SEC,
  "backup_duration_seconds": $BACKUP_SEC,
  "drill_duration_seconds": $DRILL_SEC,
  "backup_sizes_bytes": {
    "postgresql": $DB_BYTES,
    "media": $MEDIA_BYTES,
    "config": $CONFIG_BYTES,
    "total": $TOTAL_BYTES
  },
  "encryption": "GPG AES-256 symmetric",
  "offsite_remote": "${BACKUP_OFFSITE_REMOTE:-none}",
  "retention": {
    "daily": {"count": $DAILY_COUNT, "max": $DAILY_MAX},
    "weekly": {"count": $WEEKLY_COUNT, "max": $WEEKLY_MAX},
    "monthly": {"count": $MONTHLY_COUNT, "max": $MONTHLY_MAX}
  },
  "checks": [$(IFS=,; echo "${CHECKS[*]}")]
}
EOF

cat "$REPORT_JSON"
[ "$PASS" = true ]
