# YALA Enterprise v1.0 — KPI Scoreboard

**Document ID:** PM-KPI-SCOREBOARD-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Report period:** Sprint 2 Week 1  
**Governance:** [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) · [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md) · [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md)

---

## KPI summary

| Domain | Score | Target | Status | Trend |
|--------|:-----:|:------:|:------:|:-----:|
| **Engineering** | **82** | 90 | 🟡 | → |
| **QA** | **58** | 85 | 🔴 | ↓ |
| **Operations** | **65** | 80 | 🟡 | → |
| **Finance** | **85** | 85 | 🟢 | → |
| **Customer Support** | **70** | 80 | 🟡 | → |
| **Security** | **81** | 85 | 🟢 | → |
| **Deployment** | **55** | 90 | 🔴 | → |
| **Documentation** | **91** | 85 | 🟢 | ↑ |
| **Launch** | **72** | 90 | 🔴 | → |

**Composite program KPI:** **72 / 100** (RC readiness weighted)

---

## Engineering

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Roadmap phases complete | 39/39 (100%) | 100% | 🟢 | PROJECT_STATUS |
| Platform build completion | 94% | 100% | 🟢 | 06_PROJECT_DASHBOARD |
| Operations test pass rate | **94.5%** (138/146) | 100% | 🔴 | Final RC audit |
| Academy + Gateway tests | 100% (22/22) | 100% | 🟢 | Final RC audit |
| Core unit test pass rate | ~96% (~173/180) | 100% | 🟡 | KNOWN-006 |
| Open P0 engineering bugs | 1 (test regression) | 0 | 🔴 | RELEASE_BLOCKERS |
| RC3 deploy status | Not deployed | Deployed | 🔴 | BUG-P1-006 |
| Code freeze compliance | 100% | 100% | 🟢 | ROADMAP_FREEZE |

**Engineering score:** **82 / 100** — Strong build; quality drag from test regression.

---

## QA

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Physical device QA signed | **No** | Yes | 🔴 | BUG-P0-001 |
| API lifecycle certification | Pass | Pass | 🟢 | RC2 cert |
| Delivery prod E2E | Not certified | Pass | 🔴 | BUG-P1-005 |
| Load test 5xx rate | 0% | 0% | 🟢 | Phase 16 |
| Regression tests automated | Partial | Full | 🟡 | DoD |
| QA gate checklist complete | 45% | 100% | 🔴 | UAT checklist |

**QA score:** **58 / 100** — Device QA and E2E gaps block launch path.

---

## Operations

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Pilot cohort — drivers | ~2 | 20 | 🔴 | UAT |
| Pilot cohort — couriers | ~0 | 10 | 🔴 | UAT |
| Pilot cohort — riders | ~5 | 100 | 🔴 | UAT |
| Ops admin modules live | 95%+ | 100% | 🟢 | Sprint 1 audit |
| SOS/incident runbook | Documented | Drilled | 🟡 | O-03 risk |
| Launch hub configured | Yes | Yes | 🟢 | Gate A-14 |
| Daily CEO reporting template | Ready | In use | 🟢 | release/ |

**Operations score:** **65 / 100** — Platform ready; cohort and drills lagging.

---

## Finance

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Finance Operations Center | Complete | Complete | 🟢 | Phase 24 |
| Reconciliation dashboard | Live | Live | 🟢 | Prod spot-check |
| Withdrawal queue functional | Yes | Yes | 🟢 | Phase cert |
| Merchant/partner settlements | Built | Tested at scale | 🟡 | B-06 risk |
| PCI scope documented | Partial | Complete | 🟡 | C-03 |
| Finance test suite | Pass | Pass | 🟢 | test_finance_operations |

**Finance score:** **85 / 100** — On target for v1.0.

---

## Customer Support

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Support playbook | Complete | Complete | 🟢 | docs/SUPPORT_PLAYBOOK |
| Beta feedback center | Live | Live | 🟢 | Admin /support |
| Trust & Safety manual | Complete | Trained | 🟡 | O-03 |
| Support staff trained on SOS | Partial | Complete | 🟡 | Handover |
| Ticket routing defined | Yes | Yes | 🟢 | Support matrix |
| In-app help / FAQ | Partial | Complete | 🟡 | Mobile |

**Customer Support score:** **70 / 100** — Docs ready; training incomplete.

---

## Security

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| JWT + 2FA + audit | Implemented | Complete | 🟢 | Security arch |
| Rate limiting | Active | Active | 🟢 | settings.py |
| Offsite backup | **Not configured** | Complete | 🔴 | SEC-001 |
| Security UAT | Partial | Complete | 🟡 | Gate B-11 |
| Play Integrity | Disabled | Beta off OK | 🟡 | SEC-002 |
| Least-privilege audit | Incomplete | Complete | 🟡 | SEC-004 |
| Partner API security | Complete | Complete | 🟢 | Phase 38 |

