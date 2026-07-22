# YALA Enterprise — Customer Feedback Process

**Document ID:** CIP-FEEDBACK-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active  
**Related:** [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) · [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md)

---

## Purpose

Define how YALA **collects, categorizes, prioritizes, and responds to** feedback from riders, drivers, couriers, merchants, partners, and internal operators.

---

## Feedback collection

### Channels

| Channel | Source | Owner | System |
|---------|--------|-------|--------|
| **In-app beta feedback** | Rider, Driver, Delivery apps | Support Lead | Admin → Support / Beta Feedback |
| **Support tickets** | Email, phone, WhatsApp (ops) | Support Lead | Support Center |
| **Launch Command Center** | Ops observations during beta | Operations Manager | `/admin/launch` |
| **Trust & Safety incidents** | SOS, harassment, fraud reports | Operations + Security | Trust & Safety Center |
| **Merchant portal / admin** | Merchant issues | Operations Manager | Merchant Platform |
| **Driver document rejections** | Onboarding friction | Fleet / Operations | Fleet Performance Center |
| **App store reviews** | Public (post-launch) | Product Lead | Play Console |
| **CEO / executive input** | Strategic observations | CEO | Decision Log |
| **NPS / surveys** | Periodic (beta, quarterly) | Growth | Manual / future CRM |
| **Analytics signals** | Drop-off, cancel rates | Product + Engineering | BI / Launch Hub KPIs |

### Collection requirements

Every feedback item must capture:

| Field | Required |
|-------|:--------:|
| Date received | Yes |
| Channel | Yes |
| User type (rider/driver/courier/merchant) | Yes |
| Module / feature area | Yes |
| Description | Yes |
| Severity (if bug) | If applicable |
| Contact (if follow-up needed) | Optional |
| Screenshot / device info | If mobile |

**Mobile beta:** `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` for structured QA feedback.

---

## Issue categorization

| Category | Code | Definition | Route to |
|----------|:----:|------------|----------|
| **Bug** | BUG | Defect — system does not work as designed | `project-management/04_BUG_AND_TECH_DEBT.md` |
| **Enhancement** | ENH | Improvement to existing feature within approved scope | [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) |
| **Feature request** | FEAT | New capability not in v1.0 | [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) |
| **Support / how-to** | SUP | User education; no product change | Support playbook |
| **Complaint / trust** | TRUST | Safety, fraud, harassment | Trust & Safety queue |
| **Ops / process** | OPS | Internal workflow improvement | [ACTION_REGISTER.md](../program-management/ACTION_REGISTER.md) |
| **Duplicate** | DUP | Already tracked | Link to existing ID |

### Severity (bugs only)

| Level | Definition | Response SLA |
|:-----:|------------|:------------:|
| P0 | Production down, safety, data loss | 4 hours |
| P1 | Major feature broken; workaround difficult | 2 business days |
| P2 | Minor defect; workaround exists | Next sprint |
| P3 | Cosmetic; low impact | Backlog |

---

## Feature requests

Feature requests **do not enter development** without executive approval per [ROADMAP_FREEZE_V1.md](../docs/ROADMAP_FREEZE_V1.md).

### Triage flow

```
Feature request received
    → Is it in v1.0 frozen scope as fix/hardening? → IMPROVEMENT_BACKLOG (if approved)
    → Is it v1.1 polish? → project-management/05_VERSION_2_BACKLOG.md
    → Is it v2.x strategic? → VERSION2_BACKLOG.md
    → Decline with reason → Customer communication
```

### Feature request record

| Field | Value |
|-------|-------|
| ID | FEAT-XXX |
| Requester type | Rider / Driver / Merchant / Internal |
| Description | |
| Business value | High / Medium / Low |
| Strategic alignment | v1.1 / v2 / Out of scope |
| Status | Received / Under review / Backlogged / Approved / Declined |
| Decision date | |
| Communicated to requester | Yes / No |

---

## Bug reporting

### Internal bug workflow

