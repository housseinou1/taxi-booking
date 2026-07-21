#!/bin/bash
# Issue JWT for load tests without hitting nginx auth rate limits.
set -euo pipefail

EMAIL="${YALA_ADMIN_EMAIL:-sakho@admin.mr}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-yala}"
APP_DIR="${APP_DIR:-/opt/yala}"

cd "$APP_DIR"
docker compose -p "$COMPOSE_PROJECT" exec -T django python - <<PY
import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

user = get_user_model().objects.get(email="${EMAIL}")
import sys
sys.stdout.write(str(RefreshToken.for_user(user).access_token))
PY
