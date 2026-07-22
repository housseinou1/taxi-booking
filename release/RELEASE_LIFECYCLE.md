# YALA Enterprise — Release Lifecycle

**Document ID:** RELEASE-LIFECYCLE-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active  
**Governance:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)

---

## Purpose

This document defines the **standardized release lifecycle** for all YALA Enterprise releases. Every change — bug fix, hardening task, deployment, or approved change request — progresses through these stages in order.

**No release skips stages.** Stages marked N/A require written justification and approver acknowledgment per [QUALITY_GATES.md](../docs/QUALITY_GATES.md).

Planning for Version 1.0 is closed. New Version 1.0 scope requires executive approval per [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md#change-management-policy).

---

## Lifecycle Overview

```
Backlog → Ready for Development → In Development → Code Review → QA Testing
  → Security Review → Performance Validation → Release Candidate → Closed Beta
  → Production → Maintenance
```

### Mapping to Execution Policy

| Release lifecycle stage | Execution Policy stage(s) |
|-------------------------|---------------------------|
| Backlog | Pre-Stage 1 |
| Ready for Development | Stage 1 — Requirements |
| In Development | Stages 2–4 — Architecture, Backend, Frontend |
| Code Review | Peer review within Stages 3–4 |
| QA Testing | Stage 5 — Testing |
| Security Review | Stage 6 |
| Performance Validation | Stage 7 |
| Release Candidate | Stages 8–9 (partial) |
| Closed Beta | Stage 10 — Production Validation (limited) |
| Production | Stages 9–10 |
| Maintenance | Post-release monitoring |

---

## Stage Definitions

### 1. Backlog

**Purpose:** Hold approved work items awaiting prioritization and sprint assignment.

**Entry criteria:**

- Work item exists in project tracker (`project-management/06_PROJECT_DASHBOARD.md`) or bug register (`project-management/04_BUG_AND_TECH_DEBT.md`)
- For v1.0: item is bug fix, hardening, deployment, or approved change request — **not** a new feature without executive approval
- Affected module identified (see [PLATFORM_INVENTORY.md](../docs/PLATFORM_INVENTORY.md))

**Exit criteria:**

- Priority assigned (P0–P3)
- Owner assigned
- Target release or sprint identified
- Work item promoted to **Ready for Development**

**Approver:** Product Lead or Engineering Lead

---

### 2. Ready for Development

**Purpose:** Confirm requirements are clear and scope-aligned before engineering begins.

**Entry criteria:**

- Exit criteria for **Backlog** met
- Acceptance criteria documented
- Rollback need assessed (required if production-impacting)
- Scope confirmed against [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md)

**Exit criteria:**

- Requirements approved by Product or Engineering Lead
- Acceptance criteria checklist complete
- Affected platforms and permissions identified
- Work item assigned to sprint

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stage 1 — Requirements  
**Quality gate:** Requirements approved (see [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md))

**Approver:** Product Lead or Engineering Lead

---

### 3. In Development

**Purpose:** Implement approved changes following project conventions.

**Entry criteria:**

- Exit criteria for **Ready for Development** met
- Architecture review complete (when required — see Stage 4 mapping)
- Developer assigned

**Activities:**

- Backend implementation (Django apps, migrations, permissions, audit logging)
- Frontend implementation (admin, merchant, mobile as applicable)
- Unit tests written for new/changed logic
- Architecture note or migration plan documented when schema/API changes

**Exit criteria:**

- Code complete on feature branch
- Unit tests written (pass locally)
- Self-review complete
- Ready for formal **Code Review**

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stages 2–4  
**Quality gates:** Gate 1 (Backend), Gate 2 (Frontend if applicable)

**Approver:** Engineering Lead (development complete acknowledgment)

---

### 4. Code Review

**Purpose:** Peer review before QA and security validation.

**Entry criteria:**

- Exit criteria for **In Development** met
- Pull request or equivalent review artifact available

**Activities:**

- Code follows `engineering/07_CODING_STANDARDS.md`
- No duplicate business logic; existing services reused
- Permissions use centralized role groups where applicable
- Audit logging on admin mutations
- Migrations reviewed for safety (forward-only, no destructive ops without plan)

**Exit criteria:**

- At least one peer approval (Engineering Lead for high-risk changes)
- All review comments resolved or tracked
- Branch merge-ready

**Maps to:** Peer review within EXECUTION_POLICY Stages 3–4  
**Quality gate:** Code reviewed (see [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md))

**Approver:** Peer reviewer + Engineering Lead (if schema/security impact)

---

### 5. QA Testing

**Purpose:** Verify functional correctness before security and performance gates.

**Entry criteria:**

- Exit criteria for **Code Review** met
- Code merged to integration branch or deployable artifact built

**Activities:**

- Run unit test suites: `python manage.py test <affected_suite>`
- Run integration/API tests (DRF `APIClient`, permission 403 checks)
- Mobile QA for rider/driver/delivery changes (`release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`)
- Regression check on related modules
- Document test count and pass/fail

**Exit criteria:**

- All applicable automated tests pass (0 errors)
- No new P0/P1 regressions introduced
- Mobile QA sign-off where applicable
- QA report attached to work item

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stage 5 — Testing  
**Quality gates:** Gate 4 (Unit tests), Gate 5 (Integration tests), Gate 6 (Mobile QA)

**Approver:** QA Lead (mobile) / Engineering Lead (automated)

---

### 6. Security Review

**Purpose:** Confirm no security regressions before release candidate.

**Entry criteria:**

- Exit criteria for **QA Testing** met

**Activities:**

- Authentication and authorization paths verified
- No secrets, credentials, or PII in logs/responses
- Rate limiting and input validation confirmed
- Partner/API changes: key rotation, scopes, IP whitelist reviewed
- Cross-check `engineering/04_SECURITY_ARCHITECTURE.md` and `handover/05_RISK_REGISTER.md`

**Exit criteria:**

- Security checklist pass or findings remediated
- Security Lead or Engineering Lead sign-off

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stage 6  
**Quality gate:** Gate 7 (Security review)

**Approver:** Security Lead or Engineering Lead

**N/A when:** Documentation-only change (document reason)

---

### 7. Performance Validation

**Purpose:** Ensure acceptable performance before release candidate.

**Entry criteria:**

- Exit criteria for **Security Review** met
- Required when API, query, or caching changes present

**Activities:**

- Review database queries (N+1, indexes)
- Confirm caching strategy for dashboard endpoints
- Run smoke load test for API-heavy changes (`launch-perf-smoke.py`)
- Compare p95 latency (target < 2000 ms for public launch per UAT Gate B)

**Exit criteria:**

- No unacceptable latency regression
- Load test results documented if applicable
- Engineering Lead sign-off

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stage 7  
**Quality gate:** Gate 8 (Performance review)

**Approver:** Engineering Lead

**N/A when:** Non-API documentation or copy change (document reason)

---

### 8. Release Candidate

**Purpose:** Freeze a validated build for beta or production promotion.

**Entry criteria:**

- Exit criteria for **Performance Validation** met (or N/A documented)
- Documentation updated (API catalog, runbooks, [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md))
- [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) documented for this release
- Release notes drafted from [CHANGELOG_TEMPLATE.md](./CHANGELOG_TEMPLATE.md)

**Activities:**

- Tag release (e.g. `v1.0.0-rc3`, `v1.0.1`)
- Deploy to staging (when available) or pre-prod validation environment
- Full regression: admin routes, core API lifecycle, health endpoints
- Build mobile APK/AAB if mobile changes included
- Complete [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)

**Exit criteria:**

- All mandatory checklist items ✓ (or N/A justified)
- RC validation report signed by Engineering Lead
- Known issues documented in release notes
- Rollback procedure tested or confirmed

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stages 8–9 (partial)  
**Quality gates:** Gates 3, 9, 10 (pre-production), rollback documented

**Approver:** Engineering Lead + DevOps Lead

**Reference:** `execution/05_RELEASE_PLAN.md` — RC stage exit criteria

---

### 9. Closed Beta

**Purpose:** Limited production exposure with capped pilot cohort before general availability.

**Entry criteria:**

- Exit criteria for **Release Candidate** met
- Gate A items from `release/UAT_RELEASE_READINESS_CHECKLIST.md` satisfied (or explicit waiver from CEO)
- Physical device QA signed for launch-critical mobile paths
- Offsite backup configured (Gate A)
- Pilot caps defined: 20 drivers, 10 couriers, 100 riders

**Activities:**

- Deploy RC to production
- Google Play closed testing track (Android)
- Monitor via Launch Command Center and Trust & Safety
- Track beta metrics per `release/BETA_SUCCESS_METRICS.md`
- Daily ops per `release/CLOSED_BETA_RUNBOOK.md`

**Exit criteria:**

- All Gate A checklist items ✅
- Beta success metrics meet minimum thresholds (`release/CLOSED_BETA_EXIT_CRITERIA.md`)
- No unresolved P0 incidents during beta period (minimum 2 weeks at cohort cap)
- CEO closed-beta sign-off (`release/UAT_EXECUTIVE_SIGNOFF.md`)

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stage 10 — Production Validation (limited)  
**Quality gate:** Gate 11 (CEO approval — Gate A)

**Approver:** CEO

---

### 10. Production

**Purpose:** General availability or production deployment of approved release.

**Entry criteria:**

- Exit criteria for **Closed Beta** met (for initial v1.0 launch), **or**
- Exit criteria for **Release Candidate** met (for patch/hotfix with CEO approval if bypassing beta)
- Gate B items satisfied for public launch (see UAT checklist)
- Production approval granted (Engineering Lead + CEO for GA)

**Activities:**

- Deploy backend (Docker Compose per `engineering/05_DEPLOYMENT_GUIDE.md`)
- Apply migrations during approved maintenance window
- Deploy frontend static bundle via nginx
- Promote mobile builds to production store track
- Smoke test: `/api/health/ready/`, core lifecycle, affected admin routes
- 24-hour monitoring observation for high-risk changes

**Exit criteria:**

- Health check PASS
- Production validation checklist signed
- [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) updated
- Release notes published
- Work items closed

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stages 9–10  
**Quality gates:** Gates 10, 11 (CEO for public launch)

**Approver:** DevOps Lead (deploy) + CEO (public launch)

---

### 11. Maintenance

**Purpose:** Ongoing support, monitoring, and patch management post-release.

**Entry criteria:**

- Release live in **Production** or **Closed Beta**

**Activities:**

- Monitor error rates (Sentry), latency, Celery queue depth
- Triage bugs into backlog (P0–P3)
- Apply hotfixes per [RELEASE_CALENDAR.md](./RELEASE_CALENDAR.md) hotfix process
- Weekly review of `project-management/04_BUG_AND_TECH_DEBT.md`
- Monthly CEO review for v1.1+ backlog (`docs/VERSION2_BACKLOG.md`)

**Exit criteria:**

- N/A — continuous stage until next release supersedes or product EOL

**Maps to:** Post Stage 10 monitoring  
**Reference:** `release/POST_LAUNCH_SUPPORT_PROCEDURES.md`, `docs/INCIDENT_RESPONSE.md`

**Owner:** Operations Manager + Engineering Lead on-call rotation

---

## Stage Transition Rules

| Rule | Detail |
|------|--------|
| **No skipping** | Every stage completed or N/A with written justification |
| **No deploy before QA** | Production/RC deploy only after QA Testing exit |
| **Rollback required** | Release Candidate and Production require documented rollback |
| **Freeze respect** | Backlog items must align with ROADMAP_FREEZE_V1 |
| **Escalation** | Blocked stages escalate to Engineering Lead; P0 to CEO |

---

## Release Types

| Type | Typical path | Beta required? |
|------|--------------|:--------------:|
| **Major** (v1.0 → v2.0) | Full lifecycle including Closed Beta | Yes |
| **Minor** (v1.0 → v1.1) | RC → optional Closed Beta → Production | Recommended |
| **Patch** (v1.0.0 → v1.0.1) | RC → Production (or hotfix path) | No (unless mobile-critical) |
| **Hotfix** | Abbreviated path — see RELEASE_CALENDAR.md | CEO approval if P0 |
| **Infrastructure** | Security + Performance + RC → Production | Staging validation required |

---

## Roles

| Role | Lifecycle responsibility |
|------|--------------------------|
| **Program Office** | Lifecycle compliance, release calendar |
| **Product Lead** | Backlog prioritization, requirements approval |
| **Engineering Lead** | Architecture, code review, performance, RC sign-off |
| **Security Lead** | Security Review stage |
| **QA Lead** | QA Testing, mobile sign-off |
| **DevOps Lead** | Release Candidate deploy, Production deploy, rollback |
| **CEO** | Closed Beta and Production approval (Gate A/B) |

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Mandatory pre-release checks |
| [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) | Rollback procedures |
| [CHANGELOG_TEMPLATE.md](./CHANGELOG_TEMPLATE.md) | Release notes format |
| [RELEASE_CALENDAR.md](./RELEASE_CALENDAR.md) | Cadence and hotfix process |
| [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | 10-stage development workflow |
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Completion gates |
| [execution/05_RELEASE_PLAN.md](../execution/05_RELEASE_PLAN.md) | v1.0 release sequence |
| `release/UAT_RELEASE_READINESS_CHECKLIST.md` | Gate A/B criteria |

---

*Effective 2026-07-22 · YALA Enterprise Program Office · Documentation only*