**Security score:** **81 / 100** — Strong controls; backup P0 drags score.

---

## Deployment

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Production uptime (health) | OK | 99.9% | 🟢 | Sprint 1 validation |
| Staging environment | **None** | Live | 🔴 | TD-008 |
| RC3 on production | **No** | Yes | 🔴 | RB-P0-002 |
| Migrations 29–39 on prod | **No** | Yes | 🔴 | RB-P0-003 |
| Rollback plan documented | Yes | Yes | 🟢 | ROLLBACK_PLAN |
| Docker compose healthy | 9/9 Up | 9/9 | 🟢 | UAT checklist |
| Frontend/nginx deploy | OK | OK | 🟢 | Sprint 1 |

**Deployment score:** **55 / 100** — Infra live but RC path blocked.

---

## Documentation

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| Governance docs complete | 100% | 100% | 🟢 | docs/ + release/ |
| Engineering handbook | 9/9 docs | Complete | 🟢 | engineering/ |
| Phase reports (20–39) | 95% | 100% | 🟢 | release/ |
| Program management pack | 7/7 docs | Complete | 🟢 | This pack |
| API catalog current | Partial | Complete | 🟡 | Phase 38 OpenAPI |
| Signed QA evidence | 0% | 100% | 🔴 | Device QA |
| Doc consistency | 90% | 95% | 🟡 | Stale test baseline |

**Documentation score:** **91 / 100** — Excellent governance; evidence gaps.

---

## Launch

| KPI | Value | Target | Status | Source |
|-----|------:|-------:|:------:|--------|
| RC readiness score | **72** | 85+ | 🔴 | EXECUTIVE_SCORECARD |
| Gate A readiness | 45% | 100% | 🔴 | UAT Gate A |
| Gate B readiness | 25% | 100% | 🔴 | UAT Gate B |
| Launch readiness (module) | 78 | 90+ | 🟡 | Sprint 1 score |
| Open RC P0 blockers | **8** | 0 | 🔴 | RELEASE_BLOCKERS |
| Release checklist rc3 | Not started | Complete | 🔴 | RB-P0-007 |
| CEO sign-off | Pending | Complete | ⬜ | UAT_EXECUTIVE_SIGNOFF |
| Beta metrics framework | Ready | Tracking | 🟢 | BETA_SUCCESS_METRICS |

**Launch score:** **72 / 100** — NOT READY for RC.

---

## KPI trend (weekly)

| Week ending | Eng | QA | Ops | Deploy | Launch | Composite |
|-------------|:---:|:--:|:---:|:------:|:------:|:---------:|
| 2026-07-22 | 82 | 58 | 65 | 55 | 72 | **72** |
| 2026-07-15 | 85 | 65 | 60 | 50 | 78 | 78 |
| *2026-07-15 estimated from Sprint 0/1 prior data* | | | | | | |

*Note: 2026-07-22 composite adjusted down for RC-specific test failure (not in prior dashboard).*

---

## KPI definitions

| KPI | Formula / source |
|-----|------------------|
| Engineering score | Weighted: build 40%, tests 35%, deploy 15%, freeze 10% |
| QA score | Weighted: device QA 30%, E2E 25%, automation 20%, gates 25% |
| Operations score | Weighted: cohort 40%, modules 30%, runbooks 30% |
| Deployment score | Weighted: prod health 20%, staging 20%, RC deploy 30%, migrations 30% |
| Launch score | RC readiness from EXECUTIVE_SCORECARD |
| Composite | Launch 30%, Engineering 20%, QA 15%, Deploy 15%, Security 10%, Docs 10% |

---

## Targets by milestone

| Milestone | Composite target | Key KPIs |
|-----------|:----------------:|----------|
| RC tag | ≥ 85 | Tests 100%, RC3 deployed, staging live |
| Gate A (Closed Beta) | ≥ 88 | Device QA, backup, cohort |
| Gate B (GA) | ≥ 90 | p95 < 2s, Play live, CEO sign-off |

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md) | Executive dashboard |
| [release/EXECUTIVE_SCORECARD.md](../release/EXECUTIVE_SCORECARD.md) | RC audit scores |
| [execution/03_PRODUCTION_READINESS_SCORE.md](../execution/03_PRODUCTION_READINESS_SCORE.md) | Module scores |
| [WEEKLY_STATUS_TEMPLATE.md](./WEEKLY_STATUS_TEMPLATE.md) | Weekly reporting |

---

*Update weekly with [WEEKLY_STATUS_TEMPLATE.md](./WEEKLY_STATUS_TEMPLATE.md) · Owner: Program Office*
