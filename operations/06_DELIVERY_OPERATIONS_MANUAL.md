# YALA — Delivery Operations Manual

**Document ID:** YALA-OPS-DEL-006  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** Operations Manager, courier coordinators, merchant liaisons  
**Related:** `release/PHASE31` (Merchant Platform) · `release/BETA_OPERATIONS_RUNBOOK.md`

---

## 1. Overview

Delivery Operations covers couriers, merchants, order fulfillment, failed deliveries, and cash-on-delivery (COD) handling.

| Tool | URL | Purpose |
|------|-----|---------|
| Operations Command Center | `/admin/operations-command` | Live deliveries, heat map |
| Merchant Platform | `/admin/merchant-platform` | Merchants, menus, settlements |
| Admin Dashboard | `/admin` | Courier approval (driver-type users) |
| Finance Operations | `/admin/finance-ops` | COD reconciliation |
| Trust & Safety | `/admin/trust-safety` | Delivery safety incidents |
| Launch Control | `/admin/launch` | Courier cap (10 beta) |

**Beta cap:** 10 approved couriers · Merchant orders in Nouakchott pilot

---

## 2. Courier onboarding

### Courier pipeline

```
Applicant registers (Delivery app)
         │
         ▼
Phone verification + profile
         │
         ▼
Document upload (ID, license if motor)
         │
         ▼
Operations review (/admin)
         │
         ▼
Approve → courier role enabled
         │
         ▼
Training + test delivery
```

### Courier onboarding checklist

| # | Task | ☐ |
|---|------|:-:|
| CO-01 | Verify courier cap (≤ 10 beta) | ☐ |
| CO-02 | ID document verified | ☐ |
| CO-03 | Vehicle type confirmed (bike/motor/car) | ☐ |
| CO-04 | Payout account verified | ☐ |
| CO-05 | Delivery app version current (1.0.4+) | ☐ |
| CO-06 | Training completed (§7 parallel in driver manual) | ☐ |
| CO-07 | Test delivery observed by ops | ☐ |
| CO-08 | Merchant zones assigned | ☐ |

### Courier vs driver

Couriers share the driver user model with a delivery/courier role flag. Use the same document verification standards as `05_DRIVER_OPERATIONS_MANUAL.md` §3, adapted for vehicle type.

---

## 3. Merchant coordination

**Module:** `/admin/merchant-platform`

### Merchant lifecycle

```
Merchant application
         │
         ▼
Ops + Finance review
(business docs, menu)
         │
         ▼
Activate on platform
         │
         ▼
Menu/catalog setup
(categories, variants, extras)
         │
         ▼
Go live → orders flow to dispatch
         │
         ▼
Settlement per Finance schedule
```

### Daily merchant coordination

| # | Task | Action |
|---|------|--------|
| MC-01 | Confirm merchants `active` for service hours | Merchant Platform status |
| MC-02 | Review pending menu changes | Approve or request fixes |
| MC-03 | Monitor order prep times | Contact if consistently > 20 min |
| MC-04 | Coordinate peak staffing with couriers | Heat map + courier broadcast |
| MC-05 | Settlement disputes | Finance + merchant liaison |

### Merchant issue escalation

| Issue | Owner | Resolution time |
|-------|-------|-----------------|
| Menu offline | Merchant + Support | 2 h |
| Wrong pricing | Merchant Platform edit | Same day |
| Order not received by courier | Operations | 15 min |
| Settlement dispute | Finance | 48 h |

### Communication template (merchant)

```
Subject: Yala Delivery — [Merchant Name] — [Date]
- Orders today: ___
- Avg prep time: ___ min
- Issues: ___
- Action needed: ___
```

---

## 4. Delivery issue resolution

### Issue taxonomy

| Code | Issue | Severity |
|------|-------|----------|
| D-01 | Courier not assigned | P1 |
| D-02 | Stuck in transit > 45 min | P1 |
| D-03 | Wrong address | P2 |
| D-04 | Customer unreachable | P2 |
| D-05 | Merchant closed / no order | P1 |
| D-06 | Damaged package | P2 |
| D-07 | Safety concern | P0 |

### Resolution workflow

