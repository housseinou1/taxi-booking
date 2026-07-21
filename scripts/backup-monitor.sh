#!/bin/bash
# Check backup health from backup-status.json; exit 1 if stale or failed.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/yala/backups}"
STATUS_FILE="${BACKUP_STATUS_FILE:-$BACKUP_DIR/backup-status.json}"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"

export STATUS_FILE MAX_AGE_HOURS

if [ ! -f "$STATUS_FILE" ]; then
  echo "CRITICAL: No backup status file at $STATUS_FILE"
  exit 1
fi

python3 - <<'PY'
import json, os, sys
from datetime import datetime, timezone

status_file = os.environ.get("STATUS_FILE", "/home/yala/backups/backup-status.json")
max_age = int(os.environ.get("MAX_AGE_HOURS", "26"))

with open(status_file) as f:
    data = json.load(f)

status = data.get("status")
last = data.get("last_success") or data.get("timestamp")
if status not in ("ok", "warning"):
    print(f"CRITICAL: backup status={status} msg={data.get('message')}")
    sys.exit(1)

if last:
    ts = datetime.fromisoformat(last.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_h = (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds() / 3600
    if age_h > max_age:
        print(f"CRITICAL: last backup {age_h:.1f}h ago (max {max_age}h)")
        sys.exit(1)

print(f"OK: backup status={status} last_success={last}")

offsite = os.environ.get("BACKUP_OFFSITE_REMOTE", "")
if offsite:
    import subprocess
    remote = offsite.split(":")[0] + ":"
    proc = subprocess.run(["rclone", "lsf", f"{offsite}/daily/", "--max-depth", "1"], capture_output=True, text=True)
    if proc.returncode != 0 or not proc.stdout.strip():
        print(f"CRITICAL: offsite remote configured but no daily files at {offsite}/daily/")
        sys.exit(1)
    print(f"OK: offsite daily files present at {offsite}/daily/")
PY
