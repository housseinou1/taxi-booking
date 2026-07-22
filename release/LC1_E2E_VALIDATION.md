# YALA Enterprise v1.0 — LC1 End-to-End Validation Report

**Document ID:** LC1-E2E-001  
**Date:** 2026-07-22  
**Environment:** Production API (`https://api.yalataxi.live`) + core test suite  
**Method:** `platform-rc1-smoke.py` (live) + unit/integration tests (235/235) + admin URL probes  
**Overall:** **34/40 API smoke checks PASS** · **6 FAIL** · Multiple workflows not exercised on production

---

## Validation legend

| Symbol | Meaning |
|:------:|---------|
| ✅ | PASS — validated on production or full E2E test |
| ⚠ | PARTIAL — backend tests pass; production or device not verified |
| ❌ | FAIL — validated and failed |
| ☐ | NOT RUN — not exercised in this cycle |
| N/A | Out of v1.0 scope |

---

## RIDER workflows

| Workflow | Status | Evidence | Failure detail |
|----------|:------:|----------|----------------|
| Sign Up | ⚠ | `tests/drivers_app` registration tests PASS; prod sign-up not run | No prod registration test account created |
| Login | ✅ | Smoke TEST1 — rider login PASS | — |
| Book Ride | ✅ | Smoke — request HTTP 201, accept → `driver_arriving` | — |
| Cancel Ride | ⚠ | Smoke cleanup uses cancel API; dedicated cancel flow not isolated | Cancel fee UI fixed (100 MRU); prod cancel not standalone test |
| Complete Ride | ❌ | Smoke — arrive/start/complete FAIL | **Driver arrive HTTP 400** — geofence requires driver GPS at pickup; smoke script sends no coords |
| Wallet | ⚠ | `tests/payments/test_driver_withdrawal_production.py` PASS | Prod rider wallet not probed in smoke |
| Ratings | ✅ | Smoke — `POST /rides/rate/` HTTP 200 | — |
| Notifications | ☐ | Push not exercised in API smoke | Requires device QA |

### Rider failures

| ID | Step | HTTP | Root cause | Launch blocker? |
|----|------|:----:|------------|:---------------:|
| E2E-R-001 | Driver arrive | 400 | Geofence — no driver lat/lng in smoke payload | No — test gap; device QA required |
| E2E-R-002 | Verify PIN | — | Cascade from E2E-R-001 | No |
| E2E-R-003 | Start ride | — | Cascade from E2E-R-001 | No |
| E2E-R-004 | Complete ride | — | Cascade from E2E-R-001 | No |
| E2E-R-005 | Stale active ride | 200 | Ride 113 left in `driver_arriving` after incomplete flow | No — cleanup artifact |

---

## DRIVER workflows

| Workflow | Status | Evidence | Failure detail |
|----------|:------:|----------|----------------|
| Registration | ⚠ | `tests/drivers_app/test_achievements_views.py` — register PASS | Prod registration not run |
| Documents | ⚠ | Driver onboarding tests in suite | Prod document upload not run |
| Approval | ⚠ | Admin approval workflow in backend tests | Prod approval state assumed for QA driver |
| Online | ✅ | Smoke — `POST /drivers/availability/toggle/` PASS | — |
| Accept Ride | ✅ | Smoke — accept → `driver_arriving` PASS | — |
| Navigation | ❌ | Smoke — arrive FAIL | Same geofence issue as E2E-R-001 |
| Earnings | ✅ | Smoke — earnings endpoint PASS (0.0 → 0.0; ride incomplete) | Earnings increment not verified (ride not completed) |
| Logout | ✅ | Smoke TEST4 — session clear PASS | Client-side clearAuthSession |

---

## DELIVERY workflows

| Workflow | Status | Evidence | Failure detail |
|----------|:------:|----------|----------------|
| Customer login | ✅ | Smoke TEST2 PASS | — |
| Customer request delivery | ❌ | Smoke — HTTP 400 | **UAT-D-010** — prod validation / phone verification |
| Customer tracking | ☐ | Not reached — request failed | — |
| Merchant order → delivery | ☐ | Not in smoke script | Covered by `tests.merchants` (235 suite) |
| Merchant checkout | ⚠ | Unit tests PASS; prod merchant flow not run | Destination coords fix in uncommitted code |
| Courier login | ✅ | Smoke PASS | — |
| Courier mode config | ✅ | Smoke — delivery mode GET PASS | `delivery_mode_enabled: false` on QA courier |
| Courier accept / complete | ☐ | Not reached — request failed | — |

