#!/usr/bin/env bash
# YALA — pre-deployment frontend backup + rollback record
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
DIR="/home/yala/pre-website-deploy-${STAMP}"
LIVE="/opt/yala/frontend/build"

mkdir -p "$DIR"
cp -a "$LIVE" "$DIR/build"

LIVE_SHA="$(sha256sum "$LIVE/index.html" | cut -d' ' -f1)"
COMMIT="$(cd /opt/yala && git rev-parse --short HEAD)"
BUNDLE="$(basename "$(ls "$LIVE"/static/js/main.*.js | head -1)")"

{
  echo "YALA website pre-deployment backup"
  echo "taken:            $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "live commit:      ${COMMIT}"
  echo "live index.html:  ${LIVE_SHA}"
  echo "live bundle:      ${BUNDLE}"
  echo ""
  echo "ROLLBACK PROCEDURE"
  echo "  1. rm -rf ${LIVE}"
  echo "  2. cp -a ${DIR}/build ${LIVE}"
  echo "  3. verify: sha256sum ${LIVE}/index.html"
  echo "     expect: ${LIVE_SHA}"
  echo "  4. nginx serves the bind mount directly - no reload required"
} > "$DIR/ROLLBACK-INFO.txt"

echo "BACKUP_DIR=${DIR}"
du -sh "$DIR"
echo "--- ROLLBACK-INFO.txt ---"
cat "$DIR/ROLLBACK-INFO.txt"
echo "--- contents ---"
ls -la "$DIR"