1. **Report** — Support, QA, or ops creates ticket with reproduction steps.
2. **Triage** — QA Lead assigns P0–P3 and module (see [PLATFORM_INVENTORY.md](../docs/PLATFORM_INVENTORY.md)).
3. **Track** — Register in `04_BUG_AND_TECH_DEBT.md`.
4. **Fix** — [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) + [DEFINITION_OF_DONE.md](../engineering/DEFINITION_OF_DONE.md) Bug Fix DoD.
5. **Verify** — QA confirms fix; requester notified if external.
6. **Close** — Update bug register and [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) if launch-impacting.

### Customer-reported bugs

| Step | Action | Owner |
|:----:|--------|-------|
| 1 | Acknowledge receipt within 24 h (beta) / 48 h (GA) | Support |
| 2 | Categorize and assign ID | QA Lead |
| 3 | Provide status update at triage + resolution | Support |
| 4 | Notify when fixed (if contact provided) | Support |

---

## Prioritization

### Scoring matrix

| Factor | Weight | Score 1–5 |
|--------|:------:|:---------:|
| User impact (how many affected) | 30% | |
| Business impact (revenue, retention) | 25% | |
| Strategic alignment | 20% | |
| Effort (inverse — lower effort scores higher) | 15% | |
| Risk if deferred | 10% | |

**Priority = weighted score → mapped to P0–P3**

### Prioritization forum

| Forum | Frequency | Participants | Output |
|-------|-----------|--------------|--------|
| Daily triage (P0 only) | Daily during beta | Support, QA, Engineering | P0 assignments |
| Weekly feedback review | Weekly | Product, Support, Ops, Engineering | Prioritized backlog |
| Monthly CIP review | Monthly | CEO, Product, Engineering | v1.1 approvals |

---

## Customer communication

### Principles

- Acknowledge every external feedback item.
- Set expectations on timeline by priority.
- Do not promise features not approved.
- Communicate resolutions for P0/P1 bugs proactively.
- Use plain language; French/Arabic when primary audience requires (C-01 compliance gap — track in backlog).

### Templates

**Acknowledgment:**

> Thank you for your feedback about [topic]. We have logged this as [BUG-XXX / ENH-XXX] and assigned it to our [team]. We expect an update by [date]. Reference: [ID].

**Resolution:**

> We have addressed the issue you reported ([ID]) in [version/release]. Please update your app to [version] or try again. If the problem persists, contact support at [channel].

**Feature request (declined / backlogged):**

> Thank you for suggesting [feature]. This is not in our current release scope. We have added it to our product backlog for future consideration. We will notify beta participants if this is prioritized.

### Communication owners

| Audience | Owner | Channel |
|----------|-------|---------|
| Riders | Support Lead | In-app, email, SMS |
| Drivers / couriers | Operations Manager | SMS, driver broadcast |
| Merchants | Operations Manager | Phone, merchant admin |
| Beta cohort | Operations Manager | Launch Command Center broadcast |
| Public (post-GA) | Product Lead | Release notes, store listing |

Reference: `docs/SUPPORT_PLAYBOOK.md` · `release/CLOSED_BETA_RUNBOOK.md`

---

## Metrics

| KPI | Target | Source |
|-----|--------|--------|
| Feedback acknowledgment SLA | 95% within 24 h | Support log |
| P0 bug time-to-triage | < 4 hours | Bug register |
| Customer satisfaction (CSAT) | ≥ 4.0 / 5.0 | Surveys |
| Repeat tickets (same issue) | < 10% | Support analytics |
| Feature request response rate | 100% acknowledged | Feedback log |

Tracked in [KPI_REVIEW.md](./KPI_REVIEW.md).

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) | CIP policy |
| [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) | Enhancements |
| [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) | Strategic features |
| [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) | Current status |
| `project-management/04_BUG_AND_TECH_DEBT.md` | Bug register |

---

*Effective 2026-07-22 · Owner: Support Lead + Product Lead · Program Office*
