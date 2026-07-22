# YALA Enterprise — Lessons Learned Register

**Document ID:** CIP-LESSONS-001  
**Version:** YALA Enterprise v1.0  
**Last updated:** 2026-07-22  
**Status:** Active  
**Related:** [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) · [POST_RELEASE_REVIEW_TEMPLATE.md](./POST_RELEASE_REVIEW_TEMPLATE.md) · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)

---

## Purpose

Capture **institutional knowledge** from releases, incidents, audits, and beta operations so YALA improves systematically and avoids repeating mistakes.

Each entry includes situation, root cause, resolution, recommendation, and owner.

---

## Register summary

| Category | Count |
|----------|:-----:|
| Release / deploy | 4 |
| Quality / testing | 3 |
| Performance | 2 |
| Operations | 2 |
| Governance | 3 |
| **Total** | **14** |

---

## Lessons learned

### LL-001 — nginx bind mount stale after deploy

| Field | Detail |
|-------|--------|
| **ID** | LL-001 |
| **Date** | 2026-07-21 |
| **Category** | Release / deploy |
| **Situation** | Admin SPA returned empty pages after frontend deploy; nginx container served empty `/usr/share/nginx/html` despite host build present. |
| **Root cause** | nginx container bind mount not refreshed without `--force-recreate nginx`. |
| **Resolution** | `docker compose -p yala up -d --force-recreate nginx` restored correct static assets. |
| **Recommendation** | Always `--force-recreate nginx` after frontend deploy; add to DEPLOYMENT_GUIDE and RELEASE_CHECKLIST. |
| **Owner** | DevOps Lead |
| **Status** | ✅ Documented in `release/SPRINT1_LAUNCH_READINESS.md` |
| **Related** | [ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md) |

---

### LL-002 — RC3 perf fixes in source but not in production

| Field | Detail |
|-------|--------|
| **ID** | LL-002 |
| **Date** | 2026-07-21 |
| **Category** | Release / deploy |
| **Situation** | p95 latency remained ~4086 ms despite RC3 optimizations merged in codebase. |
| **Root cause** | RC3 backend never deployed to production; load test measured pre-RC3 behavior. |
| **Resolution** | Pending — Sprint 2 deploy action (ACT-003). |
| **Recommendation** | Require production validation evidence before marking perf fixes "done"; gate on deploy not merge. |
| **Owner** | DevOps Lead |
| **Status** | 🟡 Open — action in progress |
| **Related** | RB-P0-002 · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) |

---

### LL-003 — Test regression slipped through (Merchant.name)

| Field | Detail |
|-------|--------|
| **ID** | LL-003 |
| **Date** | 2026-07-22 |
| **Category** | Quality / testing |
| **Situation** | Operations test suite reported 8 errors during final RC audit; prior baseline claimed 82/82 pass. |
| **Root cause** | `api_gateway/signals.py` references `Merchant.name`; model field is `business_name`. Webhook signal fires on merchant tests. |
| **Resolution** | Pending — Engineering fix (ACT-001). |
| **Recommendation** | Enforce green `tests.operations` in CI before any RC tag; update QUALITY_GATES baseline to current suite size. |
| **Owner** | Engineering Lead |
| **Status** | 🟡 Open |
| **Related** | RB-P0-001 · [FINAL_RELEASE_READINESS_AUDIT.md](../release/FINAL_RELEASE_READINESS_AUDIT.md) |

---

### LL-004 — Physical device QA cannot be substituted by emulator-only

| Field | Detail |
|-------|--------|
| **ID** | LL-004 |
| **Date** | 2026-07-21 |
| **Category** | Quality / testing |
| **Situation** | Sprint 1 mobile certification failed; no signed device QA for Rider, Driver, Delivery. |
| **Root cause** | Device QA requires human tester + Mauritania-network hardware; not automated in sprint. |
| **Resolution** | Schedule QA Lead + devices for Sprint 3 entry. |
| **Recommendation** | Block RC mobile promotion on signed PHYSICAL_DEVICE_QA_CHECKLIST; budget QA time in sprint plan. |
| **Owner** | QA Lead |
| **Status** | 🟡 Open |
| **Related** | BUG-P0-001 |

---

### LL-005 — Deploy migrations without staging is high risk

