# YALA Enterprise v1.0 — Program Risk Register

**Document ID:** PM-RISK-REGISTER-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Review cadence:** Weekly (Sprint 2+) · Monthly post-launch  
**Governance:** [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) · [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md)  
**Extended register:** `handover/05_RISK_REGISTER.md`

---

## Summary

| Status | Count |
|--------|:-----:|
| Open | 12 |
| Mitigating | 3 |
| Closed | 2 |
| Accepted | 2 |

| Impact → | Low | Medium | High | Critical |
|----------|:---:|:------:|:----:|:--------:|
| **High likelihood** | — | 1 | 3 | 1 |
| **Medium likelihood** | 1 | 4 | 4 | — |
| **Low likelihood** | 1 | 1 | — | — |

---

## Active risks

| ID | Description | Probability | Impact | Owner | Mitigation | Status | Review Date |
|----|-------------|:-----------:|:------:|-------|------------|:------:|:-----------:|
| PM-R-01 | **RC delayed** by P0 blockers (tests, deploy, staging) | High | High | CEO | Sprint 2 focused remediation; weekly launch review | Open | 2026-07-29 |
| PM-R-02 | **Test suite regression** (8 errors) undetected before audit | Medium | High | Engineering Lead | Fix signals bug; enforce green CI gate; update DoD | Mitigating | 2026-07-29 |
| PM-R-03 | **Offsite backups not verified** — data loss on failure | High | Critical | DevOps | Configure S3/DO Spaces; weekly restore drill | Open | 2026-07-29 |
| PM-R-04 | **Production deploy without staging** causes incident | Medium | High | DevOps | Provision staging; RC validation on staging first | Open | 2026-07-29 |
| PM-R-05 | **p95 latency ~4s** under admin load; RC3 not deployed | Medium | High | Engineering Lead | Deploy RC3 cache + indexes; re-run load test | Mitigating | 2026-07-29 |
| PM-R-06 | **Phases 29–39 migration batch** causes prod schema incident | Medium | High | DevOps | Pre-migration backup; maintenance window; staging first | Open | 2026-08-05 |
| PM-R-07 | **Pilot cohort too small** (~2/0/5) for beta validation | Medium | Medium | Operations Manager | Recruit to 20/10/100 caps | Open | 2026-08-05 |
| PM-R-08 | **Physical device QA unsigned** — mobile defects in beta | High | High | QA Lead | Execute device checklist before cohort expansion | Open | 2026-08-05 |
| PM-R-09 | **Apple App Store not submitted** — iOS market excluded | High | Medium | Product Lead | Android-first for v1.0; defer iOS formally | Accepted | 2026-08-12 |
| PM-R-10 | **Dual referral systems** cause payout errors | Medium | Medium | Engineering / Growth | v1.1 consolidation; monitor during beta | Open | 2026-08-12 |
| PM-R-11 | **Driver/rider abuse or harassment** during beta | Medium | Critical | Operations Manager | Trust & Safety monitoring; SOS runbook; suspension workflow | Open | 2026-07-29 |
| PM-R-12 | **Public launch delayed** past Q3 target | Medium | High | CEO | Maintain controlled beta; transparent blocker tracking | Open | 2026-07-29 |
| PM-R-13 | **Delivery prod E2E blocked** (403 phone verify) | Medium | High | QA Lead / Engineering | Debug prod verification; re-certify E2E | Open | 2026-08-05 |
| PM-R-14 | **PostgreSQL connection saturation** at launch | Medium | Medium | DevOps | Monitor connections; PgBouncer v1.1 | Open | 2026-08-12 |
| PM-R-15 | **Negative store reviews** from untested mobile builds | Medium | High | QA Lead | Device QA before Play promotion | Open | 2026-08-05 |

---

## Probability & impact legend

| Probability | Definition |
|-------------|------------|
| **Low** | < 25% in next 30 days |
| **Medium** | 25–60% |
| **High** | > 60% |

| Impact | Definition |
|--------|------------|
| **Low** | Minor delay; no user/data impact |
| **Medium** | Sprint slip; limited user impact |
| **High** | Release slip; significant user/ops impact |
| **Critical** | Data loss, safety incident, or launch cancellation |

---

## Top 5 risks (executive focus)

| Rank | ID | Risk | Action this week |
|:----:|----|------|------------------|
| 1 | PM-R-03 | Offsite backup | DevOps: configure + drill |
| 2 | PM-R-02 | Test regression | Engineering: fix + green suite |
| 3 | PM-R-04 | No staging | DevOps: provision mirror env |
| 4 | PM-R-08 | Device QA | QA: schedule hardware testing |
| 5 | PM-R-11 | Safety incidents | Ops: SOS drill with support |

---

## Closed / accepted risks

| ID | Description | Resolution | Date |
|----|-------------|------------|------|
| PM-R-C01 | Roadmap scope creep during execution | ROADMAP_FREEZE_V1 enforced | 2026-07-21 |
| PM-R-C02 | Missing governance framework | Execution baseline + release framework complete | 2026-07-22 |
| PM-R-A01 | iOS market excluded at v1.0 launch | Android-first strategy accepted by CEO | 2026-07-21 |
| PM-R-A02 | BI full ETL deferred | v1.0 design-only scope per roadmap freeze | 2026-07-21 |

---

## Risk → blocker mapping

| Risk ID | Blocker ID |
|---------|------------|
| PM-R-02 | RB-P0-001 |
| PM-R-03 | RB-P0-005 |
| PM-R-04 | RB-P0-004 |
| PM-R-05 | RB-P0-002, RB-P0-008 |
| PM-R-06 | RB-P0-003 |
| PM-R-08 | RB-P1-001, BUG-P0-001 |
| PM-R-13 | RB-P1-003 |

Reference: [release/RELEASE_BLOCKERS.md](../release/RELEASE_BLOCKERS.md)

---

## Review process

1. **Weekly** — Program Office + leads review open risks (Monday standup).
2. **Escalate** Critical/High unmitigated risks to CEO same day.
3. **Update** status, mitigation progress, and review date after each review.
4. **Sync** with `handover/05_RISK_REGISTER.md` monthly.

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [PROGRAM_DASHBOARD.md](./PROGRAM_DASHBOARD.md) | Executive snapshot |
| [ACTION_REGISTER.md](./ACTION_REGISTER.md) | Mitigation actions |
| [docs/PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) | Project status |
| `handover/05_RISK_REGISTER.md` | Technical/operational detail |

---

*Owner: Program Office · Next review: 2026-07-29*
