# Yala Enterprise Handover — Environment Register

**Document ID:** HANDOVER-04  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Environments

| Environment | Purpose | Infrastructure | URL / access | Status |
|-------------|---------|----------------|--------------|--------|
| **Development** | Local feature development | Workstation; SQLite or local PostgreSQL; optional Redis | `http://localhost:8000` | Active |
| **Testing** | CI / Django test runner | SQLite in-memory; Celery eager mode | — | Active |
| **Staging** | Pre-production validation | Docker Compose (recommended separate host) | *Not configured* — suggest `staging.yalataxi.live` | **Not deployed** |
| **Production** | Live closed beta API + admin | DigitalOcean Droplet, Docker Compose | `api.yalataxi.live` | Active |
| **Pilot** | Nouakchott closed beta under caps | Same as production with soft-launch limits | Production URLs | Ready to activate |

---

## Domains

| Domain | Purpose | SSL | Environment |
|--------|---------|-----|-------------|
| `api.yalataxi.live` | Production API, WebSockets | Let's Encrypt | Production |
| `www.yalataxi.live` | React admin/web portal | Let's Encrypt | Production |
| `yalataxi.live` | Redirect / admin portal | Let's Encrypt | Production |
| `staging.yalataxi.live` | *Recommended* staging web | — | Not configured |
| `api-staging.yalataxi.live` | *Recommended* staging API | — | Not configured |

**Privacy:** https://www.yalataxi.live/privacy  
**Terms:** https://www.yalataxi.live/terms

---

## Servers

| Role | Detail | Notes |
|------|--------|-------|
| Production host | DigitalOcean Droplet `142.93.99.142` | `/opt/yala` |
| Spec | 4GB RAM recommended (2GB minimum) | Frankfurt/London region |
| PostgreSQL | `postgres:15-alpine` container | `max_connections=250` |
| Redis | `redis:7-alpine` container | AOF persistence |
| nginx | `nginx:alpine` container | TLS termination |
| Django/Daphne | 3 replicas | ASGI + WebSocket |
| Celery Workers | 2 replicas | 4 concurrency each |
| Celery Beat | 1 replica | DatabaseScheduler |

---

## Environment variables (names only)

### Docker Compose root (`.env`)

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password |

### Backend (`backend/taxi/.env.production`)

| Variable | Purpose |
|----------|---------|
| `DJANGO_SECRET_KEY` | Cryptographic signing key |
| `DJANGO_DEBUG` | Debug mode (must be `False` in prod) |
| `DJANGO_ALLOWED_HOSTS` | Allowed hostnames |
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL_REQUIRE` | Require SSL for DB connection |
| `REDIS_URL` | Redis cache connection |
| `CELERY_BROKER_URL` | Celery message broker |
| `CELERY_RESULT_BACKEND` | Celery result store |
| `JWT_ACCESS_TOKEN_MINUTES` | Access token lifetime |
| `JWT_REFRESH_TOKEN_DAYS` | Refresh token lifetime |
| `CORS_ALLOWED_ORIGINS` | CORS allow-list |
| `CSRF_TRUSTED_ORIGINS` | CSRF trusted origins |
| `EMAIL_BACKEND` | Email backend class |
| `EMAIL_HOST` | SMTP host |
| `EMAIL_PORT` | SMTP port |
| `EMAIL_HOST_USER` | SMTP username |
| `EMAIL_HOST_PASSWORD` | SMTP password |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `YALA_SMS_PROVIDER` | SMS provider identifier |
| `YALA_SMS_API_URL` | SMS API endpoint |
| `YALA_SMS_API_KEY` | SMS API key |
| `YALA_SMS_SENDER` | SMS sender name |
| `FIREBASE_CREDENTIALS_PATH` | Path to FCM service account JSON |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key |
| `APP_FEE_PERCENT` | Platform commission percentage |
| `PUBLIC_APP_URL` | Public web URL |
| `SENTRY_DSN` | Sentry error tracking DSN |
| `ADMIN_2FA_ENABLED` | Admin TOTP enforcement |
| `PLAY_INTEGRITY_*` | Android device attestation |
| `MAX_CONCURRENT_DEVICE_SESSIONS` | Device session limit |

**Full template:** `backend/taxi/.env.production.template`

### Frontend (`frontend/.env`)

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_URL` | Backend API base URL |
| `REACT_APP_PUBLIC_URL` | Public path prefix |

