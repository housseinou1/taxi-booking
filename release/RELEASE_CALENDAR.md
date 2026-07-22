# YALA Enterprise — Release Calendar

**Document ID:** RELEASE-CALENDAR-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active  
**Governance:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)

---

## Purpose

This document defines **release cadence**, **sprint rhythm**, **hotfix process**, and **emergency release** procedures for YALA Enterprise v1.0 execution and beyond.

All releases follow [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md) and complete [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) before promotion.

---

## Sprint Cadence

### Standard sprint

| Parameter | Value |
|-----------|-------|
| **Duration** | 2 weeks |
| **Start day** | Monday |
| **Planning** | Day 1 — backlog review, P0/P1 assignment |
| **Mid-sprint check** | Day 5 — blockers, scope confirmation |
| **Sprint review** | Day 10 — demo, audit update |
| **Retrospective** | Day 10 — process improvements |

### Sprint scope rules (v1.0 frozen)

| Allowed | Not allowed |
|---------|-------------|
| P0/P1 bug fixes | New v1.0 features |
| Production deployments | Module redesigns |
| Hardening and perf fixes | Business logic changes without approval |
| Documentation updates | Version 2.x backlog items |
| Approved change requests | Scope reopening without CEO approval |

**Backlog source:** `execution/02_PRIORITY_FIX_LIST.md` · `project-management/04_BUG_AND_TECH_DEBT.md`

### Sprint ceremonies

| Ceremony | Frequency | Participants | Output |
|----------|-----------|--------------|--------|
| Daily standup | Daily | Engineering, DevOps, QA, Ops | Blocker visibility |
| CEO daily (P0 only) | Daily during launch push | CEO, Program Office, leads | P0 escalation |
| Sprint planning | Biweekly | All leads | Sprint backlog committed |
| Release readiness review | Pre-RC | Engineering, DevOps, QA, CEO | GO/NO-GO for RC |
| Weekly risk review | Weekly | Program Office | `handover/05_RISK_REGISTER.md` update |

---

## Release Cadence

### v1.0 launch sequence (current)

*Detailed exit criteria: `execution/05_RELEASE_PLAN.md`*

| Phase | Window (indicative) | Deliverable | Gate |
|-------|---------------------|-------------|------|
| **Execution Sprint 1** | 2026-07-21 – 2026-07-22 | Audit baseline | Complete ✅ |
| **Execution Sprint 2** | 2026-07-23 – 2026-08-05 | P0 remediation | Sprint exit |
| **Release Candidate RC3** | 2026-08-06 – 2026-08-12 | Tagged RC build | RC checklist |
| **Closed Beta** | 2026-08-13 – 2026-09-15 | Gate A | CEO sign-off |
| **General Availability** | 2026-09-16+ | Gate B | Public launch |

### Post-GA cadence (standard)

| Release type | Frequency | Beta required? | Approval |
|--------------|-----------|:--------------:|----------|
| **Patch** (v1.0.x) | As needed (weekly max in beta) | No | Engineering + DevOps |
| **Minor** (v1.x.0) | Monthly (post-GA) | Recommended | Engineering + CEO |
| **Major** (v2.0.0) | Per roadmap approval | Yes | CEO + board |

### Release windows

| Window | Time (UTC) | Use |
|--------|------------|-----|
| **Standard deploy** | Tue–Thu 02:00–06:00 | Backend, migrations, frontend |
| **Mobile promote** | Thu 10:00–14:00 | Play Console rollout (monitor 24 h) |
| **Blackout** | Fri 18:00 – Mon 06:00 | No prod deploys except emergency |
| **Blackout** | Mauritania peak hours* | Avoid rider/driver disruption |

*Peak hours defined by Operations Manager in `release/CLOSED_BETA_RUNBOOK.md`.*

### Version numbering

| Component | Scheme | Example |
|-----------|--------|---------|
| Backend / platform | Semantic `MAJOR.MINOR.PATCH` | `1.0.0`, `1.0.1`, `1.1.0` |
| Release candidate | `-rcN` suffix | `1.0.0-rc3` |
| Mobile apps | Independent semver + build | Rider `1.2.7 (19)` |
| API (partner) | Versioned path `/api-gateway/v1/` | Gateway semver in docs |

---

## Hotfix Process

### When to use

A **hotfix** is an expedited release for **P0 production defects** affecting users, data integrity, or security.

| Trigger | Example |
|---------|---------|
| Production down | Health check failing |
| Security incident | API key compromise |
| Data loss risk | Failed backup, corruption |
| Launch blocker | SOS flow broken in beta |

### Hotfix lifecycle (abbreviated)

```
P0 declared → Hotfix branch → Code Review → QA (targeted) → Security (if applicable)
  → RC tag → Production deploy → Recovery validation → Post-incident review
```

