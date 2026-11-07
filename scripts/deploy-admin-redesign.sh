#!/usr/bin/env bash
# =============================================================================
# YALA — Coordinated release WEB build upload (one step; backend deploy is separate)
#
#   * swaps the static SPA only (/opt/yala/frontend/build -> /usr/share/nginx/html)
#   * NO backend deploy, NO collectstatic, NO migrations, NO container restart
#   * NO Moosyl / payments backend, NO webhook registration
#   * refuses to run on an admin-stamped or Moosyl-carrying bundle
#
# usage: scripts/deploy-admin-redesign.sh <path-to-verified-frontend/build>
# =============================================================================
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
LIVE="/opt/yala/frontend/build"
SRC="${1:-}"

if [ -z "${SRC}" ]; then
  echo "usage: $0 <path-to-verified-frontend/build>" >&2
  exit 2
fi
[ -f "${SRC}/index.html" ] || { echo "ABORT: ${SRC}/index.html not found" >&2; exit 1; }

# ── 1. Release gates ─────────────────────────────────────────────────────────
BUNDLE=$(grep -o 'main\.[a-f0-9]*\.js' "${SRC}/index.html" | head -1)
[ -n "${BUNDLE}" ] || { echo "ABORT: no hashed bundle referenced by index.html" >&2; exit 1; }
JS="${SRC}/static/js/${BUNDLE}"

grep -q 'REACT_APP_TYPE:"web"'   "${JS}" || { echo "ABORT: bundle is not stamped REACT_APP_TYPE=web" >&2; exit 1; }
if grep -q 'REACT_APP_TYPE:"admin"' "${JS}"; then
  echo "ABORT: ADMIN-stamped Capacitor artifact must never go to the public website" >&2; exit 1
fi
grep -q 'yah-kpi' "${JS}"        || { echo "ABORT: redesigned Admin home not present in bundle" >&2; exit 1; }
if ! grep -rq 'moosyl-panel\|Moosyl payments' "${SRC}/static/js"; then
  echo "ABORT: Moosyl Finance panel missing from web build" >&2; exit 1
fi

echo "Release gates PASS"
echo "  bundle        : ${BUNDLE}"
echo "  index.html    : $(sha256sum "${SRC}/index.html" | cut -c1-64)"
echo "  bundle sha256 : $(sha256sum "${JS}" | cut -c1-64)"

# ── 2. Verified server-side backup of the live frontend ──────────────────────
STAMP=$(date +%Y%m%d-%H%M%S)
ssh "${REMOTE}" "set -e
  DIR=/home/yala/pre-website-deploy-${STAMP}
  mkdir -p \"\$DIR\"
  cp -a ${LIVE} \"\$DIR/build\"
  sha256sum ${LIVE}/index.html >  \"\$DIR/live-index.sha256\"
  sha256sum \"\$DIR/build/index.html\" >> \"\$DIR/live-index.sha256\"
  if [ \"\$(head -1 \"\$DIR/live-index.sha256\" | cut -c1-64)\" = \"\$(tail -1 \"\$DIR/live-index.sha256\" | cut -c1-64)\" ]; then
    echo BACKUP_VERIFY=OK; else echo BACKUP_VERIFY=MISMATCH; exit 1; fi
  echo BACKUP_DIR=\$DIR"

# ── 3. Upload WITHOUT --delete ───────────────────────────────────────────────
# Stale content-hashed bundles are deliberately preserved: clients holding a
# cached index.html / service worker would otherwise 404 and white-screen.
rsync -a --itemize-changes "${SRC}/" "${REMOTE}:${LIVE}/"

# ── 4. Verify what is actually served ────────────────────────────────────────
sleep 2
echo "--- live bundle now ---"
curl -fsS "https://www.yalataxi.live/" | grep -o 'main\.[a-f0-9]*\.js'
echo
echo "Deploy complete. Hard-refresh https://yalataxi.live/admin (Ctrl+Shift+R)."