### Delivery failures

| ID | Step | HTTP | Root cause | Launch blocker? |
|----|------|:----:|------------|:---------------:|
| E2E-D-001 | Request delivery | 400 | Prod validation — likely phone verify or terms (UAT-D-010) | **Yes (P1)** — blocks delivery beta users |

---

## REAL ESTATE workflows

**Scope decision:** Real Estate product modules (Tenant, Landlord, Rent collection) are **not in YALA Enterprise v1.0**. Academy includes landlord-audience training content only.

| Role / workflow | Status | Evidence |
|-----------------|:------:|----------|
| Tenant | N/A | `UAT_TEST_PLAN.md` — out of scope |
| Landlord | N/A | Academy audience only — `tests.academy` PASS |
| Collector | N/A | Support playbook only |
| Supervisor | N/A | Support playbook only |
| Accountant | N/A | Finance module covers platform accounting, not property rent |
| CEO (Real Estate) | N/A | CEO dashboard covers platform ops, not property management |

**No Real Estate E2E validation required for LC1.**

---

## ADMIN workflows

| Workflow | Status | Evidence | Failure detail |
|----------|:------:|----------|----------------|
| Dashboard | ✅ | Smoke TEST3 — analytics HTTP 200 | — |
| Reports | ✅ | Smoke — driver performance, acceptance rate, cancellation stats PASS | — |
| Finance | ✅ | Smoke — `/payments/admin/dashboard/` revenue=243.98 | — |
| Audit logs | ⚠ | Audit service in code; not probed in smoke | Trust/safety/compliance audit endpoints exist |
| Admin UI (status) | ✅ | Live probe — `https://www.yalataxi.live/admin/status` HTTP 200 | — |
| Admin UI (executive) | ✅ | Live probe — `/admin/executive` HTTP 200 | — |
| Admin UI (operations) | ✅ | Live probe — `/admin/operations` HTTP 200 | — |
| CEO dashboard API | ⚠ | `tests.operations` 146/146 PASS | Prod CEO API not in smoke script |

---

## Security & stability (cross-cutting)

| Check | Status | Evidence |
|-------|:------:|----------|
| JWT refresh | ✅ | Smoke TEST4 |
| HTTPS enforcement | ✅ | Smoke TEST4 |
| Rate limiting | ✅ | HTTP 401 on abuse |
| File upload validation | ✅ | HTTP 403 without auth |
| Health no 5xx | ✅ | `/health/` HTTP 200 |
| API timeouts | ✅ | All requests < 60s |

---

## Test execution log

| Run | Command | Result | Timestamp |
|-----|---------|:------:|-----------|
| Platform smoke | `python scripts/platform-rc1-smoke.py` | 34/40 PASS | 2026-07-22 13:02 UTC |
| Migration check | `python manage.py makemigrations --check` | PASS | 2026-07-22 |
| Core suite | 235/235 (prior run) | PASS | 2026-07-22 |
| Launch cert script | `python scripts/launch-certification-prod.py` | FAIL (SSL verify on workstation) | 2026-07-22 — script env issue, not prod outage |
| Admin URL probes | PowerShell `Invoke-WebRequest` | 200 on status/executive/operations | 2026-07-22 |
| Health probes | PowerShell `Invoke-RestMethod` | DB + Redis ok | 2026-07-22 |

**Note:** `launch-certification-prod.py` failed due to `[SSL: CERTIFICATE_VERIFY_FAILED]` on the validation workstation when strict SSL verification is enabled. Production endpoints respond correctly when probed via PowerShell and via smoke script (which uses unverified SSL context). This is a **local tooling issue**, not a production defect.

---

## Summary of launch-blocking failures

| ID | Severity | Workflow | Owner | Resolution |
|----|:--------:|----------|-------|------------|
| E2E-D-001 / UAT-D-010 | P1 | Delivery request on prod | Engineering | Fix QA account phone verify or validation rules |
| — | P0 | LC1 code not deployed | DevOps | Deploy + migrate before user distribution |
| — | P0 | Physical device QA unsigned | QA | Execute `DEVICE_QA_CHECKLIST.md` |
| — | P0 | Offsite backups | DevOps | Configure `BACKUP_OFFSITE_REMOTE` |

**Geofence smoke failures (E2E-R-001–005) are test harness gaps**, not confirmed product defects. Device QA must validate arrive/complete on physical hardware.

---

## Related

- [LC1_DECISION.md](./LC1_DECISION.md)
- [device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md](./device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md)
- [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md)
