#!/usr/bin/env bash
# G1 coordinated backend deploy — static www unchanged; PAYMENTS_LIVE_MODE must stay False.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yala}"
RELEASE_SHA="${G1_RELEASE_SHA:-8d68c75ac741d00d26990b60c2a7bba00de16e28}"
BRANCH="${G1_BRANCH:-release/coordinated-admin-moosyl-rc1}"
STAMP=$(date +%Y%m%d-%H%M%S)
PRE_TAG="yala-g1-predeploy-${STAMP}"

cd "$APP_DIR"

echo "=== G1 pre-deploy backup ==="
bash "$APP_DIR/scripts/backup-encrypted.sh"

echo "=== Pin release $RELEASE_SHA ==="
git fetch origin
git checkout "$BRANCH"
git reset --hard "$RELEASE_SHA"

echo "=== Save image tags ==="
for c in yala-django-1 yala-celery-worker-1 yala-celery-beat-1; do
  img=$(docker inspect "$c" --format '{{.Image}}' 2>/dev/null || true)
  if [ -n "$img" ]; then
    docker tag "$img" "${PRE_TAG}:$(echo "$c" | tr -d '-')" || true
  fi
done

echo "=== Moosyl sandbox vault (if present) ==="
if [ -x "$APP_DIR/scripts/apply-moosyl-sandbox-prod-env.sh" ]; then
  bash "$APP_DIR/scripts/apply-moosyl-sandbox-prod-env.sh" || echo "WARN: Moosyl vault not applied"
fi

echo "=== Build API + workers ==="
docker compose -p yala build django django-replica django-replica-2 celery-worker celery-worker-2 celery-beat

echo "=== Rolling up ==="
docker compose -p yala up -d django django-replica django-replica-2 celery-worker celery-worker-2 celery-beat

echo "=== Wait django health ==="
for _ in $(seq 1 60); do
  st=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  [ "$st" = healthy ] && break
  sleep 3
done
echo "django_health=$st"

echo "=== Migrations ==="
docker compose -p yala exec -T django python manage.py wallet_reference_inventory
docker compose -p yala exec -T django python manage.py migrate --noinput

echo "=== Smoke ==="
curl -fsS https://api.yalataxi.live/health/
echo
code=$(curl -s -o /dev/null -w '%{http_code}' https://api.yalataxi.live/payments/options/)
echo "payments_options_anon_http=$code (expect 401 after G1)"

echo "G1_DEPLOY_DONE tag=${PRE_TAG}"
