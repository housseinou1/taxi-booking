# YALA Enterprise v1.0 — Program Dashboard

**Document ID:** PM-PROGRAM-DASHBOARD-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Status:** Active — Central execution hub  
**Governance:** [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) · [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md)

---

## Purpose

Central **Program Management Dashboard** tracking execution across engineering, QA, operations, deployment, and launch readiness. Refreshed weekly; CEO review every Monday.

**Related dashboards:** [KPI_SCOREBOARD.md](./KPI_SCOREBOARD.md) · [SPRINT_TRACKER.md](./SPRINT_TRACKER.md) · [06_PROJECT_DASHBOARD.md](./06_PROJECT_DASHBOARD.md) (legacy metrics)

---

## Executive at a glance

| Metric | Value | Target | Status |
|--------|------:|-------:|:------:|
| **Overall Project Health** | 🟡 **At Risk** | Green | RC blockers open |
| **Overall Completion %** | **94%** (build) · **72%** (RC readiness) | 100% / 85+ RC | 🟡 / 🔴 |
| **Current Sprint** | **Sprint 2** — P0 Remediation | — | 🟡 In progress |
| **Current Release** | **v1.0.0-rc3** (target) · pre-RC on prod | RC tagged | 🔴 Not tagged |
| **Open Risks** | **12 active** (3 critical) | ≤ 2 critical | 🔴 |
| **Critical Blockers** | **8 P0** (RC) + **2 P0** (launch register) | 0 | 🔴 |
| **Overall Launch Readiness** | **72 / 100** (RC audit) · **78 / 100** (module) | 90+ GA | 🔴 |

**RC verdict:** **NOT READY FOR RELEASE CANDIDATE** — [release/EXECUTIVE_SCORECARD.md](../release/EXECUTIVE_SCORECARD.md)

---

## Overall Project Health

```
Health indicator:  AT RISK
Planning:          CLOSED ✅
Execution:           ACTIVE 🟡
Scope freeze:        ENFORCED ✅
RC readiness:        NOT READY 🔴
Closed Beta (Gate A): NOT READY 🔴
General Availability: NOT READY 🔴
```

| Dimension | Health | Score | Trend |
|-----------|:------:|:-----:|:-----:|
| Engineering (build) | 🟢 Good | 95% | → |
| Engineering (quality) | 🔴 At risk | 68% | ↓ (test regression) |
| QA | 🔴 At risk | 55% | → |
| Operations | 🟡 Fair | 65% | → |
| Deployment | 🔴 At risk | 63% | → |
| Documentation | 🟢 Excellent | 91% | ↑ |
| Security | 🟢 Good | 81% | → |
| Launch | 🔴 Blocked | 72% | → |

**Primary drivers:** Test suite errors (8), RC3 undeployed, no staging, offsite backup P0.

---

## Overall Completion %

### Build completion (roadmap)

| Category | Complete | Total | % |
|----------|:--------:|:-----:|:-:|
| Roadmap phases | 39 | 39 | **100%** |
| Platform modules (weighted) | — | — | **94%** |
| Governance framework | 20+ docs | — | **100%** |

### Execution completion (launch path)

| Stage | Status | Completion |
|-------|:------:|:----------:|
| Planning & freeze | ✅ Done | 100% |
| Sprint 1 audit | ✅ Done | 100% |
| Sprint 2 P0 fixes | 🟡 Active | 15% |
| Release Candidate | ⬜ Not started | 0% |
| Closed Beta (Gate A) | ⬜ Blocked | 45% |
| General Availability (Gate B) | ⬜ Blocked | 25% |

**Weighted execution completion:** **~58%** toward GA · **~15%** toward RC tag

---

## Current Sprint

| Field | Value |
|-------|-------|
| **Sprint** | Sprint 2 — P0 Remediation |
| **Dates** | 2026-07-23 – 2026-08-05 (indicative) |
| **Goal** | Close all RC P0 blockers; green test suite; deploy RC3 |
| **Owner** | Engineering Lead + DevOps Lead |
| **Completion** | **15%** |

Detail: [SPRINT_TRACKER.md](./SPRINT_TRACKER.md)

---

## Current Release

| Field | Value |
|-------|-------|
| **Target release** | v1.0.0-rc3 |
| **Release type** | Release Candidate |
| **Production today** | Pre-RC3 backend · Phase 20 deployed |
| **RC tag status** | **Not created** |
| **Release owner** | DevOps Lead |
| **Target RC window** | 2026-08-06 – 2026-08-12 |

**Release path:** Sprint 2 → RC3 → Closed Beta → GA — [execution/05_RELEASE_PLAN.md](../execution/05_RELEASE_PLAN.md)

**Checklist:** [release/RELEASE_CHECKLIST.md](../release/RELEASE_CHECKLIST.md) (not instantiated for rc3)

---

## Open Risks

