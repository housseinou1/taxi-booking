# DJANGO_SECRET_KEY Rotation — Maintenance Window

Run during low traffic. **All users must log in again** after rotation.

## Pre-checklist

- [ ] Announce maintenance (15–30 min window)
- [ ] Confirm `api.yalataxi.live/health/` is OK
- [ ] Backup `.env.production` on server
- [ ] Have team ready to verify login on Rider/Driver/Delivery apps

## Steps (production server)

```bash
ssh root@142.93.99.142

# 1. Generate a new key (50+ chars)
NEW_KEY=$(python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
echo "New key length: ${#NEW_KEY}"

# 2. Rotate (backs up env, updates key, restarts django + celery)
cd /opt/yala
bash scripts/rotate-production-secret-key.sh "$NEW_KEY"

# 3. Restart nginx if upstream was cached
docker compose -p yala restart nginx

# 4. Verify
curl -sS https://api.yalataxi.live/health/
docker compose -p yala exec -T django python manage.py check --deploy 2>&1 | grep security.W009 || echo "W009 cleared"

# 5. Smoke test login (use QA account)
curl -sS -X POST https://api.yalataxi.live/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"qa-rider-profile-fix@test.local","password":"QaRiderFix!2026"}'
```

## Rollback

```bash
cp /opt/yala/backend/taxi/.env.production.bak.TIMESTAMP /opt/yala/backend/taxi/.env.production
cd /opt/yala && docker compose -p yala up -d django celery-worker celery-beat
```

## Notes

- JWT refresh tokens signed with the old key will fail; users re-authenticate.
- Store the new key only in `.env.production` (never commit).
- `security.W009` from `check --deploy` should clear after rotation.
