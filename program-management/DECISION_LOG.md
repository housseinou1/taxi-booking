# YALA Enterprise v1.0 — Decision Log

**Document ID:** PM-DECISION-LOG-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Status:** Active  
**Governance:** [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) · [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md)

---

## Purpose

Track **major program decisions** affecting scope, architecture, release strategy, or governance. Minor technical decisions remain in PR/commit history.

---

## Decision index

| ID | Description | Date | Owner | Status |
|----|-------------|------|-------|:------:|
| DEC-001 | Version 1.0 roadmap planning closed (Phases 1–39) | 2026-07-21 | CEO | ✅ Active |
| DEC-002 | Version 1.0 scope frozen — no new features without CEO approval | 2026-07-21 | CEO | ✅ Active |
| DEC-003 | Execution phase begins; EXECUTION_POLICY governs all work | 2026-07-21 | Program Office | ✅ Active |
| DEC-004 | Version 2.x (Phases 40–44) — Future Vision only, not approved | 2026-07-21 | CEO | ✅ Active |
| DEC-005 | Android-first launch; Apple iOS deferred to post-beta | 2026-07-21 | CEO / Product | ✅ Active |
| DEC-006 | Controlled Closed Beta before General Availability | 2026-07-21 | CEO | ✅ Active |
| DEC-007 | Pilot cohort caps: 20 drivers, 10 couriers, 100 riders | 2026-07-21 | CEO / Ops | ✅ Active |
| DEC-008 | RC3 as next Release Candidate (not RC4) | 2026-07-21 | Engineering | ✅ Active |
| DEC-009 | Sprint 1 = audit only; no code changes | 2026-07-22 | Program Office | ✅ Closed |
| DEC-010 | NOT READY for RC — P0 blockers must close first | 2026-07-22 | Program Office | ✅ Active |
| DEC-011 | Gate-based release: RC → Closed Beta → GA | 2026-07-22 | Program Office | ✅ Active |
| DEC-012 | Staging environment required before prod migration batch | 2026-07-22 | DevOps / Engineering | 🟡 Pending execution |
| DEC-013 | BI ETL warehouse deferred to v2.0; v1.0 uses service layer on primary DB | 2026-07-21 | Engineering | ✅ Active |

---

## Decision records

### DEC-001 — Roadmap planning complete

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-001 |
| **Date** | 2026-07-21 |
| **Owner** | CEO |
| **Description** | YALA Enterprise v1.0 roadmap Phases 1–39 declared complete. Planning phase closed. |
| **Reason** | All approved v1.0 modules designed and built in source. Shift resources to execution and launch. |
| **Related ADR** | [docs/ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) |
| **Impact** | No new phases added to v1.0 without change control. |

---

### DEC-002 — Scope freeze

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-002 |
| **Date** | 2026-07-21 |
| **Owner** | CEO |
| **Description** | Freeze Version 1.0 feature scope. Bug fixes, hardening, and approved change requests only. |
| **Reason** | Prevent scope creep; focus on launch readiness. |
| **Related ADR** | ROADMAP_FREEZE_V1.md § Change Management Policy |
| **Impact** | All sprint work must align with frozen scope. |

---

### DEC-005 — Android-first launch

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-005 |
| **Date** | 2026-07-21 |
| **Owner** | CEO / Product Lead |
| **Description** | Prioritize Google Play closed testing for Rider, Driver, Delivery. Apple App Store submission deferred. |
| **Reason** | iOS pipeline not submitted; Android beta validates core flows first. |
| **Related ADR** | BUG-P1-003 accepted for v1.1 |
| **Impact** | ~50% mobile market deferred; document in release notes. |

---

### DEC-008 — RC3 as Release Candidate

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-008 |
| **Date** | 2026-07-21 |
| **Owner** | Engineering Lead |
| **Description** | Next tagged release is v1.0.0-rc3 incorporating stabilization fixes (perf, mobile, indexes). |
| **Reason** | RC2 certified for API lifecycle; RC3 addresses p95 and mobile P0 fixes without new features. |
| **Related ADR** | [release/RC3_STABILIZATION_REPORT.md](../release/RC3_STABILIZATION_REPORT.md) |
| **Impact** | RC3 deploy + mobile rebuild required before RC tag. |

---

### DEC-010 — NOT READY for Release Candidate

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-010 |
| **Date** | 2026-07-22 |
| **Owner** | Program Office |
| **Description** | Final RC audit concludes platform is NOT READY for RC tag until 8 P0 blockers closed. |
| **Reason** | Test suite 8 errors; RC3 undeployed; no staging; offsite backup open; RC-E criteria 0/6 pass. |
| **Related ADR** | [release/FINAL_RELEASE_READINESS_AUDIT.md](../release/FINAL_RELEASE_READINESS_AUDIT.md) · [release/EXECUTIVE_SCORECARD.md](../release/EXECUTIVE_SCORECARD.md) |
| **Impact** | Sprint 2 focused on P0 remediation; no RC tag until re-audit passes. |

---

### DEC-011 — Gate-based release sequence

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-011 |
| **Date** | 2026-07-22 |
| **Owner** | Program Office |
| **Description** | Adopt standardized release lifecycle: Sprint → RC → Closed Beta (Gate A) → GA (Gate B). |
| **Reason** | Reduce launch risk; align with QUALITY_GATES and RELEASE_LIFECYCLE. |
| **Related ADR** | [release/RELEASE_LIFECYCLE.md](../release/RELEASE_LIFECYCLE.md) · [execution/05_RELEASE_PLAN.md](../execution/05_RELEASE_PLAN.md) |
| **Impact** | No GA without Gate A/B sign-off. |

---

### DEC-012 — Staging required before migration batch

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-012 |
| **Date** | 2026-07-22 |
| **Owner** | DevOps Lead / Engineering Lead |
| **Description** | Provision staging environment before applying Phases 29–39 production migrations. |
| **Reason** | Risk PM-R-04/R-06; no safe validation path today. |
| **Related ADR** | RB-P0-004 |
| **Impact** | Migration deploy blocked until staging live (pending execution). |

---

## Decision request template

Use for new decisions requiring CEO or lead approval:

```markdown
### DEC-XXX — [Title]

| Field | Value |
|-------|-------|
| **Decision ID** | DEC-XXX |
| **Date** | YYYY-MM-DD |
| **Owner** | [Role] |
| **Description** | [What was decided] |
| **Reason** | [Why] |
| **Alternatives considered** | [Options rejected] |
| **Related ADR** | [Link or —] |
| **Impact** | [Scope, timeline, risk] |
| **Approved by** | [Name / date] |
```

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) | Scope decisions |
| [release/LAUNCH_DECISION.md](../release/LAUNCH_DECISION.md) | Launch GO/NO-GO |
| [DECISION_LOG.md](./DECISION_LOG.md) | This log |

---

*Append new decisions at top of index · Owner: Program Office*