| ID | Risk | Impact | Owner | Status |
|----|------|:------:|-------|:------:|
| PM-R-01 | RC delayed by P0 blockers | High | CEO | Open |
| PM-R-02 | Test suite regression undetected | High | Engineering | Open |
| PM-R-03 | Offsite backup failure = data loss | Critical | DevOps | Open |
| PM-R-04 | Deploy without staging causes incident | High | DevOps | Open |
| PM-R-05 | p95 latency under admin load | High | Engineering | Open |

**Full register:** [RISK_REGISTER.md](./RISK_REGISTER.md) · `handover/05_RISK_REGISTER.md`

**Open risks:** 12 active · **3 critical/high unmitigated**

---

## Critical Blockers

| # | Blocker | Priority | Owner | Tracker |
|---|---------|:--------:|-------|---------|
| 1 | Operations test suite 8 errors (`Merchant.name` bug) | P0 RC | Engineering | RB-P0-001 |
| 2 | RC3 backend not deployed | P0 RC | DevOps | RB-P0-002 |
| 3 | Phases 29–39 migrations not on prod | P0 RC | DevOps | RB-P0-003 |
| 4 | No staging environment | P0 RC | DevOps | RB-P0-004 |
| 5 | Offsite encrypted backups not configured | P0 | DevOps | RB-P0-005 |
| 6 | RELEASE_CHECKLIST not complete for rc3 | P0 RC | Program Office | RB-P0-007 |
| 7 | p95 not re-measured post-RC3 | P0 RC | Engineering | RB-P0-008 |
| 8 | Physical device QA unsigned | P0 launch | QA Lead | BUG-P0-001 |

**Full list:** [release/RELEASE_BLOCKERS.md](../release/RELEASE_BLOCKERS.md) · [ACTION_REGISTER.md](./ACTION_REGISTER.md)

---

## Overall Launch Readiness

| Gate | Score / Status | Ready? |
|------|:--------------:|:------:|
| **RC readiness** | 72 / 100 | ❌ |
| **Gate A — Closed Beta** | 45% checklist | ❌ |
| **Gate B — General Availability** | 25% checklist | ❌ |
| Module build readiness | 78 / 100 | ⚠ |
| Documentation readiness | 91 / 100 | ✅ |

**Sources:** [release/EXECUTIVE_SCORECARD.md](../release/EXECUTIVE_SCORECARD.md) · [release/FINAL_RELEASE_READINESS_AUDIT.md](../release/FINAL_RELEASE_READINESS_AUDIT.md) · [docs/PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)

---

## Workstream status

| Workstream | Owner | Progress | Status |
|------------|-------|:--------:|:------:|
| P0 bug fixes & test suite | Engineering | 10% | 🟡 |
| RC3 production deploy | DevOps | 0% | 🔴 |
| Staging environment | DevOps | 0% | 🔴 |
| Offsite backup | DevOps | 0% | 🔴 |
| Physical device QA | QA Lead | 0% | 🔴 |
| Pilot cohort (20/10/100) | Operations | 15% | 🔴 |
| Play Store submission | Product | 70% | 🟡 |
| Executive sign-off | CEO | 0% | ⬜ |

---

## Program document index

| # | Document | Purpose |
|---|----------|---------|
| — | **PROGRAM_DASHBOARD.md** | This dashboard |
| — | [SPRINT_TRACKER.md](./SPRINT_TRACKER.md) | Sprint execution |
| — | [RISK_REGISTER.md](./RISK_REGISTER.md) | Program risks |
| — | [DECISION_LOG.md](./DECISION_LOG.md) | Major decisions |
| — | [ACTION_REGISTER.md](./ACTION_REGISTER.md) | Tracked actions |
| — | [WEEKLY_STATUS_TEMPLATE.md](./WEEKLY_STATUS_TEMPLATE.md) | Weekly report template |
| — | [KPI_SCOREBOARD.md](./KPI_SCOREBOARD.md) | KPI metrics |
| 01 | [01_PROJECT_PORTFOLIO.md](./01_PROJECT_PORTFOLIO.md) | Platform register |
| 04 | [04_BUG_AND_TECH_DEBT.md](./04_BUG_AND_TECH_DEBT.md) | Bugs & debt |
| 06 | [06_PROJECT_DASHBOARD.md](./06_PROJECT_DASHBOARD.md) | Legacy dashboard |

---

## Governance cross-references

| Document | Path |
|----------|------|
| Project status | [docs/PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) |
| Execution policy | [docs/EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) |
| Quality gates | [docs/QUALITY_GATES.md](../docs/QUALITY_GATES.md) |
| Definition of done | [engineering/DEFINITION_OF_DONE.md](../engineering/DEFINITION_OF_DONE.md) |
| Release lifecycle | [release/RELEASE_LIFECYCLE.md](../release/RELEASE_LIFECYCLE.md) |
| Execution board | [execution/04_EXECUTION_BOARD.md](../execution/04_EXECUTION_BOARD.md) |

---

## Change log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-22 | Initial program dashboard — post final RC audit | Program Office |

---

*Refresh weekly · Align with [WEEKLY_STATUS_TEMPLATE.md](./WEEKLY_STATUS_TEMPLATE.md) · Owner: YALA Enterprise Program Office*