```
Issue detected (support, alert, merchant call)
         │
         ▼
Identify delivery ID
         │
         ▼
Operations Command → active delivery detail
         │
         ▼
Contact courier → merchant → customer (in order)
         │
         ▼
┌─────────────────────────┐
│ Resolve in-app status   │
│ OR failed delivery flow │
└───────────┬─────────────┘
            │
            ▼
Support ticket update + CRM note
```

### Stuck delivery checklist

- [ ] Delivery ID and status confirmed
- [ ] Courier GPS checked (last ping)
- [ ] Courier contacted by phone
- [ ] Merchant confirmed order ready
- [ ] Customer ETA communicated
- [ ] Escalate to Operations Manager if > 60 min

---

## 5. Failed delivery workflow

### Failed delivery reasons

| Reason | System status | Customer | Merchant | Courier |
|--------|---------------|----------|----------|---------|
| Customer unreachable | `failed` / `cancelled` | Notify; may re-order | Compensate per policy | Return or dispose per policy |
| Wrong address | `failed` | Support update address | — | Return to merchant if COD |
| Merchant cancelled | `cancelled` | Full refund | — | Reassign |
| Courier issue | `failed` | Reassign or refund | Notify | Review performance |
| Safety | `cancelled` + incident | Trust & Safety | — | Investigate |

### Failed delivery workflow

```
Delivery marked failed (app or ops)
         │
         ▼
Log reason code
         │
         ▼
COD? ──Yes──▶ Courier returns cash/item
         │              │
         No             ▼
         │         Finance COD reconciliation
         ▼
Refund/customer credit if prepaid
         │
         ▼
Merchant notified
         │
         ▼
Close support ticket
Performance flag if courier fault
```

### Failed delivery checklist

- [ ] Reason code selected
- [ ] Customer notified
- [ ] Refund processed if applicable
- [ ] COD reconciled if applicable
- [ ] Merchant updated on inventory
- [ ] Incident created if safety-related

---

## 6. COD handling

Cash-on-Delivery requires strict Finance reconciliation.

### COD flow

```
Customer selects COD at checkout
         │
         ▼
Courier collects cash on delivery
         │
         ▼
Courier confirms amount in app
         │
         ▼
Delivery marked delivered
         │
         ▼
Finance daily COD reconciliation
         │
         ▼
Courier settlement / wallet adjustment
per policy
```

### COD reconciliation (daily)

| # | Task | Owner | ☐ |
|---|------|-------|:-:|
| COD-01 | Export delivered COD orders for date | Finance | ☐ |
| COD-02 | Match courier-reported amounts | Finance | ☐ |
| COD-03 | Investigate discrepancies > 50 MRU | Finance + Ops | ☐ |
| COD-04 | Update courier wallet / deduction | Finance | ☐ |
| COD-05 | Merchant settlement excludes COD until collected | Finance | ☐ |

### COD discrepancy handling

| Variance | Action |
|----------|--------|
| ≤ 50 MRU | Document; adjust in next settlement |
| 51–500 MRU | Courier contacted; 24 h resolution |
| > 500 MRU | Operations Manager + Finance; possible suspension |

### COD policy summary

| Rule | Detail |
|------|--------|
| Collection | Exact amount or round per merchant policy |
| Failed delivery | Cash not collected; return order if perishable |
| Short payment | Do not complete delivery; contact support |
| Deposit deadline | Couriers remit per daily schedule (Finance defines) |

---

## 7. Delivery performance metrics

| Metric | Target (beta) | Source |
|--------|---------------|--------|
| Delivery completion rate | > 95% | Exit criteria / Operations Command |
| Avg delivery time | City baseline TBD | BI / Operations |
| Failed delivery rate | < 5% | Daily ops report |
| COD discrepancy rate | < 1% | Finance Ops |
| Active couriers (peak) | ≥ 1 | Live Operations |

---

## 8. Peak period playbook

| Phase | Action |
|-------|--------|
| T-2 h | Confirm courier online count; notify merchants of expected volume |
| Peak | Monitor heat map; reassign stuck deliveries |
| T+1 h | COD preliminary tally |
| EOD | Failed delivery review; merchant feedback loop |

---

## 9. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `02_OPERATIONS_TEAM_MANUAL.md` · `03_FINANCE_OPERATIONS_MANUAL.md` · `04_CUSTOMER_SUPPORT_MANUAL.md` · `05_DRIVER_OPERATIONS_MANUAL.md`
