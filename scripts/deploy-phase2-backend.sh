#!/usr/bin/env bash
# Deploy Yala Security Phase 2 backend to production.
# Syncs auth/device/2FA/integrity/fraud/payment webhook files, rebuilds django,
# runs migrations, then verifies the six previous device-QA failures.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="${REPO_ROOT}/backend/taxi"

echo "=== Phase 2 backend deploy → ${REMOTE}:${APP_DIR} ==="

ssh "${REMOTE}" "mkdir -p \
  ${APP_DIR}/backend/taxi/admin_2fa/migrations \
  ${APP_DIR}/backend/taxi/authapp/migrations \
  ${APP_DIR}/backend/taxi/security/services \
  ${APP_DIR}/backend/taxi/payments \
  ${APP_DIR}/backend/taxi/deliveries/services \
  ${APP_DIR}/backend/taxi/taxi/rides \
  ${APP_DIR}/backend/taxi/taxi/security \
  ${APP_DIR}/scripts"

# --- Auth / sessions ---
scp "${BACKEND}/authapp/views.py" "${REMOTE}:${APP_DIR}/backend/taxi/authapp/views.py"
scp "${BACKEND}/authapp/urls.py"  "${REMOTE}:${APP_DIR}/backend/taxi/authapp/urls.py"
scp "${BACKEND}/authapp/models.py" "${REMOTE}:${APP_DIR}/backend/taxi/authapp/models.py"
scp "${BACKEND}/authapp/migrations/0018_devicesession.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/authapp/migrations/0018_devicesession.py"

# --- Admin 2FA + integrity ---
scp "${BACKEND}/admin_2fa/__init__.py" "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/__init__.py"
scp "${BACKEND}/admin_2fa/apps.py"     "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/apps.py"
scp "${BACKEND}/admin_2fa/models.py"   "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/models.py"
scp "${BACKEND}/admin_2fa/views.py"    "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/views.py"
scp "${BACKEND}/admin_2fa/urls.py"     "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/urls.py"
scp "${BACKEND}/admin_2fa/integrity.py" "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/integrity.py"
scp "${BACKEND}/admin_2fa/integrity_urls.py" "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/integrity_urls.py"
scp "${BACKEND}/admin_2fa/pending.py"  "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/pending.py"
scp "${BACKEND}/admin_2fa/migrations/__init__.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/migrations/__init__.py"
scp "${BACKEND}/admin_2fa/migrations/0001_initial.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/admin_2fa/migrations/0001_initial.py"

# --- Settings / root URLs / deps ---
scp "${BACKEND}/taxi/settings.py" "${REMOTE}:${APP_DIR}/backend/taxi/taxi/settings.py"
scp "${BACKEND}/taxi/urls.py"     "${REMOTE}:${APP_DIR}/backend/taxi/taxi/urls.py"
scp "${BACKEND}/requirements.txt" "${REMOTE}:${APP_DIR}/backend/taxi/requirements.txt"

# --- Fraud / PIN / payments ---
scp "${BACKEND}/security/services/fraud_service.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/security/services/fraud_service.py"
scp "${BACKEND}/security/models.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/security/models.py"
scp "${BACKEND}/deliveries/services/delivery_service.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/deliveries/services/delivery_service.py"
scp "${BACKEND}/taxi/rides/views.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/taxi/rides/views.py"
scp "${BACKEND}/taxi/security/abuse.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/taxi/security/abuse.py"
scp "${BACKEND}/payments/webhooks.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/payments/webhooks.py"
scp "${BACKEND}/payments/urls.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/payments/urls.py"

echo "=== Rebuild django + migrate + health ==="
ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd /opt/yala

# Ensure env knobs exist without overwriting existing values
ENV_FILE=/opt/yala/backend/taxi/.env.production
touch "$ENV_FILE"
grep -q '^PLAY_INTEGRITY_ENFORCE=' "$ENV_FILE" || echo 'PLAY_INTEGRITY_ENFORCE=false' >> "$ENV_FILE"
grep -q '^MAX_CONCURRENT_DEVICE_SESSIONS=' "$ENV_FILE" || echo 'MAX_CONCURRENT_DEVICE_SESSIONS=5' >> "$ENV_FILE"
grep -q '^ADMIN_2FA_ENABLED=' "$ENV_FILE" || echo 'ADMIN_2FA_ENABLED=true' >> "$ENV_FILE"

docker compose -p yala build django
docker compose -p yala up -d django

for _ in $(seq 1 50); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: ${status:-unknown}"

docker compose -p yala exec -T django python manage.py migrate authapp --noinput
docker compose -p yala exec -T django python manage.py migrate admin_2fa --noinput
docker compose -p yala exec -T django python manage.py migrate --noinput

curl -fsS https://api.yalataxi.live/health/
echo
REMOTE_SCRIPT

echo "=== Verify Phase 2 endpoints ==="
python3 - <<'PY'
import json, ssl, urllib.request, urllib.error, uuid

API = "https://api.yalataxi.live"
CTX = ssl._create_unverified_context()
EMAIL = "qa-rider-profile-fix@test.local"
PASSWORD = "QaRiderFix!2026"
fail = 0

def req(method, path, token=None, body=None, headers=None):
    hdrs = dict(headers or {})
    data = None
    if body is not None:
        hdrs["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(f"{API}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=45, context=CTX) as resp:
            payload = resp.read().decode()
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        try:
            parsed = json.loads(payload) if payload else {}
        except Exception:
            parsed = {"raw": payload[:200]}
        return e.code, parsed

def check(name, ok, detail=""):
    global fail
    print(("PASS" if ok else "FAIL"), name, detail)
    if not ok:
        fail += 1

device = f"deploy-verify-{uuid.uuid4().hex[:8]}"
st, body = req("POST", "/auth/login/", body={
    "email": EMAIL, "password": PASSWORD,
    "device_id": device, "device_name": "Phase2-Deploy-Verify",
}, headers={"X-Device-Id": device})
check("login returns is_new_device", st == 200 and "is_new_device" in body, f"HTTP {st} is_new={body.get('is_new_device')}")
token = body.get("access", "")

st2, body2 = req("POST", "/auth/login/", body={
    "email": EMAIL, "password": PASSWORD,
    "device_id": device, "device_name": "Phase2-Deploy-Verify",
}, headers={"X-Device-Id": device})
check("repeat device not new", st2 == 200 and body2.get("is_new_device") is False, f"is_new={body2.get('is_new_device')}")

st, devices = req("GET", "/auth/devices/", token=token)
check("/auth/devices/", st == 200 and isinstance(devices, list), f"HTTP {st}")

st, integ = req("POST", "/auth/integrity/verify/", token=token, body={
    "token": "", "package_name": "com.yala.rider.mr",
})
check("/auth/integrity/verify/", st in (200, 400, 403), f"HTTP {st}")

st, lo = req("POST", "/auth/logout-all-devices/", token=token)
check("/auth/logout-all-devices/", st == 200, f"HTTP {st}")

st, after = req("GET", "/auth/devices/", token=token)
check("devices cleared or token restricted", (st == 200 and after == []) or st in (401, 403), f"HTTP {st} {after}")

raise SystemExit(fail)
PY

echo "=== Phase 2 backend deploy complete ==="
