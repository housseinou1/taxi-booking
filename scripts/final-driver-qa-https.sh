#!/usr/bin/env bash
set -euo pipefail
API="https://api.yalataxi.live"
EMAIL="qa-driver-final-qa@test.local"
PASS="QaDriverFinal!2026"
PNG="/tmp/qa-sig.png"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$PNG"

pass() { echo "[PASS] $1${2:+ — $2}"; }
fail() { echo "[FAIL] $1${2:+ — $2}"; FAILED=1; }

FAILED=0

echo "=== Setup unsigned driver on production ==="
docker exec -i yala-django-1 python manage.py shell <<'PY'
from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile
User=get_user_model()
email="qa-driver-final-qa@test.local"
user, created = User.objects.get_or_create(email=email, defaults={"user_type":"driver","first_name":"Final","last_name":"QA"})
user.set_password("QaDriverFinal!2026")
user.user_type = "driver"
user.save()
p, _ = DriverProfile.objects.get_or_create(user=user)
p.driver_terms_accepted=False
p.driver_terms_accepted_at=None
p.driver_terms_version=""
p.driver_signed_full_name=""
p.driver_legal_declaration_accepted=False
p.driver_signature_image=None
p.is_available=False
p.status="approved"
p.save()
print("ready", email)
PY

echo ""
echo "=== 1. Login as unsigned driver ==="
LOGIN=$(curl -sS -X POST "$API/auth/login/" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('access',''))" "$LOGIN")
if [ -n "$TOKEN" ]; then pass "1. Login"; else fail "1. Login" "$LOGIN"; fi

echo ""
echo "=== 2. Legal gate (app redirects to /driver/sign) ==="
LEGAL=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/legal/status/")
SIG=$(python3 -c "import json,sys; d=json.loads(sys.argv[1])['driver']; print(d.get('signature_complete'), d.get('sign_path',''))" "$LEGAL")
if echo "$SIG" | grep -q "False.*/driver/sign"; then pass "2. Unsigned blocked, sign_path=/driver/sign"; else fail "2. Legal gate" "$SIG"; fi

TOGGLE1_CODE=$(curl -sS -o /tmp/toggle1.json -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' "$API/drivers/availability/toggle/")
TOGGLE1_CODE_ERR=$(python3 -c "import json; print(json.load(open('/tmp/toggle1.json')).get('code',''))" 2>/dev/null || true)
if [ "$TOGGLE1_CODE" = "400" ] && [ "$TOGGLE1_CODE_ERR" = "driver_terms_required" ]; then
  pass "Online blocked before sign"
else
  fail "Online blocked before sign" "http=$TOGGLE1_CODE code=$TOGGLE1_CODE_ERR"
fi

echo ""
echo "=== 3. Complete e-sign ==="
ESIGN_CODE=$(curl -sS -o /tmp/esign.json -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -F "signed_full_name=Final QA Driver" -F "legal_declaration_accepted=true" -F "scrolled_to_bottom=true" -F "terms_version=v1.0" -F "signed_device_info=Final Driver QA" -F "signature_image=@${PNG}")
if [ "$ESIGN_CODE" = "200" ]; then pass "3. E-sign completes"; else fail "3. E-sign" "http=$ESIGN_CODE body=$(cat /tmp/esign.json)"; fi

echo ""
echo "=== 4. Dashboard legal gate cleared ==="
LEGAL2=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/legal/status/")
COMPLIANT=$(python3 -c "import json,sys; d=json.loads(sys.argv[1])['driver']; print(d.get('signature_complete'), d.get('compliance_current'))" "$LEGAL2")
if echo "$COMPLIANT" | grep -q "True True"; then pass "4. Dashboard opens (compliance cleared)"; else fail "4. Dashboard gate" "$COMPLIANT"; fi

echo ""
echo "=== 5. Tap Online ==="
ME_CODE=$(curl -sS -o /tmp/me.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/drivers/me/")
if [ "$ME_CODE" = "200" ]; then pass "5a. GET /drivers/me/"; else fail "5a. GET /drivers/me/" "http=$ME_CODE"; fi
TOGGLE2_CODE=$(curl -sS -o /tmp/toggle2.json -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}' "$API/drivers/availability/toggle/")
ONLINE=$(python3 -c "import json; print(json.load(open('/tmp/toggle2.json')).get('is_available'))" 2>/dev/null || echo "")
if [ "$TOGGLE2_CODE" = "200" ] && [ "$ONLINE" = "True" ]; then pass "5. Tap Online works"; else fail "5. Tap Online" "http=$TOGGLE2_CODE is_available=$ONLINE"; fi

echo ""
echo "=== 6-8. Profile + documents ==="
PROF_CODE=$(curl -sS -o /tmp/prof.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/drivers/me/profile/")
NAME=$(python3 -c "import json; print(json.load(open('/tmp/prof.json')).get('driver_name',''))" 2>/dev/null || true)
if [ "$PROF_CODE" = "200" ] && [ -n "$NAME" ]; then pass "6. Profile loads" "$NAME"; else fail "6. Profile" "http=$PROF_CODE"; fi

DOCS_CODE=$(curl -sS -o /tmp/docs.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/drivers/me/documents/")
DOC_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/docs.json')); print(len(d.get('documents',[])))" 2>/dev/null || echo "n/a")
if [ "$DOCS_CODE" = "200" ]; then pass "7. Documents visible" "count=$DOC_COUNT"; else fail "7. Documents" "http=$DOCS_CODE"; fi

if [ "$ME_CODE" = "200" ] && [ "$PROF_CODE" = "200" ]; then pass "8. No Profile unavailable"; else fail "8. Profile unavailable risk" "me=$ME_CODE profile=$PROF_CODE"; fi

echo ""
echo "=== FINAL DRIVER QA SUMMARY ==="
if [ "${FAILED:-0}" -eq 0 ]; then
  echo "RESULT: PASS (8/8) — production API ready for device QA"
  echo "Test account: $EMAIL / $PASS"
else
  echo "RESULT: BLOCKED"
  exit 1
fi
