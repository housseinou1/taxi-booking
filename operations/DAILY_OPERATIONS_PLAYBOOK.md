# YALA Daily Operations Playbook

**Document ID:** YALA-OPS-DAILY-001  
**Version:** 1.0.0  
**Effective date:** 2026-07-22  
**Command hub:** `/admin/ops-control`

## Purpose

This playbook defines the daily rhythm for YALA live commercial operations using the Operations Control Center and companion dashboards.

## Roles & ownership

| Role | Primary modules | Backup |
|------|-----------------|--------|
| Operations Manager | All modules | CEO |
| Dispatcher | 1 Dispatch, 2 Drivers | Ops Manager |
| Support Agent | 4 Support, 7 Tasks | Support Lead |
| Supervisor | 3 Incidents, 7 Tasks | Ops Manager |
| CEO | 8 CEO Command | — |

## Pre-shift checklist (T-30 min)

- [ ] Open Operations Control Center — confirm KPIs load
- [ ] Verify WebSocket or polling status (header indicator)
- [ ] Review **Fleet Health** — zero expired insurance blocking active drivers
- [ ] Review **Incidents** — no unassigned critical tickets
- [ ] Check **Task Board** — launch checklist gaps flagged to engineering
- [ ] Confirm on-call contacts in operations channel

## Hourly rhythm

### :00 — Situation scan (5 min)

1. **Dispatch module** — waiting riders count, longest wait > 10 min?
2. **Analytics module** — cancellation rate spike vs. prior hour?
3. **Incidents module** — new critical/high tickets?
4. **CEO KPI bar** — open SOS count

**Action threshold:**

| Signal | Action |
|--------|--------|
| Waiting riders > 10 | Broadcast nearby drivers; review supply |
| Avg wait > 12 min | Supervisor notified; consider surge |
| Cancellation rate > 25% | Review driver availability + pricing |
| Open SOS > 0 | Incident commander assigned within 5 min |

### :15 — Driver supply check

1. **Driver Monitoring** — online vs. busy ratio
2. Identify offline drivers with active badges (document expiring, high cancellation)
3. Contact top 5 idle online drivers in low-coverage zones if demand rising

### :30 — Support & finance touchpoint

1. **Support module** — refund queue depth
2. Approve legitimate refunds; reject with documented reason
3. Pull assigned tickets from **Task Board**

### :45 — Fleet compliance spot check

1. **Fleet Health** — new expirations in 7-day bucket
2. Notify drivers via Fleet Center if documents expiring within 72 hours

## Peak demand playbook (lunch / evening rush)

1. Dispatcher focused on Module 1 only
2. Ops Manager monitors Analytics hourly demand chart
3. Suspend non-urgent support callbacks
4. Pre-stage promo codes for delay compensation (Support Lead approval)
5. CEO notified if wait times exceed 15 min citywide for 30+ consecutive minutes

## End-of-shift handoff

Complete before leaving:

1. Zero unassigned P0/P1 incidents (or documented handoff owner)
2. Refund queue triaged — none older than 4 hours without status
3. Dispatch log: rides force-assigned, cancellations, escalations
4. Note in operations channel:

```
Shift: [DATE] [SHIFT]
Dispatcher: [NAME]
Peak wait: [MIN] · Cancellations: [%] · Open incidents: [N]
Handoff notes: [brief]
Next shift priority: [item]
```

## Daily CEO briefing (18:00 local)

Pull from **CEO Command module**:

| Metric | Source |
|--------|--------|
| Completed trips today | CEO executive overview |
| Revenue today | CEO financial overview |
| Driver utilization | Fleet CEO metrics |
| Open incidents | Emergency + ops incident counts |
| Launch readiness score | Readiness block |
| Support backlog | Open ticket KPI |

CEO reviews approval queues (merchant, driver onboarding) before end of day.

## Weekly operations review (Monday 09:00)

1. Export fleet document expiration report (`/admin/fleet`)
2. Review incident trends — top categories from unified inbox
3. Support SLA compliance from Support Center dashboard
4. Update [WEEK1_LAUNCH_STATUS.md](./WEEK1_LAUNCH_STATUS.md) if operational score changes

## Escalation matrix

| Event | First responder | Escalation | CEO |
|-------|-----------------|------------|-----|
| Single ride delay > 20 min | Dispatcher | Ops Manager | If pattern |
| Payment system errors | Support → Finance | Engineering | If > 10 users |
| Driver accident | Dispatcher | Safety Manager | Immediate |
| Platform outage | Engineering | CEO Command freeze | Immediate |
| Social media crisis | Support Lead | CEO | Immediate |

## Module quick map

| Time | Module | Question to answer |
|------|--------|-------------------|
| Continuous | Dispatch | Are riders being picked up on time? |
| Continuous | Drivers | Is supply healthy and compliant? |
| On event | Incidents | Is someone owning this issue? |
| Hourly | Support | Is the refund queue under control? |
| Daily AM | Fleet Health | Are vehicles legal on road? |
| Hourly | Analytics | Is demand matching supply? |
| Per agent | Task Board | What is assigned to me? |
| Daily PM | CEO Command | Is the business healthy end-to-end? |

## Related documents

- [OPERATIONS_CONTROL_CENTER.md](./OPERATIONS_CONTROL_CENTER.md) — system overview & production validation
- [INCIDENT_MANAGEMENT_GUIDE.md](./INCIDENT_MANAGEMENT_GUIDE.md) — ticket handling
- [SUPPORT_AGENT_GUIDE.md](./SUPPORT_AGENT_GUIDE.md) — support procedures
- [INCIDENT_PLAYBOOK.md](./INCIDENT_PLAYBOOK.md) — SEV-1/2 response
- [LAUNCH_DAY_RUNBOOK.md](./LAUNCH_DAY_RUNBOOK.md) — launch-day procedures