**Stages skipped (with justification):** Full sprint planning; Performance Validation (unless perf-related); Closed Beta (for P0 prod fixes).

### Hotfix checklist (minimum)

| # | Required | Status |
|---|:--------:|:------:|
| H-01 | P0 incident documented | ☐ |
| H-02 | Root cause identified or hypothesis documented | ☐ |
| H-03 | Fix peer-reviewed | ☐ |
| H-04 | Targeted tests pass | ☐ |
| H-05 | Security review (if auth/data impact) | ☐ |
| H-06 | Rollback plan confirmed | ☐ |
| H-07 | CHANGELOG hotfix entry | ☐ |
| H-08 | Production validation complete | ☐ |
| H-09 | CEO notified (within 1 h of P0) | ☐ |
| H-10 | Post-incident review within 48 h | ☐ |

**Maximum hotfix cycle time:** 4 hours from P0 declaration to production (target).

### Hotfix approval

| Severity | Approver |
|----------|----------|
| P0 production | Engineering Lead + DevOps Lead (+ CEO notify) |
| P0 security | Security Lead + CEO |
| P0 during Closed Beta | CEO + Operations Manager |

---

## Emergency Releases

### Definition

An **emergency release** is a hotfix or infrastructure change requiring **immediate production action** outside standard release windows (blackout override).

### Emergency criteria

| Criterion | Emergency? |
|-----------|:----------:|
| Active production outage | Yes |
| Active security breach | Yes |
| SOS / Trust & Safety failure | Yes |
| Offsite backup failure discovered | Yes (infra) |
| Non-critical admin UI bug | No — use hotfix next window |
| Performance degradation (non-outage) | No — use standard hotfix |

### Emergency procedure

1. **Declare incident** — DevOps or Engineering Lead notifies CEO and Operations Manager (see [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) § Incident Communication).
2. **Assess** — Rollback vs forward-fix (prefer rollback if deploy-related).
3. **Approve** — CEO verbal approval for emergency deploy (document within 24 h in `UAT_EXECUTIVE_SIGNOFF.md` or incident record).
4. **Execute** — Follow [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) or abbreviated [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).
5. **Validate** — Recovery validation checklist (ROLLBACK_PLAN §5).
6. **Communicate** — Internal + pilot users if beta active.
7. **Review** — Post-incident review within 48 hours; update [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md).

### Emergency roles (on-call)

| Role | Primary responsibility |
|------|------------------------|
| **DevOps Lead** | Deploy, rollback, infrastructure |
| **Engineering Lead** | Application fix, migration decision |
| **CEO** | Emergency deploy approval |
| **Operations Manager** | User communication, SOS monitoring |
| **Security Lead** | Security incident response |

On-call rotation: document in `handover/06_SUPPORT_MATRIX.md`.

---

## Calendar Maintenance

| Activity | Frequency | Owner | Output |
|----------|-----------|-------|--------|
| Update release calendar | After each release | Program Office | This document |
| Sync with execution board | Weekly | Program Office | `execution/04_EXECUTION_BOARD.md` |
| Update PROJECT_STATUS | After deploy | Engineering Lead | `docs/PROJECT_STATUS.md` |
| Publish CHANGELOG | Each release | Release owner | `release/CHANGELOG_vX.Y.Z.md` |

---

## 2026 Release Calendar (v1.0)

| Date (indicative) | Event | Type | Owner |
|-------------------|-------|------|-------|
| 2026-07-22 | Release Management Framework published | Documentation | Program Office |
| 2026-07-23 | Sprint 2 start | Sprint | Engineering |
| 2026-08-05 | Sprint 2 end | Sprint | Engineering |
| 2026-08-06 | RC3 cut | Release Candidate | DevOps |
| 2026-08-12 | RC3 validation complete | RC | Engineering |
| 2026-08-13 | Closed Beta start (target) | Beta | CEO / Ops |
| 2026-09-15 | Closed Beta exit review (target) | Beta | CEO |
| 2026-09-16+ | GA target | Production | CEO |

*Dates adjust based on P0 closure evidence. CEO may delay GA.*

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md) | Full lifecycle stages |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Mandatory checks |
| [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) | Rollback and emergency recovery |
| [CHANGELOG_TEMPLATE.md](./CHANGELOG_TEMPLATE.md) | Release notes |
| [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | Development workflow |
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Completion gates |
| [execution/05_RELEASE_PLAN.md](../execution/05_RELEASE_PLAN.md) | v1.0 release sequence |
| `release/CLOSED_BETA_RUNBOOK.md` | Beta operations |
| `docs/INCIDENT_RESPONSE.md` | Incident handling |

---

*Effective 2026-07-22 · Update after each release milestone · YALA Enterprise Program Office*
