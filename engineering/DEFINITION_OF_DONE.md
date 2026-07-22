# YALA Enterprise v1.0 — Definition of Done

**Document ID:** ENG-DOD-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active — Mandatory for all work items  
**Governance:** [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) · [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [RELEASE_LIFECYCLE.md](../release/RELEASE_LIFECYCLE.md) · [RELEASE_CHECKLIST.md](../release/RELEASE_CHECKLIST.md)

---

## Purpose

This document is the **official Definition of Done (DoD)** for YALA Enterprise v1.0. A work item — feature, bug fix, enhancement, hotfix, or release — is **not complete** until all applicable criteria in the relevant section below are satisfied.

**Rules:**

- Applicable items must be ✅; **N/A** requires written justification and approver initials.
- No work item may bypass [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) stages or [QUALITY_GATES.md](../docs/QUALITY_GATES.md).
- Version 1.0 scope is frozen; new features require executive approval per [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md).
- Evidence must be attached to the work item (test output, review link, sign-off date).

---

## DoD Types

| Section | Applies to |
|---------|------------|
| [Part 1 — Feature DoD](#part-1--feature-definition-of-done) | Approved features, enhancements, module changes |
| [Part 2 — Bug Fix DoD](#part-2--bug-fix-definition-of-done) | All bug fixes (P0–P3) |
| [Part 3 — Hotfix DoD](#part-3--hotfix-definition-of-done) | Emergency production releases |
| [Part 4 — Release DoD](#part-4--release-definition-of-done) | Release candidates → Production |
| [Part 5 — Approval Matrix](#part-5--approval-matrix) | Who approves what |

---

# Part 1 — Feature Definition of Done

A **feature** (or approved enhancement within frozen v1.0 scope) is complete only when **all applicable criteria** below are satisfied.

*During v1.0 execution, most work is bug fixes and hardening — new features require CEO/executive approval before Part 1 applies.*

---

## Business

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| B-01 | ✓ **Requirements approved** | Work item with acceptance criteria; Product or Engineering Lead sign-off | EXECUTION_POLICY Stage 1 |
| B-02 | ✓ **Acceptance criteria met** | Each criterion demonstrated and checked | EXECUTION_POLICY Stage 10 |
| B-03 | ✓ **Product owner approval** | Product Lead (or CEO for executive modules) sign-off on work item | QUALITY_GATES Gate 11 (where applicable) |

**Additional:** Scope confirmed against [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md). Affected module listed per [PLATFORM_INVENTORY.md](../docs/PLATFORM_INVENTORY.md).

---

## Architecture

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| A-01 | ✓ **Architecture reviewed** | Architecture note or phase design doc; Engineering Lead sign-off | EXECUTION_POLICY Stage 2 |
| A-02 | ✓ **Existing patterns reused** | No duplicate business logic; services extended not rewritten | `engineering/01_SYSTEM_ARCHITECTURE.md` |
| A-03 | ✓ **No unnecessary complexity introduced** | Review confirms minimal diff; no over-abstraction | `engineering/07_CODING_STANDARDS.md` |

**N/A when:** Isolated change with no schema, API, or cross-module impact (document reason).

---

## Backend

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| BE-01 | ✓ **Business logic complete** | Implements acceptance criteria; peer review passed | EXECUTION_POLICY Stage 3 |
| BE-02 | ✓ **Permissions verified** | Role groups in `executive_permissions.py` or domain permissions; 403 tested | QUALITY_GATES Gate 7 |
| BE-03 | ✓ **Validation implemented** | Input validation on serializers/views; edge cases handled | `engineering/07_CODING_STANDARDS.md` |
| BE-04 | ✓ **Error handling complete** | Meaningful API error responses; no unhandled exceptions in happy path | Code review |
| BE-05 | ✓ **Logging added** | Audit logs on admin mutations via `log_from_request`; operational logs where needed | QUALITY_GATES Gate 7 |

**N/A when:** Frontend-only or documentation-only change.

---

## Frontend

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| FE-01 | ✓ **Responsive UI** | Admin/mobile layouts usable on target screen sizes | Manual QA |
| FE-02 | ✓ **Accessibility considered** | Labels, contrast, keyboard/focus where applicable | Code review |
| FE-03 | ✓ **Loading states** | Spinners/skeletons during API fetch | Manual UI check |
| FE-04 | ✓ **Error states** | 403, network failure, validation errors displayed | Manual UI check |
| FE-05 | ✓ **Empty states** | Zero-data views handled gracefully | Manual UI check |

**Applies to:** Admin centers (`frontend/src/admin/`), merchant portal, mobile apps.  
**N/A when:** Backend-only or infrastructure-only change.

**Maps to:** EXECUTION_POLICY Stage 4 · QUALITY_GATES Gate 2

---

## API

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| API-01 | ✓ **API documented** | `engineering/02_API_CATALOG.md` or phase report updated; OpenAPI for Gateway changes | QUALITY_GATES Gate 3 |
| API-02 | ✓ **Version compatibility maintained** | No breaking changes without migration notes; partner APIs versioned (`/api-gateway/v1/`) | CHANGELOG breaking changes section |
| API-03 | ✓ **Authentication verified** | JWT/partner key/API key flows tested; unauthorized access returns 401/403 | QUALITY_GATES Gate 7 |

**N/A when:** No API contract change.

---

## Database

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| DB-01 | ✓ **Migrations reviewed** | Forward-only; reviewed by Engineering Lead; listed in release notes | EXECUTION_POLICY Stage 2 |
| DB-02 | ✓ **Rollback considered** | Pre-migration backup planned; app rollback strategy documented | [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) |
| DB-03 | ✓ **Performance impact assessed** | Indexes for new filters/sorts; no full-table scans on hot paths | EXECUTION_POLICY Stage 7 |

**N/A when:** No schema change.

**Reference:** `engineering/03_DATABASE_REFERENCE.md`

---

## Testing

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| T-01 | ✓ **Unit tests** | New/changed logic covered; suite passes (document name + count) | QUALITY_GATES Gate 4 |
| T-02 | ✓ **Integration tests** | API tests with `APIClient`; permissions and payload keys verified | QUALITY_GATES Gate 5 |
| T-03 | ✓ **Regression tests** | Related modules smoke-tested; no new P0/P1 regressions | EXECUTION_POLICY Stage 5 |
| T-04 | ✓ **Manual QA completed** | QA Lead or engineer sign-off; mobile device QA if mobile impact | QUALITY_GATES Gate 6 |

**Baseline:** Operations suite and affected module tests pass with **0 errors**.

---

## Security

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| S-01 | ✓ **Authentication verified** | Login/token flows correct for affected roles | EXECUTION_POLICY Stage 6 |
| S-02 | ✓ **Authorization verified** | Role-based access enforced; least privilege maintained | QUALITY_GATES Gate 7 |
| S-03 | ✓ **Sensitive data protected** | No secrets/PII in logs or responses; `.env` patterns respected | `engineering/04_SECURITY_ARCHITECTURE.md` |
| S-04 | ✓ **Audit logs generated** | Admin mutations logged via audit service | QUALITY_GATES Gate 7 |

**Approver:** Security Lead or Engineering Lead (see [Approval Matrix](#part-5--approval-matrix)).

---

## Performance

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| P-01 | ✓ **No significant regressions** | p95 latency acceptable; no new N+1 queries | EXECUTION_POLICY Stage 7 |
| P-02 | ✓ **Database queries reviewed** | `select_related`/`prefetch_related`; indexes where needed | Code review |
| P-03 | ✓ **Mobile performance acceptable** | No jank on critical paths; APK size not materially increased | Mobile QA |

**Launch target:** p95 < 2000 ms under load (Gate B).  
**N/A when:** Non-API, non-mobile documentation change.

---

## Documentation

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| D-01 | ✓ **Technical documentation updated** | API catalog, architecture notes, runbooks as applicable | QUALITY_GATES Gate 9 |
| D-02 | ✓ **User documentation updated** | Ops manuals, support playbooks if procedure changes | `operations/`, `docs/` |
| D-03 | ✓ **Release notes prepared** | [CHANGELOG_TEMPLATE.md](../release/CHANGELOG_TEMPLATE.md) entry for user-facing changes | EXECUTION_POLICY Stage 8 |

**Always update:** [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) when module status changes.

---

## Deployment

| # | Criterion | Verification | Maps to |
|---|-----------|--------------|---------|
| DEP-01 | ✓ **Staging deployed** | Validated on staging when available; else pre-prod smoke test documented | RELEASE_LIFECYCLE Release Candidate |
| DEP-02 | ✓ **Production validation completed** | Smoke test post-deploy; 24 h observation for high-risk changes | EXECUTION_POLICY Stage 10 |
| DEP-03 | ✓ **Rollback plan confirmed** | Previous tag documented; [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) pre-deploy checklist | QUALITY_GATES Gate 10 |

**Health check:** `/api/health/ready/` returns 200 with database=ok, redis=ok.

---

## Feature DoD — Completion Statement

A feature may be marked **Done** when:

1. All applicable criteria above are ✅ (or N/A approved).
2. All [QUALITY_GATES.md](../docs/QUALITY_GATES.md) applicable to the work type are satisfied.
3. All [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stages 1–10 are complete.
4. Approvals in [Part 5](#part-5--approval-matrix) are obtained.
5. No open P0 defect introduced by the change.

---

# Part 2 — Bug Fix Definition of Done

A **bug fix** is complete when the defect is resolved **and** the evidence below is recorded before closing the work item.

---

## Required evidence

| # | Evidence | Required | Notes |
|---|----------|:--------:|-------|
| BF-01 | **Bug ID referenced** | Yes | e.g. `BUG-P1-001` from `project-management/04_BUG_AND_TECH_DEBT.md` |
| BF-02 | **Affected module documented** | Yes | From [PLATFORM_INVENTORY.md](../docs/PLATFORM_INVENTORY.md) |
| BF-03 | **Root cause described** | Yes | Brief explanation in work item or commit message |
| BF-04 | **Fix peer-reviewed** | Yes | Code review link or reviewer initials |
| BF-05 | **Regression test added or updated** | Yes* | *N/A for typos/docs with Engineering Lead approval |
| BF-06 | **Unit tests pass** | Yes | Document suite: `tests.<module>` N/N pass |
| BF-07 | **Integration test pass** | If API | API client test for affected endpoint(s) |
| BF-08 | **Manual verification** | Yes | Steps to reproduce → verify fixed |
| BF-09 | **Security impact assessed** | Yes | Security Lead or Engineering Lead ack if auth/data |
| BF-10 | **No new P0/P1 regressions** | Yes | Related modules smoke-checked |
| BF-11 | **Deployed to target environment** | If prod fix | Deploy log + health check |
| BF-12 | **Bug register updated** | Yes | Status → Closed in `04_BUG_AND_TECH_DEBT.md` |
| BF-13 | **PROJECT_STATUS updated** | If status impact | [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) |

---

## Bug fix by priority

| Priority | Minimum DoD | Deploy | Approver |
|:--------:|-------------|--------|----------|
| **P0** | BF-01 – BF-13 | Production (or hotfix path) | Engineering Lead + QA; CEO notify |
| **P1** | BF-01 – BF-12 | Per sprint plan | Engineering Lead |
| **P2** | BF-01 – BF-10, BF-12 | Next release | Peer reviewer |
| **P3** | BF-01 – BF-06, BF-08, BF-12 | Backlog release | Peer reviewer |

---

## Bug fix — N/A allowances

| Criterion | May be N/A when |
|-----------|-----------------|
| Integration test (BF-07) | Backend-only internal logic; no API change |
| Deploy (BF-11) | Fix merged but release batched to next RC |
| Regression test (BF-05) | Trivial fix; Engineering Lead documents reason |

---

## Bug fix — Completion statement

> **Bug [ID] is Done** when reproduction steps fail after fix, automated tests pass, evidence BF-01–BF-13 (or priority subset) is attached, and the bug register is updated.

**Maps to:** [QUALITY_GATES.md](../docs/QUALITY_GATES.md) — P0 bug fix gates: 1, 4, 5, 7, 9, 10

---

# Part 3 — Hotfix Definition of Done

A **hotfix** is an expedited production release for **P0 defects**. It uses an abbreviated lifecycle per [RELEASE_CALENDAR.md](../release/RELEASE_CALENDAR.md).

---

## Hotfix triggers

| Trigger | Example |
|---------|---------|
| Production outage | Health check failing |
| Security incident | API key compromise |
| Data integrity risk | Backup failure, corruption |
| Launch blocker | SOS flow broken during beta |

---

## Hotfix process

```
P0 declared → Hotfix branch → Code review → Targeted QA → Security (if applicable)
  → RC tag → Production deploy → Recovery validation → Post-incident review (48 h)
```

Reference: [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) · [RELEASE_CALENDAR.md](../release/RELEASE_CALENDAR.md) · [INCIDENT_RESPONSE.md](../docs/INCIDENT_RESPONSE.md)

---

## Hotfix DoD checklist

| # | Criterion | Required | Evidence |
|---|-----------|:--------:|----------|
| HF-01 | P0 incident declared and documented | Yes | Incident record / timestamp |
| HF-02 | CEO notified within 1 hour | Yes | Notification log |
| HF-03 | Root cause identified or hypothesis documented | Yes | Work item |
| HF-04 | Fix peer-reviewed | Yes | Reviewer + date |
| HF-05 | Targeted tests pass | Yes | Test output |
| HF-06 | Security review (if auth/data/security impact) | Conditional | Security Lead sign-off |
| HF-07 | Rollback tag documented | Yes | Previous version in deploy checklist |
| HF-08 | Pre-deploy backup (if migration) | Conditional | Backup filename |
| HF-09 | CHANGELOG hotfix entry | Yes | `CHANGELOG_vX.Y.Z.md` |
| HF-10 | Production deploy complete | Yes | Deploy log |
| HF-11 | Health check PASS | Yes | `/api/health/ready/` |
| HF-12 | Recovery validation complete | Yes | [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) §5 checklist |
| HF-13 | Error rate normal (15 min observation) | Yes | Sentry/logs |
| HF-14 | Pilot/users notified (if beta active) | Conditional | Ops communication log |
| HF-15 | Post-incident review scheduled ≤ 48 h | Yes | Calendar / ticket |
| HF-16 | Root cause fix tracked if forward-fix incomplete | Conditional | Backlog item |
| HF-17 | PROJECT_STATUS and bug register updated | Yes | Doc links |

---

## Hotfix — Maximum timeline

| Milestone | Target |
|-----------|--------|
| P0 declaration → production | **≤ 4 hours** |
| CEO notification | **≤ 1 hour** from P0 declaration |
| Post-incident review | **≤ 48 hours** after resolution |

---

## Hotfix — Stages skipped (with justification)

| Stage | Skipped? | Condition |
|-------|:--------:|-----------|
| Full sprint planning | Yes | P0 always |
| Architecture review | Sometimes | Simple fix; document if skipped |
| Performance validation | Sometimes | Unless perf-related |
| Closed Beta | Yes | P0 prod fix |
| Full RELEASE_CHECKLIST | Partial | Minimum: HF-01 – HF-17 |

---

## Hotfix — Completion statement

> **Hotfix is Done** when production is stable, HF-01–HF-17 satisfied, recovery validation signed by DevOps Lead, and post-incident review scheduled.

**Approvers:** Engineering Lead + DevOps Lead; CEO for P0; Security Lead for security hotfixes.

---

# Part 4 — Release Definition of Done

A **release** (Release Candidate promoted to Closed Beta or Production) is complete when all criteria below are satisfied.

*This consolidates [RELEASE_CHECKLIST.md](../release/RELEASE_CHECKLIST.md) into DoD form.*

---

## Release Candidate → Production DoD

### Planning & design

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-01 | Requirements approved for all items in release | ☐ |
| R-02 | Architecture reviewed (or N/A documented) for all schema/API changes | ☐ |
| R-03 | Scope aligned with [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) | ☐ |

### Implementation & review

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-04 | All changes code-reviewed and merged | ☐ |
| R-05 | Backend complete; migrations listed | ☐ |
| R-06 | Frontend complete (if UI changes) | ☐ |
| R-07 | API documented (if API changes) | ☐ |

### Testing

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-08 | Unit tests — full affected suites pass (0 errors) | ☐ |
| R-09 | Integration tests pass | ☐ |
| R-10 | Mobile QA signed (if mobile in release) | ☐ |
| R-11 | Regression — core API lifecycle PASS | ☐ |

### Security & performance

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-12 | Security review complete | ☐ |
| R-13 | Performance validated (p95 documented) | ☐ |

### Documentation & artifacts

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-14 | Technical documentation updated | ☐ |
| R-15 | [CHANGELOG](../release/CHANGELOG_TEMPLATE.md) complete | ☐ |
| R-16 | Known issues documented | ☐ |
| R-17 | [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) pre-deploy checklist complete | ☐ |

### Deployment & validation

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-18 | Staging validated (when available) | ☐ |
| R-19 | Release tagged (e.g. `v1.0.0-rc3`) | ☐ |
| R-20 | Production deploy complete | ☐ |
| R-21 | Health check PASS | ☐ |
| R-22 | Production smoke test PASS | ☐ |
| R-23 | 24 h monitoring observation (high-risk releases) | ☐ |

### Approval

| # | Criterion | ✓ |
|---|-----------|:-:|
| R-24 | Engineering Lead sign-off | ☐ |
| R-25 | DevOps Lead sign-off | ☐ |
| R-26 | QA Lead sign-off (if mobile/UI) | ☐ |
| R-27 | CEO approval (Closed Beta / GA / executive modules) | ☐ |

---

## Gate A — Closed Beta DoD (additional)

| # | Criterion | ✓ |
|---|-----------|:-:|
| GA-01 | Physical device QA signed — all 3 apps | ☐ |
| GA-02 | Offsite backup configured + drill PASS | ☐ |
| GA-03 | Pilot caps configured (20/10/100) | ☐ |
| GA-04 | Gate A executive sign-off | ☐ |

Reference: `release/UAT_RELEASE_READINESS_CHECKLIST.md`

---

## Gate B — General Availability DoD (additional)

| # | Criterion | ✓ |
|---|-----------|:-:|
| GB-01 | All Gate A items ✅ | ☐ |
| GB-02 | p95 latency < 2000 ms under load | ☐ |
| GB-03 | Play closed testing live | ☐ |
| GB-04 | Pilot cohort at target | ☐ |
| GB-05 | Account deletion attested | ☐ |
| GB-06 | CEO public launch sign-off | ☐ |

Reference: `release/UAT_EXECUTIVE_SIGNOFF.md` · [execution/05_RELEASE_PLAN.md](../execution/05_RELEASE_PLAN.md)

---

## Release — Completion statement

> **Release vX.Y.Z is Done** when R-01–R-27 are satisfied (plus GA-* or GB-* for launch releases), [RELEASE_CHECKLIST.md](../release/RELEASE_CHECKLIST.md) signed, and [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) updated.

---

# Part 5 — Approval Matrix

Who must approve work before it is marked **Done**.

---

## By role

| Role | Title / alias | Approves |
|------|---------------|----------|
| **Engineering Lead** | Backend Lead / CTO | Architecture, backend, code review, performance, feature completion, bug fix P1+, RC sign-off |
| **Mobile Lead** | Engineering Lead (mobile) | Mobile builds, device QA, rider/driver/delivery app changes, APK/AAB promotion |
| **QA Lead** | QA | Manual QA, mobile QA sign-off, release certification, bug fix verification |
| **Security Lead** | Security | Security review, auth/authz changes, hotfix (security), partner API security |
| **DevOps Lead** | DevOps / SRE | Deployment, rollback, infrastructure, production validation, hotfix deploy |
| **Product Lead** | Product owner | Requirements, acceptance criteria, feature sign-off, store submissions |
| **Finance Lead** | Finance | Payment logic, withdrawals, settlements, reconciliation, incentive payouts, financial reports |
| **Operations Manager** | Operations | Dispatch changes, SOS/incident flows, pilot cohort, beta ops, user communication |
| **CEO** | CEO | Public launch, Closed Beta entry, executive/board/compliance module changes, P0 escalation, scope reopening |

Reference: `handover/06_SUPPORT_MATRIX.md`

---

## By work type

| Work type | Required approvers | Optional / conditional |
|-----------|-------------------|------------------------|
| **Feature (v1.0 approved)** | Product Lead, Engineering Lead, QA Lead | Security Lead, CEO (executive modules) |
| **Enhancement / hardening** | Engineering Lead, Peer reviewer | QA Lead (if UI), Security Lead (if auth) |
| **Bug fix P0** | Engineering Lead, QA Lead, DevOps Lead | CEO (notify) |
| **Bug fix P1** | Engineering Lead, QA Lead | DevOps (if deploy) |
| **Bug fix P2/P3** | Peer reviewer, Engineering Lead | — |
| **Backend-only change** | Engineering Lead (Backend Lead) | Security Lead |
| **Mobile app change** | Mobile Lead, QA Lead | Product Lead |
| **Financial change** | Engineering Lead, **Finance Lead** | CEO (if reporting impact) |
| **Operations / dispatch change** | Engineering Lead, **Operations Manager** | QA Lead |
| **Security change** | **Security Lead**, Engineering Lead | CEO (if incident) |
| **API / partner change** | Engineering Lead, Security Lead | DevOps |
| **Infrastructure / deploy** | **DevOps Lead**, Engineering Lead | CEO (emergency) |
| **Release Candidate** | Engineering Lead, DevOps Lead | QA Lead |
| **Closed Beta (Gate A)** | **CEO**, Engineering Lead, DevOps Lead | QA Lead |
| **General Availability (Gate B)** | **CEO**, Engineering Lead, DevOps Lead, QA Lead | Product Lead |
| **Hotfix P0** | Engineering Lead, DevOps Lead, CEO (notify/approve) | Security Lead |
| **Scope change (v1.0 reopen)** | **CEO** only | Program Office |

---

## By module (examples)

| Module | Primary approver | Additional approvers |
|--------|------------------|---------------------|
| Yala Rider / Driver / Delivery | Mobile Lead | QA Lead, Product Lead |
| Finance Operations Center | Finance Lead | Engineering Lead |
| Payments & Wallet | Finance Lead | Engineering Lead, Security Lead |
| Operations / Command Center | Operations Manager | Engineering Lead |
| Trust & Safety | Operations Manager | Security Lead |
| CEO Master / Board Reports | CEO | Engineering Lead, Finance Lead |
| Compliance & Governance | CEO / Legal | Engineering Lead |
| API Gateway | Engineering Lead | Security Lead |
| Merchant / Partner settlements | Finance Lead | Engineering Lead |
| Infrastructure | DevOps Lead | Engineering Lead |

Module list: [PLATFORM_INVENTORY.md](../docs/PLATFORM_INVENTORY.md)

---

## Approval evidence

| Field | Required in work item |
|-------|----------------------|
| Approver name / role | Yes |
| Date | Yes |
| Method | PR approval · checklist initials · sign-off doc link |
| Scope acknowledged | What was approved (version, module, environment) |

Executive approvals: document in `release/UAT_EXECUTIVE_SIGNOFF.md`.

---

## Escalation

| Situation | Escalate to | Timeframe |
|-----------|-------------|-----------|
| DoD criterion cannot be met | Engineering Lead | Same sprint |
| P0 blocker | CEO + DevOps | Immediate |
| Security finding | Security Lead | Before deploy |
| Scope dispute | CEO + Product Lead | Before development |
| Launch gate failure | CEO | Release readiness review |

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md) | Scope freeze |
| [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | 10-stage workflow |
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Completion gates |
| [RELEASE_LIFECYCLE.md](../release/RELEASE_LIFECYCLE.md) | Release stages |
| [RELEASE_CHECKLIST.md](../release/RELEASE_CHECKLIST.md) | Release checklist |
| [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) | Rollback procedures |
| [RELEASE_CALENDAR.md](../release/RELEASE_CALENDAR.md) | Cadence and hotfix |
| [CHANGELOG_TEMPLATE.md](../release/CHANGELOG_TEMPLATE.md) | Release notes |
| [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) | Status tracking |
| [execution/02_PRIORITY_FIX_LIST.md](../execution/02_PRIORITY_FIX_LIST.md) | Open fixes |
| `project-management/04_BUG_AND_TECH_DEBT.md` | Bug register |
| `handover/06_SUPPORT_MATRIX.md` | Team responsibilities |

---

## Document maintenance

| Event | Action | Owner |
|-------|--------|-------|
| New work type introduced | Update Part 5 matrix | Program Office |
| Launch gate change | Update Part 4 | Program Office |
| Process improvement from retrospective | Update relevant section | Engineering Lead |

---

*Effective 2026-07-22 · Mandatory for all work items · YALA Enterprise Program Office · Documentation only*
