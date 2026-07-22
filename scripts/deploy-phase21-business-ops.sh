#!/usr/bin/env bash
# Phase 21 — Deploy Business Operations Hub (Phase 20) + admin frontend to production.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Phase 21 deploy → ${REMOTE}:${APP_DIR} ==="

echo "=== Upload Phase 20 backend files ==="
rsync -av \
  "${REPO_ROOT}/backend/taxi/operations/business_ops_service.py" \
  "${REPO_ROOT}/backend/taxi/operations/business_views.py" \
  "${REPO_ROOT}/backend/taxi/operations/models.py" \
  "${REPO_ROOT}/backend/taxi/operations/urls.py" \
  "${REPO_ROOT}/backend/taxi/operations/migrations/0005_phase20_business_ops.py" \
  "${REMOTE}:${APP_DIR}/backend/taxi/operations/"

ssh "${REMOTE}" "mkdir -p ${APP_DIR}/backend/taxi/tests/operations"
rsync -av \
  "${REPO_ROOT}/backend/taxi/tests/operations/test_business_operations.py" \
  "${REMOTE}:${APP_DIR}/backend/taxi/tests/operations/"

echo "=== Upload frontend source (business hub + routes) ==="
rsync -av \
  "${REPO_ROOT}/frontend/src/admin/business/" \
  "${REMOTE}:${APP_DIR}/frontend/src/admin/business/"

rsync -av \
  "${REPO_ROOT}/frontend/src/App.js" \
  "${REPO_ROOT}/frontend/src/admin/AdminDashboard.js" \
  "${REMOTE}:${APP_DIR}/frontend/src/"

rsync -av \
  "${REPO_ROOT}/frontend/src/admin/AdminDashboard.js" \
  "${REMOTE}:${APP_DIR}/frontend/src/admin/"

echo "=== Rebuild backend + migrate ==="
ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd /opt/yala
docker compose -p yala build django django-replica django-replica-2
docker compose -p yala up -d django django-replica django-replica-2 celery-worker celery-beat
for _ in $(seq 1 60); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: ${status:-unknown}"
docker compose -p yala exec -T django python manage.py migrate operations --noinput
curl -fsS https://api.yalataxi.live/health/
echo
REMOTE_SCRIPT

echo "=== Build + deploy production frontend ==="
bash "${REPO_ROOT}/scripts/deploy-production-frontend.sh"

echo "=== Verify business hub API (requires admin token on server) ==="
ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd /opt/yala
if [ -f scripts/fetch-load-test-token.sh ]; then
  export LOAD_AUTH_TOKEN=$(bash scripts/fetch-load-test-token.sh 2>/dev/null || true)
  if [ -n "${LOAD_AUTH_TOKEN:-}" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' \
      -H "Authorization: Bearer ${LOAD_AUTH_TOKEN}" \
      https://api.yalataxi.live/operations/business/hub/)
    echo "business_hub HTTP ${code}"
  fi
fi
REMOTE_SCRIPT

echo "=== Phase 21 deploy complete ==="
