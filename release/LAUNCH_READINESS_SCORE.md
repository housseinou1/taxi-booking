# YALA Enterprise v1.0 — Launch Readiness Score (LC1)

**Document ID:** LC1-SCORE-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-lc1  
**Method:** Weighted scoring from live validation, certification reports, and test results  
**Evidence date:** 2026-07-22

---

## Overall launch readiness

# 71%

**Interpretation:** LC1 is ready for **limited closed beta (≤25 real users)** with documented conditions. **Not ready** for public launch, Play Store production track, or cohort expansion.

---

## Domain scores

| Domain | Weight | Score | Status | Key evidence |
|--------|:------:|:-----:|:------:|--------------|
| **Engineering** | 20% | **92%** | ✅ | 235/235 tests; 0 P0 code blockers; migrations clean |
| **QA** | 18% | **68%** | ⚠ | Smoke 34/40; device QA unsigned; ride complete untested on device |
| **Infrastructure** | 15% | **72%** | ⚠ | Health 200; DB+Redis ok; no staging; SSH audit blocked |
| **Security** | 12% | **82%** | ⚠ | JWT/HTTPS/rate-limit PASS; role audit incomplete |
| **Performance** | 10% | **58%** | ⚠ | Health p95 1729 ms; admin p95 4086 ms pre-deploy |
| **Operations** | 10% | **42%** | ❌ | LC1 not deployed; offsite backup missing |
| **Support** | 8% | **70%** | ⚠ | Runbooks exist; beta playbook ready; staffing TBD |
| **Legal** | 7% | **65%** | ⚠ | Privacy/terms live; Play attestation incomplete |

### Weighted calculation

```
(92×0.20) + (68×0.18) + (72×0.15) + (82×0.12) + (58×0.10) + (42×0.10) + (70×0.08) + (65×0.07)
= 18.4 + 12.24 + 10.8 + 9.84 + 5.8 + 4.2 + 5.6 + 4.55
= 71.43% ≈ 71%
```

---

## Engineering — 92%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Core test suite 235/235 | 100% | `CORE_DEVELOPMENT_FINAL_REPORT.md` |
| P0 code blockers | 100% | 0 open |
| Migration drift | 100% | `makemigrations --check` PASS 2026-07-22 |
| Feature completeness (v1.0) | 96% | Module matrix in core dev report |
| LC1 commit + tag | 40% | Uncommitted working tree |
| Code freeze documented | 100% | `LC1_CODE_FREEZE.md` |

**Deductions:** Uncommitted LC1 snapshot (−8%).

---

## QA — 68%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Platform API smoke | 85% | 34/40 PASS — `LC1_E2E_VALIDATION.md` |
| Rider book/accept/rate | 90% | Smoke TEST1 partial |
| Ride complete E2E | 30% | Geofence failures in smoke (test gap) |
| Delivery E2E | 25% | Request delivery HTTP 400 |
| Admin workflows | 90% | Smoke TEST3 all PASS |
| Physical device QA | 0% | UAT-D-005 unsigned |
| UAT sign-off | 30% | `UAT_SIGNOFF.md` pending |

**Deductions:** Delivery prod failure (−15%); no device QA (−17%).

---

## Infrastructure — 72%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Production health | 95% | `/health/`, `/api/health/ready/` 200 — DB+Redis ok |
| HTTPS / TLS | 90% | Live probes + nginx config |
| Docker compose stack | 85% | 3× Django, PG, Redis, Celery — code review |
| Domain routing | 90% | api + www + yalataxi.live all 200 |
| Staging environment | 0% | UAT-D-003 |
| Container resource limits | 40% | Not configured |
| SSH server audit | 30% | Blocked — `INFRASTRUCTURE_CERTIFICATION_REPORT.md` |

---

## Security — 82%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| JWT auth + refresh | 95% | Smoke TEST4 PASS |
| HTTPS enforcement | 95% | Smoke TEST4 PASS |
| Rate limiting | 90% | nginx + DRF + Redis |
| CSRF / CORS | 90% | Prod template + settings review |
| File upload validation | 88% | Smoke HTTP 403 |
| Admin 2FA | 85% | Code review |
| Role least-privilege audit | 40% | UAT-D-015 open |
| Security UAT S-01–S-10 | 50% | UAT-D-016 partial |

