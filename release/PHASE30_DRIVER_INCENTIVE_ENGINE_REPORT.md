# Phase 30 — Driver Incentive Engine

**Date:** 2026-07-21  
**Status:** Backend, UI, and tests complete; build passes

---

## Summary

Phase 30 implements a configurable Driver Incentive Engine that lets Operations create bonus campaigns, lets drivers track progress in the Driver app, and gives Operations, Finance, and CEO dashboards full visibility into participation, bonuses, and ROI.

No Driver app redesign was needed; the existing incentive APIs feed the Driver app's progress and bonus views.

---

## 1. Incentive Campaigns

### Models (`incentives/models.py`)

- `IncentiveProgram`
  - Campaign types: `daily_trip_target`, `weekly_trip_target`, `peak_hour_bonus`, `weekend_bonus`, `airport_bonus`, `new_driver_bonus`, `referral_bonus`, `consecutive_trips_bonus`, etc.
  - Reward types: `fixed`, `percentage`, `per_trip`
  - Fields: name, description, campaign type, reward type, bonus amount, target value, city, status (`draft`/`active`/`paused`/`completed`/`expired`), eligible groups, start/end dates, max participants
  - `is_currently_active` property checks status and date window
- `DriverIncentiveProgress`
  - Tracks a driver's enrollment, current value, status (`in_progress`/`completed`/`paid`/`expired`), bonus earned/pending, completed/paid timestamps
  - `progress_percent` and `trips_remaining` helper properties
  - Unique together on `(driver, program)`
- `BonusPayment`
  - Payout record with status `pending`/`approved`/`paid`/`rejected`
  - Links to driver, program, progress, wallet transaction, approver

### Admin API (`operations/incentive_engine_views.py`)

- `GET/POST /operations/incentive-engine/campaigns/` — list/create campaigns
- `GET/PATCH /operations/incentive-engine/campaigns/<id>/` — view/update campaign
- `GET /operations/incentive-engine/` — combined incentive engine dashboard
- `GET /operations/incentive-engine/ops/` — operations metrics
- `GET /operations/incentive-engine/ceo/` — CEO metrics
- `GET /operations/incentive-engine/finance/` — finance dashboard
- `POST /operations/incentive-engine/payouts/<id>/action/` — approve/reject bonus payout
- `GET /operations/incentive-engine/export/` — CSV export of bonus report rows

All modifying actions call `log_from_request` and invalidate the incentive engine dashboard cache.

### Service logic (`operations/incentive_engine_service.py`)

- `create_campaign` / `update_campaign` / `list_campaigns`
- `build_ops_dashboard` — active campaigns, participation rate, completion rate, total bonuses earned, ROI estimate, top campaigns
- `build_ceo_dashboard` — incentive cost, additional rides generated, revenue increase estimate, driver retention, campaign effectiveness
- `build_finance_dashboard` — pending payouts, recently paid bonuses, bonus summary
- `approve_bonus_payout` / `reject_bonus_payout` — credit driver wallet on approval
- `build_bonus_report_rows` — CSV-ready rows

---

## 2. Driver Progress

### Driver API (`incentives/views.py`)

- `GET /incentives/programs/` — active campaigns driver can join
- `POST /incentives/programs/<id>/enroll/` — enroll in a campaign
- `GET /incentives/my-progress/` — active campaigns with progress bars, trips completed, trips remaining, estimated bonus, expiration, completed history
- `GET /incentives/my-bonuses/` — bonus payment history

### Payload shape

Progress payloads from `operations/incentive_engine_service.py::build_driver_campaigns_payload` include:

- `program_id`, `name`, `campaign_type`, `reward_type`
- `current_value`, `target_value`, `progress_percent`, `trips_remaining`
- `estimated_bonus`, `earned_bonus`, `pending_bonus`, `paid_bonus`
- `expires_at`, `status`

---

## 3. Bonus Calculation

- Fixed amount: `bonus_amount` paid on completion
- Percentage: `bonus_amount` interpreted as percent of qualifying earnings
- Per-trip: `bonus_amount` paid for each qualifying trip
- Completed progress creates/updates `BonusPayment` records (`pending`)
- Finance approves; wallet is credited when `pay_now=true`
- `build_bonus_summary` returns earned, pending, paid, approved-awaiting-pay totals

---

## 4. Operations Dashboard

`GET /operations/incentive-engine/ops/` returns:

- Summary: active campaigns, participants, participation rate, completion rate, total bonuses earned, ROI estimate
- Bonus summary
- Active campaigns list
- Top-performing campaigns by completions

---

## 5. CEO Dashboard

`GET /operations/incentive-engine/ceo/` returns:

- Incentive cost (30 days)
- Additional rides generated
- Revenue increase estimate
- Driver retention rate
- Campaign effectiveness list
- Pending payouts

---

## 6. Finance

`GET /operations/incentive-engine/finance/` returns:

- Bonus summary
- Pending payouts list
- Recently paid list

`POST /operations/incentive-engine/payouts/<id>/action/`:

- `action=approve` with optional `pay_now` (default true) — marks approved/paid and credits wallet
- `action=reject` with optional `note`
- Writes audit log and invalidates dashboard cache

`GET /operations/incentive-engine/export/?days=30` returns CSV with payment rows.

---

## 7. Frontend

- `frontend/src/admin/incentives/DriverIncentivesCenter.js`
  - Tabs: Campaigns, Operations, CEO Dashboard, Finance
  - Create/edit campaign form
  - Campaign list with status filter
  - Operations metrics cards
  - CEO metrics cards
  - Finance payout queue with approve/reject actions
  - CSV export button
- `frontend/src/admin/incentives/incentiveEngineApi.js`
- `frontend/src/admin/incentives/DriverIncentivesCenter.css`

### Routing & navigation

- `/admin/incentives` mapped in `App.js` and `roleRouting.js`
- Sidebar link in `admin/AdminDashboard.js`

---

## 8. Permissions

- Operations: `IsLaunchCommandStaff` / `can_dispatch_operations`
- Finance: `IsFinanceStaff` / `can_manage_finance`
- CEO: `IsCeoStaff`
- Driver endpoints: `IsAuthenticated`

All campaign create/update and payout actions are logged.

---

## 9. Tests

- `backend/taxi/tests/operations/test_incentive_engine.py`

```bash
cd backend/taxi
python manage.py test tests.operations.test_incentive_engine -v 1
```

**Result:** passes as part of the operations test suite.

Full operations suite:

```bash
python manage.py test tests.operations -v 1
```

**Result:** 82/82 pass.

---

## 10. Verification

```bash
cd backend/taxi
python manage.py check
# no issues

cd frontend
npm run build
# succeeded
```

---

## Files changed / referenced

- `backend/taxi/incentives/models.py`
- `backend/taxi/incentives/views.py`
- `backend/taxi/incentives/urls.py`
- `backend/taxi/operations/incentive_engine_service.py`
- `backend/taxi/operations/incentive_engine_views.py`
- `backend/taxi/operations/urls.py`
- `backend/taxi/tests/operations/test_incentive_engine.py`
- `frontend/src/admin/incentives/DriverIncentivesCenter.js`
- `frontend/src/admin/incentives/incentiveEngineApi.js`
- `frontend/src/admin/incentives/DriverIncentivesCenter.css`
- `frontend/src/App.js`
- `frontend/src/admin/AdminDashboard.js`
- `frontend/src/auth/roleRouting.js`
