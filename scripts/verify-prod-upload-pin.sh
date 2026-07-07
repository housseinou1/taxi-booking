#!/usr/bin/env bash
set -euo pipefail
API=https://api.yalataxi.live
sleep 20

echo "=== Upload validation ==="
LOGIN=$(curl -sS -X POST "$API/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-driver-final-qa@test.local","password":"QaDriverFinal!2026"}')
TOKEN=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['access'])" "$LOGIN")
CODE=$(curl -sS -o /tmp/up.txt -w "%{http_code}" -X POST "$API/deliveries/1/confirm/" \
  -H "Authorization: Bearer $TOKEN" \
  -F "proof_of_delivery=@/etc/hosts;type=application/octet-stream;filename=evil.exe")
echo "status=$CODE body=$(head -c 180 /tmp/up.txt)"
if [ "$CODE" = "400" ] || [ "$CODE" = "403" ] || [ "$CODE" = "404" ]; then
  echo "UPLOAD_PASS"
else
  echo "UPLOAD_FAIL"
fi

echo "=== PIN lockout ==="
python3 - <<'PY'
import json
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"

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

_, login = post("/auth/login/", {"email": "qa-driver-final-qa@test.local", "password": "QaDriverFinal!2026"})
token = login["access"]
req = urllib.request.Request(API + "/rides/driver/", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(req, timeout=20) as resp:
    rides = json.loads(resp.read().decode())

items = rides if isinstance(rides, list) else rides.get("results", [])
target = next((r for r in items if r.get("status") == "driver_arrived"), None)
if not target:
    print("PIN_SKIP no driver_arrived ride")
    raise SystemExit(0)

ride_id = target["id"]
for _ in range(6):
    code, data = post(f"/rides/{ride_id}/start/", {"pickup_pin": "0000"}, token)
    print("attempt", code, data.get("detail", data))
    if code == 429:
        print("PIN_PASS")
        raise SystemExit(0)
print("PIN_FAIL no lockout")
raise SystemExit(1)
PY