| Field | Detail |
|-------|--------|
| **ID** | LL-005 |
| **Date** | 2026-07-22 |
| **Category** | Release / deploy |
| **Situation** | Phases 29–39 migrations pending production; no staging environment to validate batch. |
| **Root cause** | Staging never provisioned (TD-008); execution prioritized build over infra. |
| **Resolution** | DEC-012 — staging required before migration batch. |
| **Recommendation** | Provision staging before any multi-phase migration; pre-migration backup mandatory. |
| **Owner** | DevOps Lead |
| **Status** | 🟡 Open |
| **Related** | RB-P0-004 · PM-R-04 |

---

### LL-006 — Offsite backup is launch-critical, not optional

| Field | Detail |
|-------|--------|
| **ID** | LL-006 |
| **Date** | 2026-07-21 |
| **Category** | Operations |
| **Situation** | Local backup + drill passed Gate A partial; offsite backup still open as P0. |
| **Root cause** | Offsite S3/DO Spaces configuration deferred; local-only DR insufficient. |
| **Resolution** | Pending — ACT-006. |
| **Recommendation** | Treat offsite backup as P0 for RC and Gate A; weekly restore drill once configured. |
| **Owner** | DevOps Lead |
| **Status** | 🟡 Open |
| **Related** | BUG-P0-002 · `docs/DISASTER_RECOVERY.md` |

---

### LL-007 — Dashboard caching must be verified in prod, not assumed

| Field | Detail |
|-------|--------|
| **ID** | LL-007 |
| **Date** | 2026-07-21 |
| **Category** | Performance |
| **Situation** | AI Operations dashboard regenerates recommendations on every GET in production. |
| **Root cause** | RC3 `cached_ops_call` (45s Redis) not deployed. |
| **Resolution** | Part of RC3 deploy (ACT-003). |
| **Recommendation** | Include cache-hit verification in performance review stage; compare p95 before/after deploy. |
| **Owner** | Engineering Lead |
| **Status** | 🟡 Open |
| **Related** | LL-002 · PERF-001 |

---

### LL-008 — Dual referral systems create payout risk

| Field | Detail |
|-------|--------|
| **ID** | LL-008 |
| **Date** | 2026-07-21 |
| **Category** | Operations |
| **Situation** | Legacy `promotions.ReferralCode` and modern `referrals` app both active on ride complete. |
| **Root cause** | Phase 33 added new system without fully deprecating legacy path. |
| **Resolution** | v1.1 consolidation planned (KNOWN-001). |
| **Recommendation** | Monitor referral payouts during beta; consolidate before GA if payout errors observed. |
| **Owner** | Engineering / Growth |
| **Status** | 🟡 Accepted deferral to v1.1 |
| **Related** | [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) v1.1 items |

---

### LL-009 — Governance docs ahead of execution evidence

| Field | Detail |
|-------|--------|
| **ID** | LL-009 |
| **Date** | 2026-07-22 |
| **Category** | Governance |
| **Situation** | Comprehensive governance framework complete while RC audit concludes NOT READY. |
| **Root cause** | Planning and documentation sprint completed before P0 execution items closed. |
| **Resolution** | Sprint 2 focused on execution; PROGRAM_DASHBOARD tracks gap. |
| **Recommendation** | Balance doc sprints with mandatory execution deliverables; verify claims with test/deploy evidence. |
| **Owner** | Program Office |
| **Status** | ✅ Acknowledged |
| **Related** | [PROGRAM_DASHBOARD.md](../program-management/PROGRAM_DASHBOARD.md) |

---

### LL-010 — Feature freeze enables focus but frustrates feedback

| Field | Detail |
|-------|--------|
| **ID** | LL-010 |
| **Date** | 2026-07-21 |
| **Category** | Governance |
| **Situation** | Beta participants may request features outside v1.0 frozen scope. |
| **Root cause** | ROADMAP_FREEZE_V1 closes v1.0 scope by design. |
| **Resolution** | CUSTOMER_FEEDBACK_PROCESS routes FEAT requests to VERSION2_BACKLOG with acknowledgment template. |
| **Recommendation** | Communicate freeze clearly in beta onboarding; set expectations on response templates. |
| **Owner** | Product Lead |
| **Status** | ✅ Process defined |
| **Related** | [CUSTOMER_FEEDBACK_PROCESS.md](./CUSTOMER_FEEDBACK_PROCESS.md) |

