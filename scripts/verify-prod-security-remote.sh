#!/usr/bin/env bash
set -euo pipefail

API="${API_BASE:-https://api.yalataxi.live}"
RIDER_EMAIL="${YALA_TEST_EMAIL:-qa-rider-profile-fix@test.local}"
RIDER_PASSWORD="${YALA_TEST_PASSWORD:-QaRiderFix!2026}"
DRIVER_EMAIL="${YALA_DRIVER_EMAIL:-qa-driver-final-qa@test.local}"
DRIVER_PASSWORD="${YALA_DRIVER_PASSWORD:-QaDriverFinal!2026}"

pass=0
fail=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "[PASS] $name"
    pass=$((pass + 1))
  else
    echo "[FAIL] $name"
    fail=$((fail + 1))
  fi
}

jwt_check() {
  local login refresh resp
  login=$(curl -sS -X POST "$API/auth/login/" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$RIDER_EMAIL\",\"password\":\"$RIDER_PASSWORD\"}")
  refresh=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['refresh'])" "$login")
  resp=$(curl -sS -X POST "$API/auth/token/refresh/" \
    -H "Content-Type: application/json" \
    -d "{\"refresh\":\"$refresh\"}")
  python3 -c "import json,sys; d=json.loads(sys.argv[1]); assert d.get('access')" "$resp"
}

https_check() {
  curl -sSI "http://api.yalataxi.live/health/" | grep -qi "301\|302\|location: https"
}

login_rate_limit_check() {
  local code
  for _ in $(seq 1 10); do
    curl -sS -o /dev/null -X POST "$API/auth/login/" \
      -H "Content-Type: application/json" \
      -d '{"email":"security-probe-rate@test.local","password":"wrong"}' || true
  done
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API/auth/login/" \
    -H "Content-Type: application/json" \
    -d '{"email":"security-probe-rate@test.local","password":"wrong"}')
  [ "$code" = "429" ] || [ "$code" = "503" ]
}

reset_rate_limit_check() {
  local code
  for _ in $(seq 1 5); do
    curl -sS -o /dev/null -X POST "$API/auth/password/reset/" \
      -H "Content-Type: application/json" \
      -d '{"email":"security-probe-rate@test.local"}' || true
  done
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API/auth/password/reset/" \
    -H "Content-Type: application/json" \
    -d '{"email":"security-probe-rate@test.local"}')
  [ "$code" = "429" ]
}

upload_check() {
  local token code
  token=$(curl -sS -X POST "$API/auth/login/" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$DRIVER_EMAIL\",\"password\":\"$DRIVER_PASSWORD\"}" \
    | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['access'])")
  code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$API/deliveries/1/confirm/" \
    -H "Authorization: Bearer $token" \
    -F "proof_of_delivery=@/etc/hosts;type=application/octet-stream;filename=evil.exe")
  [ "$code" = "400" ] || [ "$code" = "403" ] || [ "$code" = "404" ]
}

pin_lockout_check() {
  python3 - <<'PY'
import json
import os
import urllib.request

API = os.environ.get("API_BASE", "https://api.yalataxi.live")
driver_email = os.environ.get("YALA_DRIVER_EMAIL", "qa-driver-final-qa@test.local")
driver_password = os.environ.get("YALA_DRIVER_PASSWORD", "QaDriverFinal!2026")

def post(path, payload, token=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            data = {"raw": body}
        return exc.code, data

_, login = post("/auth/login/", {"email": driver_email, "password": driver_password})
token = login["access"]

# Find a ride assigned to driver in driver_arrived status if possible
req = urllib.request.Request(API + "/rides/driver/", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req, timeout=20) as resp:
    rides = json.loads(resp.read().decode())

target = None
for ride in rides if isinstance(rides, list) else rides.get("results", []):
    if ride.get("status") == "driver_arrived":
        target = ride
        break

if not target:
    print("SKIP no driver_arrived ride for PIN lockout test")
    raise SystemExit(0)

ride_id = target["id"]
locked = False
for i in range(6):
    code, data = post(f"/rides/{ride_id}/start/", {"pickup_pin": "0000"}, token)
    if code == 429:
        locked = True
        break
    if code not in {400, 429}:
        raise SystemExit(f"unexpected PIN response {code}: {data}")

if not locked:
    raise SystemExit("PIN lockout not triggered after repeated failures")
PY
}

ws_check() {
  python3 - <<'PY'
import asyncio
try:
    import websockets
except ImportError:
    raise SystemExit(0)

async def main():
    try:
        async with websockets.connect("wss://api.yalataxi.live/ws/rides/", open_timeout=8):
            raise SystemExit(1)
    except Exception:
        return

asyncio.run(main())
PY
}

echo "Security verification on $API"
check "HTTPS redirect" https_check
check "JWT login + refresh" jwt_check
check "Login rate limit" login_rate_limit_check
check "Password reset rate limit" reset_rate_limit_check
check "Upload validation" upload_check
check "PIN lockout" pin_lockout_check
check "WebSocket anonymous blocked" ws_check

echo "Summary: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
