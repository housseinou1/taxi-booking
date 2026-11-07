#!/usr/bin/env bash
# =============================================================================
# YALA — rollback the frontend-only Admin redesign deploy.
#
# Restores the byte-exact previous SPA from a pre-deploy backup directory.
# No nginx reload and no container restart are required: the web root is a bind
# mount (/opt/yala/frontend/build -> /usr/share/nginx/html).
#
# usage: scripts/rollback-admin-redesign.sh /home/yala/pre-website-deploy-<STAMP>
#        scripts/rollback-admin-redesign.sh /home/yala/pre-admin-redesign-20261106-212901
# =============================================================================
set -euo pipefail

REMOTE="${YALA_PROD_HOST:-root@142.93.99.142}"
BACKUP_DIR="${1:?usage: $0 <backup-dir containing build/>}"
LIVE="/opt/yala/frontend/build"

ssh "${REMOTE}" "set -e
  [ -d ${BACKUP_DIR}/build ] || { echo 'ABORT: ${BACKUP_DIR}/build not found' >&2; exit 1; }
  rm -rf ${LIVE}
  cp -a ${BACKUP_DIR}/build ${LIVE}
  echo '--- restored index.html sha256 ---'
  sha256sum ${LIVE}/index.html | cut -c1-64
  if [ -f ${BACKUP_DIR}/live-index.sha256 ]; then
    echo '--- expected (from backup record) ---'
    head -1 ${BACKUP_DIR}/live-index.sha256 | cut -c1-64
  fi
  if [ -f ${BACKUP_DIR}/ROLLBACK-INFO.txt ]; then cat ${BACKUP_DIR}/ROLLBACK-INFO.txt; fi"

echo "--- live bundle after rollback ---"
curl -fsS "https://www.yalataxi.live/" | grep -o 'main\.[a-f0-9]*\.js'
