# Yala Enterprise Handover — Dependency Register

**Document ID:** HANDOVER-03  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Backend runtime & frameworks

| Dependency | Version | Purpose | License |
|------------|:-------:|---------|---------|
| Python | 3.12 | Runtime | PSF |
| Django | 4.2.7 | Web framework, ORM, admin | BSD-3-Clause |
| Django REST Framework | 3.17.1 | REST API | BSD-3-Clause |
| djangorestframework-simplejwt | 5.5.1 | JWT authentication | MIT |
| django-cors-headers | 4.9.0 | CORS | MIT |
| django-filter | 23.5 | API filtering | BSD |
| drf-spectacular | 0.29.0 | OpenAPI schema (available) | BSD |
| django-crispy-forms | 2.3 | Form rendering | MIT |
| django-bootstrap-v5 | 1.0.11 | Admin styling | MIT |
| django-celery-beat | bundled | Scheduled tasks | BSD |
| asgiref | 3.11.1 | ASGI utilities | BSD |
| whitenoise | (in stack) | Static file serving | MIT |
| python-dotenv | 1.2.2 | Environment loading | BSD |
| dj-database-url | (in stack) | DATABASE_URL parsing | BSD |

---

## Async, real-time & task queue

| Dependency | Version | Purpose |
|------------|:-------:|---------|
| Celery | 5.6.3 | Background task queue |
| Redis (server) | 7 (Docker) | Broker, cache, Channels |
| Daphne | 4.2.1 | ASGI / WebSocket server |
| Channels | 4.3.2 | Django WebSocket support |
| channels-redis | (in stack) | Redis channel layer |
| autobahn | 25.12.2 | WebSocket protocol |
| Twisted | 25.5.0 | Async networking |
| msgpack | 1.1.2 | Serialization |

---

## Database & data processing

| Dependency | Version | Purpose |
|------------|:-------:|---------|
| PostgreSQL | 15 | Primary database |
| psycopg2-binary | 2.9.9 | PostgreSQL driver |
| pandas | 2.2.3 | Analytics / reporting |
| numpy | 2.1.1 | Numeric operations |
| matplotlib | 3.9.2 | Charts |
| pillow | 10.4.0 | Image processing (documents, POD) |

---

## Security & cryptography

| Dependency | Version | Purpose |
|------------|:-------:|---------|
| cryptography | 48.0.0 | Encryption, signatures |
| PyJWT | 2.12.1 | JWT handling |
| pyOpenSSL | 26.2.0 | SSL utilities |
| cffi | 2.0.0 | C bindings for crypto |

---

## Payments & HTTP clients

| Dependency | Version | Purpose |
|------------|:-------:|---------|
| stripe | 15.1.0 | Card payment processing |
| requests | 2.32.3 | External HTTP calls |
| urllib3 | 2.2.2 | HTTP client |
| certifi | 2024.8.30 | CA bundle |

---

## Frontend (React SPA)

| Dependency | Version | Purpose |
|------------|:-------:|---------|
| React | 18.x | UI framework |
| react-scripts / CRA | 5.x | Build toolchain |
| (see `frontend/package.json`) | — | Full dependency tree |

**Location:** `frontend/package.json`

---

## Mobile (Capacitor / Ionic)

| Technology | Purpose | Location |
|------------|---------|----------|
| Ionic Framework | Mobile UI components | `rider-app/`, `driver-app/`, `delivery-app/` |
| Capacitor | Native bridge (Android/iOS) | Same |
| Android Gradle Plugin | Android builds | `*/android/` |
| Firebase SDK | FCM push | Mobile app configs |
| Google Maps SDK | Maps on device | Mobile app configs |

**Locations:** `rider-app/package.json`, `driver-app/package.json`, `delivery-app/package.json`

---

## Infrastructure & DevOps

| Dependency | Version | Purpose |
|------------|:-------:|---------|
| Docker Engine | current | Container runtime |
| Docker Compose | current | Multi-container orchestration |
| nginx | alpine | Reverse proxy, SSL, static |
| Git | current | Source control |
| black | 25.1.0 | Python formatter |
| certbot / Let's Encrypt | current | SSL certificates |

**Files:** `docker-compose.yml`, `nginx/nginx.conf`, `backend/taxi/Dockerfile`

---

## Third-party APIs & external services

| Service | Purpose | Config location | Owner |
|---------|---------|-----------------|-------|
| **Firebase Cloud Messaging** | Push notifications to mobile apps | `FIREBASE_CREDENTIALS_PATH` | Engineering |
| **Google Maps Platform** | Maps, geocoding, routing (web + mobile) | `GOOGLE_MAPS_API_KEY` | Engineering |
| **Stripe** | Card payment authorization/capture | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Finance |
| **Bankily** | Mauritania mobile money | Payment provider integration | Finance |
| **Sedad** | Mauritania mobile money | Payment provider integration | Finance |
| **Masravi / Masrvi** | Mauritania mobile money | Payment provider integration | Finance |
| **SMTP (Gmail)** | Transactional email | `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | Engineering |
| **SMS provider** | OTP, notifications | `YALA_SMS_*` env vars | Engineering |
| **Let's Encrypt** | SSL certificate issuance | nginx + certbot | DevOps |
| **Google Play Console** | Android app distribution | Play Console | Product |
| **Apple App Store Connect** | iOS distribution | App Store Connect | Product |
| **Sentry** | Error tracking & APM | `SENTRY_DSN` | Engineering |
| **DigitalOcean** | Production VPS hosting | Droplet `142.93.99.142` | DevOps |

---

## CI/CD (GitHub Actions)

| Workflow | Purpose | File |
|----------|---------|------|
| iOS Rider build | Capacitor iOS build pipeline | `.github/workflows/ios-rider.yml` |
| iOS Driver build | Capacitor iOS build pipeline | `.github/workflows/ios-driver.yml` |
| iOS Delivery build | Capacitor iOS build pipeline | `.github/workflows/ios-delivery.yml` |

**Note:** Backend/frontend production deploy is manual (SSH + Docker Compose). No automated CD to production yet.

---

## Repository file locations

| Asset | Path |
|-------|------|
| Python dependencies | `requirements.txt` |
| Frontend dependencies | `frontend/package.json` |
| Rider app | `rider-app/package.json` |
| Driver app | `driver-app/package.json` |
| Delivery app | `delivery-app/package.json` |
| Docker stack | `docker-compose.yml` |
| Backend Dockerfile | `backend/taxi/Dockerfile` |
| nginx config | `nginx/nginx.conf` |
| Env template | `backend/taxi/.env.production.template` |

---

## Upgrade & support notes

| Component | Notes |
|-----------|-------|
| Django 4.2 | LTS supported through ~April 2026; plan upgrade to 5.x |
| Celery 5.6 + Redis 7 | Stable; monitor Celery 6 release |
| React 18 | Current; evaluate React 19 after Capacitor compatibility |
| Stripe 15.x | Verify API version before upgrading |
| PostgreSQL 15 | Supported; consider managed DB for scale |
| Python 3.12 | Current production runtime |

**Action:** Generate SBOM before public launch — `pip-licenses` + `npm-license-crawler` → `THIRD_PARTY_LICENSES.txt`

---

## Cross-references

- License summary: `handover/07_LICENSE_AND_COMPLIANCE.md`
- Environment variables: `handover/04_ENVIRONMENT_REGISTER.md`
- Architecture stack: `engineering/01_SYSTEM_ARCHITECTURE.md`
- Dependency deep-dive: `handover/03_DEPENDENCY_REGISTER.md` (this doc)
