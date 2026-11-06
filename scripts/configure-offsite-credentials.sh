#!/bin/bash
# Interactively configure DigitalOcean Spaces credentials for offsite backups.
#
# SECURITY: prompts with `read -s` (no echo) and never writes secrets to shell
# history, process arguments, or logs. Run this ON the server, interactively.
#
# Usage:  sudo bash configure-offsite-credentials.sh
set -uo pipefail

ENV_FILE="${BACKUP_OFFSITE_ENV:-/home/yala/.backup-offsite.env}"
APP_DIR="${APP_DIR:-/opt/yala}"

echo "── YALA offsite backup — credential setup ─────────────────────────"
echo "You need, from DigitalOcean:"
echo "  Control Panel → API → Spaces access keys → Create New Key"
echo "  (the SECRET is shown only once — copy it before closing the dialog)"
echo
echo "Also ensure a Space exists named: yala-backups-prod   (region fra1)"
echo

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE from template..."
  bash "$APP_DIR/scripts/setup-offsite-backup.sh" >/dev/null 2>&1 || true
fi

# ── prompt without echo ───────────────────────────────────────────────────────
printf 'SPACES_ACCESS_KEY_ID: '
read -r ACCESS_KEY
printf 'SPACES_SECRET_ACCESS_KEY (hidden): '
read -rs SECRET
echo

if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET" ]; then
  echo "ERROR: both values are required. Nothing written." >&2
  exit 1
fi

# sanity: DO Spaces keys are ~20 char id / ~64 char secret, base64-ish
if printf '%s' "$ACCESS_KEY" | grep -qE '[^A-Za-z0-9+/=_-]'; then
  echo "WARNING: access key id has unusual characters." >&2
fi
if [ "${#SECRET}" -lt 20 ]; then
  echo "WARNING: secret looks short (${#SECRET} chars) - double-check it." >&2
fi

# ── write atomically, 600, preserving everything else ─────────────────────────
umask 077
TMP="$(mktemp)"
grep -v '^SPACES_ACCESS_KEY_ID=' "$ENV_FILE" 2>/dev/null \
  | grep -v '^SPACES_SECRET_ACCESS_KEY=' > "$TMP"
{
  echo "SPACES_ACCESS_KEY_ID=$ACCESS_KEY"
  echo "SPACES_SECRET_ACCESS_KEY=$SECRET"
} >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset ACCESS_KEY SECRET

echo
echo "Wrote credentials to $ENV_FILE (mode $(stat -c%a "$ENV_FILE"))."
echo "Keys present: $(grep -c '^SPACES_ACCESS_KEY_ID=' "$ENV_FILE") access id, $(grep -c '^SPACES_SECRET_ACCESS_KEY=' "$ENV_FILE") secret"
echo
echo "── configuring rclone + cron ──────────────────────────────────────"
bash "$APP_DIR/scripts/setup-offsite-backup.sh"
echo
echo "Done. Now run:  bash $APP_DIR/scripts/offsite-backup-certification.sh"
