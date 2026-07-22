# YALA Enterprise v1.0 — User Acceptance Test Plan

**Document ID:** UAT-V1-PLAN-001  
**Release:** v1.0.0-rc3  
**Date:** 2026-07-22  
**Status:** Approved for execution  
**Feature freeze:** Active — defect fixes only  
**Environment:** Production (`https://api.yalataxi.live`) + staging (when provisioned)

**Related:** [UAT_ROLE_SCENARIOS.md](./UAT_ROLE_SCENARIOS.md) · [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md) · [UAT_SIGNOFF.md](./UAT_SIGNOFF.md) · [UAT_FINAL_REPORT.md](./UAT_FINAL_REPORT.md)

---

## 1. Objectives

1. Confirm YALA Enterprise v1.0 meets business requirements for a **controlled Closed Beta** in Nouakchott.
2. Validate end-to-end workflows for rider, driver, delivery, merchant, and admin/executive roles.
3. Verify security, permissions, notifications, and financial controls under real usage.
4. Produce evidence for executive sign-off and Closed Beta launch decision.
5. Log all defects with severity, owner, and resolution before beta invites.

**Out of scope:** New features, UI redesign, Version 2 modules (Real Estate product surface, BI ETL warehouse, iOS App Store).

---

## 2. Scope

### In scope

| Area | Modules | Test types |
|------|---------|------------|
| Mobile apps | Rider 1.2.7+, Driver 1.2.23+, Delivery 1.0.4+ (RC3 rebuild) | Manual device + API |
| Web admin | Operations, Finance, Trust & Safety, CEO Master, Board Reports | Manual + API |
| Merchant portal | Orders, inventory, reports | Manual web |
| Business processes | Ride, delivery, merchant settlement, CEO approvals, notifications | E2E + automated |
| Security | Auth, RBAC, rate limits, audit logs | Manual + automated |
| Performance | p95 latency post-RC3 deploy | Load smoke script |
| Academy | Role-targeted training (incl. supervisor/collector/landlord audiences) | API + admin UI |

### Out of scope / N/A (v1.0)

| Item | Reason |
|------|--------|
| **Tenant** role (Real Estate) | No Tenant module in platform inventory |
| **Rent collection** (property) | Real Estate not in v1.0 — see `PLATFORM_INVENTORY.md` |
| **Landlord / Collector** product apps | Academy audience types + support playbook only |
| Public marketing launch | Closed Beta only |
| Apple iOS | Not submitted |

---

## 3. Success criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Critical (P0) defects open | **0** | UAT defect log |
| SC-02 | High (P1) defects open at beta start | **≤ 3** with mitigations | Defect log + CEO approval |
| SC-03 | Automated regression suite | **100% pass** | `python manage.py test` (235 core) |
| SC-04 | Ride booking E2E (paired devices) | **PASS** | Device QA evidence |
| SC-05 | Delivery E2E (customer + courier) | **PASS** or deferred | Device QA + prod phone verify |
| SC-06 | Admin finance dashboard | **PASS** | Accountant role UAT |
| SC-07 | CEO approval workflows | **PASS** | API + manual sign-off |
| SC-08 | Production health | database + redis **OK** | `/api/health/ready/` |
| SC-09 | Security UAT checklist S-01–S-10 | **≥ 90%** pass | Security review |
| SC-10 | Executive sign-off complete | All required roles | `UAT_SIGNOFF.md` |

---

## 4. Participants

| Role | Name (fill at kickoff) | Responsibility |
|------|------------------------|----------------|
| **UAT Lead / QA Lead** | | Plan execution, defect triage, final report |
| **Engineering Lead** | | Defect fixes, API support, deploy |
| **Operations Manager** | | Business process validation, pilot accounts |
| **Finance Lead / Accountant** | | Settlement, payout, refund UAT |
| **Customer Support Lead** | | Support playbook, ticket workflows |
| **Mobile QA Tester** | | Physical device execution |
| **CEO / Product Owner** | | Final acceptance decision |
| **Pilot users (controlled)** | 25 max at start | Real-world beta feedback |

