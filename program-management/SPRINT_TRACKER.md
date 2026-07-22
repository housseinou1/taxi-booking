# YALA Enterprise v1.0 — Sprint Tracker

**Document ID:** PM-SPRINT-TRACKER-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Status:** Active  
**Governance:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md)

---

## Sprint cadence

| Parameter | Value |
|-----------|-------|
| Duration | 2 weeks |
| Scope rule | Bug fixes, hardening, deploys only — **no new features** |
| Reference | [release/RELEASE_CALENDAR.md](../release/RELEASE_CALENDAR.md) |

---

## Sprint summary

| Sprint | Goal | Status | Completion % | Velocity |
|:------:|------|:------:|:------------:|:--------:|
| **0** | RC2 stabilization & soft launch prep | ✅ Complete | 100% | — |
| **1** | Module audit & execution baseline | ✅ Complete | 100% | 5 docs + audit |
| **2** | P0 remediation → RC-ready | 🟡 **Active** | **15%** | TBD |
| **3** | RC validation & Closed Beta entry | ⬜ Planned | 0% | — |
| **4** | Closed Beta operations | ⬜ Planned | 0% | — |

**Current sprint:** **Sprint 2**

---

## Sprint 1 — Complete ✅

| Field | Value |
|-------|-------|
| **Sprint number** | 1 |
| **Dates** | 2026-07-21 – 2026-07-22 |
| **Sprint goal** | Audit every v1.0 module; establish execution baseline; release & governance docs |
| **Status** | ✅ Complete |
| **Completion %** | 100% |
| **Velocity** | 5 execution docs + 6 governance docs + final RC audit |

### Deliverables (no features)

| Item | Type | Owner | Status |
|------|------|-------|:------:|
| execution/01_SPRINT1_AUDIT.md | Documentation | Program Office | ✅ |
| execution/02_PRIORITY_FIX_LIST.md | Documentation | Program Office | ✅ |
| execution/03_PRODUCTION_READINESS_SCORE.md | Documentation | Program Office | ✅ |
| execution/04_EXECUTION_BOARD.md | Documentation | Program Office | ✅ |
| execution/05_RELEASE_PLAN.md | Documentation | Program Office | ✅ |
| release/RELEASE_LIFECYCLE.md + 4 release docs | Documentation | Program Office | ✅ |
| engineering/DEFINITION_OF_DONE.md | Documentation | Program Office | ✅ |
| release/FINAL_RELEASE_READINESS_AUDIT.md | Audit | Program Office | ✅ |
| Operations test verification | QA | Engineering | ⚠ 8 errors found |

### Bug fixes

| ID | Description | Owner | Status |
|----|-------------|-------|:------:|
| — | None (documentation sprint) | — | — |

---

## Sprint 2 — Active 🟡

| Field | Value |
|-------|-------|
| **Sprint number** | 2 |
| **Dates** | 2026-07-23 – 2026-08-05 (indicative) |
| **Sprint goal** | Close all RC P0 blockers; green operations test suite; deploy RC3; provision staging |
| **Status** | 🟡 In progress |
| **Completion %** | **15%** |
| **Velocity** | TBD at sprint end |

### Features

| ID | Description | Owner | Status |
|----|-------------|-------|:------:|
| — | **No new features authorized** (roadmap frozen) | — | 🔒 |

### Bug fixes & hardening (committed)

