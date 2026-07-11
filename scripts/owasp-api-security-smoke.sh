#!/usr/bin/env bash
# Lightweight OWASP API Security Top 10 smoke tests against a Yala API base URL.
# Usage:
#   API_URL=https://api.yalataxi.live bash scripts/owasp-api-security-smoke.sh
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local expect="$2"
  local got="$3"
  if [ "$got" = "$expect" ]; then
    echo "PASS  $name (HTTP $got)"
    PASS=$((PASS + 1))
  else
    echo "FAIL  $name (expected $expect got $got)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== OWASP API smoke against $API_URL ==="

# API1 Broken Object Level Authorization — unauthenticated ride detail
code=$(curl -sS -o /dev/null -w "%{http_code}" "$API_URL/rides/1/" || true)
check "BOLA unauthenticated ride detail" "401" "$code"

# API2 Broken Auth — junk JWT
code=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.notvalid" \
  "$API_URL/auth/me/" || true)
check "Broken auth junk JWT on /auth/me/" "401" "$code"

# API4 Unrestricted resource consumption — rapid login bursts should eventually 429
login_code="200"
for i in $(seq 1 12); do
  login_code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API_URL/auth/login/" \
    -H "Content-Type: application/json" \
    -d '{"email":"rate-limit-probe@example.com","password":"wrong"}' || true)
done
if [ "$login_code" = "429" ] || [ "$login_code" = "401" ]; then
  echo "PASS  login rate-limit/auth gate (last HTTP $login_code)"
  PASS=$((PASS + 1))
else
  echo "FAIL  login rate-limit/auth gate (last HTTP $login_code)"
  FAIL=$((FAIL + 1))
fi

# API8 Security misconfig — health should not leak debug
body=$(curl -sS "$API_URL/health/" || true)
if echo "$body" | grep -qi "traceback\|DEBUG = True"; then
  echo "FAIL  health endpoint leaks debug details"
  FAIL=$((FAIL + 1))
else
  echo "PASS  health endpoint does not leak debug traceback"
  PASS=$((PASS + 1))
fi

# WebSocket auth — expect non-101 without token on rides WS if applicable
ws_probe=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "$API_URL/ws/rides/" || true)
echo "INFO  websocket probe HTTP $ws_probe (expect non-101 without auth)"
if [ "$ws_probe" != "101" ]; then
  echo "PASS  websocket rejects unauthenticated upgrade"
  PASS=$((PASS + 1))
else
  echo "FAIL  websocket accepted unauthenticated upgrade"
  FAIL=$((FAIL + 1))
fi

echo "=== RESULT pass=$PASS fail=$FAIL ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
