# Sprint 1 — Release Plan

**Document ID:** EXEC-SPRINT1-RELEASE-001  
**Sprint:** Execution Sprint 1  
**Date:** 2026-07-22  
**Version:** YALA Enterprise v1.0  
**Status:** Active  
**Governance:** [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) · [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md)  
**Related:** [04_EXECUTION_BOARD.md](./04_EXECUTION_BOARD.md) · `release/UAT_RELEASE_READINESS_CHECKLIST.md`

---

## Release Strategy

YALA Enterprise v1.0 follows a **controlled, gate-based release**. No new features are introduced during execution. Each stage has explicit **exit criteria** aligned with [Quality Gates](../docs/QUALITY_GATES.md).

```
Sprint 1 (Audit) → Sprint 2 (P0 Fixes) → Release Candidate → Closed Beta → General Availability
```

**Current position:** Sprint 1 complete → entering Sprint 2

---

## Release Timeline (Indicative)

| Stage | Target window | Owner |
|-------|---------------|-------|
| Sprint 1 — Audit & baseline | 2026-07-21 – 2026-07-22 | Program Office |
| Sprint 2 — P0 remediation | 2026-07-23 – 2026-08-05 | Engineering / DevOps / QA |
| Release Candidate (RC3) | 2026-08-06 – 2026-08-12 | DevOps / Engineering |
| Closed Beta (Gate A) | 2026-08-13 – 2026-09-15 | Operations / Product |
| General Availability (Gate B) | 2026-09-16+ | CEO / Program Office |

*Dates are indicative; CEO may adjust based on P0 closure evidence.*

---

## Stage 1 — Sprint 1 (Complete)

**Objective:** Audit every v1.0 module; establish execution baseline; no code changes.

### Scope

- Module classification (✅ / ⚠ / ❌)
- Quality gate verification per module
- Priority fix list (P0–P3)
- Production readiness scores
- Execution board
- Release plan (this document)

### Deliverables

| Deliverable | Status |
|-------------|:------:|
| `execution/01_SPRINT1_AUDIT.md` | ✅ |
| `execution/02_PRIORITY_FIX_LIST.md` | ✅ |
| `execution/03_PRODUCTION_READINESS_SCORE.md` | ✅ |
| `execution/04_EXECUTION_BOARD.md` | ✅ |
| `execution/05_RELEASE_PLAN.md` | ✅ |

### Exit criteria

| # | Criterion | Status |
|---|-----------|:------:|
| S1-01 | All v1.0 modules audited and classified | ✅ |
| S1-02 | Every finding references affected module | ✅ |
| S1-03 | Findings mapped to QUALITY_GATES.md | ✅ |
| S1-04 | P0/P1 fix list published | ✅ |
| S1-05 | No features added or scope changed | ✅ |
| S1-06 | Execution board assigns owners | ✅ |
| S1-07 | Release plan with exit criteria approved | ☐ CEO ack |

**Sprint 1 exit:** ✅ **COMPLETE** (pending CEO acknowledgment of baseline)

---

## Stage 2 — Sprint 2 (P0 Remediation)

**Objective:** Close all P0 blockers; deploy RC3; apply migrations; green test suite.

### Scope (from [02_PRIORITY_FIX_LIST.md](./02_PRIORITY_FIX_LIST.md))

- FIX-P0-001 through FIX-P0-006
- Selected P1 items required for RC validation (FIX-P1-001, FIX-P1-002, FIX-P1-013)

### Work packages

| WP | Module(s) | Owner | Quality gates |
|:--:|-----------|-------|---------------|
| WP-2A | Infrastructure — offsite backup, staging | DevOps | 7, 8, 9, 10 |
| WP-2B | Platform — RC3 backend deploy | Engineering / DevOps | 1, 4, 7, 8, 10 |
| WP-2C | Phases 29–39 — production migrations | DevOps | 1, 5, 10 |
| WP-2D | Operations test suite — 8 errors | Engineering | 4, 5 |
| WP-2E | Mobile — device QA + RC3 APK | QA / Mobile | 6, 10 |
| WP-2F | Delivery — prod E2E fix | Engineering / QA | 5, 6 |

