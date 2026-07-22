# YALA Enterprise — Improvement Backlog

**Document ID:** CIP-IMPROVEMENT-BACKLOG-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Status:** Active  
**Related:** [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) · [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)

---

## Purpose

Track **approved improvements** — enhancements, hardening, and process optimizations within or adjacent to v1.0 scope. This is **not** the strategic v2 backlog.

| Backlog | Scope | Approval |
|---------|-------|----------|
| **This document (IMPROVEMENT_BACKLOG)** | v1.0.x fixes, v1.1 polish, ops/process | Product + Engineering |
| [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) | v2.x strategic phases | CEO + executive |
| `project-management/04_BUG_AND_TECH_DEBT.md` | Bugs and tech debt | Engineering |

**No implementation without approval** per [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) and [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md).

---

## Summary

| Priority | Count | Status breakdown |
|:--------:|:-----:|------------------|
| P0 | 0 | — |
| P1 | 12 | Open 12 |
| P2 | 14 | Open 14 |
| P3 | 6 | Open 6 |
| **Total** | **32** | **32 open** |

| Status | Count |
|--------|:-----:|
| Open | 32 |
| Approved | 0 |
| In progress | 0 |
| Done | 0 |
| Deferred | 0 |

---

## P1 — High priority

| ID | Enhancement | Business value | Priority | Effort | Related module | Status | Owner |
|----|-------------|----------------|:--------:|:------:|----------------|:------:|-------|
| IMP-001 | Consolidate dual referral systems to `referrals` app | Accurate referral payouts; trust | P1 | M | Customer Growth & Loyalty | Open | Engineering |
| IMP-002 | Rider loyalty UI in mobile app | Retention; visible tier benefits | P1 | M | Yala Rider | Open | Mobile Lead |
| IMP-003 | Partner self-service web portal | Reduce ops overhead for partners | P1 | L | Partner Platform | Open | Engineering |
| IMP-004 | Fix merchant hardcoded destination lat/lng | Correct delivery dispatch | P1 | S | Merchant Platform | Open | Engineering |
| IMP-005 | Surface silent delivery creation failure to merchant | Prevent stuck orders | P1 | S | Merchant, Delivery | Open | Engineering |
| IMP-006 | Admin least-privilege role audit | Security compliance | P1 | M | All admin modules | Open | Security Lead |
| IMP-007 | PgBouncer connection pooling | Scale under concurrent load | P1 | M | Infrastructure | Open | DevOps |
| IMP-008 | Complete merchant portal menu/variants UI | Merchant self-service | P1 | M | Merchant Portal | Open | Product |
| IMP-009 | Wire referral signup to auth registration | Capture referral conversions | P1 | S | Customer Growth | Open | Engineering |
| IMP-010 | Apply referral credits to payment flow | Realize referral value | P1 | M | Payments, Referrals | Open | Engineering |
| IMP-011 | Apple App Store submission (Rider iOS) | iOS market access | P1 | XL | Yala Rider | Open | Product |
| IMP-012 | Automated dependency audit in CI (`pip audit`, `npm audit`) | Supply chain security | P1 | S | Platform | Open | Engineering |

---

## P2 — Medium priority

| ID | Enhancement | Business value | Priority | Effort | Related module | Status | Owner |
|----|-------------|----------------|:--------:|:------:|----------------|:------:|-------|
| IMP-020 | Split Redis logical databases | Stability under load | P2 | S | Infrastructure | Open | DevOps |
| IMP-021 | Celery Flower / queue depth alerting | Ops visibility | P2 | S | Infrastructure | Open | DevOps |
| IMP-022 | Enable Play Integrity post-beta | Reduce device fraud | P2 | S | Rider, Driver | Open | Security |
| IMP-023 | JWT revocation on password change | Security hardening | P2 | M | Authentication | Open | Engineering |
| IMP-024 | Referral push notifications (FCM) | Referrer engagement | P2 | S | Customer Growth | Open | Engineering |
| IMP-025 | Merchant city CharField → City FK | Better geo analytics | P2 | M | Merchant Platform | Open | Engineering |
| IMP-026 | Fleet maintenance reminders UI complete | Fleet compliance | P2 | S | Fleet Performance | Open | Operations |
| IMP-027 | FR/AR privacy and terms localization | Regulatory / store compliance | P2 | M | Legal | Open | Product |
| IMP-028 | Marketing campaign push/email automation | Campaign ROI | P2 | L | Business Ops, Growth | Open | Growth |
| IMP-029 | Fraud flags full Trust & Safety UI integration | Faster fraud response | P2 | M | Trust & Safety | Open | Security |
| IMP-030 | Generate THIRD_PARTY_LICENSES.txt / SBOM | Compliance | P2 | S | Platform | Open | Engineering |
| IMP-031 | Pin DRF/Celery versions in requirements.txt | Reproducible builds | P2 | S | Platform | Open | Engineering |
| IMP-032 | BI read replica or query timeout guards | Protect primary DB | P2 | M | Business Intelligence | Open | Engineering |
| IMP-033 | Supersede June 2026 PRODUCTION_READINESS_AUDIT doc | Doc accuracy | P2 | S | Documentation | Open | Program Office |

