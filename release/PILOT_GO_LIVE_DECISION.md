# YALA Enterprise v1.0 — Pilot Go-Live Decision

**Document ID:** PILOT-GOLIVE-001  
**Date:** 2026-07-22  
**Pilot period assessed:** Validation day + platform lifetime metrics  
**Launch readiness score:** 71% — [LAUNCH_READINESS_SCORE.md](./LAUNCH_READINESS_SCORE.md)

---

## Decision

# EXTEND PILOT

Do **not** proceed to public release. Continue controlled pilot with capped cohort (≤25 users) after closing P0 deployment and account preparation gates.

---

## Decision options considered

| Option | Selected? | Rationale |
|--------|:---------:|-----------|
| **GO TO PUBLIC RELEASE** | ❌ | 4 P0 blockers open; device QA unsigned; delivery prod failure; completion metrics not representative but below target |
| **EXTEND PILOT** | ✅ | Production stack live; core flows partially validated; real user pilot viable after LC1 deploy + account prep |
| **STOP RELEASE** | ❌ | No P0 code defects; 235/235 tests; platform operational — issues are ops/QA not fundamental product failure |

---

## Evidence summary

### What works (observed)

| Evidence | Result | Date |
|----------|--------|------|
| Production health DB+Redis | ✅ 200 OK | 2026-07-22 |
| Platform smoke | 34/40 PASS | 2026-07-22 13:08 UTC |
| Admin/CEO workflows | ✅ All TEST3 PASS | 2026-07-22 |
| Security (JWT, HTTPS, rate limit) | ✅ TEST4 PASS | 2026-07-22 |
| Failed payments | ✅ 0 | 2026-07-22 |
| Driver acceptance rate | ✅ 91% | 2026-07-22 |
| Historical device ride lifecycle | ✅ PASS | 2026-07-09 `DRIVER_RELEASE_QA_REPORT.md` |
| Core test suite | ✅ 235/235 | 2026-07-22 |

### What fails or is unverified (observed)

| Evidence | Result | Date |
|----------|--------|------|
| Delivery request on prod | ❌ HTTP 400 | 2026-07-22 |
| API ride complete (smoke) | ❌ Geofence 400 | 2026-07-22 |
| LC1 code deployed | ❌ Not done | 2026-07-22 |
| Device QA LC1 sign-off | ❌ Not done | No adb today |
| Merchant pilot account | ❌ Not provisioned | 2026-07-22 |
| Offsite backups | ❌ Not configured | Prior audits |
| Crash-free sessions | ❌ Unknown | No instrumentation |
| Platform completion rate | 🔴 37% | QA-inflated — 2026-07-22 |

---

## Conditions to begin pilot user onboarding

| # | Condition | Severity | Owner | Est. resolution |
|---|-----------|:--------:|-------|:---------------:|
| E1 | Deploy LC1 backend + migrations to production | P0 | DevOps | 4 hours |
| E2 | Deploy frontend production build | P0 | DevOps | 2 hours |
| E3 | Run `fix-qa-cert-accounts.py` on production | P0 | DevOps | 30 min |
| E4 | Enable courier delivery mode on pilot account | P1 | Ops | 15 min |
| E5 | Fix delivery prod request (UAT-D-010) | P1 | Engineering | 1–2 days |
| E6 | Fresh device QA on LC1 APKs | P1 | QA | 2–3 days |
| E7 | Provision merchant + ops pilot accounts | P1 | Ops | 1 day |
| E8 | CEO DR acceptance OR configure offsite backup | P0 | CEO/DevOps | 1–3 days |

---

## Conditions to exit pilot → public release

| # | Condition | Severity | Owner | Est. resolution |
|---|-----------|:--------:|-------|:---------------:|
| X1 | Pilot cohort ≥14 days with real users | P0 | Ops | 14 days |
| X2 | Ride completion rate >95% (QA excluded) | P0 | Ops | End of pilot |
| X3 | Delivery completion rate >95% | P0 | Ops | End of pilot |
| X4 | Physical device QA signed all apps | P0 | QA | Before GA |
| X5 | Offsite backups certified | P0 | DevOps | 1–2 days |
| X6 | Executive sign-off | P0 | CEO | 1 day |
| X7 | Play Store production track ready | P1 | Product | 3–5 days |
| X8 | Crash-free sessions >99% | P1 | Mobile | Requires instrumentation |
| X9 | API p95 <2000 ms post-LC1 deploy | P1 | Engineering | 4 hours post-deploy |

---

## Pilot parameters (approved)

| Parameter | Value |
|-----------|-------|
| Max users | **25** |
| Environment | Production (no staging) |
| Apps | Android only — Rider 1.2.7, Driver 1.2.23, Delivery 1.0.4 |
| Real Estate | Excluded |
| Duration (initial) | **14 days** per `BETA_SUCCESS_METRICS.md` |
| Ops on-call | Required during pilot hours |

---

## Sign-off

| Role | Decision | Date | Signature |
|------|:--------:|------|-----------|
| Engineering | EXTEND PILOT | 2026-07-22 | _Pending_ |
| QA | EXTEND PILOT | 2026-07-22 | _Pending_ |
| Operations | EXTEND PILOT | 2026-07-22 | _Pending_ |
| Security | EXTEND PILOT | 2026-07-22 | _Pending_ |
| CEO | PENDING | — | _Pending_ |

---

## Evidence index

| Document | Content |
|----------|---------|
| [deployment/PILOT_DEPLOYMENT_REPORT.md](../deployment/PILOT_DEPLOYMENT_REPORT.md) | Phase 1 — stack verification |
| [PILOT_USER_VALIDATION.md](./PILOT_USER_VALIDATION.md) | Phase 2 — accounts + workflows |
| [PILOT_DEVICE_TESTING.md](./PILOT_DEVICE_TESTING.md) | Phase 3 — device QA |
| [PILOT_ISSUES.md](./PILOT_ISSUES.md) | Phase 4 — issue tracker |
| [PILOT_METRICS.md](./PILOT_METRICS.md) | Phase 5 — metrics |
| [LC1_DECISION.md](./LC1_DECISION.md) | Prior LC1 gate |
| [device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md](./device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md) | Today's smoke |

**Next review:** After E1–E3 complete + first 5 real pilot users onboarded
