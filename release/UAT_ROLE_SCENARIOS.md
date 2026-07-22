# YALA Enterprise v1.0 — UAT Role-Based Test Scenarios

**Document ID:** UAT-V1-SCENARIOS-001  
**Date:** 2026-07-22  
**Parent:** [UAT_TEST_PLAN.md](./UAT_TEST_PLAN.md)  
**Legend:** ☐ Not run · ✅ Pass · ❌ Fail · **N/A** — not in v1.0 product scope

**Evidence folder:** `release/uat-evidence/<date>/<role>/`

---

## Scenario template

Each scenario uses: **ID · Preconditions · Steps · Expected · Pass/Fail · Evidence**

---

# 1. Rider (`com.yala.rider.mr`)

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| R-UAT-01 | Registration | Valid email; terms accepted | 1. Open app 2. Register 3. Verify email if required | Account created; pending or approved state shown | ☐ | |
| R-UAT-02 | Login | Approved rider account | 1. Login with credentials 2. Close/reopen app | JWT session persists; home loads | ☐ | RC4 login PASS |
| R-UAT-03 | Book ride | GPS on; approved rider | 1. Set pickup/destination 2. Select service 3. Confirm terms 4. Request | Ride `requested`; fare shown | ☐ | RC4 request PASS |
| R-UAT-04 | Driver assigned | Active ride request | 1. Wait for dispatch 2. Observe map/notifications | Driver shown; status updates | ☐ | |
| R-UAT-05 | Ride accepted | Driver accepted | 1. View tracker 2. Confirm driver details | Status `driver_arriving` or equivalent | ☐ | |
| R-UAT-06 | Driver arrives | Driver en route | 1. Wait for arrived notification 2. View PIN if applicable | Arrived state; PIN displayed if required | ☐ | |
| R-UAT-07 | Ride starts | PIN verified | 1. Driver starts ride 2. Rider sees in-progress | Status `in_progress`; map updates | ☐ | |
| R-UAT-08 | Ride completes | Ride in progress | 1. Driver completes 2. Rider sees complete | Status `completed`; fare final | ☐ | |
| R-UAT-09 | Payment | Completed ride | 1. Pay via wallet/cash/card 2. View receipt | Payment recorded; wallet updated if applicable | ☐ | |
| R-UAT-10 | Rating | Completed ride | 1. Submit 1–5 stars + review | Rating saved; confirmation shown | ☐ | |
| R-UAT-11 | Cancel with fee disclosure | Driver assigned | 1. Open cancel 2. Read fee text 3. Cancel | Copy mentions 100 MRU if en route; fee applied per backend | ☐ | Copy fixed 2026-07-22 |
| R-UAT-12 | Wallet history | Prior transactions | 1. Open wallet 2. View history | Transactions listed | ☐ | API PASS |

---

# 2. Driver (`com.yala.driver.mr`)

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| D-UAT-01 | Registration | New driver user | 1. Register 2. Complete profile | Profile pending review | ☐ | |
| D-UAT-02 | Document upload | Logged-in driver | 1. Upload license, ID, vehicle docs 2. Submit | Docs `pending_review` | ☐ | |
| D-UAT-03 | Document approval | Admin approved docs | 1. Refresh app 2. Check status | Approved; can attempt online | ☐ | |
| D-UAT-04 | Legal signature | Docs approved | 1. Sign driver terms 2. Confirm | Signature recorded | ☐ | |
| D-UAT-05 | Go online | Approved + docs + terms | 1. Toggle online 2. Confirm location permission | `is_available=true`; eligible for offers | ☐ | RC4 FAIL — retest RC3 |
| D-UAT-06 | Accept ride | Online; offer received | 1. View offer 2. Accept | Ride assigned; navigation available | ☐ | RC1 PASS |
| D-UAT-07 | Navigate / arrive | Accepted ride | 1. Open maps 2. Mark arrived at pickup | Geofence validates; arrived state | ☐ | |
| D-UAT-08 | Start ride | PIN verified | 1. Enter/verify PIN 2. Start | Status `in_progress` | ☐ | |
| D-UAT-09 | Complete ride | In progress | 1. Complete ride 2. Check earnings | Completed; points/earnings updated | ☐ | |
| D-UAT-10 | Earnings dashboard | Completed rides | 1. Open earnings 2. View chart | Totals match completed rides | ☐ | API PASS |
| D-UAT-11 | Wallet / withdrawal | Balance > 0 | 1. Request withdrawal 2. OTP if required | Request `pending`; finance can approve | ☐ | |

