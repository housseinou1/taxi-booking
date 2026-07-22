# YALA — Trust & Safety Manual

**Document ID:** YALA-OPS-TNS-007  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** Security Lead, Operations Manager, support escalations  
**Related:** `release/PHASE29_TRUST_SAFETY_CENTER_REPORT.md` · `handover/06_SUPPORT_MATRIX.md`

---

## 1. Overview

Trust & Safety protects riders, drivers, couriers, and merchants through SOS response, fraud investigation, account actions, incident management, and risk scoring.

| Tool | URL | Purpose |
|------|-----|---------|
| Trust & Safety Center | `/admin/trust-safety` | Incidents, profiles, monitoring, reports |
| Operations Command Center | `/admin/operations-command` | Live trips, emergency panel |
| Launch Control | `/admin/launch` | Critical incidents, alerts |
| Compliance & Governance | `/admin/compliance-governance` | Audit exports, policy |
| Fleet & Performance | `/admin/fleet` | Driver history |
| Finance Operations | `/admin/finance-ops` | Fraud-related financial holds |

**API:** `/operations/trust-safety/` · SOS: `POST /safety/sos/`

---

## 2. SOS response

### SOS trigger sources

| Source | Detection |
|--------|-----------|
| Mobile app | Rider/Driver/Courier taps SOS |
| API | `POST /safety/sos/` with ride_id or delivery_id + GPS |
| Support | Emergency keyword in ticket |
| Monitoring | Automated safety events → critical escalation |

### SOS automatic actions (system)

1. Creates `SafetyIncident` (severity: **critical**)
2. Dispatches `EmergencyAlert`
3. Captures GPS, trip snapshot, emergency contacts
4. Notifies Operations Center via `LaunchAlert`
5. Invalidates CEO dashboard cache
6. Writes audit record

### SOS response workflow

```
SOS received (target: ack < 2 min)
         │
         ▼
Trust & Safety queue → acknowledge
         │
         ▼
Identify: user, role, ride/delivery ID,
          last GPS, emergency contacts
         │
         ▼
Call user (0–5 min)
         │
    ┌────┴────┐
    │         │
 Response   No response
    │         │
    ▼         ▼
Assess     Call emergency contacts;
threat     dispatch nearest driver;
level      consider local EMS/police
    │
    ▼
Assign investigator
Status → investigating
         │
         ▼
Launch incident (critical) if not auto-created
         │
         ▼
Resolve or escalate to CEO (injury/legal)
         │
         ▼
Post-incident: SafetyResponseLog complete
```

### SOS response checklist

| # | Step | Time | ☐ |
|---|------|------|:-:|
| SOS-01 | Acknowledge incident in queue | < 2 min | ☐ |
| SOS-02 | Open trip map / GPS replay | < 3 min | ☐ |
| SOS-03 | Call primary user | < 5 min | ☐ |
| SOS-04 | Call emergency contacts if needed | < 10 min | ☐ |
| SOS-05 | Create/update Launch incident | < 10 min | ☐ |
| SOS-06 | CEO notify if injury or assault | Immediate | ☐ |
| SOS-07 | Document every action in SafetyResponseLog | Ongoing | ☐ |
| SOS-08 | Resolve with outcome code | Post-event | ☐ |

### SOS outcome codes

| Code | Meaning |
|------|---------|
| RES-01 | False alarm — user safe |
| RES-02 | Resolved with phone contact |
| RES-03 | Escalated to emergency services |
| RES-04 | Ongoing investigation |
| RES-05 | Legal/compliance referral |

---

## 3. Fraud investigation

### Fraud signal sources

| Signal | Module |
|--------|--------|
| Open `FraudFlag` | Executive security dashboard |
| Duplicate accounts | User matching (phone, device) |
| Ride/delivery farming | BI anomaly patterns |
| Referral abuse | Customer Growth / referrals |
| Payment anomalies | Finance Ops failed payments |
| Wallet manipulation | Audit trail |

### Fraud investigation workflow

```
Alert or manual report
         │
         ▼
Create / link SafetyIncident
(category: fraud) OR fraud case
         │
         ▼
Gather evidence:
- Trip history
- Payment records
- Device/IP logs (if available)
- Referral graph
         │
         ▼
Risk score assessment (§7)
         │
         ▼
┌────────────────────────┐
│ Decision:              │
│ - Dismiss              │
│ - Warn                 │
│ - Soft suspend         │
│ - Hard suspend         │
│ - Permanent ban        │
└───────────┬────────────┘
            │
            ▼
Finance hold on withdrawals if needed
Document in audit + Compliance
```

### Fraud investigation checklist

- [ ] Case ID assigned
- [ ] Affected accounts listed
- [ ] Evidence preserved (§5)
- [ ] Financial exposure quantified
- [ ] Decision approved (Security Lead; CEO if > 10,000 MRU)
- [ ] User notification per policy
- [ ] Wallet/withdrawal holds applied
- [ ] Case closed with resolution notes

---

## 4. Account suspension

### Suspension authority

| Action | Authority |
|--------|-----------|
| Soft suspend (review) | Operations Manager |
| Hard suspend (fraud) | Security Lead |
| Permanent ban | Security Lead + CEO |
| Reinstatement after fraud | Security Lead written clearance |

### Suspension workflow

Reference: `05_DRIVER_OPERATIONS_MANUAL.md` §5 — coordinated with Trust & Safety for safety/fraud cases.

