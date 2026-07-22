# YALA Enterprise v1.0 — LC1 Release Artifacts

**Document ID:** LC1-ARTIFACTS-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-lc1

---

## Version matrix (verified in source)

| Component | versionName | versionCode | Package ID | Source file |
|-----------|-------------|:-----------:|------------|-------------|
| Yala Rider | **1.2.7** | **19** | `com.yala.rider.mr` | `rider-app/android/app/build.gradle` |
| Yala Driver | **1.2.23** | **38** | `com.yala.driver.mr` | `driver-app/android/app/build.gradle` |
| Yala Delivery | **1.0.4** | **6** | `com.yala.delivery.mr` | `delivery-app/android/app/build.gradle` |
| Admin mobile | 1.0.0 | 1 | (internal) | `admin-app/android/app/build.gradle` |
| Backend API | v1.0.0 | — | Docker image | `backend/taxi/Dockerfile` |
| Frontend SPA | v1.0.0 | — | Static build | `frontend/build/` |

**Version consistency:** Mobile Gradle versions match documented LC1 targets in `RC1_RELEASE_NOTES.md` and `KNOWN_ISSUES_v1.0.0.md`.

---

## Android Release APK (signed)

| App | Status | Artifact path | Build date |
|-----|:------:|---------------|------------|
| Yala Rider 1.2.7 (19) | ✅ Available | `release/android/yala-rider-1.2.7-19-20260720-203407.apk` | 2026-07-20 |
| Yala Driver 1.2.23 (38) | ✅ Available | `release/android/yala-driver-1.2.23-38-20260720-203407.apk` | 2026-07-20 |
| Yala Delivery 1.0.4 (6) | ⚠ Partial | No recent APK in `release/android/`; AAB only | 2026-07-07 |

**Alternate (newer driver build):** `yala-driver-1.2.23-38-20260721-000235.apk`

**Rebuild status:** ⚠ **Pending** — `signing/credentials.env` not present in workspace. Rebuild required from LC1 commit to include latest backend-facing fixes.

**Rebuild command:**
```bash
bash scripts/build-android-release.sh all
```

---

## Android AAB (Play Console upload)

| App | Status | Artifact path |
|-----|:------:|---------------|
| Yala Rider 1.2.7 (19) | ✅ | `release/android/yala-rider-1.2.7-19-20260720-203407.aab` |
| Yala Driver 1.2.23 (38) | ✅ | `release/android/yala-driver-1.2.23-38-20260720-203407.aab` |
| Yala Delivery 1.0.4 (6) | ✅ | `release/android/yala-delivery-1.0.4-6-20260707-093848.aab` |

---

## Production backend image

| Item | Status | Evidence |
|------|:------:|----------|
| Dockerfile | ✅ | `backend/taxi/Dockerfile` — Python 3.12, Daphne ASGI |
| Compose stack | ✅ | `docker-compose.yml` — 3× Django, postgres, redis, 2× celery-worker, celery-beat, nginx |
| Image built on prod | ☐ | Requires SSH to `142.93.99.142` |
| LC1 code deployed | ❌ | UAT-D-006 — latest fixes not on production |
| Migrations current | ⚠ | `makemigrations --check` PASS locally; prod migration state unverified |

**Deploy command:**
```bash
cd /opt/yala
git checkout release/v1.0-rc1
docker compose -p yala build django celery-worker celery-beat
docker compose -p yala run --rm django python manage.py migrate --noinput
docker compose -p yala up -d
```

---

## Frontend production build

| Item | Status | Evidence |
|------|:------:|----------|
| Build exists | ✅ | `frontend/build/index.html` present |
| Asset manifest | ✅ | `frontend/build/asset-manifest.json` — main.js `main.54c39f8b.js` |
| Build date | 2026-07-22 | From prior RC1 build session |
| Deployed to prod | ☐ | Requires deploy script execution |

**Build command:**
```bash
cd frontend && npm ci && npm run build
bash scripts/deploy-production-frontend.sh
```

---

## Artifact readiness summary

| Artifact | Ready for LC1? | Blocker |
|----------|:--------------:|---------|
| Rider APK/AAB | ⚠ Use existing; rebuild recommended | Signing credentials |
| Driver APK/AAB | ⚠ Use existing; rebuild recommended | Signing credentials |
| Delivery AAB | ⚠ Stale (2026-07-07) | Rebuild + signing |
| Backend image | ❌ Not deployed with LC1 code | UAT-D-006 |
| Frontend build | ✅ Built locally | Deploy pending |

---

## iOS

**Not applicable** — iOS not in v1.0 scope (ISSUE-V1-P1-003).

---

## Related

- [LC1_HANDOFF.md](./RC1_HANDOFF.md) (RC1 handoff — superseded for LC1 by this doc)
- [LC1_CODE_FREEZE.md](./LC1_CODE_FREEZE.md)
- [LC1_DECISION.md](./LC1_DECISION.md)