### Exit criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| S2-01 | All P0 fixes closed or explicitly deferred with CEO approval | Fix list review |
| S2-02 | RC3 backend deployed; health check PASS | `/api/health/ready/` |
| S2-03 | Phases 29–39 migrations applied on production | `showmigrations` + smoke tests |
| S2-04 | Operations test suite 0 errors | `python manage.py test tests.operations` |
| S2-05 | Offsite backup configured + restore drill PASS | Certification script |
| S2-06 | Staging environment operational | Staging smoke test |
| S2-07 | Physical device QA signed (all 3 apps) | Signed QA report |
| S2-08 | Overall readiness score ≥ 85 | [03_PRODUCTION_READINESS_SCORE.md](./03_PRODUCTION_READINESS_SCORE.md) |
| S2-09 | All work followed EXECUTION_POLICY.md stages 1–10 | Work item audit |
| S2-10 | PROJECT_STATUS.md updated | Doc review |

**Sprint 2 exit:** Gate A prerequisites met (except executive sign-off)

---

## Stage 3 — Release Candidate (RC3)

**Objective:** Frozen build candidate validated for closed beta entry.

### Scope

- Tag `v1.0.0-rc3` (or successor) on backend + mobile
- No new code except P0/P1 hotfixes
- Full regression on staging then production

### Validation checklist

| # | Check | Module | Gate |
|---|-------|--------|:----:|
| RC-01 | Backend tag deployed to production | Platform | 10 |
| RC-02 | Mobile APK/AAB rebuilt from RC3 source | Rider, Driver, Delivery | 6, 10 |
| RC-03 | All admin routes HTTP 200 | All admin modules | 2, 5 |
| RC-04 | Core API lifecycle PASS | Rider, Driver, Delivery | 5 |
| RC-05 | p95 latency re-measured | Platform | 8 |
| RC-06 | Load test 0× HTTP 5xx | Platform | 8 |
| RC-07 | Security UAT complete | Security & Audit | 7 |
| RC-08 | API catalog / docs current | API Gateway, all changed APIs | 3, 9 |
| RC-09 | Rollback procedure tested | Infrastructure | 10 |
| RC-10 | Known issues register updated | All | 9 |

### Exit criteria

| # | Criterion | Target |
|---|-----------|--------|
| RC-E1 | p95 latency < 3000 ms (interim; Gate B requires < 2000 ms) | Load test report |
| RC-E2 | 0 P0 open defects | Fix list |
| RC-E3 | Operations + academy + api_gateway tests green | CI / local run |
| RC-E4 | RC3 mobile builds distributed to internal testers | Distribution log |
| RC-E5 | Staging sign-off from Engineering Lead | Written ack |
| RC-E6 | Release notes published | `release/` folder |

**RC exit:** Ready for Closed Beta entry review

---

## Stage 4 — Closed Beta (Gate A)

**Objective:** Limited pilot with capped cohort; validate real-world operations.

### Cohort caps

| Role | Cap |
|------|:---:|
| Drivers | 20 |
| Couriers | 10 |
| Riders | 100 |

### Scope

- Google Play **closed testing** track (Android)
- Apple iOS deferred unless explicitly approved
- Operations monitoring via Launch Command Center
- Trust & Safety active monitoring

### Gate A exit criteria

*From `release/UAT_RELEASE_READINESS_CHECKLIST.md` Gate A*

| # | Criterion | Status at Sprint 1 |
|---|-----------|:------------------:|
| A-01 | Production API health OK | ✅ |
| A-02 | Full ride API lifecycle PASS | ✅ |
| A-03 | Admin SPA routes HTTP 200 | ✅ |
| A-04 – A-08 | Executive/Ops/Business/Launch/AI APIs 200 | ✅ |
| A-09 | Load test 0× 5xx | ✅ |
| A-10 | SSL / HTTPS valid | ✅ |
| A-11 | Local encrypted backup + drill | ✅ |
| A-12 | Backup monitor cron active | ✅ |
| A-13 | Post-launch procedures documented | ✅ |
| A-14 | Pilot caps defined | ✅ |
| A-15 | Feature freeze acknowledged | ✅ |
| A-16 | **Physical device QA signed** | ❌ |
| A-17 | **Offsite backup configured** | ❌ |
| A-18 | **Executive sign-off completed** | ☐ |

### Beta success metrics

Track per `release/BETA_SUCCESS_METRICS.md`:

- Ride completion rate
- Driver acceptance rate
- Support ticket volume
- SOS/incident response time
- Payment success rate
- App crash-free rate

### Closed Beta exit criteria

| # | Criterion |
|---|-----------|
| CB-E1 | All Gate A items ✅ (A-01 through A-18) |
| CB-E2 | Pilot cohort at cap for ≥ 2 weeks |
| CB-E3 | Beta success metrics meet minimum thresholds |
| CB-E4 | No unresolved P0 incidents during beta |
| CB-E5 | CEO closed-beta sign-off (`UAT_EXECUTIVE_SIGNOFF.md`) |
| CB-E6 | Quality gates 1–11 satisfied for all launch-critical modules |

