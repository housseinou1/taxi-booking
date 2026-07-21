#!/bin/bash
# Generate daily soft-launch reports on production (Phase 19).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/yala}"
OUTPUT_DIR="${SOFT_LAUNCH_REPORT_DIR:-/home/yala/reports/soft-launch}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-yala}"
REPORT="${1:-all}"

cd "$APP_DIR"
mkdir -p "$OUTPUT_DIR"

docker compose -p "$COMPOSE_PROJECT" exec -T django python manage.py generate_soft_launch_reports \
  --output-dir /tmp/soft-launch-reports \
  --report "$REPORT"

docker compose -p "$COMPOSE_PROJECT" cp "django:/tmp/soft-launch-reports/." "$OUTPUT_DIR/" 2>/dev/null || true

echo "Reports written to $OUTPUT_DIR"
ls -la "$OUTPUT_DIR" | tail -12