---

# 3. Delivery Courier (`com.yala.delivery.mr`)

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| C-UAT-01 | Courier registration | Delivery mode enabled | 1. Register 2. Complete courier profile | Profile created | ☐ | |
| C-UAT-02 | Phone verification | Prod environment | 1. Verify phone 2. Complete onboarding | No 403; courier approved | ☐ | RB-P1-003 open |
| C-UAT-03 | View available deliveries | Online courier | 1. Go online 2. Open available list | Deliveries listed | ☐ | |
| C-UAT-04 | Accept delivery | Available job | 1. Accept 2. Confirm | Status assigned; trip screen loads | ☐ | RC4 UI FAIL |
| C-UAT-05 | Pickup | Assigned | 1. Arrive pickup 2. Confirm pickup proof | Status picked up | ☐ | RC4 PASS |
| C-UAT-06 | Deliver | In transit | 1. Arrive dropoff 2. Complete proof | Status delivered | ☐ | RC4 PASS |
| C-UAT-07 | Earnings | Completed delivery | 1. View earnings/wallet | Courier earning recorded | ☐ | |

---

# 4. Merchant (`/merchant` web)

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| M-UAT-01 | Login | Approved merchant | 1. Login 2. View dashboard | Dashboard loads; orders visible | ☐ | |
| M-UAT-02 | Receive order | Customer placed order | 1. View new order 2. Accept | Status `accepted` | ☐ | |
| M-UAT-03 | Preparing → Ready | Accepted order | 1. Mark preparing 2. Mark ready | Delivery created; coords from order | ☐ | Code fix 2026-07-22 |
| M-UAT-04 | Inventory update | Products exist | 1. Update stock 2. Save | Stock reflects; unavailable if 0 | ☐ | |
| M-UAT-05 | Reports / analytics | Completed orders | 1. Open analytics 2. View totals | Revenue/order counts reasonable | ☐ | API PASS |
| M-UAT-06 | Settlement view | Settlement period | 1. View settlements/payouts | Pending/paid settlements listed | ☐ | |

---

# 5. Landlord

**v1.0 scope:** **N/A — no Landlord product module.** Landlord exists as **YALA Academy audience** and **support playbook** entry only.

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| LL-UAT-01 | Academy course (landlord audience) | Admin published course | 1. Admin assigns landlord-audience course 2. User completes | Progress tracked; cert if pass score met | ☐ | `tests.academy` PASS |
| LL-UAT-02 | Support ticket (landlord) | Support playbook | 1. Log landlord inquiry 2. Route per playbook | Ticket categorized; SLA tracked | ☐ | Manual ops |
| LL-UAT-03 | Rent collection app | N/A | — | **Not in v1.0** | **N/A** | `PLATFORM_INVENTORY.md` |

---

# 6. Tenant

**v1.0 scope:** **N/A — Tenant module not built.**

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| T-UAT-01 | Tenant portal login | N/A | — | **Not in v1.0** | **N/A** | — |
| T-UAT-02 | Rent payment | N/A | — | **Not in v1.0** | **N/A** | — |

---

# 7. Collector

**v1.0 scope:** **N/A as standalone app.** Collector is **Academy audience** type. Cash/payment collection validated under **Finance** and **Delivery COD** flows.

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| COL-UAT-01 | Academy course (collector audience) | Published course | 1. Assign collector-audience course 2. Complete exam | Certification issued if pass | ☐ | Academy tests PASS |
| COL-UAT-02 | Delivery COD settlement | Courier COD delivery | 1. Complete COD delivery 2. Finance reconciles | Payment record + settlement | ☐ | `deliveries/tests.py` |
| COL-UAT-03 | Property rent collection | N/A | — | **Not in v1.0** | **N/A** | — |

---

# 8. Supervisor (Django group: `Supervisor`)

**Access:** Operations Command Center, dispatch, launch hub (read), multi-city ops.

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| SUP-UAT-01 | Login admin | User in Supervisor group | 1. Login `/admin` 2. Open operations command | Dashboard 200; live map loads | ☐ | |
| SUP-UAT-02 | Live dispatch view | Active rides | 1. Open operations center 2. View ride list/map | Rides/deliveries visible | ☐ | `test_operations_center` PASS |
| SUP-UAT-03 | Incident create/ack | Ops permissions | 1. Create incident 2. Acknowledge | Incident logged; audit trail | ☐ | |
| SUP-UAT-04 | Cannot access finance payouts | Supervisor only | 1. Attempt finance approve payout | 403 or hidden UI | ☐ | RBAC test |

