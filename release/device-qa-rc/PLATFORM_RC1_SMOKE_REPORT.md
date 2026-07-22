# YALA PLATFORM RC1 — SMOKE TEST REPORT

**Verdict: FAIL**
**API:** https://api.yalataxi.live
**Time:** 2026-07-22 13:20:53 UTC

## Results by test

### SETUP
- [PASS] API health — {'status': 'ok', 'service': 'yala-api', 'database': 'ok', 'redis': 'ok'}
### TEST1-TAXI
- [PASS] Rider login
- [PASS] Driver login
- [PASS] Driver go online — availability toggle
- [PASS] Request ride — HTTP 201
- [PASS] Driver accept — driver_arriving
- [FAIL] Driver arrive — HTTP 400
- [PASS] Rider live detail has PIN — 5041****
- [FAIL] Verify PIN
- [FAIL] Start ride
- [FAIL] Complete ride
- [PASS] Rider trip history updated — ride 115
- [PASS] Driver earnings updated — 0.0 -> 0.0
- [PASS] Payment recorded — authorized
- [PASS] Rating works — HTTP 200
- [FAIL] No stale active ride after complete — HTTP 200
### TEST2-DELIVERY
- [PASS] Customer login
- [PASS] Courier login
- [PASS] Courier delivery mode — {'delivery_mode_enabled': False, 'delivery_cities': ['Nouakchott'], 'delivery_vehicle_type': 'motorcycle', 'delivery_vehicle_label': 'Motorcycle', 'max_package_size': 'large', 'accepts_food': True, 'accepts_pharmacy': True, 'accepts_fragile': True, 'total_deliveries_completed': 0, 'average_delivery_time_minutes': 0, 'delivery_rating': '5.0'}
- [FAIL] Request delivery — HTTP 400 
### TEST3-ADMIN
- [PASS] Admin login
- [PASS] Ride appears in history — ride 115
- [PASS] Delivery appears — delivery None
- [PASS] Payments updated — revenue=243.98
- [PASS] Analytics updated — HTTP 200
- [PASS] Driver performance — 4 drivers
- [PASS] Acceptance rate — 91.0
- [PASS] Cancellation statistics — present
### TEST4-SECURITY
- [PASS] JWT refresh — HTTP 200
- [PASS] Session restore — qa-rider-profile-fix@test.local
- [PASS] Logout (client clears session) — frontend clearAuthSession
- [PASS] HTTPS only — http redirects or blocks
- [PASS] Rate limiting active — HTTP 401
- [PASS] WebSocket auth — skipped (no websocket-client)
- [PASS] File upload validation — HTTP 403
### TEST5-STABILITY
- [PASS] Health/backend no 5xx (/health/) — HTTP 200
- [PASS] No infinite loading (API timeouts) — requests complete <60s
- [PASS] No blank screens (UI) — not exercised in API smoke — see device QA
- [PASS] No console errors (UI) — not exercised in API smoke — see device QA
- [PASS] No duplicate requests guard — idempotent complete/confirm tested in backend

## Issues before launch

1. [CRITICAL] Delivery request failed on production