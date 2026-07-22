# YALA — Customer Support Manual

**Document ID:** YALA-OPS-SUP-004  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** Support Lead, support agents  
**Related:** `release/POST_LAUNCH_SUPPORT_PROCEDURES.md` · `handover/06_SUPPORT_MATRIX.md`

---

## 1. Overview

Customer Support handles rider, driver, courier, and merchant inquiries across in-app tickets, WhatsApp, and emergency escalations.

| Tool | URL | Purpose |
|------|-----|---------|
| Support Center | `/admin/support` | Ticket queue, categories, resolution |
| Launch Control | `/admin/launch` | Incidents, refund queue, alerts |
| Business Operations (CRM) | `/admin/business` | User profiles, notes, history |
| Finance Operations | `/admin/finance-ops` | Payment verification, refunds |
| Trust & Safety | `/admin/trust-safety` | Safety incidents, SOS follow-up |
| Operations Command | `/admin/operations-command` | Live trip lookup |

**Channels:** In-app support · WhatsApp rider/driver line · Phone (emergency)

---

## 2. Response time targets

### SLA matrix (closed beta)

| Channel | Priority | First response | Resolution target |
|---------|----------|----------------|-----------------|
| SOS / safety | P0 | Immediate | Escalate — do not close alone |
| WhatsApp | P1 | 15 min | 4 h |
| In-app ticket | P1 | 30 min | 24 h |
| In-app ticket | P2 | 2 h | 48 h |
| Payment dispute | P1 | 30 min | Same day (Finance handoff) |
| Refund request | P2 | 24 h | 48 h after approval |
| Lost item | P2 | 2 h | 72 h |

### Business hours (beta)

| Period | Coverage |
|--------|----------|
| Launch week | 06:00–24:00 UTC |
| Standard beta | 08:00–22:00 UTC |
| P0 | 24/7 via on-call escalation |

---

## 3. Escalation levels

```
Level 0 — Support Agent
    │  Standard tickets, FAQ, trip status
    ▼
Level 1 — Support Lead
    │  Refunds ≤ 2,000 MRU, repeat complaints, driver disputes
    ▼
Level 2 — Operations Manager
    │  Supply issues, stuck trips, suspension recommendations
    ▼
Level 2 — Finance Lead
    │  Payments, withdrawals, refunds > 2,000 MRU
    ▼
Level 3 — Security Lead
    │  Fraud, harassment, safety investigation
    ▼
Level 4 — CEO
       P0 only: injury, media, regulatory, service-wide outage
```

### Escalation triggers

| Condition | Escalate to | Method |
|-----------|-------------|--------|
| SOS or safety keyword | Operations Manager + Trust & Safety | Immediate phone |
| Amount > 2,000 MRU | Finance Lead | Ticket + WhatsApp |
| 3+ tickets same user in 24 h | Support Lead | Internal review |
| Fraud suspicion | Security Lead | Trust & Safety incident |
| API/payment system down | Engineering on-call | P0 incident |
| Legal threat | CEO + Compliance | Same day |

---

## 4. Ride complaints

### Common ride complaint types

| Type | Investigation | Typical resolution |
|------|---------------|-------------------|
| Driver no-show | Trip status, driver GPS log | Cancel fee waiver / rebook |
| Wrong route | Trip map, fare breakdown | Partial refund if overcharged |
| Rude driver | Both parties' account history | Warning / suspension referral |
| Overcharge | Payment record vs estimate | Refund difference |
| Cancelled by driver | Cancel reason, acceptance log | Refund + driver review |
| Long wait | Dispatch timestamps | Promo credit |

### Ride complaint workflow

```
Ticket received (category: ride)
         │
         ▼
Collect: ride ID, date/time, user phone
         │
         ▼
Look up trip in Operations Command
or CRM profile
         │
         ▼
Review: status, payment, driver rating,
support history
         │
         ▼
┌────────────────────────┐
│ Resolve at L0/L1       │
│ OR escalate per matrix │
└───────────┬────────────┘
            │
            ▼
Document resolution in ticket + CRM note
Close ticket
```

### Ride complaint checklist

- [ ] Ride ID verified
- [ ] Both parties heard if dispute
- [ ] Payment record checked
- [ ] Refund/credit applied if warranted
- [ ] Driver flagged to Operations if pattern
- [ ] Customer confirmation sent

---

## 5. Delivery complaints

### Common delivery complaint types

| Type | Investigation | Resolution |
|------|---------------|------------|
| Late delivery | Timestamps, courier GPS | Apology credit |
| Wrong items | Merchant order detail | Merchant coordination / refund |
| Damaged goods | Proof-of-delivery photo | Partial/full refund |
| Courier no-show | Delivery status | Reassign or cancel + refund |
| COD dispute | COD amount vs order | Finance Ops verification |

### Delivery workflow

