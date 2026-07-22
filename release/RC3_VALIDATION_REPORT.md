# YALA Enterprise v1.0 — RC3 Validation Report

**Document ID:** RC3-VALIDATION-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-rc3  
**Validator:** Release Engineering (automated + local verification)  
**Governance:** [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [CORE_DEVELOPMENT_FINAL_REPORT.md](./CORE_DEVELOPMENT_FINAL_REPORT.md)

---

## Verdict

| Gate | Status |
|------|:------:|
| **RC3 local validation** | **PASS** (with fixes applied) |
| **Production deploy validation** | **PENDING** |

One **release-blocking defect** was discovered and **fixed during validation**: model/migration index drift (see §4). Production deploy and staging verification remain open.

---

## 1. Django migrations

| Check | Result | Evidence |
|-------|:------:|----------|
| `migrate --plan` (no pending unapplied locally) | ✅ PASS | No planned operations after full migrate |
| `makemigrations --check --dry-run` | ✅ PASS (after fix) | Exit code 0 — no drift |
| RC3 index migrations present | ✅ PASS | `payments/0020`, `drivers/0023` |
| Phase 29–39 migrations present | ✅ PASS | academy, api_gateway, merchants/0005, incentives/0005, safety/0004 |
| Migration conflicts | ✅ PASS | None detected |
| Local migrate apply | ✅ PASS | `incentives.0005_rc3_model_sync`, `safety.0004_rc3_model_sync` applied |

### Fix applied during validation (RB-RC3-001)

**Issue:** `makemigrations --check` failed — Django detected indexes added in RC3 migrations (`0020`/`0023`) missing from model `Meta.indexes`, plus choice-field drift on `IncentiveProgram.incentive_type` and `TripSafetyEvent.event_type`.

**Resolution:**
- Added RC3 index definitions to `payments/models.py` and `taxi/drivers/models.py`
- Generated `incentives/migrations/0005_rc3_model_sync.py`
- Generated `safety/migrations/0004_rc3_model_sync.py`

**Severity:** P0 release blocker (would cause deploy migration failures or index rollback on next migrate)

---

## 2. Static assets

| Check | Result | Evidence |
|-------|:------:|----------|
| `collectstatic --dry-run` | ✅ PASS | 157 static files, no errors |
| Frontend `npm run build` | ✅ PASS | CRA build completed; chunks emitted to `frontend/build/` |
| Build warnings | ⚠ INFO | Standard CRA size warnings only; no build failures |

---

## 3. Production environment variables

Validated against `backend/taxi/.env.production.template` (secrets not read from live `.env.production`).

| Variable group | Template complete | Production verified |
|----------------|:-----------------:|:-------------------:|
| Django core (`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`) | ✅ | ☐ Server-side |
| Database (`DATABASE_URL`, `DATABASE_SSL_REQUIRE`) | ✅ | ☐ Server-side |
| Redis / Celery | ✅ | ☐ Server-side |
| CORS / CSRF | ✅ | ✅ Prod API responds |
| HTTPS / HSTS | ✅ | ☐ Server-side |
| Email SMTP | ✅ | ☐ Server-side |
| Stripe keys | ✅ | ☐ Server-side |
| Push VAPID | ✅ Optional | ☐ Server-side |
| Sentry | ✅ Recommended | ☐ Server-side |

**Production spot-check (unauthenticated):**

```
GET https://api.yalataxi.live/api/health/ready/
→ {"status":"ok","service":"yala-api","database":"ok","redis":"ok"}
```

Celery status not exposed on public readiness endpoint (by design).

---

## 4. Secrets & configuration

| Check | Result | Notes |
|-------|:------:|-------|
| `.env.production` in `.gitignore` | ✅ PASS | Template committed; secrets excluded |
| `pip check` (dependency conflicts) | ✅ PASS | No broken requirements |
| Django `check --deploy` (local dev) | ⚠ EXPECTED | Warnings for DEBUG=True, dev SECRET_KEY — not production config |
| Docker Compose service wiring | ✅ PASS | Healthchecks on django, postgres, redis, celery |

---

## 5. Dependencies

| Component | Status | Notes |
|-----------|:------:|-------|
| Python `requirements.txt` | ✅ PASS | Installed; `pip check` clean |
| Node `package.json` | ✅ PASS | Build succeeds |
| Docker images | ✅ PASS | postgres:15, redis:7, nginx:alpine pinned by tag |
| Unpinned DRF/Celery | ⚠ P2 | Documented in RELEASE_BLOCKERS RB-P2-014 |

---

## 6. Core test suite (pre-deploy gate)

| Suite | Result |
|-------|--------|
| Core backend (235 tests) | **235/235 PASS** |
| Operations | 146/146 |
| Academy + API Gateway | 22/22 |
| Rides + Drivers + Deliveries | 67/67 |

Source: [CORE_DEVELOPMENT_FINAL_REPORT.md](./CORE_DEVELOPMENT_FINAL_REPORT.md)

---

## 7. Open validation items (production server required)

| ID | Item | Owner |
|----|------|-------|
| VAL-RC3-01 | Apply all migrations on production DB | DevOps |
| VAL-RC3-02 | Run `collectstatic` on production deploy | DevOps |
| VAL-RC3-03 | Verify `.env.production` secrets on server (not in repo) | DevOps |
| VAL-RC3-04 | Run `scripts/launch-perf-smoke.py` with admin credentials | QA |
| VAL-RC3-05 | Rebuild mobile APK/AAB after RC3 code changes | Mobile |

---

## Sign-off

| Role | Status | Date |
|------|:------:|------|
| Release Engineering (local) | ✅ Complete | 2026-07-22 |
| DevOps (production) | ☐ Pending | |
| QA (perf smoke) | ☐ Pending | |