---

## P3 — Low priority

| ID | Enhancement | Business value | Priority | Effort | Related module | Status | Owner |
|----|-------------|----------------|:--------:|:------:|----------------|:------:|-------|
| IMP-040 | Open-source license attribution page | Minor compliance | P3 | S | Platform | Open | Engineering |
| IMP-041 | Admin mobile app polish | Internal convenience | P3 | M | Admin Mobile | Open | Engineering |
| IMP-042 | Compliance policy legal review batch | Legal confidence | P3 | M | Compliance & Governance | Open | Legal |
| IMP-043 | Marketing campaign A/B testing framework | Growth optimization | P3 | L | Customer Growth | Open | Growth |
| IMP-044 | Driver achievement notification improvements | Driver engagement | P3 | S | Driver Incentive Engine | Open | Operations |
| IMP-045 | Export param standardization audit (`export_format`) | API consistency | P3 | S | API Platform | Open | Engineering |

---

## Process improvements (non-product)

| ID | Enhancement | Business value | Priority | Effort | Related module | Status | Owner |
|----|-------------|----------------|:--------:|:------:|----------------|:------:|-------|
| IMP-P01 | Enforce green ops test suite in CI gate | Prevent RC regressions | P1 | S | QA / Platform | Open | Engineering |
| IMP-P02 | Mandatory nginx recreate in deploy runbook | Prevent empty SPA | P1 | S | Deployment | Open | DevOps |
| IMP-P03 | Post-deploy cache verification checklist | Perf validation | P1 | S | Performance | Open | Engineering |
| IMP-P04 | Weekly KPI → backlog grooming ritual | CIP discipline | P2 | S | Program Office | Open | Program Office |
| IMP-P05 | Archive superseded audit documents | Doc hygiene | P2 | S | Documentation | Open | Program Office |

---

## Effort key

| Code | Meaning |
|:----:|---------|
| S | Days – 1 week |
| M | 1–2 weeks |
| L | 3–4 weeks |
| XL | 1+ months |

---

## Status definitions

| Status | Meaning |
|--------|---------|
| **Open** | Logged; not yet approved for sprint |
| **Approved** | Approved for upcoming sprint/release |
| **In progress** | Active development per EXECUTION_POLICY |
| **Done** | Deployed and verified per DEFINITION_OF_DONE |
| **Deferred** | Postponed with review date |
| **Cancelled** | No longer needed |

---

## Prioritization rules

1. **P0 bugs** never go in this backlog — use bug register.
2. **Strategic v2 features** never go here — use [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md).
3. **Customer feedback** ENH items enter via [CUSTOMER_FEEDBACK_PROCESS.md](./CUSTOMER_FEEDBACK_PROCESS.md).
4. **Post-release actions** from [POST_RELEASE_REVIEW_TEMPLATE.md](./POST_RELEASE_REVIEW_TEMPLATE.md) enter here or ACTION_REGISTER.
5. Monthly CIP review approves P1 items for next sprint.

---

## Mapping to other registers

| IMP ID | Related bug/debt | VERSION2 / PM register |
|--------|------------------|------------------------|
| IMP-001 | KNOWN-001, TD-001 | v1.1 |
| IMP-002 | KNOWN-003 | v1.1 |
| IMP-003 | KNOWN-004 | v1.1 |
| IMP-004 | TD-006 | v1.1 |
| IMP-005 | TD-007 | v1.1 |
| IMP-007 | BUG-P2-001 | v1.1 |
| IMP-011 | BUG-P1-003, TD-011 | v1.1 |
| IMP-028 | KNOWN-005 | v2.0 |

Full v2 strategic items: [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) · `project-management/05_VERSION_2_BACKLOG.md`

---

## Completed improvements

| ID | Enhancement | Completed | Evidence |
|----|-------------|-----------|----------|
| — | None yet — execution phase active | — | — |

*Populate after first v1.0.x release improvements ship.*

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) | Current platform status |
| [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) | Strategic v2 backlog |
| [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) | Source recommendations |
| [ACTION_REGISTER.md](../program-management/ACTION_REGISTER.md) | P0 execution actions |
| `project-management/04_BUG_AND_TECH_DEBT.md` | Bugs |

---

*Groom biweekly · Owner: Product Lead + Program Office · No implementation without approval*