| ID | Description | Module | Owner | Priority | Status |
|----|-------------|--------|-------|:--------:|:------:|
| SP2-001 | Fix `api_gateway/signals.py` Merchant.name → business_name | API Gateway | Engineering | P0 | ☐ |
| SP2-002 | Green operations test suite (146/146) | Platform | Engineering | P0 | ☐ |
| SP2-003 | Deploy RC3 backend to production | Platform | DevOps | P0 | ☐ |
| SP2-004 | Apply Phases 29–39 production migrations | Multiple | DevOps | P0 | ☐ |
| SP2-005 | Provision staging environment | Infrastructure | DevOps | P0 | ☐ |
| SP2-006 | Configure offsite encrypted backup + drill | Infrastructure | DevOps | P0 | ☐ |
| SP2-007 | Re-run p95 load test post-RC3 | Platform | Engineering | P0 | ☐ |
| SP2-008 | Instantiate RELEASE_CHECKLIST_v1.0.0-rc3 | Release | Program Office | P0 | ☐ |
| SP2-009 | Rebuild mobile APKs from RC3 source | Mobile | Mobile Lead | P1 | ☐ |
| SP2-010 | Fix core unit test fixture drift (7 tests) | Rider/Driver/Delivery | Engineering | P1 | ☐ |

### Owners

| Role | Sprint 2 lead responsibilities |
|------|----------------------------------|
| Engineering Lead | SP2-001, SP2-002, SP2-007, SP2-010 |
| DevOps Lead | SP2-003, SP2-004, SP2-005, SP2-006 |
| QA Lead | Device QA prep (Sprint 3 entry) |
| Program Office | SP2-008, sprint reporting |
| Mobile Lead | SP2-009 |

### Sprint 2 exit criteria

| # | Criterion | Status |
|---|-----------|:------:|
| S2-01 | All RB-P0-001 – RB-P0-008 closed | ☐ |
| S2-02 | Operations tests 0 errors | ☐ |
| S2-03 | RC3 deployed; health PASS | ☐ |
| S2-04 | Staging operational | ☐ |
| S2-05 | Offsite backup certified | ☐ |
| S2-06 | RELEASE_CHECKLIST rc3 complete | ☐ |
| S2-07 | Sprint retrospective documented | ☐ |

Reference: [execution/05_RELEASE_PLAN.md](../execution/05_RELEASE_PLAN.md) Stage 2

---

## Sprint 3 — Planned ⬜

| Field | Value |
|-------|-------|
| **Sprint number** | 3 |
| **Dates** | 2026-08-06 – 2026-08-19 (indicative) |
| **Sprint goal** | Tag RC3; full RC validation; begin Closed Beta entry |
| **Status** | ⬜ Planned |
| **Completion %** | 0% |

### Planned work

| Item | Type | Owner |
|------|------|-------|
| Tag v1.0.0-rc3 | Release | DevOps |
| RC validation (RELEASE_CHECKLIST) | QA | QA Lead |
| Physical device QA sign-off | QA | QA Lead |
| Pilot cohort recruitment | Ops | Operations Manager |
| Play closed testing track | Product | Product Lead |
| CEO Gate A review | Executive | CEO |

---

## Sprint 4 — Planned ⬜

| Field | Value |
|-------|-------|
| **Sprint goal** | Closed Beta operations; beta metrics; Gate A exit |
| **Dates** | 2026-08-20 – 2026-09-02 (indicative) |
| **Reference** | [release/BETA_SUCCESS_METRICS.md](../release/BETA_SUCCESS_METRICS.md) |

---

## Velocity tracking

| Sprint | Planned items | Completed | Carry-over | Velocity index |
|:------:|:-------------:|:---------:|:----------:|:--------------:|
| 0 | RC2 cert | 100% | 0 | — |
| 1 | 8 doc deliverables | 8/8 | 0 | High (docs) |
| 2 | 10 execution items | 0/10 | — | TBD |
| 3 | TBD | — | — | — |

*Velocity index = completed P0+P1 items / planned (execution sprints)*

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md) | Executive summary |
| [ACTION_REGISTER.md](./ACTION_REGISTER.md) | Detailed actions |
| [release/RELEASE_BLOCKERS.md](../release/RELEASE_BLOCKERS.md) | P0 blockers |
| [execution/02_PRIORITY_FIX_LIST.md](../execution/02_PRIORITY_FIX_LIST.md) | Fix priorities |

---

*Update at sprint boundaries and mid-sprint check (Day 5) · Program Office*