```
Investigation complete
         │
         ▼
Select suspension type
         │
         ▼
Apply in admin:
- CRM blacklist
- /auth/users/<id>/block/
- account_under_review
         │
         ▼
Trust & Safety profile updated
SafetyResponseLog entry
         │
         ▼
Finance: freeze withdrawals
Support: do not disclose details to other party
```

### Account types

| User type | Profile endpoint |
|-----------|------------------|
| Driver | `/operations/trust-safety/drivers/<user_id>/` |
| Rider | `/operations/trust-safety/riders/<user_id>/` |
| Courier | Driver profile + delivery history |
| Merchant | Merchant Platform + incident link |

---

## 5. Incident investigation

### Incident types (`SafetyIncident`)

| Type | Examples |
|------|----------|
| SOS | Emergency button activation |
| Driver/rider/courier report | Harassment, accident |
| Merchant report | Delivery theft, abuse |
| Delivery problem | Safety during delivery |
| Monitoring alert | Route deviation, long stop |
| Fraud | Referral farming, fake trips |

### Incident status workflow

```
open → acknowledged → investigating → resolved
                              ↘ dismissed
```

### Investigation steps

| Step | Action |
|------|--------|
| 1 | Assign investigator |
| 2 | Collect trip snapshot, GPS pings, chat if any |
| 3 | Interview parties (support script) |
| 4 | Review prior incidents on profiles |
| 5 | Determine severity (low → critical) |
| 6 | Recommend action |
| 7 | Resolve or dismiss with documented reason |
| 8 | Export to Compliance if regulatory impact |

### PATCH incident actions

`GET/PATCH /operations/trust-safety/incidents/<id>/`

- acknowledge · assign · investigate · resolve · dismiss

Every status change → `SafetyResponseLog` + audit entry.

---

## 6. Evidence handling

### Evidence types

| Type | Storage | Retention |
|------|---------|-----------|
| GPS / trip pings | `TripLocationPing` | Per compliance policy |
| Proof-of-delivery photos | `media/` | 30+ days |
| Document uploads | `media/` | Account lifetime + 7 years |
| Support transcripts | Support Center | 7 years |
| Audit logs | Database | 7 years |
| Incident notes | SafetyResponseLog | 7 years |

### Evidence handling rules

| Rule | Requirement |
|------|-------------|
| Chain of custody | Log who accessed evidence and when |
| Minimization | Only staff with need-to-know |
| No deletion | Soft-delete only; Compliance approval for purge |
| Export | Compliance & Governance for legal requests |
| PII | Redact in external reports |

### Evidence checklist (per case)

- [ ] Trip ID and timestamps captured
- [ ] GPS replay exported if needed
- [ ] Screenshots stored in case folder
- [ ] Access logged
- [ ] Retention date set

---

## 7. Risk scoring

### Automated monitoring

**Service:** `safety/monitoring_service.py` + `operations/trust_safety_service.py`  
**Trigger:** `POST /operations/trust-safety/monitoring/`

| Event detected | Typical severity |
|----------------|------------------|
| Excessive route deviation | Medium → High |
| Long unexpected stop | Medium |
| Trip unusually long | Medium |
| Driver offline during trip | High |
| Multiple emergency reports same user/ride | Critical |

### Profile risk factors

**Driver profile** (`/operations/trust-safety/drivers/<user_id>/`):

- Rating, completed trips, accidents, reports, suspensions, document violations, SOS history

**Rider profile** (`/operations/trust-safety/riders/<user_id>/`):

- Cancellations, abuse/fraud/payment-dispute reports, blacklist status, SOS history

### Risk score bands (operational)

| Band | Score indicators | Action |
|------|------------------|--------|
| Low | No open incidents; clean history | Standard monitoring |
| Medium | 1–2 minor reports; yellow metrics | Increased monitoring |
| High | Fraud flag; repeat cancellations; SOS | Review within 24 h |
| Critical | Active SOS; assault; farming pattern | Immediate suspension review |

### CEO safety dashboard

**Endpoint:** `/operations/trust-safety/ceo/`

| Metric | Use |
|--------|-----|
| Safety score | Daily CEO review |
| Open / critical incidents | Zero critical target |
| Avg resolution time | Weekly improvement |
| High-risk areas | Ops staffing |
| Repeat offenders | Suspension queue |

---

## 8. Reporting

| Report | Endpoint | Cadence |
|--------|----------|---------|
| Daily Safety Report | `type=daily` | Daily |
| Weekly Incident Report | `type=weekly` | Weekly |
| Monthly Trust Report | `type=monthly` | Monthly |
| Safety KPI Dashboard | `type=kpi` | On demand |

**Module:** Trust & Safety Center → Reports tab

---

## 9. Escalation matrix (safety-specific)

| Event | First | Escalate | CEO |
|-------|-------|----------|-----|
| SOS | Ops duty | Security Lead | If injury |
| Assault allegation | Security Lead | Legal/Compliance | Yes |
| Data breach suspicion | Security Lead | Engineering | Yes |
| Mass fraud | Security Lead | Finance | If > threshold |
| Regulatory inquiry | Compliance | CEO | Yes |

---

## 10. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `01_CEO_OPERATIONS_MANUAL.md` · `04_CUSTOMER_SUPPORT_MANUAL.md` · `05_DRIVER_OPERATIONS_MANUAL.md`
