#!/bin/bash
# Install daily soft-launch report cron (07:00 UTC CEO, Monday weekly exec).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yala}"
SCRIPT="$APP_DIR/scripts/soft-launch-daily-reports.sh"
CRON_USER="${CRON_USER:-root}"

chmod +x "$SCRIPT"
DAILY="0 7 * * * $SCRIPT all >> /home/yala/reports/soft-launch/cron.log 2>&1"
WEEKLY="0 8 * * 1 $SCRIPT weekly-exec >> /home/yala/reports/soft-launch/cron.log 2>&1"

mkdir -p /home/yala/reports/soft-launch
(crontab -u "$CRON_USER" -l 2>/dev/null || true) | grep -v "soft-launch-daily-reports" | { cat; echo "$DAILY"; echo "$WEEKLY"; } | crontab -u "$CRON_USER" -
echo "Installed soft-launch report cron:"
crontab -u "$CRON_USER" -l | grep soft-launch
