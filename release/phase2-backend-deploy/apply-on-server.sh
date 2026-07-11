#!/bin/bash
set -euo pipefail
ROOT=/opt/yala
SRC_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$SRC_ROOT"
rsync -a backend/taxi/ "$ROOT/backend/taxi/"
ENV_FILE="$ROOT/backend/taxi/.env.production"
touch "$ENV_FILE"
grep -q '^PLAY_INTEGRITY_ENFORCE=' "$ENV_FILE" || echo 'PLAY_INTEGRITY_ENFORCE=false' >> "$ENV_FILE"
grep -q '^MAX_CONCURRENT_DEVICE_SESSIONS=' "$ENV_FILE" || echo 'MAX_CONCURRENT_DEVICE_SESSIONS=5' >> "$ENV_FILE"
grep -q '^ADMIN_2FA_ENABLED=' "$ENV_FILE" || echo 'ADMIN_2FA_ENABLED=true' >> "$ENV_FILE"
cd "$ROOT"
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
curl -fsS https://api.yalataxi.live/health/; echo
echo "Phase 2 apply done"
