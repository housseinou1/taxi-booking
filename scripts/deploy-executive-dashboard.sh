#!/usr/bin/env bash
# Deploy Executive Operations Dashboard to production.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Executive dashboard deploy → ${REMOTE}:${APP_DIR} ==="

ssh "${REMOTE}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd ${APP_DIR}
git fetch origin
git pull --ff-only origin main
REMOTE_SCRIPT

echo "=== Rebuild backend services ==="
ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd /opt/yala
docker compose -p yala build django
docker compose -p yala up -d django celery-worker celery-beat
for _ in $(seq 1 50); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: ${status:-unknown}"
docker compose -p yala exec -T django python manage.py migrate operations --noinput
docker compose -p yala exec -T django python manage.py shell < /opt/yala/scripts/seed_executive_roles.py
curl -fsS https://api.yalataxi.live/health/
echo
REMOTE_SCRIPT

echo "=== Deploy admin/web frontend ==="
bash "${REPO_ROOT}/scripts/deploy-production-frontend.sh"

echo "=== Executive dashboard deploy complete ==="
