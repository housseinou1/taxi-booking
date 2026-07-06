#!/usr/bin/env bash
set -euo pipefail

touch /home/yala/app/backend/taxi/payments/__init__.py
chown yala:yala /home/yala/app/backend/taxi/payments/__init__.py

if [ -d /opt/yala/backend/taxi/payments ]; then
  touch /opt/yala/backend/taxi/payments/__init__.py
  chown yala:yala /opt/yala/backend/taxi/payments/__init__.py
fi

echo "=== DJANGO_DEBUG ==="
grep DJANGO_DEBUG /opt/yala/backend/taxi/.env.production 2>/dev/null \
  || grep DJANGO_DEBUG /home/yala/app/backend/taxi/.env.production

echo "=== DATABASE_SSL_REQUIRE (.env file) ==="
grep DATABASE_SSL_REQUIRE /opt/yala/backend/taxi/.env.production 2>/dev/null \
  || grep DATABASE_SSL_REQUIRE /home/yala/app/backend/taxi/.env.production \
  || echo "DATABASE_SSL_REQUIRE not set in .env.production"

echo "=== DATABASE_SSL_REQUIRE (django container) ==="
docker compose -p yala exec -T django printenv DATABASE_SSL_REQUIRE 2>/dev/null \
  || echo "django container not running"

ACTIVE_DIR=/opt/yala
if [ ! -f "$ACTIVE_DIR/docker-compose.yml" ]; then
  ACTIVE_DIR=/home/yala/app
fi

echo "=== Rebuild django in $ACTIVE_DIR ==="
cd "$ACTIVE_DIR"
docker compose -p yala build django
docker compose -p yala up -d django

for _ in $(seq 1 40); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then
    break
  fi
  sleep 3
done
echo "django health: ${status:-unknown}"

echo "=== docker compose ps ==="
docker compose -p yala ps

echo "=== HEALTH ==="
curl -sS https://api.yalataxi.live/health/
echo

echo "=== LOGIN (optional: set YALA_TEST_EMAIL / YALA_TEST_PASSWORD) ==="
if [ -n "${YALA_TEST_EMAIL:-}" ] && [ -n "${YALA_TEST_PASSWORD:-}" ]; then
  python3 "${ACTIVE_DIR}/scripts/test-prod-login.py" 2>/dev/null \
    || python3 "$(dirname "$0")/test-prod-login.py"
else
  echo "Skipped login smoke test (credentials not set in environment)."
fi

echo "=== DJANGO LOGS ==="
docker compose -p yala logs django --tail 30
