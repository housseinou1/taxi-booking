# YALA Enterprise — Release Checklist

**Document ID:** RELEASE-CHECKLIST-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active — Mandatory for all releases  
**Governance:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md)

---

## Purpose

This checklist must be completed **before any release is promoted** to Release Candidate, Closed Beta, or Production. Every item maps to [Quality Gates](../docs/QUALITY_GATES.md) and [Execution Policy](../docs/EXECUTION_POLICY.md) stages.

**Do not check items without verification evidence** (date, initials, link to report or test output).

---

## How to Use

1. Copy this checklist into the release work item or create `release/RELEASE_CHECKLIST_vX.Y.Z.md` per release.
2. Mark ☐ → ✅ when verified.
3. Mark **N/A** only with written justification and approver initials.
4. All mandatory items must be ✅ (or N/A approved) before release promotion.
5. CEO approval required where indicated (Gate 11).

---

## Release Information

| Field | Value |
|-------|-------|
| **Release version** | e.g. v1.0.0-rc3, v1.0.1 |
| **Release type** | Major · Minor · Patch · Hotfix · Infrastructure |
| **Target environment** | Staging · Closed Beta · Production |
| **Affected modules** | (from [PLATFORM_INVENTORY.md](../docs/PLATFORM_INVENTORY.md)) |
| **Release owner** | |
| **Target date** | |
| **Rollback owner** | |

---

## Mandatory Checks

### Planning & Design

| # | Check | Required | Status | Date | Initials | Evidence / Notes |
|---|-------|:--------:|:------:|------|----------|------------------|
| 1 | ✓ **Requirements approved** | Yes | ☐ | | | Work item + acceptance criteria; ROADMAP_FREEZE alignment |
| 2 | ✓ **Architecture reviewed** | If schema/API/cross-module | ☐ | | | EXECUTION_POLICY Stage 2; architecture note or N/A reason |

**Maps to:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) Stages 1–2 · [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md) Ready for Development → In Development

---

### Implementation & Review

| # | Check | Required | Status | Date | Initials | Evidence / Notes |
|---|-------|:--------:|:------:|------|----------|------------------|
| 3 | ✓ **Code reviewed** | Yes | ☐ | | | Peer approval; PR link or review record |
| 4 | ✓ **Backend implemented** | If backend change | ☐ | | | QUALITY_GATES Gate 1; migrations listed if any |
| 5 | ✓ **Frontend implemented** | If UI change | ☐ | | | QUALITY_GATES Gate 2; routes wired; 403 handled |
| 6 | ✓ **API documented** | If API change | ☐ | | | QUALITY_GATES Gate 3; `engineering/02_API_CATALOG.md` or phase report |

**Maps to:** EXECUTION_POLICY Stages 3–4 · RELEASE_LIFECYCLE Code Review

---

### Testing

| # | Check | Required | Status | Date | Initials | Evidence / Notes |
|---|-------|:--------:|:------:|------|----------|------------------|
| 7 | ✓ **Unit tests passed** | Yes | ☐ | | | Suite name + count (e.g. `tests.operations`: N/N pass) |
| 8 | ✓ **Integration tests passed** | If API/module change | ☐ | | | QUALITY_GATES Gate 5; permissions + payload keys verified |
| 9 | ✓ **Mobile QA passed** | If mobile impact | ☐ | | | QUALITY_GATES Gate 6; `physical-device-qa/` checklist signed |

**Maps to:** EXECUTION_POLICY Stage 5 · RELEASE_LIFECYCLE QA Testing

**Baseline:** Operations suite must pass with 0 errors (maintain or improve documented baseline).

---

### Security & Performance

| # | Check | Required | Status | Date | Initials | Evidence / Notes |
|---|-------|:--------:|:------:|------|----------|------------------|
| 10 | ✓ **Security review completed** | Yes | ☐ | | | QUALITY_GATES Gate 7; auth, secrets, input validation |
| 11 | ✓ **Performance validated** | If API/query impact | ☐ | | | QUALITY_GATES Gate 8; p95 acceptable; load test if applicable |

**Maps to:** EXECUTION_POLICY Stages 6–7 · RELEASE_LIFECYCLE Security Review → Performance Validation

**Launch target:** p95 < 2000 ms under load (Gate B per `UAT_RELEASE_READINESS_CHECKLIST.md`).

---

### Documentation & Release Artifacts

| # | Check | Required | Status | Date | Initials | Evidence / Notes |
|---|-------|:--------:|:------:|------|----------|------------------|
| 12 | ✓ **Documentation updated** | Yes | ☐ | | | QUALITY_GATES Gate 9; PROJECT_STATUS, runbooks, API catalog |
| 13 | ✓ **Rollback plan documented** | If production deploy | ☐ | | | [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md); version tag to revert to |
| 14 | ✓ **Release notes prepared** | Yes | ☐ | | | [CHANGELOG_TEMPLATE.md](./CHANGELOG_TEMPLATE.md); known issues listed |
| 15 | ✓ **Known issues register updated** | If applicable | ☐ | | | `KNOWN_ISSUES_v*.md` or UAT register |

