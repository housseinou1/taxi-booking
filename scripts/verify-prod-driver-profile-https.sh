#!/usr/bin/env bash
set -euo pipefail
# Credentials come from the environment only (never hardcoded, never printed).
require_env() { local n; for n in "$@"; do if [ -z "${!n:-}" ]; then echo "Missing required environment variable: $n (values are never printed)" >&2; exit 1; fi; export "$n"; done; }
login_json() { python3 -c 'import json,os,sys; print(json.dumps({"email": sys.argv[1], "password": os.environ[sys.argv[2]]}))' "$1" "$2"; }
require_env YALA_QA_DRIVER2_PASSWORD YALA_QA_RIDER_PASSWORD
API="https://api.yalataxi.live"
PATHS=(
  "/drivers/me/"
  "/drivers/me/profile/"
  "/drivers/me/documents/"
)

echo "=== UNAUTHENTICATED ==="
for path in "${PATHS[@]}"; do
  code=$(curl -sS -o /tmp/yala_body.json -w "%{http_code}" "$API$path")
  echo "$path -> $code"
done

echo "=== DRIVER LOGIN ==="
DRIVER_TOKEN=$(curl -sS -X POST "$API/auth/login/" \
  -H "Content-Type: application/json" \
  --data-binary @- < <(login_json "qa-driver-profile-fix@test.local" YALA_QA_DRIVER2_PASSWORD) \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access',''))")
if [ -z "$DRIVER_TOKEN" ]; then echo "driver login failed"; exit 1; fi
echo "driver token acquired"

echo "=== DRIVER (profile row deleted before test) ==="
for path in "${PATHS[@]}"; do
  code=$(curl -sS -o /tmp/yala_body.json -w "%{http_code}" -H "Authorization: Bearer $DRIVER_TOKEN" "$API$path")
  snippet=$(python3 -c "import json; d=json.load(open('/tmp/yala_body.json')); print(','.join(list(d.keys())[:6]))" 2>/dev/null || true)
  echo "$path -> $code keys=$snippet"
done

echo "=== RIDER LOGIN ==="
RIDER_TOKEN=$(curl -sS -X POST "$API/auth/login/" \
  -H "Content-Type: application/json" \
  --data-binary @- < <(login_json "qa-rider-profile-fix@test.local" YALA_QA_RIDER_PASSWORD) \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access',''))")
if [ -z "$RIDER_TOKEN" ]; then echo "rider login failed"; exit 1; fi

echo "=== RIDER (expect 403) ==="
for path in "${PATHS[@]}"; do
  code=$(curl -sS -o /tmp/yala_body.json -w "%{http_code}" -H "Authorization: Bearer $RIDER_TOKEN" "$API$path")
  err_code=$(python3 -c "import json; d=json.load(open('/tmp/yala_body.json')); print(d.get('code',''))" 2>/dev/null || true)
  echo "$path -> $code code=$err_code"
done