---

## 5. Test schedule

| Phase | Window | Activities | Deliverable |
|-------|--------|------------|-------------|
| **UAT-0 Prep** | Day 0 (2026-07-22) | Automated suite, health probe, docs | `UAT_FINAL_REPORT.md` (prep baseline) |
| **UAT-1 Deploy** | Day 1–2 | RC3 deploy, migrations, APK rebuild | Deploy sign-off |
| **UAT-2 Automated** | Day 2 | Re-run 235 tests on staging/prod | Test log |
| **UAT-3 Role scenarios** | Day 3–7 | Execute [UAT_ROLE_SCENARIOS.md](./UAT_ROLE_SCENARIOS.md) | Scenario sheets + screenshots |
| **UAT-4 Business processes** | Day 5–8 | Cross-role E2E rides, deliveries, settlements | Process validation log |
| **UAT-5 Security** | Day 6–7 | S-01–S-10 checklist | `SECURITY_REVIEW.md` update |
| **UAT-6 Performance** | Day 7 | `launch-perf-smoke.py` post-deploy | `PERFORMANCE_REPORT.md` update |
| **UAT-7 Sign-off** | Day 8–10 | Defect review, executive sign-off | `UAT_SIGNOFF.md` |
| **Closed Beta Day 0** | After GO | Invite first 25 users | `CLOSED_BETA_RUNBOOK.md` |

---

## 6. Test methods

| Method | When used | Evidence |
|--------|-----------|----------|
| **Automated unit/integration** | Every UAT phase | CI log, `manage.py test` output |
| **API manual (Postman/curl)** | Admin, finance, CEO | Request/response capture |
| **Physical device manual** | Rider, driver, delivery | Screenshots, `DEVICE_QA_CHECKLIST.md` |
| **Web admin manual** | Admin, supervisor, accountant, CEO | Screen recording / screenshots |
| **Production smoke** | Daily during UAT | Health endpoint JSON |
| **Load smoke** | Once post-RC3 deploy | `launch-perf-smoke.py` JSON |

---

## 7. Exit criteria

UAT is **complete** when:

1. All mandatory role scenarios executed or formally **N/A** with justification.
2. Zero open **P0** defects; P1 defects mitigated or accepted by CEO.
3. `UAT_SIGNOFF.md` signed by all required approvers.
4. `UAT_FINAL_REPORT.md` published with **READY FOR CLOSED BETA** or **NOT READY**.
5. `CLOSED_BETA_CHECKLIST.md` mandatory items addressed.

UAT **does not** complete public launch — see `CLOSED_BETA_EXIT_CRITERIA.md` for GA gates.

---

## 8. Defect management

- All defects logged in [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md)
- Severity: P0 (block beta) · P1 (fix before scale) · P2 (backlog) · P3 (cosmetic)
- Daily triage during UAT-3 through UAT-7

---

## 9. Preparation baseline (executed 2026-07-22)

| Check | Result | Evidence |
|-------|:------:|----------|
| Core automated tests (235) | ✅ PASS | Ran 2026-07-22 — 310s |
| Production `/api/health/ready/` | ✅ PASS | database + redis OK |
| Manual role scenarios | ☐ Pending | Awaiting UAT-3 |
| Device QA | ☐ Pending | RC3 APK rebuild |

See [UAT_FINAL_REPORT.md](./UAT_FINAL_REPORT.md) for current pass rates.

---

## 10. Reference documents

| Document | Purpose |
|----------|---------|
| `UAT_ROLE_SCENARIOS.md` | Role-based test cases |
| `DEVICE_QA_CHECKLIST.md` | Mobile execution detail |
| `BETA_WORKFLOW_VALIDATION.md` | Workflow completeness matrix |
| `CLOSED_BETA_READINESS.md` | Beta gate status |
| `physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` | Extended mobile QA |
