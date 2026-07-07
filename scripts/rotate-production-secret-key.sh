#!/usr/bin/env bash
# Rotate DJANGO_SECRET_KEY on production during a maintenance window.
#
# Effects:
# - All existing JWT refresh tokens become invalid (users must log in again)
# - Session cookies signed with old key stop working
# - Run during low-traffic window; announce app downtime if needed
#
# Usage (on production server as root):
#   NEW_KEY="$(python3 -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())')"
#   bash scripts/rotate-production-secret-key.sh "$NEW_KEY"

set -euo pipefail

NEW_KEY="${1:-}"
ENV_FILE="${ENV_FILE:-/opt/yala/backend/taxi/.env.production}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/yala}"

if [[ -z "$NEW_KEY" || ${#NEW_KEY} -lt 50 ]]; then
  echo "Usage: $0 <new-secret-key-50plus-chars>"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
echo "Backed up env to $BACKUP"

if grep -q '^DJANGO_SECRET_KEY=' "$ENV_FILE"; then
  sed -i "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=${NEW_KEY}|" "$ENV_FILE"
else
  echo "DJANGO_SECRET_KEY=${NEW_KEY}" >> "$ENV_FILE"
fi

echo "Updated DJANGO_SECRET_KEY in $ENV_FILE"

cd "$COMPOSE_DIR"
docker compose -p yala up -d django celery-worker celery-beat

for _ in $(seq 1 40); do
  status=$(docker inspect yala-django-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo missing)
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  sleep 3
done

echo "django health: ${status:-unknown}"
curl -sS https://api.yalataxi.live/health/ && echo
docker compose -p yala exec -T django python manage.py check --deploy 2>&1 | grep -E 'security\.W009|System check identified' || true

echo "SECRET_KEY rotation complete. Users must log in again."