---

### LL-011 — Pilot cohort size limits beta signal quality

| Field | Detail |
|-------|--------|
| **ID** | LL-011 |
| **Date** | 2026-07-21 |
| **Category** | Operations |
| **Situation** | Cohort at ~2/0/5 vs target 20/10/100 — insufficient for scale validation. |
| **Root cause** | Recruitment not yet executed at scale; pre-beta state. |
| **Resolution** | Operations outreach in Sprint 3 (ACT-015). |
| **Recommendation** | Do not expand Play testing track until minimum driver/rider thresholds met. |
| **Owner** | Operations Manager |
| **Status** | 🟡 Open |
| **Related** | BUG-P1-004 |

---

### LL-012 — June 2026 production audit superseded

| Field | Detail |
|-------|--------|
| **ID** | LL-012 |
| **Date** | 2026-07-22 |
| **Category** | Governance |
| **Situation** | `docs/PRODUCTION_READINESS_AUDIT.md` (32/100, June 2026) contradicts current 72/100 RC audit. |
| **Root cause** | Platform evolved significantly through Phases 20–39 and RC2/RC3 work. |
| **Resolution** | Mark June audit superseded; link to FINAL_RELEASE_READINESS_AUDIT. |
| **Recommendation** | Date-stamp audits; archive superseded docs with forward link. |
| **Owner** | Program Office |
| **Status** | 🟡 Action ACT-027 |
| **Related** | [FINAL_RELEASE_READINESS_AUDIT.md](../release/FINAL_RELEASE_READINESS_AUDIT.md) |

---

### LL-013 — Android-first reduces launch scope productively

| Field | Detail |
|-------|--------|
| **ID** | LL-013 |
| **Date** | 2026-07-21 |
| **Category** | Release |
| **Situation** | Apple App Store not submitted; iOS market excluded at v1.0. |
| **Root cause** | DEC-005 — deliberate Android-first strategy. |
| **Resolution** | Accepted; iOS deferred to v1.1. |
| **Recommendation** | Document iOS deferral in release notes and investor comms; avoid implicit promise of iOS at GA. |
| **Owner** | Product Lead |
| **Status** | ✅ Accepted (DEC-005) |
| **Related** | [DECISION_LOG.md](../program-management/DECISION_LOG.md) |

---

### LL-014 — BI service layer without ETL is acceptable for v1.0

| Field | Detail |
|-------|--------|
| **ID** | LL-014 |
| **Date** | 2026-07-21 |
| **Category** | Performance |
| **Situation** | Phase 37 BI queries primary DB; full warehouse not built. |
| **Root cause** | ETL deferred per roadmap freeze and VERSION2_BACKLOG. |
| **Resolution** | Accepted for v1.0; monitor DB load during beta. |
| **Recommendation** | Set query timeouts and caching on BI dashboards; plan read replica post-GA if load spikes. |
| **Owner** | Engineering Lead |
| **Status** | ✅ Accepted (DEC-013) |
| **Related** | TD-010 · [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) |

---

## Entry template

```markdown
### LL-XXX — [Short title]

| Field | Detail |
|-------|--------|
| **ID** | LL-XXX |
| **Date** | YYYY-MM-DD |
| **Category** | Release / Quality / Performance / Operations / Governance / Security |
| **Situation** | [What happened] |
| **Root cause** | [Why it happened] |
| **Resolution** | [What we did or plan to do] |
| **Recommendation** | [Future prevention or process change] |
| **Owner** | [Role] |
| **Status** | Open / Closed / Accepted |
| **Related** | [Links to bugs, decisions, actions] |
```

---

## Review process

| Activity | Frequency | Owner |
|----------|-----------|-------|
| Add entry after post-release review | Per release | Program Office |
| Add entry after P0 incident | Within 48 h | Engineering Lead |
| Review open lessons | Monthly | Program Office |
| Annual synthesis | Annual | CEO + Program Office |

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [POST_RELEASE_REVIEW_TEMPLATE.md](./POST_RELEASE_REVIEW_TEMPLATE.md) | Source of new lessons |
| [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) | Actions from recommendations |
| [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) | Current status |
| [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) | Strategic deferrals |

---

*Owner: Program Office · Append new entries at top of register section*
