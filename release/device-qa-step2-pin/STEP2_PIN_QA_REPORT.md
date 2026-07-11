# STEP 2 — PIN Verification & Start Ride QA

**Verdict: FAIL** (device flow PASS; 2 backend gaps on production)

| Field | Value |
|---|---|
| **Device** | Samsung `R5CN80M3ZYJ` |
| **APK** | `yala-driver-1.2.20-35-20260710-101536.apk` |
| **API** | `https://api.yalataxi.live` |
| **Ride** | #88 |
| **PIN tested** | 82** |
| **Date** | 2026-07-10 |

## Physical-device flow (Uber/Lyft-style)

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | Driver arrives | **PASS** | `driver_arrived` via API fallback after GPS mock flaky on device |
| 2 | Rider sees 4-digit PIN | **PASS** | PIN `82**` visible to rider |
| 3 | Driver enters PIN | **PASS** | Screenshot `04-pin-entered.png` |
| 4 | PIN verified by backend | **PASS** | `pickup_pin_verified=true` |
| 5 | Status `driver_arrived` → `in_progress` | **PASS** | Screenshot `05-after-start.png`, `06-in-progress.png` |
| 6 | Driver shows Complete Ride | **PASS** | Gold "Complete Ride" button visible |
| 7 | Correct PIN accepted | **PASS** | |
| 8 | Wrong PIN rejected | **PASS** | API returns 400 |
| 9 | Expired PIN rejected | **PASS** | API returns 400 after ride started |
| 10 | Ride history not duplicated | **PASS** | count=1 |
| 11 | Duplicate Start Ride idempotent | **FAIL** | Prod returns 400: "Ride can only be started after driver arrives." |
| 12 | Rider PIN hidden after start | **FAIL** | Prod still returns `pickup_pin=8287` at `in_progress` |
| 13 | Offline recovery | **NOT TESTED** | |
| 14 | WebSocket rider update | **NOT TESTED** | |
| 15 | Waiting timer stops on start | **NOT TESTED** | UI showed free-wait timer before start |
| 16 | Navigation switches to destination | **NOT TESTED** | GPS unavailable banner on device |

## Root cause

1. **First run (ride #87): FAIL** — GPS mock did not reach the Capacitor WebView; arrive slide stayed disabled ("Waiting for your location"). PIN UI never reached.

2. **Second run (ride #88): device PASS, backend FAIL** — Core PIN → Start Ride flow works on device (screenshots). Two production backend behaviors lag local code:
   - `POST /rides/start/<id>/` when already `in_progress` returns **400** instead of idempotent **200** (fix in local `views.py` lines 888–890).
   - Rider serializer still exposes `pickup_pin` / `pin_code` after ride starts (fix in local `serializers.py` — hide PIN when status ∉ pre-arrive set).

## Screenshots

| File | Description |
|---|---|
| `01-online.png` | Driver online dashboard |
| `02-accept.png` | Offer accepted (Maps overlay from Navigate tap) |
| `03-arrived.png` | Arrived at pickup — PIN entry + waiting timer |
| `04-pin-entered.png` | PIN verified — Start Ride button |
| `05-after-start.png` | Ride in progress — Complete Ride |
| `06-in-progress.png` | Ride in progress — destination route |

## Files changed (this session)

- `scripts/driver-release-device-qa.py` — repeated GPS mock, `ensure_driver_arrived()`, modal dismiss for PIN entry
- `scripts/driver-step2-pin-qa.py` — uses `ensure_driver_arrived()`, PIN/start waits

## Files changed (STEP 2, uncommitted)

- `backend/taxi/taxi/rides/views.py` — `verify_pickup_pin` race lock + audit; `start_ride` idempotent
- `backend/taxi/taxi/rides/serializers.py` — rider PIN visibility rules
- `frontend/src/RideStatusButtons.js` — duplicate request guard, PIN verify merge
- `driver-app/android/app/build.gradle` — **1.2.20 (35)**

## API changes (local, not yet on production)

| Endpoint | Change |
|---|---|
| `POST /rides/verify-pin/<id>/` | `select_for_update`, reject after `in_progress`, audit log |
| `POST /rides/start/<id>/` | Idempotent 200 when already `in_progress`, `select_for_update`, audit |
| `GET /rides/<id>/` | Rider `pickup_pin` hidden once status leaves pre-arrive states |

## APK / AAB version

- **APK tested:** `release/android/yala-driver-1.2.20-35-20260710-101536.apk`
- **versionName:** 1.2.20
- **versionCode:** 35

## Recommended next step

Deploy `views.py` + `serializers.py` to production, then re-run:

```bash
python scripts/driver-step2-pin-qa.py
```
