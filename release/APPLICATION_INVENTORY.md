# YALA Enterprise v1.0 Application Inventory

**Document ID:** YALA-REL-APP-INV-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0  
**Golden commit:** `f6ffdcb4` — `release: YALA Enterprise v1.0.0 golden release candidate`  
**Validation method:** Repository inspection, artifact verification, live production health checks, core regression run

---

## Validation Sources

| Source | Path / endpoint |
|--------|-----------------|
| Native wrappers | `rider-app/`, `driver-app/`, `delivery-app/`, `admin-app/` |
| Android configs | `*/android/app/build.gradle` |
| Capacitor configs | `*/capacitor.config.ts` |
| Store metadata | `store-listings/`, `release/play-store/` |
| Release artifacts | `release/android/` |
| Frontend build | `frontend/build/` |
| Backend | `backend/taxi/`, `docker-compose.yml` |
| Production API | https://api.yalataxi.live/api/health/ready/ |

---

## Inventory Summary

| Application | v1.0 inclusion | Publishable artifact | Platform form | Status |
| --- | --- | --- | --- | --- |
| Yala Rider | ✅ Yes | ✅ Yes | Android wrapper + web SPA | **READY WITH CONDITIONS** |
| Yala Driver | ✅ Yes | ✅ Yes | Android wrapper + web SPA | **READY WITH CONDITIONS** |
| Yala Delivery | ✅ Yes | ⚠ Partial | Android wrapper + web SPA | **PENDING** |
| Yala Real Estate Tenant | ❌ Not in repo | ❌ No | No native wrapper | **BLOCKED — N/A v1.0** |
| Yala Real Estate Landlord | ❌ Not in repo | ❌ No | Academy audience tag only | **BLOCKED — N/A v1.0** |
| Yala Real Estate Collector | ❌ Not in repo | ❌ No | Academy audience tag only | **BLOCKED — N/A v1.0** |
| Yala Real Estate Supervisor | ❌ Not in repo | ❌ No | Academy audience tag only | **BLOCKED — N/A v1.0** |
| Yala Real Estate Maintenance | ❌ Not in repo | ❌ No | Academy audience tag only | **BLOCKED — N/A v1.0** |
| Admin Portal | ✅ Yes | ⚠ Partial | Android wrapper + web admin | **PENDING** |
| CEO Dashboard | ✅ Yes | ✅ Yes (web) | Admin route `/admin/ceo-master` | **READY AS ADMIN MODULE** |

---

## Publishable Native Apps

| App | Capacitor appId | Android applicationId | versionName / code | Latest verified artifact |
| --- | --- | --- | --- | --- |
| Yala Rider | `com.yala.rider.mr` | `com.yala.rider.mr` | **1.2.7** / 19 | `release/android/yala-rider-1.2.7-19-20260720-231255.aab` (11.9 MB, 2026-07-20) + matching `.apk` (13.8 MB) |
| Yala Driver | `com.yala.driver.mr` | `com.yala.driver.mr` | **1.2.23** / 38 | `release/android/yala-driver-1.2.23-38-20260721-000235.aab` (12.1 MB, 2026-07-21) + matching `.apk` (14.1 MB) |
| Yala Delivery | `com.yala.delivery.mr` | `com.yala.delivery.mr` | **1.0.4** / 6 | `release/android/yala-delivery-1.0.4-6-20260707-121438-original-upload-key.aab` (12.0 MB, **2026-07-07 — stale**) |
| Admin Portal | `com.yala.admin.mr` | `com.yala.admin.mr` | **1.0.0** / 1 | ❌ No signed release AAB/APK in `release/android/` |

**Version note:** Mobile apps retain Play Store `versionName` for upgrade continuity. They ship as part of the **Enterprise 1.0.0** golden bundle — platform version is 1.0.0; store version labels differ by design.

---

## Web / Admin Applications

| Surface | Route | Artifact | Status |
| --- | --- | --- | --- |
| Admin Portal | `/admin`, `/admin-dashboard` | `frontend/build/` (2026-07-22) | **READY WITH CONDITIONS** — deploy pending |
| CEO Dashboard | `/admin/ceo-master`, `/admin/ceo` | `frontend/build/` | **READY AS ADMIN MODULE** |
| Operations Command | `/admin/launch`, `/admin/operations-command` | `frontend/build/` | **READY** |
| Finance Ops | `/admin/finance-ops`, `/admin/payments` | `frontend/build/` | **READY** |

---

## Real Estate Scope Finding

The requested Real Estate Tenant, Landlord, Collector, Supervisor, and Maintenance apps are **not present as standalone publishable applications** in the v1.0 repository.

| Evidence | Finding |
|----------|---------|
| Native wrappers | No `tenant-app`, `landlord-app`, `collector-app`, `supervisor-app`, or `maintenance-app` directories |
| Android package IDs | None found for Real Estate roles |
| `frontend/src/admin/academy/AcademyCenter.js` | `supervisor`, `collector`, `landlord`, `maintenance` are training audience values, not store apps |
| `release/V1_FINAL_CERTIFICATION.md` | Real Estate marked N/A for v1.0 |
| `release/UAT_TEST_PLAN.md` | Real Estate product surface out of scope |

**Release interpretation:** Do not publish Real Estate standalone apps in v1.0. Creating those wrappers would be feature development and is outside the release freeze.

---

## Store Readiness Snapshot (Phase 2)

