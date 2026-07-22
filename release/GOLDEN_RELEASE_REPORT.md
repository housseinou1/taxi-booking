# YALA Enterprise v1.0.0 — Golden Release Report

**Document ID:** GOLDEN-RELEASE-001  
**Date:** 2026-07-22  
**Platform version:** YALA Enterprise **1.0.0**  
**Target tag:** `v1.0.0-rc-final`  
**Pre-golden commit:** `3c7d20832d061508597afd768ec24929d38ff3c1`  
**Status:** **GOLDEN PACKAGE ASSEMBLED** — tag pending commit

---

## Executive summary

The YALA Enterprise v1.0.0 Golden Release packages all RC/LC1 stabilization work into a production-ready bundle. **Code regression passes (256/256).** Production smoke is **34/40**. Store certification and version lock **pending** uncommitted snapshot commit and Play Console attestation.

---

## Version

| Field | Value |
|-------|-------|
| Enterprise release | **1.0.0** |
| Git tag (target) | `v1.0.0-rc-final` |
| Git tag (applied) | ❌ Pending commit |
| Base commit | `3c7d2083` |
| Branch | `main` (uncommitted golden changes) |
| Market | Nouakchott, Mauritania |

### Component versions

| Component | versionName | versionCode | Package ID |
|-----------|-------------|:-----------:|------------|
| Backend API | 1.0.0 | — | Docker `backend/taxi` |
| Frontend SPA | 1.0.0 | — | Static `frontend/build/` |
| Yala Rider | 1.2.7 | 19 | `com.yala.rider.mr` |
| Yala Driver | 1.2.23 | 38 | `com.yala.driver.mr` |
| Yala Delivery | 1.0.4 | 6 | `com.yala.delivery.mr` |

Mobile apps retain Play Store `versionName` for upgrade continuity; they ship as part of the **Enterprise 1.0.0** golden bundle.

---

## Test summary

### Local regression (2026-07-22)

| Suite | Result | Duration |
|-------|:------:|---------:|
| `tests.operations` | ✅ PASS | — |
| `tests.academy` | ✅ PASS | — |
| `tests.api_gateway` | ✅ PASS | — |
| `tests.rides` | ✅ PASS | — |
| `tests.drivers_app` | ✅ PASS | — |
| `tests.deliveries` | ✅ PASS | — |
| `tests.payments` | ✅ PASS | — |
| **Total** | **256/256 OK** | 486.9s |

| Check | Result |
|-------|:------:|
| `makemigrations --check` | ✅ PASS |
| P0 code blockers | ✅ 0 open |

### Production smoke (2026-07-22 13:20 UTC)

| Area | Result |
|------|:------:|
| Overall | **34/40 PASS** |
| Authentication | ✅ PASS |
| Ride book/accept | ✅ PASS |
| Ride complete (API) | ❌ Geofence 400 (smoke harness) |
| Delivery request | ❌ HTTP 400 |
| Admin / Finance | ✅ PASS |
| Security | ✅ PASS |
| Stability | ✅ PASS |

Report: [device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md](./device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md)

### Regression matrix

| Workflow | Unit tests | Prod smoke | Device |
|----------|:----------:|:----------:|:------:|
| Authentication | ✅ | ✅ | ⚠ Historical |
| Permissions | ✅ | ✅ | ☐ |
| Ride flow | ✅ | ⚠ Partial | ✅ Historical |
| Driver flow | ✅ | ⚠ Partial | ⚠ Mixed |
| Delivery flow | ✅ | ❌ | ⚠ RC4 partial |
| Merchant flow | ✅ (ops) | ☐ | ☐ |
| Real Estate | N/A | N/A | N/A |
| Admin | ✅ | ✅ | ✅ URL 200 |
| CEO Dashboard | ✅ | ⚠ API only | ✅ URL 200 |
| Finance | ✅ | ✅ | ☐ |
| Notifications | ✅ | ☐ | ☐ |
| Push | ⚠ | ☐ | ☐ |
| Payments | ✅ | ✅ | ☐ |
| Maps / GPS | ✅ | ☐ | ✅ Historical |

---

## Release artifacts

### Backend production image

| Item | Status |
|------|:------:|
| Dockerfile | ✅ `backend/taxi/Dockerfile` — Python 3.12, Daphne |
| Compose stack | ✅ `docker-compose.yml` |
| Image built today | ☐ Requires production deploy |
| LC1 code on prod | ❌ Pending |

**Build:** `docker compose -p yala build django celery-worker celery-beat`