### Mobile apps

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_URL` | Backend API base URL |
| Firebase config keys | FCM (bundled in app) |
| Google Maps API key | Maps (bundled in app) |

---

## Secrets locations

| Secret | Location | Notes |
|--------|----------|-------|
| `DJANGO_SECRET_KEY` | `backend/taxi/.env.production` | Unique per environment; rotate on breach |
| `POSTGRES_PASSWORD` | Root `.env` + embedded in `DATABASE_URL` | Must match |
| Stripe keys | `.env.production` | Test keys for staging |
| Firebase service account | `backend/taxi/secrets/` or mounted path | **Never commit** |
| Google Maps API key | Backend env + mobile config | Restrict by referrer/package |
| SMTP password | `.env.production` | App-specific password |
| SMS API key | `.env.production` | Rotate regularly |
| Android signing keystores | `yala-release.jks`, `yala-upload-key.jks` | Secure vault only |
| Apple certificates | Xcode / App Store Connect | Secure vault |
| Production SSH keys | Operator machines | Restrict access |

---

## SSL

| Item | Detail |
|------|--------|
| Provider | Let's Encrypt |
| Termination | nginx container |
| Protocols | TLS 1.2, TLS 1.3 |
| HSTS | Enabled (`includeSubDomains`) |
| Auto-renewal | Certbot cron — verify weekly |
| Minimum validity alert | 30 days before expiry |

---

## Backup strategy

| Layer | Method | Frequency | Retention | Owner | Status |
|-------|--------|-----------|-----------|-------|--------|
| PostgreSQL | `pg_dump` gzip → `/var/backups/yala/postgres/` | Daily | 7 days local | DevOps | Script exists |
| Offsite DB | Upload to S3/DO Spaces | Daily | 30 days | DevOps | **P0 — not configured** |
| Redis | AOF + RDB snapshots | Continuous | Volume-based | DevOps | AOF enabled |
| Media files | `backend/taxi/media/` rsync | Daily | 30 days | DevOps | Partial |
| Source code | Git remote | Continuous | Full history | Engineering | Verify origin |
| Secrets | Secure vault (not git) | On change | — | DevOps | Manual |

**Scripts:** `scripts/backup-local.sh`, `scripts/backup-encrypted.sh`, `scripts/backup-monitor.sh`

**Reference:** `release/BACKUP_RESTORE_GUIDE.md`, `engineering/05_DEPLOYMENT_GUIDE.md`, `operations/08_SYSTEM_MAINTENANCE_MANUAL.md`

---

## Environment-specific notes

| Topic | Detail |
|-------|--------|
| Docker Postgres SSL | Compose pins `DATABASE_SSL_REQUIRE=False` for internal postgres |
| Managed DB migration | Set `DATABASE_SSL_REQUIRE=True`; update `DATABASE_URL` to provider hostname |
| Redis DB split | DB 0: Celery + Channels; DB 1: cache — consider splitting at scale |
| Frontend deploy | Always `npm run build` before deploy; nginx serves `frontend/build/` |
| Pending prod migrations | Phases 29–33 migrations may need `migrate` on production |

---

## Cross-references

- Deployment: `engineering/05_DEPLOYMENT_GUIDE.md`, `DEPLOYMENT.md`
- Docker Compose: `docker-compose.yml`
- Settings: `backend/taxi/taxi/settings.py`
- nginx: `nginx/nginx.conf`
- Disaster recovery: `handover/08_DISASTER_RECOVERY_SUMMARY.md`
- Local setup: `engineering/08_ENGINEERING_ONBOARDING.md`
