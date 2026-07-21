#!/bin/bash
# Bootstrap DigitalOcean Spaces access key via DO API (optional one-time setup).
# Requires: DO_API_TOKEN with read/write scope.
set -euo pipefail

ENV_FILE="${BACKUP_OFFSITE_ENV:-/home/yala/.backup-offsite.env}"
KEY_NAME="${SPACES_KEY_NAME:-yala-backup-prod-$(date +%Y%m)}"
SPACES_ENDPOINT="${SPACES_ENDPOINT:-fra1.digitaloceanspaces.com}"
SPACES_BUCKET="${SPACES_BUCKET:-yala-backups-prod}"

if [ -z "${DO_API_TOKEN:-}" ]; then
  echo "ERROR: DO_API_TOKEN not set" >&2
  exit 1
fi

echo "Creating Spaces access key: $KEY_NAME"
RESP=$(curl -sf -X POST "https://api.digitalocean.com/v2/spaces/keys" \
  -H "Authorization: Bearer $DO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$KEY_NAME\"}")

ACCESS_KEY=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['key']['access_key_id'])")
SECRET_KEY=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['key']['secret_access_key'])")

if [ ! -f "$ENV_FILE" ]; then
  bash "$(dirname "$0")/setup-offsite-backup.sh" || true
fi

# Append or update credentials (preserve other settings)
grep -v '^SPACES_ACCESS_KEY_ID=' "$ENV_FILE" 2>/dev/null | grep -v '^SPACES_SECRET_ACCESS_KEY=' > "${ENV_FILE}.tmp" || true
{
  cat "${ENV_FILE}.tmp" 2>/dev/null || true
  echo "SPACES_ACCESS_KEY_ID=$ACCESS_KEY"
  echo "SPACES_SECRET_ACCESS_KEY=$SECRET_KEY"
  echo "SPACES_ENDPOINT=$SPACES_ENDPOINT"
  echo "SPACES_BUCKET=$SPACES_BUCKET"
  echo "BACKUP_OFFSITE_REMOTE=do-spaces:$SPACES_BUCKET"
} > "$ENV_FILE"
rm -f "${ENV_FILE}.tmp"
chmod 600 "$ENV_FILE"

echo "Spaces credentials written to $ENV_FILE (secret shown once — already saved)."
bash "$(dirname "$0")/setup-offsite-backup.sh"