```
Ticket (category: delivery)
         │
         ▼
Collect delivery ID + merchant name
         │
         ▼
Check Merchant Platform order +
delivery status
         │
         ▼
Contact courier/merchant if needed
         │
         ▼
Resolve or escalate to Operations (supply)
or Finance (COD/refund)
```

**Reference:** `06_DELIVERY_OPERATIONS_MANUAL.md`

---

## 6. Refund process

Support initiates; Finance executes for amounts above agent authority.

### Refund eligibility guide

| Scenario | Eligible | Amount |
|----------|----------|--------|
| Ride cancelled by driver after payment | Yes | Full |
| Duplicate charge | Yes | Full duplicate |
| Service not delivered | Yes | Full |
| Partial service (short trip) | Case-by-case | Partial |
| User changed mind after trip started | No | — |
| No-show rider | No | Cancel fee may apply |

### Refund workflow (support side)

| Step | Action | Owner |
|------|--------|-------|
| 1 | Verify eligibility | Support agent |
| 2 | Document reason in ticket | Support agent |
| 3 | Submit refund request | Support Lead (≤ 2,000 MRU) |
| 4 | Finance approves in payments admin | Finance Lead |
| 5 | Confirm credit to customer | Support agent |
| 6 | Close ticket | Support agent |

**SLA:** Respond 24 h · Process approved refunds 48 h  
**Reference:** `03_FINANCE_OPERATIONS_MANUAL.md` §6

---

## 7. Lost item process

### Lost item workflow

```
Rider reports item left in vehicle
         │
         ▼
Collect: ride ID, item description,
contact phone, time window
         │
         ▼
Contact driver via ops channel
(do not share rider phone without consent)
         │
    ┌────┴────┐
    │         │
 Found     Not found / no response
    │         │
    ▼         ▼
Arrange    72 h follow-up;
return     close with notes;
           flag driver if pattern
```

### Lost item checklist

- [ ] Ride ID and date confirmed
- [ ] Driver contacted within 2 h
- [ ] Item description logged in CRM
- [ ] Return arranged if found (neutral meeting point policy)
- [ ] Ticket updated every 24 h until closed
- [ ] No refund for lost items unless service failure caused loss

### Policy notes

- Yala facilitates contact; does not guarantee recovery
- Escalate to Operations if driver unresponsive > 24 h
- Repeated lost-item reports → driver review (`05_DRIVER_OPERATIONS_MANUAL.md`)

---

## 8. Emergency cases

### Emergency definition

Physical safety threat, assault, accident, kidnapping, medical emergency, or active SOS.

### Emergency response (support role)

| Step | Time | Action |
|------|------|--------|
| 1 | 0 min | **Do not** handle alone — escalate immediately |
| 2 | 0–1 min | Notify Operations Manager + Trust & Safety |
| 3 | 1–2 min | Acknowledge SOS in `/admin/trust-safety` if ops unavailable |
| 4 | 2–5 min | Provide ride/delivery ID, user phones, last GPS |
| 5 | 5+ min | Stay on line with user if safe; document timeline |
| 6 | Post | Support ticket linked to SafetyIncident; no public details |

### Emergency do / don't

| Do | Don't |
|----|-------|
| Escalate immediately | Promise police/EMS arrival time |
| Capture location and trip ID | Blame user or driver |
| Stay calm, document facts | Close ticket before Safety resolves |
| Follow Trust & Safety lead | Discuss on public channels |

**Reference:** `07_TRUST_AND_SAFETY_MANUAL.md`

---

## 9. Ticket categories and routing

| Category | Default owner | Tools |
|----------|---------------|-------|
| `ride` | Support L0 | Operations Command, CRM |
| `delivery` | Support L0 | Merchant Platform |
| `payment` | Support → Finance | Finance Ops, Payments |
| `refund` | Support Lead → Finance | Payments admin refunds |
| `safety` | Trust & Safety | SOS queue — immediate |
| `fraud` | Security Lead | Trust & Safety profiles |
| `merchant` | Support → Operations | Merchant Platform |
| `driver_account` | Support → Operations | Admin driver approval |
| `general` | Support L0 | FAQ, account help |

---

## 10. Daily support checklist

| # | Task | ☐ |
|---|------|:-:|
| DS-01 | Clear P0/P1 tickets from overnight | ☐ |
| DS-02 | WhatsApp queue < 5 pending | ☐ |
| DS-03 | Refund requests > 24 h escalated to Finance | ☐ |
| DS-04 | Safety tickets — zero unacknowledged | ☐ |
| DS-05 | Handover notes for next shift | ☐ |
| DS-06 | EOD ticket stats to Support Lead | ☐ |

### EOD metrics template

| Metric | Count |
|--------|------:|
| Tickets opened | |
| Tickets closed | |
| Avg first response (min) | |
| Escalations to Finance | |
| Escalations to Operations | |
| Safety escalations | |

---

## 11. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `02_OPERATIONS_TEAM_MANUAL.md` · `03_FINANCE_OPERATIONS_MANUAL.md` · `07_TRUST_AND_SAFETY_MANUAL.md`
