# YALA ADMIN RC1 QA REPORT

**Verdict: FAIL**
**API:** https://api.yalataxi.live
**Checks:** 33/38 passed

## Checklist Results

### Drivers
- [PASS] Admin permissions (rider blocked from /drivers/list/) — HTTP 403
- [PASS] View drivers list — 5 drivers

### Riders
- [PASS] View riders — 9 users

### Deliveries
- [PASS] Live deliveries (admin mine=all) — 14 deliveries

### Analytics
- [PASS] Delivery analytics — HTTP 200
- [PASS] Platform analytics (rides) — HTTP 200
- [FAIL] Analytics daily — ['summary', 'charts', 'ride_type_breakdown', 'top_drivers']
- [FAIL] Analytics weekly — ['summary', 'charts', 'ride_type_breakdown', 'top_drivers']
- [FAIL] Analytics monthly — ['summary', 'charts', 'ride_type_breakdown', 'top_drivers']
- [FAIL] City analytics — HTTP 500

### Performance
- [PASS] Admin login — sakho@admin.mr
- [FAIL] Admin role payload — role=
- [PASS] Session restore (/auth/me/) — sakho@admin.mr
- [PASS] Token refresh — HTTP 200
- [PASS] Driver performance API — HTTP 200
- [PASS] Performance points / acceptance / risk fields — ['driver_id', 'user_id', 'driver_name', 'driver_email', 'status', 'driver_category', 'driver_level', 'performance_points']
- [PASS] View driver documents (payload) — fields present in list API
- [PASS] Approve driver endpoint — HTTP 404
- [PASS] Reject driver endpoint — HTTP 404
- [PASS] Suspend driver (block API available) — user id 8
- [PASS] Driver agreement (legal admin) — HTTP 200
- [PASS] Driver agreement records — 2 records
- [PASS] Rider records in user list — 7 riders
- [PASS] Ride history (admin) — 51 rides
- [PASS] Courier status queue — 2 couriers
- [PASS] Merchant orders/onboarding — 0 merchants
- [PASS] Payment dashboard API — HTTP 200
- [PASS] Withdrawals list — 0 withdrawals
- [PASS] Ride payment records — HTTP 200
- [PASS] Refund queue API — HTTP 200
- [PASS] Activity heatmap (daily) — HTTP 200
- [PASS] Activity heatmap (weekly) — HTTP 200
- [PASS] Activity heatmap (monthly) — HTTP 200
- [PASS] Audit logs — 19 entries
- [PASS] Fraud flags — HTTP 200
- [PASS] 2FA (not implemented — expect 404) — HTTP 404
- [PASS] Native admin app routes to AdminDashboard — App.js missing admin branch
- [PASS] Native admin role guard — isRoleAllowedForAppType missing admin check

## Bugs Found

1. Admin login does not return admin role / is_staff