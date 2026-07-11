#!/usr/bin/env bash
# RC4 production deploy — sync active_ride + rebuild django + provision QA accounts.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== RC4 deploy to ${REMOTE} (${APP_DIR}) ==="

scp "${REPO_ROOT}/backend/taxi/taxi/rides/urls.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/taxi/rides/urls.py"
scp "${REPO_ROOT}/backend/taxi/taxi/rides/views.py" \
    "${REMOTE}:${APP_DIR}/backend/taxi/taxi/rides/views.py"
scp "${REPO_ROOT}/scripts/prod-rc4-provision.py" \
    "${REMOTE}:${APP_DIR}/scripts/prod-rc4-provision.py"

ssh "${REMOTE}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd /opt/yala
docker compose -p yala build django
docker compose -p yala up -d django
for _ in $(seq 1 40); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [ "$status" = healthy ]; then break; fi
  sleep 3
done
echo "django health: ${status:-unknown}"
docker compose -p yala exec -T django python manage.py shell < /opt/yala/scripts/prod-rc4-provision.py
curl -sS https://api.yalataxi.live/health/
echo
REMOTE_SCRIPT

echo "=== Verify /rides/active/ endpoint ==="
python3 "${REPO_ROOT}/scripts/platform-rc1-smoke.py"
