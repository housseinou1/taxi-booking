#!/bin/bash
set -euo pipefail
# Credentials come from the environment only (never hardcoded, never printed).
require_env() { local n; for n in "$@"; do if [ -z "${!n:-}" ]; then echo "Missing required environment variable: $n (values are never printed)" >&2; exit 1; fi; export "$n"; done; }
login_json() { python3 -c 'import json,os,sys; print(json.dumps({"email": sys.argv[1], "password": os.environ[sys.argv[2]]}))' "$1" "$2"; }
require_env YALA_CEO_PASSWORD
RESP=$(curl -sS -w '\nHTTP_CODE:%{http_code}' -X POST 'https://yalataxi.live/auth/login/' \
  -H 'Content-Type: application/json' \
  --data-binary @- < <(login_json "sakho@admin.mr" YALA_CEO_PASSWORD))
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