**Reference:** [`SECURITY_CERTIFICATION.md`](./SECURITY_CERTIFICATION.md)

---

## Performance — 58%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Health endpoint avg | 80% | 349 ms (20 samples) — `PERFORMANCE_REPORT.md` |
| Health endpoint p95 | 55% | 1729 ms (target < 500 ms for health) |
| Admin dashboard p95 | 30% | 4086 ms baseline (target < 2000 ms) |
| HTTP 5xx under load | 90% | 0% at 335 concurrent (RC1 monitoring doc) |
| RC3 perf fixes deployed | 20% | UAT-D-006 — source only |
| Post-deploy benchmark | 0% | Not re-run |

---

## Operations — 42%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Deployment runbooks | 85% | `LC1_RELEASE_ARTIFACTS.md`, `ROLLBACK_PLAN.md` |
| LC1 backend deployed | 0% | UAT-D-006 |
| Backup scripts | 80% | Scripts reviewed |
| Offsite backup certified | 0% | RB-P0-005 |
| Rollback plan | 90% | Documented |
| Beta cohort playbook | 85% | `CLOSED_BETA_RUNBOOK.md` |
| Launch day staffing | 30% | Not confirmed |

---

## Support — 70%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Known issues documented | 90% | `KNOWN_ISSUES_v1.0.0.md` |
| Defect log active | 90% | `UAT_DEFECT_LOG.md` |
| Beta operations runbook | 85% | `BETA_OPERATIONS_RUNBOOK.md` |
| Incident response | 80% | `docs/INCIDENT_RESPONSE.md` |
| Support staffing for beta | 30% | Ops Manager confirm pending |
| Beta success metrics | 85% | `BETA_SUCCESS_METRICS.md` |

---

## Legal — 65%

| Criterion | Score | Evidence |
|-----------|:-----:|----------|
| Privacy policy live | 90% | https://www.yalataxi.live/privacy |
| Terms of service live | 90% | https://www.yalataxi.live/terms |
| Play Console Data Safety | 40% | RB-P1-004 — manual attestation open |
| Account deletion attestation | 40% | Play Console pending |
| GDPR / data handling docs | 70% | Privacy policy + audit logging |
| Executive legal sign-off | 30% | Pending |

---

## Observability confirmation (Phase 4)

Validated against [`MONITORING_CERTIFICATION.md`](./MONITORING_CERTIFICATION.md) and live probes.

| Capability | Status | Evidence |
|------------|:------:|----------|
| Error logging | ⚠ | Docker stdout + optional Sentry (`SENTRY_DSN` unconfirmed on prod) |
| Health endpoints | ✅ | `/health/` 200; `/api/health/ready/` DB+Redis ok |
| Crash reporting | ❌ | No mobile Crashlytics; Sentry backend unconfirmed |
| Performance metrics | ⚠ | Documented thresholds; p95 above target; no APM |
| Alert thresholds | ⚠ | Defined in `PRODUCTION_MONITORING_RC1.md`; no auto-paging |

### Alert thresholds (confirmed in documentation)

| Metric | Warning | Critical |
|--------|---------|----------|
| `/health/` uptime | < 99.5% / 15m | < 99% / 15m |
| HTTP 5xx | > 0.5% / 5m | > 2% / 5m |
| API p95 | > 3000 ms | > 8000 ms |
| Celery workers | < 2 | 0 |
| Backup age | > 26 h | > 48 h |

**Observability score (embedded):** **69%** — adequate for manual ops during closed beta; insufficient for unattended launch.

---

## Score thresholds

| Overall % | Decision |
|:---------:|----------|
| ≥ 90% | GO — public launch candidate |
| 75–89% | GO WITH CONDITIONS — closed beta |
| 60–74% | GO WITH CONDITIONS — limited beta ≤25 users |
| < 60% | NO GO |

**LC1 at 71% → GO WITH CONDITIONS (limited beta ≤25 users)**

---

## Related

- [LC1_DECISION.md](./LC1_DECISION.md)
- [LC1_E2E_VALIDATION.md](./LC1_E2E_VALIDATION.md)
- [PRODUCTION_CERTIFICATE.md](./PRODUCTION_CERTIFICATE.md)
