#!/usr/bin/env bash
set -euo pipefail
cd /opt/yala
git fetch origin
git checkout main
git pull --ff-only origin main
echo "HEAD: $(git rev-parse --short HEAD)"

docker compose -p yala build django
docker compose -p yala up -d django celery-worker celery-beat

for _ in $(seq 1 50); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: ${status:-unknown}"

echo "=== migrate drivers 0020 ==="
docker compose -p yala exec -T django python manage.py migrate drivers 0020_driverprofile_total_rides_no_show --noinput

echo "=== show drivers migrations tail ==="
docker compose -p yala exec -T django python manage.py showmigrations drivers | tail -5

curl -fsS https://api.yalataxi.live/health/
echo