**Closed Beta exit:** Authorized to proceed to GA preparation

---

## Stage 5 — General Availability (Gate B)

**Objective:** Public launch with store presence and performance SLOs.

### Gate B exit criteria

*From `release/UAT_RELEASE_READINESS_CHECKLIST.md` Gate B*

| # | Criterion | Status at Sprint 1 |
|---|-----------|:------------------:|
| B-01 | All Gate A items ✅ | ☐ |
| B-02 | Physical device QA — all P0 tests PASS | ☐ |
| B-03 | Offsite backup certification PASS | ☐ |
| B-04 | **p95 latency < 2000 ms under load** | ❌ (4086 ms) |
| B-05 | Play Console closed testing live | ☐ |
| B-06 | Apple App Store submitted (or formally deferred) | ☐ |
| B-07 | Pilot cohort at target (20/10/100) | ❌ |
| B-08 | Privacy / terms pages live | ✅ |
| B-09 | Account deletion flow attested | ☐ |
| B-10 | Safe migrations applied | ☐ |
| B-11 | Security UAT complete | ⚠️ |
| B-12 | **CEO public launch sign-off** | ☐ |

### GA exit criteria

| # | Criterion |
|---|-----------|
| GA-E1 | All Gate B items ✅ |
| GA-E2 | Google Play production track (or approved phased rollout) |
| GA-E3 | Support team trained and staffed (`operations/07_TRUST_AND_SAFETY_MANUAL.md`) |
| GA-E4 | Monitoring and incident response validated (`docs/INCIDENT_RESPONSE.md`) |
| GA-E5 | Post-launch support procedures active |
| GA-E6 | Overall readiness score ≥ 90 |
| GA-E7 | CEO public launch approval documented |
| GA-E8 | No open P0/P1 defects for launch-critical modules |

**GA exit:** YALA Enterprise v1.0 publicly available

---

## Release Sequence Diagram

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Sprint 1   │───▶│  Sprint 2   │───▶│     RC3     │───▶│ Closed Beta │───▶│     GA      │
│   (Audit)   │    │ (P0 Fixes)  │    │  Candidate  │    │  (Gate A)   │    │  (Gate B)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      ✅                  ☐                  ☐                  ☐                  ☐
  Docs only          Deploy+QA           Validate           20/10/100          Public launch
```

---

## Rollback Policy

At any stage before GA:

1. **Backend:** Revert to previous Docker image tag; verify health endpoint.
2. **Database:** Migrations are forward-only; rollback requires restore from backup ( reinforces FIX-P0-002).
3. **Mobile:** Distribute previous APK/AAB to pilot cohort via Play internal track.
4. **Communication:** Notify pilot users via Launch Command Center broadcast.

Document every rollback in `release/` and update [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md).

---

## Roles & Approvals

| Stage | Approver | Document |
|-------|----------|----------|
| Sprint 1 exit | Program Office | This release plan |
| Sprint 2 exit | Engineering Lead + DevOps Lead | Sprint 2 completion report |
| RC exit | Engineering Lead | RC validation checklist |
| Closed Beta entry | CEO | `UAT_EXECUTIVE_SIGNOFF.md` (Gate A) |
| GA entry | CEO | `UAT_EXECUTIVE_SIGNOFF.md` (Gate B) |

Gate 11 (CEO approval) per [QUALITY_GATES.md](../docs/QUALITY_GATES.md) applies at Closed Beta and GA.

---

## Out of Scope (Frozen)

Per [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md):

- Version 2.x features (AI Ops Assistant, Multi-country, ESG, etc.)
- New modules or business logic changes
- UI redesigns
- Items in [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md)

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [01_SPRINT1_AUDIT.md](./01_SPRINT1_AUDIT.md) | Module audit |
| [02_PRIORITY_FIX_LIST.md](./02_PRIORITY_FIX_LIST.md) | Fix priorities |
| [03_PRODUCTION_READINESS_SCORE.md](./03_PRODUCTION_READINESS_SCORE.md) | Readiness scores |
| [04_EXECUTION_BOARD.md](./04_EXECUTION_BOARD.md) | Module board |
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Gate definitions |
| `release/UAT_RELEASE_READINESS_CHECKLIST.md` | Gate A/B checklist |
| `release/BETA_SUCCESS_METRICS.md` | Beta KPIs |

---

*Release plan effective 2026-07-22 · YALA Enterprise Program Office · Execution phase active*