**Maps to:** EXECUTION_POLICY Stage 8 · RELEASE_LIFECYCLE Release Candidate

---

### Deployment & Approval

| # | Check | Required | Status | Date | Initials | Evidence / Notes |
|---|-------|:--------:|:------:|------|----------|------------------|
| 16 | ✓ **Staging validated** | If staging available | ☐ | | | Smoke test on staging before prod |
| 17 | ✓ **Migrations reviewed** | If schema change | ☐ | | | Forward-only; maintenance window scheduled |
| 18 | ✓ **Health check post-deploy** | Yes | ☐ | | | `/api/health/ready/` PASS |
| 19 | ✓ **Production validation complete** | Yes | ☐ | | | EXECUTION_POLICY Stage 10; smoke test evidence |
| 20 | ✓ **Production approval granted** | Yes | ☐ | | | Engineering Lead + DevOps; **CEO for GA/public launch** (Gate 11) |

**Maps to:** EXECUTION_POLICY Stages 9–10 · RELEASE_LIFECYCLE Production

---

## Gate A / Gate B Addendum (Launch Releases)

*Complete when promoting to Closed Beta or General Availability.*

### Gate A — Closed Beta

| # | Check | Status | Evidence |
|---|-------|:------:|----------|
| G-A1 | Physical device QA signed | ☐ | `physical-device-qa/` report |
| G-A2 | Offsite backup configured + drill | ☐ | `OFFSITE_BACKUP_CERTIFICATION.md` |
| G-A3 | Pilot caps defined (20/10/100) | ☐ | Launch hub config |
| G-A4 | Feature freeze acknowledged | ☐ | ROADMAP_FREEZE_V1 |
| G-A5 | Executive sign-off (Gate A) | ☐ | `UAT_EXECUTIVE_SIGNOFF.md` |

### Gate B — General Availability

| # | Check | Status | Evidence |
|---|-------|:------:|----------|
| G-B1 | All Gate A items ✅ | ☐ | UAT checklist |
| G-B2 | p95 latency < 2000 ms | ☐ | Load test report |
| G-B3 | Play closed testing live | ☐ | Play Console |
| G-B4 | Pilot cohort at target | ☐ | Launch metrics |
| G-B5 | Account deletion attested | ☐ | Store + in-app |
| G-B6 | CEO public launch sign-off | ☐ | `UAT_EXECUTIVE_SIGNOFF.md` |

Reference: `release/UAT_RELEASE_READINESS_CHECKLIST.md`

---

## Checklist by Release Type

| Check # | Patch | Hotfix | Minor | Major / GA |
|:-------:|:-----:|:------:|:-----:|:----------:|
| 1–2 | ✅ | ✅ | ✅ | ✅ |
| 3–6 | ✅ | ✅ | ✅ | ✅ |
| 7 | ✅ | ✅ | ✅ | ✅ |
| 8 | If API | If API | ✅ | ✅ |
| 9 | If mobile | If mobile | If mobile | ✅ |
| 10 | ✅ | ✅ | ✅ | ✅ |
| 11 | If API | If API | ✅ | ✅ |
| 12–15 | ✅ | ✅ | ✅ | ✅ |
| 13 | ✅ | ✅ | ✅ | ✅ |
| 16–20 | ✅ | ✅ | ✅ | ✅ |
| Gate A/B | — | — | Optional | ✅ |

---

## Sign-Off

| Role | Name | Signature / Date | Release approved |
|------|------|:----------------:|:----------------:|
| Engineering Lead | | ☐ | |
| Security Lead | | ☐ | (if security-impacting) |
| QA Lead | | ☐ | (if mobile/UI) |
| DevOps Lead | | ☐ | |
| CEO | | ☐ | (Closed Beta / GA only) |

**Release may not proceed without Engineering Lead + DevOps sign-off. CEO sign-off required for public launch.**

---

## Non-Compliance

If any mandatory check cannot be satisfied:

1. **Do not promote** the release.
2. Return work item to appropriate lifecycle stage ([RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md)).
3. Log blocker in [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) and `handover/05_RISK_REGISTER.md`.
4. Escalate P0 blockers to CEO daily standup.

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Gate definitions |
| [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | 10-stage workflow |
| [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) | Rollback procedures |
| [CHANGELOG_TEMPLATE.md](./CHANGELOG_TEMPLATE.md) | Release notes format |
| [RELEASE_CALENDAR.md](./RELEASE_CALENDAR.md) | Release cadence |
| `engineering/05_DEPLOYMENT_GUIDE.md` | Deploy steps |

---

*Mandatory for all releases · Effective 2026-07-22 · YALA Enterprise Program Office*
