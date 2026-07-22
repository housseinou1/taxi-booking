# YALA Enterprise v1.0 — Pilot Issue Tracker

**Document ID:** PILOT-ISSUES-001  
**Date opened:** 2026-07-22  
**Status:** Active  
**Source:** Production smoke (2026-07-22), device QA history, deployment validation

---

## Summary

| Severity | Open | Fixed | Deferred |
|:--------:|:----:|:-----:|:--------:|
| P0 | 4 | 0 | 0 |
| P1 | 6 | 0 | 0 |
| P2 | 5 | 0 | 2 |
| P3 | 3 | 0 | 1 |
| **Total** | **18** | **0** | **3** |

---

## Issue register

### PILOT-001 · LC1 code not deployed to production

| Field | Value |
|-------|-------|
| **Severity** | P0 |
| **Steps to reproduce** | Compare production ride/delivery behavior with LC1 fixes in working tree (merchant coords, delivery errors) |
| **Expected** | Latest LC1 backend running on `api.yalataxi.live` |
| **Actual** | Production running prior deploy; LC1 uncommitted |
| **Owner** | DevOps |
| **Target fix** | v1.0.0-lc1 deploy |

---

### PILOT-002 · Delivery request fails on production (HTTP 400)

| Field | Value |
|-------|-------|
| **Severity** | P1 |
| **Steps to reproduce** | 1. Login as `qa-rider-profile-fix@test.local` 2. `POST /deliveries/request/` with valid Nouakchott payload and terms accepted |
| **Expected** | HTTP 201, delivery created |
| **Actual** | HTTP 400 (observed 2026-07-22 13:08 UTC, ride 114 session) |
| **Owner** | Engineering |
| **Target fix** | v1.0.0-lc1 — verify phone verification + validation rules; run `fix-qa-cert-accounts.py` on prod |

---

### PILOT-003 · API smoke ride complete fails (geofence)

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Steps to reproduce** | 1. Request ride via API 2. Driver accept 3. `POST /rides/arrived/{id}/` without driver GPS coords |
| **Expected** | Arrive succeeds or clear error for test harness |
| **Actual** | HTTP 400; PIN/start/complete cascade fail |
| **Owner** | QA |
| **Target fix** | v1.0.0-lc1 — update smoke script with driver lat/lng; confirm on device (see PILOT-008) |

**Note:** Historical device QA (`DRIVER_RELEASE_QA_REPORT.md`) shows full ride lifecycle **PASS** with GPS on device — likely test harness gap, not product defect.

---

### PILOT-004 · Stale active rides after incomplete smoke runs

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Steps to reproduce** | Run smoke test; observe ride left in `driver_arriving` (e.g. ride 114) |
| **Expected** | No active ride after test cleanup |
| **Actual** | Active ride persists when arrive/complete fail |
| **Owner** | Engineering |
| **Target fix** | v1.0.0-lc1 — improve smoke cleanup to cancel on arrive failure |

---

### PILOT-005 · Physical device QA not signed for LC1 builds

| Field | Value |
|-------|-------|
| **Severity** | P0 |
| **Steps to reproduce** | Install LC1 APK (1.2.7/1.2.23/1.0.4) on device; execute `DEVICE_QA_CHECKLIST.md` |
| **Expected** | Signed QA report for all critical paths |
| **Actual** | Last device session 2026-07-07–10; no LC1 sign-off; adb unavailable on pilot validation workstation today |
| **Owner** | QA Lead |
| **Target fix** | Before pilot cohort >10 users |

---

### PILOT-006 · Offsite encrypted backups not configured

| Field | Value |
|-------|-------|
| **Severity** | P0 |
| **Steps to reproduce** | Check `BACKUP_OFFSITE_REMOTE` on production host |
| **Expected** | Daily encrypted backup replicated offsite |
| **Actual** | Not configured (RB-P0-005) |
| **Owner** | DevOps |
| **Target fix** | Before public release |

---

### PILOT-007 · Driver go-online failure on RC4 device QA

| Field | Value |
|-------|-------|
| **Severity** | P1 |
| **Steps to reproduce** | RC4 device QA — driver login, tap Go Online |
| **Expected** | Driver available; receives offers |
| **Actual** | FAIL in `RC4_FINAL_DEVICE_QA_REPORT.md`; PASS in earlier `DRIVER_RELEASE_QA_REPORT.md` |
| **Owner** | Mobile QA |
| **Target fix** | v1.0.0-lc1 — retest with LC1 driver APK |

---

### PILOT-008 · Courier accept button missing on device (RC4)

| Field | Value |
|-------|-------|
| **Severity** | P1 |
| **Steps to reproduce** | RC4 — rider requests delivery; courier views offer on device |
| **Expected** | Accept button visible |
| **Actual** | No Accept button; API fallback accept worked; delivery completed via API |
| **Owner** | Mobile |
| **Target fix** | v1.0.0-lc1 delivery app rebuild |

