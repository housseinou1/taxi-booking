# YALA Enterprise v1.0 — Action Register

**Document ID:** PM-ACTION-REGISTER-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Status:** Active  
**Governance:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md)

---

## Summary

| Priority | Open | In progress | Done |
|:--------:|:----:|:-----------:|:----:|
| P0 | 10 | 0 | 0 |
| P1 | 12 | 0 | 0 |
| P2 | 8 | 0 | 0 |
| **Total** | **30** | **0** | **0** |

---

## P0 actions — Critical

| ID | Action | Owner | Priority | Due Date | Status | Dependencies |
|----|--------|-------|:--------:|:--------:|:------:|--------------|
| ACT-001 | Fix `api_gateway/signals.py` Merchant.name → business_name | Engineering Lead | P0 | 2026-07-26 | Open | — |
| ACT-002 | Green operations test suite (146/146, 0 errors) | Engineering Lead | P0 | 2026-07-27 | Open | ACT-001 |
| ACT-003 | Deploy RC3 backend to production | DevOps Lead | P0 | 2026-07-30 | Open | ACT-002 |
| ACT-004 | Apply Phases 29–39 production migrations | DevOps Lead | P0 | 2026-08-02 | Open | ACT-005, ACT-003 |
| ACT-005 | Provision staging environment (mirror prod compose) | DevOps Lead | P0 | 2026-07-30 | Open | — |
| ACT-006 | Configure offsite encrypted backup + restore drill | DevOps Lead | P0 | 2026-07-29 | Open | — |
| ACT-007 | Re-run p95 load test after RC3 deploy | Engineering Lead | P0 | 2026-08-01 | Open | ACT-003 |
| ACT-008 | Complete RELEASE_CHECKLIST_v1.0.0-rc3 | Program Office | P0 | 2026-08-05 | Open | ACT-002, ACT-003 |
| ACT-009 | Execute physical device QA; sign certification | QA Lead | P0 | 2026-08-05 | Open | — |
| ACT-010 | Document RC readiness re-audit | Program Office | P0 | 2026-08-06 | Open | ACT-001–008 |

---

## P1 actions — High

| ID | Action | Owner | Priority | Due Date | Status | Dependencies |
|----|--------|-------|:--------:|:--------:|:------:|--------------|
| ACT-011 | Rebuild Rider/Driver/Delivery AAB from RC3 source | Mobile Lead | P1 | 2026-08-02 | Open | ACT-003 |
| ACT-012 | Fix delivery prod E2E (403 phone verify) | Engineering Lead | P1 | 2026-08-02 | Open | — |
| ACT-013 | Fix 7 core unit test fixture failures | Engineering Lead | P1 | 2026-08-05 | Open | — |
| ACT-014 | Complete Google Play Data Safety + closed testing | Product Lead | P1 | 2026-08-12 | Open | ACT-009 |
| ACT-015 | Recruit pilot cohort to 20/10/100 | Operations Manager | P1 | 2026-08-15 | Open | — |
| ACT-016 | Admin least-privilege role audit | Security Lead | P1 | 2026-08-12 | Open | — |
| ACT-017 | Complete security UAT (S-01–S-10) | Security Lead | P1 | 2026-08-12 | Open | ACT-003 |
| ACT-018 | Obtain CEO Gate A sign-off | CEO | P1 | 2026-08-15 | Open | ACT-006, ACT-009 |
| ACT-019 | Update PROJECT_STATUS.md post-deploy | Program Office | P1 | 2026-08-03 | Open | ACT-003 |
| ACT-020 | Update 04_BUG_AND_TECH_DEBT.md (test baseline) | Program Office | P1 | 2026-07-29 | Open | ACT-002 |
| ACT-021 | Tag v1.0.0-rc3 git release | DevOps Lead | P1 | 2026-08-06 | Open | ACT-008 |
| ACT-022 | Sprint 2 retrospective | Program Office | P1 | 2026-08-05 | Open | Sprint 2 end |

---

## P2 actions — Medium (sample)

| ID | Action | Owner | Priority | Due Date | Status | Dependencies |
|----|--------|-------|:--------:|:--------:|:------:|--------------|
| ACT-023 | Pin DRF/Celery in requirements.txt | Engineering Lead | P2 | 2026-08-12 | Open | ACT-021 |
| ACT-024 | Generate THIRD_PARTY_LICENSES.txt | Engineering Lead | P2 | 2026-08-19 | Open | — |
| ACT-025 | Deploy Celery Flower or queue monitor | DevOps Lead | P2 | v1.1 | Open | — |
| ACT-026 | FR/AR privacy/terms localization | Product Lead | P2 | v1.1 | Open | — |
| ACT-027 | Mark PRODUCTION_READINESS_AUDIT.md superseded | Program Office | P2 | 2026-07-29 | Open | — |
| ACT-028 | Consolidate dual referral systems | Engineering Lead | P2 | v1.1 | Open | — |
| ACT-029 | Enable Play Integrity post-beta | Security Lead | P2 | v1.1 | Open | ACT-014 |
| ACT-030 | PgBouncer connection pooler | DevOps Lead | P2 | v1.1 | Open | — |

---

## Completed actions (Sprint 1)

| ID | Action | Owner | Completed | Status |
|----|--------|-------|-----------|:------:|
| ACT-D01 | Create execution baseline (5 docs) | Program Office | 2026-07-22 | ✅ Done |
| ACT-D02 | Create release management framework | Program Office | 2026-07-22 | ✅ Done |
| ACT-D03 | Create Definition of Done | Program Office | 2026-07-22 | ✅ Done |
| ACT-D04 | Final RC readiness audit | Program Office | 2026-07-22 | ✅ Done |
| ACT-D05 | Program management dashboard (7 docs) | Program Office | 2026-07-22 | ✅ Done |

---

## Action status legend

| Status | Meaning |
|--------|---------|
| Open | Not started |
| In progress | Owner actively working |
| Blocked | Waiting on dependency |
| Done | Complete with evidence |
| Cancelled | No longer required |

---

## Mapping to blockers

| Action ID | Blocker / Bug ID |
|-----------|------------------|
| ACT-001 | RB-P0-001 |
| ACT-003 | RB-P0-002, BUG-P1-006 |
| ACT-004 | RB-P0-003 |
| ACT-005 | RB-P0-004 |
| ACT-006 | RB-P0-005, BUG-P0-002 |
| ACT-009 | BUG-P0-001, RB-P1-001 |
| ACT-012 | BUG-P1-005 |
| ACT-013 | KNOWN-006 |

Reference: [release/RELEASE_BLOCKERS.md](../release/RELEASE_BLOCKERS.md)

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [SPRINT_TRACKER.md](./SPRINT_TRACKER.md) | Sprint commitments |
| [RISK_REGISTER.md](./RISK_REGISTER.md) | Risk mitigations |
| [docs/EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | Workflow |
| [engineering/DEFINITION_OF_DONE.md](../engineering/DEFINITION_OF_DONE.md) | Completion criteria |

---

*Update daily for P0 · Weekly for P1/P2 · Owner: Program Office*
