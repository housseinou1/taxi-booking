#!/usr/bin/env bash
# Deploy Yala web frontend (Admin + shared auth) to live nginx stack at /opt/yala.
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo "=== Build production frontend ==="
cd "${REPO_ROOT}/frontend"
cp -f .env.production.example .env.production
export CI=false
export GENERATE_SOURCEMAP=false
npm run build

echo "=== Upload to ${REMOTE}:/opt/yala/frontend/build ==="
ssh "${REMOTE}" "mkdir -p /opt/yala/frontend/build"
rsync -a --delete "${REPO_ROOT}/frontend/build/" "${REMOTE}:/opt/yala/frontend/build/"

echo "=== Update nginx config ==="
scp "${REPO_ROOT}/nginx/nginx.conf" "${REMOTE}:/opt/yala/nginx/nginx.conf"
ssh "${REMOTE}" "docker exec yala-nginx-1 nginx -t && docker exec yala-nginx-1 nginx -s reload"

echo "=== Live bundle ==="
ssh "${REMOTE}" "grep -o 'main\\.[^\\\"]*\\.js' /opt/yala/frontend/build/index.html; head -1 /opt/yala/frontend/build/sw.js"

echo "=== Optional login smoke (set YALA_TEST_EMAIL / YALA_TEST_PASSWORD) ==="
if [ -n "${YALA_TEST_EMAIL:-}" ] && [ -n "${YALA_TEST_PASSWORD:-}" ]; then
  python3 "${REPO_ROOT}/scripts/test-prod-login.py" || true
fi

echo "Deploy complete (${STAMP}). Hard-refresh desktop browser: Ctrl+Shift+R on https://yalataxi.live/admin"
