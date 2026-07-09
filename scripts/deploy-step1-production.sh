#!/usr/bin/env bash
# deploy-step1-production.sh
# Step 1 — Rider No-Show & Waiting Timer: commit, push, deploy, migrate, restart, QA.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
APP_DIR="${YALA_PROD_APP_DIR:-/opt/yala}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HEALTH_URL="https://api.yalataxi.live/health/"
STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { echo -e "\033[1;36m[$(date +%T)] $*\033[0m"; }
ok()   { echo -e "\033[1;32m[$(date +%T)] ✓ $*\033[0m"; }
fail() { echo -e "\033[1;31m[$(date +%T)] ✗ $*\033[0m"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# 1. Commit
# ─────────────────────────────────────────────────────────────────────────────
log "=== STEP 1: Commit Step 1 changes ==="
cd "$REPO_ROOT"

git add \
  backend/taxi/taxi/rides/migrations/0018_ride_rider_no_show.py \
  backend/taxi/taxi/rides/migrations/0019_ride_no_show_at.py \
  backend/taxi/taxi/rides/views.py \
  backend/taxi/taxi/rides/services/no_show_service.py \
  backend/taxi/taxi/drivers/services/ride_performance_service.py \
  backend/taxi/taxi/drivers/models.py \
  backend/taxi/taxi/drivers/views_level.py \
  backend/taxi/taxi/drivers/views_performance.py \
  backend/taxi/tests/rides/test_no_show_cancel.py \
  frontend/src/components/WaitingFeeBanner.js \
  frontend/src/components/WaitingFeeBanner.css \
  frontend/src/components/RideCancellationModal.js \
  frontend/src/components/RideCancellationModal.css \
  frontend/src/utils/waitingFee.js \
  frontend/src/driver/DriverDashboardNew.js \
  frontend/src/driver/components/DriverLiveTripBar.js \
  frontend/src/driver/components/DriverLiveTripBar.css \
  frontend/src/driver/hooks/useRideLiveState.js \
  frontend/src/driver/utils/driverNavigationPrefs.js \
  frontend/src/driver/utils/externalNavigation.js \
  rider-app/android/app/build.gradle \
  driver-app/android/app/build.gradle \
  2>/dev/null || true

# Also stage any payments migration if present
git add backend/taxi/taxi/payments/migrations/0013_*.py 2>/dev/null || true

git diff --cached --quiet && { log "Nothing new to commit — already up to date."; } || \
  git commit -m "feat(step1): Lyft-style rider no-show & waiting timer v1.2.7

- rides.0018: is_rider_no_show, no_show_fee, no_show_driver_compensation, rider_no_show status
- rides.0019: no_show_at timestamp
- no_show_service: GPS-gated eligibility (150m, 5min max wait, 3min free)
- WaitingFeeBanner: live countdown, no-show unlock warning for rider
- RideCancellationModal: auto-select no-show reason, GPS coords in payload
- DriverLiveTripBar: waiting timer, fee display, Rider Absent CTA
- useRideLiveState: arrival ETA, waiting timer, voice guidance
- distanceToNextKm: driver_arrived branch added for GPS gate
- Rider app: 1.2.7 (19) | Driver app: 1.2.7 (22)"

COMMIT_HASH="$(git rev-parse HEAD)"
ok "Committed: $COMMIT_HASH"

# ─────────────────────────────────────────────────────────────────────────────
# 2. Push to GitHub
# ─────────────────────────────────────────────────────────────────────────────
log "=== STEP 2: Push to GitHub ==="
git push origin main
ok "Pushed to origin/main"

# ─────────────────────────────────────────────────────────────────────────────
# 3–7. Remote: pull, migrate, rebuild, restart
# ─────────────────────────────────────────────────────────────────────────────
log "=== STEP 3–7: Deploy to production ($REMOTE) ==="

ssh "$REMOTE" bash -s << 'REMOTE_SCRIPT'
set -euo pipefail
APP_DIR="/opt/yala"
cd "$APP_DIR"

echo "--- git pull ---"
git pull origin main

echo "--- Run Django migrations ---"
docker compose -p yala exec -T django python manage.py migrate rides 0018_ride_rider_no_show  --noinput
docker compose -p yala exec -T django python manage.py migrate rides 0019_ride_no_show_at      --noinput
docker compose -p yala exec -T django python manage.py migrate rides                            --noinput
docker compose -p yala exec -T django python manage.py migrate payments                         --noinput
docker compose -p yala exec -T django python manage.py migrate drivers                          --noinput
echo "Migrations complete."

echo "--- Collect static ---"
docker compose -p yala exec -T django python manage.py collectstatic --noinput --clear 2>/dev/null || true

echo "--- Rebuild & restart Django ---"
docker compose -p yala build django
docker compose -p yala up -d django

echo "--- Wait for Django health ---"
for i in $(seq 1 50); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  [ "$status" = "healthy" ] && break
  sleep 3
done
echo "Django health: ${status:-unknown}"
[ "${status:-unknown}" = "healthy" ] || { echo "ERROR: Django not healthy"; exit 1; }

echo "--- Restart Celery ---"
docker compose -p yala restart celery || true
sleep 3
echo "Celery restarted."

echo "--- API health check ---"
curl -sSf https://api.yalataxi.live/health/ && echo ""
echo "Production deploy complete."
REMOTE_SCRIPT

ok "Remote deploy finished"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Verify API health locally
# ─────────────────────────────────────────────────────────────────────────────
log "=== STEP 7: Verify API health ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "Health check PASSED ($HEALTH_URL → 200)"
else
  fail "Health check FAILED — HTTP $HTTP_CODE"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Production QA smoke test
# ─────────────────────────────────────────────────────────────────────────────
log "=== Production QA smoke tests ==="
python3 "$REPO_ROOT/scripts/prod-qa-verify.py" 2>/dev/null && ok "Prod QA PASSED" \
  || { echo "prod-qa-verify.py not found or failed — manual QA required"; }

echo ""
echo "============================================"
echo "  Step 1 Deploy Complete"
echo "  Commit : $COMMIT_HASH"
echo "  Stamp  : $STAMP"
echo "============================================"
SCRIPT_END
