# YALA Operations Manual (SOP)

**Document set ID:** YALA-OPS-SOP-001  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Production:** https://api.yalataxi.live · https://www.yalataxi.live/admin  

---

## Purpose

This folder contains the **Standard Operating Procedures (SOP)** for all Yala departments. These documents define daily workflows, escalation paths, approval gates, and cross-team handoffs. They reference existing admin modules and release/handover documentation without modifying application code.

---

## Document index

| # | Document | Primary audience | Key admin modules |
|---|----------|------------------|-------------------|
| 01 | [CEO Operations Manual](./01_CEO_OPERATIONS_MANUAL.md) | CEO, executive staff | `/admin/ceo-master`, `/admin/executive`, `/admin/board-reports` |
| 02 | [Operations Team Manual](./02_OPERATIONS_TEAM_MANUAL.md) | Operations Manager, supervisors | `/admin/operations-command`, `/admin/operations`, `/admin/multi-city` |
| 03 | [Finance Operations Manual](./03_FINANCE_OPERATIONS_MANUAL.md) | Finance Lead, accountants | `/admin/finance-ops`, `/admin/incentives` |
| 04 | [Customer Support Manual](./04_CUSTOMER_SUPPORT_MANUAL.md) | Support Lead, agents | `/admin/support`, `/admin/launch` |
| 05 | [Driver Operations Manual](./05_DRIVER_OPERATIONS_MANUAL.md) | Operations, onboarding | `/admin/operations`, `/admin/fleet`, `/admin/incentives` |
| 06 | [Delivery Operations Manual](./06_DELIVERY_OPERATIONS_MANUAL.md) | Operations, couriers | `/admin/merchant-platform`, `/admin/operations` |
| 07 | [Trust & Safety Manual](./07_TRUST_AND_SAFETY_MANUAL.md) | Security Lead, Operations | `/admin/trust-safety`, `/admin/compliance-governance` |
| 08 | [System Maintenance Manual](./08_SYSTEM_MAINTENANCE_MANUAL.md) | DevOps, Engineering Lead | `/admin/status`, `/admin/launch` |
| 09 | [Business Continuity Plan](./09_BUSINESS_CONTINUITY_PLAN.md) | All leadership | DR runbooks, incident response |
| 10 | [New Employee Onboarding](./10_NEW_EMPLOYEE_ONBOARDING.md) | HR, department leads | Access matrix, training schedule |

### Launch operations package (v1.0.1 — pilot-validated 2026-07-22)

| Document | Primary audience | Purpose |
|----------|------------------|---------|
| [Launch Day Runbook](./LAUNCH_DAY_RUNBOOK.md) | CEO, Operations, Engineering, Support, Finance | Minute-by-minute launch execution timeline |
| [Launch Monitoring](./LAUNCH_MONITORING.md) | DevOps, Engineering, Operations | Live monitoring with observed baselines |
| [Incident Playbook](./INCIDENT_PLAYBOOK.md) | Incident Commander, department leads | SEV-1 to SEV-4 response |
| [Support Playbook](./SUPPORT_PLAYBOOK.md) | Support Lead, agents | Launch support triage (all audiences) |
| [First 30 Days Metrics](./FIRST_30_DAYS.md) | Operations Manager, CEO | Launch metrics with Day 0 baseline |
| [Launch Executive Brief](./LAUNCH_EXECUTIVE_BRIEF.md) | CEO, executive leadership | Readiness 71%, Go/No-Go, rollback, contacts |

**Operational readiness:** 71% — **GO WITH CONDITIONS** for pilot ≤25 users. See [LAUNCH_EXECUTIVE_BRIEF.md](./LAUNCH_EXECUTIVE_BRIEF.md).

---

## Related documentation

| Area | Location |
|------|----------|
| Closed beta runbook | `release/BETA_OPERATIONS_RUNBOOK.md` |
| Day 1 checklist | `release/DAY1_OPERATIONS_CHECKLIST.md` |
| Success metrics | `release/BETA_SUCCESS_METRICS.md` |
| CEO daily template | `release/CEO_DAILY_DASHBOARD_TEMPLATE.md` |
| Post-launch support | `release/POST_LAUNCH_SUPPORT_PROCEDURES.md` |
| Support matrix | `handover/06_SUPPORT_MATRIX.md` |
| Disaster recovery | `handover/08_DISASTER_RECOVERY_SUMMARY.md` |
| Project tracker | `project-management/06_PROJECT_DASHBOARD.md` |

---

## Escalation quick reference

| Severity | Definition | First response | Decision authority |
|----------|------------|----------------|-------------------|
| **P0** | Service down, safety, data loss | 5 min | CEO |
| **P1** | Feature degraded, payment failure | 15 min | Engineering Lead / Finance Lead |
| **P2** | Minor UX, analytics delay | Same day | Product Lead |

**On-call:** Engineering 24/7 during beta · Operations 06:00–24:00 UTC · Finance business hours + payout windows · CEO P0 only.
