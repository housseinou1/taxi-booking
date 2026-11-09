#!/usr/bin/env bash
# Merge Moosyl SANDBOX keys from a root-only vault into .env.production (no stdout secrets).
# Vault path: /home/yala/.moosyl-sandbox.env (mode 600, CEO/ops only).
#
# Required vault keys: MOOSYL_SECRET_KEY, MOOSYL_WEBHOOK_SECRET
# Optional: MOOSYL_PUBLISHABLE_KEY, MOOSYL_API_BASE_URL
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/yala/backend/taxi/.env.production}"
VAULT="/home/yala/.moosyl-sandbox.env"

if [ ! -f "$VAULT" ]; then
  echo "ABORT: missing vault $VAULT — create from scripts/moosyl-secure-credential-setup.md" >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a
source "$VAULT"
set +a

for req in MOOSYL_SECRET_KEY MOOSYL_WEBHOOK_SECRET; do
  if [ -z "${!req:-}" ]; then
    echo "ABORT: $req not set in vault" >&2
    exit 2
  fi
done

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

strip_keys() {
  grep -v '^MOOSYL_' "$ENV_FILE" 2>/dev/null \
    | grep -v '^PAYMENTS_LIVE_MODE=' \
    | grep -v '^MOOSYL_ALLOW_SANDBOX_SETTLEMENT=' \
    | grep -v '^CASHLESS_POLICY_ENFORCED=' || true
}

TMP=$(mktemp)
strip_keys > "$TMP"
{
  cat "$TMP"
  echo "PAYMENTS_LIVE_MODE=False"
  echo "CASHLESS_POLICY_ENFORCED=True"
  echo "MOOSYL_ENVIRONMENT=sandbox"
  echo "MOOSYL_ALLOW_SANDBOX_SETTLEMENT=True"
  echo "MOOSYL_API_BASE_URL=${MOOSYL_API_BASE_URL:-https://api.moosyl.com}"
  echo "MOOSYL_FEE_PERCENT=${MOOSYL_FEE_PERCENT:-1}"
  echo "MOOSYL_SECRET_KEY=$MOOSYL_SECRET_KEY"
  echo "MOOSYL_PUBLISHABLE_KEY=${MOOSYL_PUBLISHABLE_KEY:-}"
  echo "MOOSYL_WEBHOOK_SECRET=$MOOSYL_WEBHOOK_SECRET"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
rm -f "$TMP"

echo "OK: Moosyl sandbox policy merged into $ENV_FILE (PAYMENTS_LIVE_MODE=False)"
echo "MOOSYL_SECRET_KEY_set=yes MOOSYL_WEBHOOK_SECRET_set=yes"
