# YALA Incident Management Guide

**Document ID:** YALA-OPS-INC-MGT-001  
**Version:** 1.0.0  
**Effective date:** 2026-07-22  
**Primary console:** Operations Control Center → Incidents (`/admin/ops-control`)  
**Related:** [INCIDENT_PLAYBOOK.md](./INCIDENT_PLAYBOOK.md)

## Overview

YALA uses two incident systems that appear in a **unified inbox** in the Operations Control Center:

| System | Source | Examples |
|--------|--------|----------|
| **Safety incidents** | In-app SOS / Trust & Safety | Emergency events, accidents, unsafe driving reports |
| **Ops incidents** | Command / Launch operations | Platform outages, payment disputes, operational escalations |

Both streams are actionable from Module 3 without switching dashboards.

## Incident categories

Create ops tickets with these standard types:

1. **Accident** — vehicle collision, injury, property damage
2. **Unsafe driving** — speeding, reckless behavior, route deviation
3. **Passenger complaint** — service quality, harassment, fare dispute
4. **Driver complaint** — rider behavior, unsafe pickup, abuse
5. **Lost property** — items left in vehicle
6. **Payment dispute** — overcharge, failed refund, wallet issue
7. **Emergency event** — SOS, medical, security threat

## Severity / priority matrix

| Severity | Response target | Assignment | CEO notify |
|----------|-----------------|------------|------------|
| **Critical** | 5 min | Incident commander + on-call dispatch | Immediate |
| **High** | 15 min | Senior dispatcher or support lead | Within 30 min if safety-related |
| **Medium** | 4 hours | Assigned support or ops agent | Daily summary |
| **Low** | Next business day | Queue owner | Weekly summary |

Map to API values: `critical`, `high`, `medium`, `low`.

## Creating an incident

1. Open **Operations Control Center** → **Incidents**
2. Select incident type from dropdown
3. Set severity
4. Enter title (concise) and description (facts, IDs, location, witnesses)
5. Click **Open ticket**

API: `POST /operations/command/incidents/` with `{ title, description, severity, owner_id? }`

### Required fields in description

- Ride/delivery ID (if applicable)
- Rider and driver contact info
- Location and time
- What was observed vs. reported
- Photos/evidence links (if available)

## Incident lifecycle

```
Open → Acknowledged/Investigating → Resolved → Closed
         ↓
      Escalated (severity ↑, supervisor assigned)
```

### Safety incidents

| Action | API | Effect |
|--------|-----|--------|
| Acknowledge | `POST /operations/center/incidents/{id}/action/` `{ action: "acknowledge" }` | Status → acknowledged |
| Assign me | `{ action: "assign" }` | Assigns current operator |
| Escalate | `{ action: "escalate" }` | Severity → critical |
| Close | `{ action: "close", notes: "..." }` | Resolved with notes |

### Ops incidents

| Action | API | Effect |
|--------|-----|--------|
| Resolve | `POST /operations/command/incidents/{id}/action/` `{ action: "resolve", resolution: "..." }` | Closes with resolution |
| Escalate | `{ action: "escalate" }` | Severity → critical, status investigating |

## Assignment rules

1. **P0 / Critical safety** — Safety Manager + Dispatch lead within 5 minutes
2. **Payment disputes** — Support agent; escalate to Finance if amount > 5,000 MRU
3. **Lost property** — Support agent; driver notified within 2 hours
4. **Accidents** — Safety Manager owns; do not discuss liability in ticket notes

Set `owner_id` on creation when assigning to a specific staff member.

## Evidence & timeline

- **Safety incidents:** full timeline in Trust & Safety Center (`/admin/trust-safety`)
- **Ops incidents:** event timeline via Launch Hub incident detail
- Export safety incident CSV from Real-Time Operations Center emergency tab

Always preserve:

- Screenshots
- Chat/call logs reference
- GPS coordinates at time of report
- Payment transaction IDs

## Resolution standards

A ticket may be marked **Resolved** only when:

1. Root cause documented
2. Affected parties contacted (or attempt logged)
3. Corrective action taken (refund, suspension, retraining, etc.)
4. Supervisor review for critical/high severity

Resolution text template:

```
Root cause: [brief]
Actions taken: [refund ID / driver pause / police contacted]
Customer outcome: [informed at TIME via CHANNEL]
Follow-up: [none / 24h check / legal review]
Closed by: [name] at [time]
```

## Escalation paths

| Condition | Escalate to |
|-----------|-------------|
| Injury or ambulance | CEO + Safety Manager immediately |
| Unresponsive driver during active ride | Dispatch lead → pause driver |
| Repeat offender (3+ incidents) | Trust & Safety review |
| Media/legal exposure | CEO + Compliance |

## Integration with other modules

- **Dispatch (Module 1):** Pause driver, cancel ride during active safety event
- **Support (Module 4):** Link passenger complaints to support tickets
- **CEO Command (Module 8):** Platform freeze for widespread emergencies

## Quick reference

| Task | Location |
|------|----------|
| Unified inbox | `/admin/ops-control` → Incidents |
| Create ops ticket | Same module → Create incident ticket |
| Safety deep dive | `/admin/trust-safety` |
| Launch incident export | `/admin/launch` → Incidents |
| Full playbook | [INCIDENT_PLAYBOOK.md](./INCIDENT_PLAYBOOK.md) |