---

# 9. Accountant (Django group: `Accountant`)

**Access:** Finance Operations Center, withdrawals, refunds, merchant settlements.

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| ACC-UAT-01 | Finance dashboard | Accountant login | 1. Open `/admin/finance-ops` 2. Load dashboard | KPIs, queues load | ☐ | `test_finance_operations` PASS |
| ACC-UAT-02 | Approve withdrawal | Pending withdrawal | 1. Review 2. Approve | Status updated; wallet debited | ☐ | |
| ACC-UAT-03 | Refund queue | Pending refund | 1. Open refund 2. Approve/reject | Refund processed | ☐ | |
| ACC-UAT-04 | Merchant settlement | Pending settlement | 1. Generate settlement 2. Mark paid | Settlement record updated | ☐ | `test_merchant_platform` PASS |
| ACC-UAT-05 | Export report | Finance export | 1. Export CSV/PDF | File downloads; data matches | ☐ | |

---

# 10. CEO

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| CEO-UAT-01 | Executive dashboard | CEO login | 1. Open `/admin/executive` 2. Load all panels | Live + finance + queues | ☐ | `EXECUTIVE_DASHBOARD_QA.md` PASS |
| CEO-UAT-02 | CEO Master Command | CEO login | 1. Open `/admin/ceo-master` 2. Review overview | Platform health score, pending actions | ☐ | `test_ceo_master` PASS |
| CEO-UAT-03 | Approve payout | Pending payout in queue | 1. Select payout 2. Approve | Payout status `approved`/paid | ☐ | |
| CEO-UAT-04 | Approve onboarding | Pending driver/merchant | 1. Review 2. Approve | Entity approved | ☐ | |
| CEO-UAT-05 | Board report export | CEO login | 1. Generate weekly report 2. Export CSV | Report downloads | ☐ | `test_board_reporting` PASS |
| CEO-UAT-06 | Maintenance mode toggle | CEO login | 1. Toggle maintenance 2. Verify API message | Platform flag set | ☐ | `test_executive_dashboard` |

---

# 11. Admin (Super Admin / staff)

| ID | Scenario | Preconditions | Steps | Expected results | Pass/Fail | Evidence |
|----|----------|---------------|-------|------------------|:---------:|----------|
| AD-UAT-01 | User management | Admin login | 1. List riders/drivers 2. Approve/block user | Status updated | ☐ | |
| AD-UAT-02 | Ride management | Active ride | 1. View in ops center 2. Cancel/reassign if supported | Action reflected | ☐ | |
| AD-UAT-03 | Delivery management | Active delivery | 1. Admin delivery panel 2. View disputes | Delivery visible | ☐ | RC4 admin PASS |
| AD-UAT-04 | Finance overview | Admin login | 1. Payment dashboard 2. View records | Records load | ☐ | |
| AD-UAT-05 | Audit logs | Admin login | 1. Open security audit logs 2. Filter by action | Immutable log entries | ☐ | |
| AD-UAT-06 | Trust & Safety | Admin login | 1. Open trust center 2. Review incident | Incident workflow works | ☐ | `test_trust_safety` PASS |

---

## Execution summary

| Role | Scenarios | Executable v1.0 | Executed | Pass |
|------|:---------:|:-----------------:|:--------:|:----:|
| Rider | 12 | 12 | 0 manual | ☐ |
| Driver | 11 | 11 | 0 manual | ☐ |
| Courier | 7 | 7 | 0 manual | ☐ |
| Merchant | 6 | 6 | 0 manual | ☐ |
| Landlord | 3 | 1 (+1 ops) | 0 | ☐ |
| Tenant | 2 | 0 | — | **N/A** |
| Collector | 3 | 1 (+1 finance) | 0 | ☐ |
| Supervisor | 4 | 4 | 0 | ☐ |
| Accountant | 5 | 5 | 0 | ☐ |
| CEO | 6 | 6 | 0 | ☐ |
| Admin | 6 | 6 | 0 | ☐ |

**Manual UAT execution:** Pending UAT-3 window (see test plan).
