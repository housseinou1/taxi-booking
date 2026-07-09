#!/usr/bin/env bash
# Deploy Step 1 — rider no-show + waiting timer to production.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Step 1 deploy → ${REMOTE}:${APP_DIR} ==="

ssh "${REMOTE}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd ${APP_DIR}
git fetch origin
git checkout main
git pull --ff-only origin main
echo "HEAD: \$(git rev-parse --short HEAD)"

docker compose -p yala build django
docker compose -p yala up -d django celery-worker celery-beat

for _ in \$(seq 1 50); do
  status=\$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "\$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: \${status:-unknown}"

docker compose -p yala exec -T django python manage.py migrate rides --noinput
docker compose -p yala exec -T django python manage.py migrate payments --noinput
docker compose -p yala exec -T django python manage.py migrate --noinput

curl -fsS https://api.yalataxi.live/health/
echo
REMOTE_SCRIPT

echo "=== Deploy admin frontend ==="
bash "${REPO_ROOT}/scripts/deploy-production-frontend.sh"

echo "=== Step 1 backend deploy complete ==="