---

### PILOT-009 · Courier delivery_mode_enabled false on QA account

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Steps to reproduce** | `GET /deliveries/driver/mode/` as QA courier (driver account) |
| **Expected** | `delivery_mode_enabled: true` for pilot courier |
| **Actual** | `delivery_mode_enabled: false` (observed 2026-07-22) |
| **Owner** | Ops |
| **Target fix** | Immediate — enable on pilot courier profile |

---

### PILOT-010 · Ride completion rate below pilot target

| Field | Value |
|-------|-------|
| **Severity** | P1 |
| **Steps to reproduce** | Query `/operations/launch/kpis/` |
| **Expected** | Completion rate >95% for real user pilot |
| **Actual** | **37.0%** completion, **60.9%** cancellation (2026-07-22) — inflated by QA smoke cancellations |
| **Owner** | Ops / QA |
| **Target fix** | Re-measure after pilot cohort onboarded (exclude QA accounts) |

---

### PILOT-011 · No dedicated pilot/staging environment

| Field | Value |
|-------|-------|
| **Severity** | P0 |
| **Steps to reproduce** | Navigate to `staging.yalataxi.live` |
| **Expected** | Isolated pre-production stack |
| **Actual** | Not configured; pilot uses production |
| **Owner** | DevOps |
| **Target fix** | v1.0.1 or pre-GA — mitigate with cohort cap ≤25 |

---

### PILOT-012 · Merchant pilot account not provisioned

| Field | Value |
|-------|-------|
| **Severity** | P1 |
| **Steps to reproduce** | Attempt merchant primary workflow with pilot credentials |
| **Expected** | Approved merchant can create order + dispatch delivery |
| **Actual** | No dedicated pilot merchant account validated in this cycle |
| **Owner** | Ops |
| **Target fix** | v1.0.0-lc1 — provision `pilot-merchant@yalataxi.live` |

---

### PILOT-013 · Real Estate roles not in v1.0

| Field | Value |
|-------|-------|
| **Severity** | N/A |
| **Steps to reproduce** | Attempt tenant/landlord/collector login |
| **Expected** | N/A — out of scope |
| **Actual** | No Real Estate product modules |
| **Owner** | Product |
| **Target fix** | Deferred — Academy content only |

---

### PILOT-014 · Push notification delivery not measured

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Steps to reproduce** | Trigger ride accept; observe FCM on device |
| **Expected** | Push received within 30s |
| **Actual** | Not automated; not measured in pilot cycle |
| **Owner** | QA |
| **Target fix** | During extended pilot |

---

### PILOT-015 · Mobile crash reporting not instrumented

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Steps to reproduce** | Check Crashlytics/Sentry mobile integration |
| **Expected** | Crash-free session metric available |
| **Actual** | No Crashlytics in repo; metric unavailable |
| **Owner** | Mobile |
| **Target fix** | Post-pilot |

---

### PILOT-016 · Auth rate limit triggered during validation burst

| Field | Value |
|-------|-------|
| **Severity** | P3 |
| **Steps to reproduce** | Run multiple login probes in rapid succession after smoke test |
| **Expected** | Validation scripts complete |
| **Actual** | HTTP 429 on login (observed 13:10 UTC after KPI fetch) |
| **Owner** | Engineering |
| **Target fix** | v1.0.0-lc1 — use token reuse in validation scripts |

---

### PILOT-017 · LC1 Android rebuild pending

| Field | Value |
|-------|-------|
| **Severity** | P1 |
| **Steps to reproduce** | Compare APK build date with LC1 code freeze |
| **Expected** | Signed APK/AAB built from LC1 branch |
| **Actual** | Latest artifacts dated 2026-07-20; signing credentials not in workspace |
| **Owner** | Mobile / DevOps |
| **Target fix** | v1.0.0-lc1 |

---

### PILOT-018 · Executive / ops role accounts incomplete

| Field | Value |
|-------|-------|
| **Severity** | P2 |
| **Steps to reproduce** | Login as Operations Manager, Accountant, Supervisor pilot accounts |
| **Expected** | Each role completes primary workflow |
| **Actual** | Only `sakho@admin.mr` (CEO/Super Admin) validated; dedicated ops/accountant pilots not provisioned |
| **Owner** | Ops |
| **Target fix** | v1.0.0-lc1 pilot onboarding |

---

## Triage rules

| Severity | Action |
|:--------:|--------|
| P0 | Block pilot cohort expansion |
| P1 | Log; fix before cohort >10 |
| P2 | Log; fix during extended pilot |
| P3 | Backlog |

---

## Related

- [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md)
- [PILOT_METRICS.md](./PILOT_METRICS.md)
- [PILOT_GO_LIVE_DECISION.md](./PILOT_GO_LIVE_DECISION.md)