### Frontend production build

| Item | Status |
|------|:------:|
| Build present | ✅ `frontend/build/index.html` |
| Deploy to prod | ☐ Pending |

### Android signed packages

| Artifact | Size | SHA-256 |
|----------|-----:|---------|
| `release/android/yala-rider-1.2.7-19-20260720-203407.apk` | 13,836,744 | `7718FF9F673FCECC78CF9058B6303DEEC2122DE01028639F0168859F082BDC4F` |
| `release/android/yala-rider-1.2.7-19-20260720-203407.aab` | 11,899,894 | `A1874F9A38D6267A97D2F31C94B6BE61927DB19DB16EE5A43EE4BE4394714A3E` |
| `release/android/yala-driver-1.2.23-38-20260720-203407.apk` | 14,077,172 | `8E74460DB8B3108134C799448E4E0EE670DCDD5519F1809D41A8E39FEA5FA999` |
| `release/android/yala-driver-1.2.23-38-20260720-203407.aab` | 12,144,697 | `48B0B035F0001CF0C771E1A00D28D915EC9150E8D859C97476D350A11F47EB66` |
| `release/android/yala-delivery-1.0.4-6-20260707-093848.aab` | 11,990,825 | `7B202B88C1E65F72F8E9122415E8660BD2511F8D42D05104D1F0F729D51C7849` |

**Note:** Delivery AAB dated 2026-07-07 — rebuild recommended from golden commit. APK rebuild blocked without `signing/credentials.env`.

### Source release archive

| Item | Status |
|------|:------:|
| Git archive | ☐ Pending tag |

```bash
git archive --format=zip --prefix=yala-enterprise-1.0.0/ v1.0.0-rc-final \
  -o release/yala-enterprise-1.0.0-source.zip
```

---

## Known limitations

See [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md). Highlights:

| Limitation | Severity |
|------------|:--------:|
| Real Estate not in v1.0 | N/A |
| iOS not submitted | High |
| Offsite backups not configured | Critical (ops) |
| Delivery prod E2E HTTP 400 | High |
| Device QA unsigned for golden builds | Critical |
| Play Console attestation incomplete | High |
| Dual referral systems | Medium |
| Crash telemetry not instrumented | Medium |
| Mobile versionName ≠ 1.0.0 (by design) | Low |

---

## Rollback strategy

Reference: [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)

| Scenario | Action | RTO |
|----------|--------|:---:|
| Deploy failure | `git checkout v1.0.0-rc2` + rebuild compose | < 15 min |
| Database issue | Restore from pre-golden backup | < 4 h |
| Mobile regression | Halt rollout; distribute prior APK | < 2 h |

**Pre-golden rollback tag:** `v1.0.0-rc2`

---

## Deployment steps

```bash
# 1. Tag and push (after commit)
git checkout release/v1.0-rc1
git merge main   # or commit golden snapshot
git tag -a v1.0.0-rc-final -m "YALA Enterprise v1.0.0 Golden Release"
git push origin release/v1.0-rc1 --tags

# 2. Production deploy
cd /opt/yala
git fetch --tags && git checkout v1.0.0-rc-final
docker compose -p yala build django celery-worker celery-beat
docker compose -p yala run --rm django python manage.py migrate --noinput
docker compose -p yala up -d

# 3. Frontend
bash scripts/deploy-production-frontend.sh

# 4. Verify
curl -fsS https://api.yalataxi.live/api/health/ready/
python scripts/platform-rc1-smoke.py
python scripts/fix-qa-cert-accounts.py  # on server

# 5. Play Console — upload AABs from release/android/
```

---

## Phase 1 version lock status

| Check | Result |
|-------|:------:|
| Migrations committed | ❌ Uncommitted |
| No pending migrations | ✅ |
| No debug in prod template | ✅ |
| Tag applied | ❌ |
| Freeze active | ✅ [VERSION_LOCK_GOLDEN.md](./VERSION_LOCK_GOLDEN.md) |

---

## Related documents

- [V1_FINAL_CERTIFICATION.md](./V1_FINAL_CERTIFICATION.md)
- [VERSION_LOCK_GOLDEN.md](./VERSION_LOCK_GOLDEN.md)
- [PRODUCTION_CERTIFICATE.md](./PRODUCTION_CERTIFICATE.md)
- [LC1_RELEASE_ARTIFACTS.md](./LC1_RELEASE_ARTIFACTS.md)

**Report issued:** 2026-07-22
