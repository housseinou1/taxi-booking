#!/bin/bash
set -euo pipefail
RESP=$(curl -sS -w '\nHTTP_CODE:%{http_code}' -X POST 'https://yalataxi.live/auth/login/' \
  -H 'Content-Type: application/json' \
  -d '{"email":"sakho@admin.mr","password":"Admin2026!"}')
CODE=$(printf '%s\n' "$RESP" | sed -n 's/^HTTP_CODE://p')
BODY=$(printf '%s\n' "$RESP" | sed '/^HTTP_CODE:/d')
echo "http=$CODE"
python3 - <<PY
import json
body = '''$BODY'''
data = json.loads(body)
safe = {
  "email": data.get("email"),
  "user_type": data.get("user_type"),
  "is_staff": data.get("is_staff"),
  "is_superuser": data.get("is_superuser"),
  "first_name": data.get("first_name"),
  "has_access": bool(data.get("access")),
}
print(json.dumps(safe))
assert safe["has_access"]
assert safe["is_staff"] or safe["is_superuser"]
print("ADMIN_LOGIN_OK")
PY