| App | Icon | Splash | Version 1.0.0 | Privacy URL | Terms URL | Account deletion | Support email | Support website | Package ID | Release notes | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rider | ✅ | ✅ | ⚠ Store continuity `1.2.7` | ✅ 200 | ✅ 200 | ⚠ In-app + Play attestation | ✅ `support@yalataxi.live` | ✅ `yalataxi.live` | ✅ | ⚠ Stale label (`v1.2.2`) | **READY WITH CONDITIONS** |
| Driver | ✅ | ✅ | ⚠ Store continuity `1.2.23` | ✅ 200 | ✅ 200 | ⚠ In-app + Play attestation | ⚠ `drivers@yala.mr` (not centralized) | ✅ `yalataxi.live` | ✅ | ⚠ Stale label (`v1.1.3`) | **READY WITH CONDITIONS** |
| Delivery | ✅ | ✅ | ⚠ `1.0.4` (not literal 1.0.0) | ✅ 200 | ✅ 200 | ⚠ In-app + Play attestation | ❌ Missing in listing | ✅ `yalataxi.live` | ✅ | ⚠ Stale label (`v1.0.1`) | **PENDING** |
| Admin Portal | ✅ | ✅ | ✅ `1.0.0` | ⚠ No store listing | ⚠ No store listing | ⚠ In-app only | ❌ Missing | ✅ `yalataxi.live` | ✅ | ❌ Missing | **PENDING** |
| CEO Dashboard | N/A | N/A | ✅ Platform 1.0.0 | Covered by Admin | Covered by Admin | Covered by Admin | Covered by Admin | ✅ | N/A | N/A | **READY AS ADMIN MODULE** |
| Real Estate (×5) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **BLOCKED** |

### Live URL validation (2026-07-22)

| URL | HTTP status |
|-----|:-----------:|
| https://api.yalataxi.live/api/health/ready/ | **200** — `database: ok`, `redis: ok` |
| https://www.yalataxi.live/privacy | **200** |
| https://www.yalataxi.live/terms | **200** |
| https://yalataxi.live/account-deletion | **200** |

### Store readiness gaps

| Gap | Apps affected |
|-----|---------------|
| Play Console Data Safety form incomplete | Rider, Driver, Delivery |
| Account deletion Play attestation unverified | Rider, Driver, Delivery |
| Screenshots / feature graphics not uploaded | Rider, Driver, Delivery |
| Release notes version labels stale vs current builds | Rider, Driver, Delivery |
| Support email not on every listing | Driver (`drivers@yala.mr`), Delivery, Admin |
| Admin store listing package missing | Admin Portal |
| Literal `versionName` 1.0.0 on Play | Rider, Driver, Delivery (by design — enterprise 1.0.0, store continuity versions) |

---

## Release Artifact Snapshot (Phase 3)

| Artifact | Status | Evidence |
| --- | --- | --- |
| Rider signed Android AAB | ✅ **READY** | `release/android/yala-rider-1.2.7-19-20260720-231255.aab` |
| Rider signed APK (internal testing) | ✅ **READY** | `release/android/yala-rider-1.2.7-19-20260720-231255.apk` |
| Driver signed Android AAB | ✅ **READY** | `release/android/yala-driver-1.2.23-38-20260721-000235.aab` |
| Driver signed APK (internal testing) | ✅ **READY** | `release/android/yala-driver-1.2.23-38-20260721-000235.apk` |
| Delivery signed Android AAB | ⚠ **PENDING** | AAB exists but dated **2026-07-07** — predates golden commit |
| Delivery signed APK | ❌ **PENDING** | No recent signed release APK in `release/android/` |
| Admin signed AAB/APK | ❌ **BLOCKED** | No signed release artifact found |
| Backend deployment package | ⚠ **PENDING** | `release/phase2-backend-deploy.zip` (46 KB, **2026-07-08**) — stale vs golden commit |
| Frontend production build | ✅ **READY** | `frontend/build/index.html` (**2026-07-22**) |
| Frontend deploy archive | ⚠ **PENDING** | `release/frontend-prod-deploy.zip` (**2026-07-08**) — stale |
| Environment templates | ✅ **READY** | `backend/taxi/.env.production.template`, `backend/taxi/.env.example`, `frontend/.env.production.example` |
| Database migration package | ✅ **READY** | 180 migration files; `makemigrations --check` **PASS** (2026-07-22) |

---

## Code Validation (2026-07-22)

| Check | Result |
|-------|:------:|
| Core regression (`tests.operations` … `tests.payments`) | **256/256 OK** (300.8s) |
| Launch context baseline | 235/235 (suite grew; 256 validated today) |
| `makemigrations --check` | **PASS** |
| P0 code blockers | **0** |
| Golden commit on `main` | **`f6ffdcb4`** ✅ |
| Tag `v1.0.0-rc-final` | ❌ Not applied (tags present: `v1.0.0-rc1`, `v1.0.0-rc2`) |
| Production smoke | **34/40 PASS** — see [device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md](./device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md) |
| Golden code deployed to production | ❌ Pending |

---

## Inventory Decision

| Launch target | Decision |
|---------------|----------|
| Rider + Driver closed/internal testing | **GO WITH CONDITIONS** |
| Delivery publish | **PENDING** — rebuild signed AAB/APK |
| Admin Android publish | **BLOCKED** — build/sign or declare web-only |
| Real Estate standalone apps | **NO GO** — not in v1.0 |
| CEO Dashboard | **READY** — via Admin web module |
| Google Play production | **NOT READY** |

**Overall:** v1.0 publishable package is **GO WITH CONDITIONS** for Rider and Driver; **PENDING** for Delivery and Admin; **BLOCKED** for Real Estate standalone apps.
