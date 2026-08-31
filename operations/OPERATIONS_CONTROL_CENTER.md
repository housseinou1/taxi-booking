# YALA Operations Control Center

**Document ID:** YALA-OPS-OCC-001  
**Version:** 1.0.0  
**Effective date:** 2026-07-22  
**Route:** https://www.yalataxi.live/admin/ops-control  
**Audience:** Operations Managers, Dispatchers, Customer Support, Supervisors, CEO

## Purpose

The Operations Control Center (OCC) is the unified live command hub for YALA commercial operations. It composes existing backend APIs into eight operational modules without replacing the Real-Time Operations Center, Launch Command, Fleet Performance, Support Center, or CEO Executive Dashboard.

## Access & permissions

| Role | Access | Capabilities |
|------|--------|--------------|
| Operations Manager / Dispatcher | Full view | Dispatch actions when `dispatch` permission granted |
| Customer Support | Modules 4, 7 | Search, refunds, promo credits, ticket assignment |
| Supervisor | Modules 1–7 | Incident escalation, task oversight |
| CEO | All modules | Broadcast, account freeze, platform freeze, approvals |

Staff must be authenticated with executive/operations permissions (`IsExecutiveStaff`).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│           Operations Control Center (Frontend)              │
│  /admin/ops-control — 8 modules, 15s poll + WebSocket       │
└──────────────────────────┬──────────────────────────────────┘
                           │
     ┌─────────────────────┼─────────────────────┐
     ▼                     ▼                     ▼
/operations/center/   /operations/fleet/   /operations/ceo-master/
/operations/support/  /operations/launch/  /operations/command/
/payments/admin/refunds/
```

### Data sources (no new backend required)

| Module | Primary APIs |
|--------|--------------|
| Live Dispatch | `GET /operations/center/dashboard/` |
| Driver Monitoring | `GET /operations/fleet/dashboard/` + ops fleet snapshot |
| Incident Management | Safety (`emergency`) + `GET/POST /operations/command/incidents/` |
| Support Center | `GET /operations/support/`, `GET /payments/admin/refunds/` |
| Fleet Health | `GET /operations/fleet/documents/` |
| Operations Analytics | Ops analytics + CEO `analytics.trips_by_hour` |
| Employee Task Board | Support queues + CEO approval queues + launch checklist |
| CEO Live Command | CEO master dashboard + executive account actions |

## Module reference

### 1 — Live Dispatch Center

- **Incoming ride requests** — trips with status `requested`
- **Assigned rides** — active trips with assigned driver
- **Waiting rides** — `fleet.waiting_riders` queue
- **Unassigned rides** — active trips without driver
- **Longest waiting customers** — sorted by `waiting_seconds`
- **Actions:** reassign, cancel, force-assign (driver ID), call rider/driver, pause driver (escalation)

### 2 — Live Driver Monitoring

- Driver identity, vehicle plate, status, live coordinates (when online)
- Last online timestamp, trips completed, performance score
- Warning badges: document expiring, high cancellation, low rating, suspended
- Battery/signal: shown as N/A until mobile telemetry API is wired

### 3 — Incident Management

- Unified inbox: Safety incidents + Ops incidents
- Create tickets for: accidents, unsafe driving, complaints, lost property, payment disputes, emergencies
- Actions: acknowledge, escalate, resolve (safety + ops paths)

### 4 — Support Center

- Search tickets, live trips by email/ID/reference
- Refund queue approve/reject
- Promo credit creation via Customer Growth API
- Links to full Support Center, ride history, payments

### 5 — Fleet Health

- Expired / expiring insurance, license, registration documents
- Inactive and suspended drivers
- Drivers flagged for document renewal

### 6 — Operations Analytics

- Average pickup wait, completion rate, cancellation rate
- Driver utilization (fleet CEO metrics)
- Hourly demand chart (today)

### 7 — Employee Task Board

- Assigned support tickets (current user)
- Pending approval queues (merchant, driver, partner)
- Open incidents
- Launch checklist incomplete items

### 8 — CEO Live Command

- Live system health (launch score, trips, drivers, incidents)
- All active rides table
- Staff roster by team
- Emergency broadcast, account suspend/reactivate, platform freeze

## Related dashboards (unchanged)

| Dashboard | Route |
|-----------|-------|
| Real-Time Operations Center | `/admin/operations` |
| Launch Command | `/admin/command` |
| Support Center | `/admin/support` |
| Fleet & Performance | `/admin/fleet` |
| CEO Executive Dashboard | `/admin/ceo-master` |

## Production readiness validation

**Validation date:** 2026-07-22  
**Verdict:** **READY FOR SUPERVISED COMMERCIAL OPERATIONS**

### Checklist

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | OCC route registered | PASS | `/admin/ops-control` in App.js + roleRouting |
| 2 | All 8 modules implemented | PASS | OperationsControlCenter.js |
| 3 | Uses existing APIs only | PASS | operationsControlApi.js aggregator |
| 4 | Dispatch actions wired | PASS | force-assign, reassign, cancel, pause |
| 5 | WebSocket + polling | PASS | opsSocket + 15s interval |
| 6 | Incident create + resolve | PASS | command incidents + safety actions |
| 7 | Support refund queue | PASS | `/payments/admin/refunds/` |
| 8 | Fleet document monitoring | PASS | `/operations/fleet/documents/` |
| 9 | CEO emergency controls | PASS | broadcast, freeze, account-action |
| 10 | Operations documentation | PASS | 4 guides in `operations/` |
| 11 | Existing dashboards untouched | PASS | No modifications to OperationsCenter.js layout |
| 12 | Backend regression tests | PASS | `tests_operations_center.py` |

### Conditions

1. **RC3 deployment** — Production API should match golden RC for full analytics performance.
2. **Device telemetry** — Battery/signal fields display N/A until driver app exposes telemetry.
3. **Unified incident timeline** — Safety and Ops incidents are merged client-side; deep timeline/evidence remains in Launch Hub for ops incidents and Trust & Safety for safety incidents.
4. **Refund permissions** — Finance staff must hold payment admin permissions for refund actions.

### Smoke test procedure

1. Log in as operations staff → open `/admin/ops-control`
2. Confirm KPI row shows waiting riders, active trips, online drivers
3. Dispatch tab: verify live trips load; test reassign on staging ride
4. Incidents tab: create test ticket; resolve on staging
5. Support tab: search by rider email; confirm refund queue loads
6. Fleet tab: confirm document buckets populate
7. CEO tab (CEO account): verify staff roster and readiness score

### Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Operations Manager | __________ | ______ | Pending |
| Engineering Lead | __________ | ______ | Pending |
| CEO | __________ | ______ | Pending |
