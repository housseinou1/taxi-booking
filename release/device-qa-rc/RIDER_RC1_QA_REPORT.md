# Yala Rider RC1 — Physical Device QA Report

**Date:** 2026-07-07  
**Device:** Samsung SM-N986U1 (`R5CN80M3ZYJ`)  
**Build tested:** `com.yala.rider.mr` v1.2.1 (installed)  
**API:** `https://api.yalataxi.live`  
**Scope:** Feature freeze — bug fixes only, no UI redesign

---

## Verdict: **FAIL**

RC1 is **not ready for store release**. Core API ride flow works, but critical bugs were found in login, active-ride restore, and password reset. Fixes are committed in source; **backend deploy + rider APK rebuild required** before RC2.

---

## Checklist

### Authentication

| Test | Result | Notes |
|------|--------|-------|
| Register | **PARTIAL** | UI present ("Create account"); full registration not automated |
| Login | **PASS** | Device + API (`qa-rider-profile-fix@test.local`) |
| Session restore | **PASS** | Cold start returns home map without login |
| Logout | **PARTIAL** | Hamburger → "Log out" exists; automation did not reach it |
| Password reset | **FAIL → FIXED** | Prod API timed out (>60s); SMTP blocked response |

### Booking

| Test | Result | Notes |
|------|--------|-------|
| GPS current location | **PASS** | "You are here" marker on map |
| Pickup search | **PARTIAL** | Location inputs present; full autocomplete not scripted |
| Destination search | **PARTIAL** | "Search destination" sheet visible |
| Fare estimate | **PARTIAL** | Fare calc wired in `RiderHome`; not verified on device |
| Request ride | **PASS** | API ride #22–23 created successfully |
| Driver assigned | **PASS** | Driver QA assigned via API |
| Driver ETA | **PARTIAL** | `RideTracker` supports ETA; not captured on device |
| Driver live location | **PARTIAL** | WebSocket driver position wired |
| Driver arriving | **PASS** | Status transitions via API |
| PIN screen | **FAIL → FIXED** | Device showed home map during `driver_arrived` — missing `/rides/active/` |
| Trip starts | **PASS** | `in_progress` confirmed |
| Trip completes | **PASS** | `completed` confirmed |

### Payments

| Test | Result | Notes |
|------|--------|-------|
| Cash | **PARTIAL** | `PostRidePayRate` supports cash; not exercised on device |
| Wallet | **PARTIAL** | Bankily/Masrvi/Seddad options in UI |
| Card | **PARTIAL** | Card option present; gateway not verified |
| Receipt | **PARTIAL** | Payment status in ride history API |
| Trip history | **PASS** | `/rides/history/` returns completed rides |

### Ride management

| Test | Result | Notes |
|------|--------|-------|
| Cancel before driver accepts | **PASS** | Ride #22 cancelled by rider |
| Cancel after driver accepts | **PARTIAL** | API supports; device flow not scripted |
| Cancellation fees | **PASS** | Fees applied in API (e.g. 100–150 MRU on cancelled rides) |
| Driver no-show | **NOT TESTED** | — |
| Waiting time fee | **PASS** | `waiting_status.currency: MRU` in API; shared `waitingFee.js` fix |

### Maps

| Test | Result | Notes |
|------|--------|-------|
| Live driver tracking | **PARTIAL** | Map + markers render; live WS not fully verified |
| Route updates | **PARTIAL** | Route service wired |
| GPS recovery | **PARTIAL** | Foreground refresh fix added |
| Map zoom / recenter | **PASS** | Zoom control visible on map |

### Notifications

| Test | Result | Notes |
|------|--------|-------|
| Ride accepted | **PARTIAL** | Push plugin registered; FCM not automated |
| Driver arrived | **PARTIAL** | Backend push wired |
| Trip started | **PARTIAL** | — |
| Trip completed | **PARTIAL** | — |
| Background push | **NOT TESTED** | — |

### Ratings

| Test | Result | Notes |
|------|--------|-------|
| Rate driver | **PARTIAL** | `PostRidePayRate` after complete; not exercised |
| Tip driver | **PARTIAL** | Tip % options in UI |

### Delivery

| Test | Result | Notes |
|------|--------|-------|
| Request delivery | **NOT TESTED** | Menu links to `/delivery` |
| Live courier tracking | **NOT TESTED** | — |
| Delivery PIN | **NOT TESTED** | — |
| Delivery completed | **NOT TESTED** | — |

### Security

| Test | Result | Notes |
|------|--------|-------|
| Session timeout | **PARTIAL** | JWT expiry handled by refresh |
| Token refresh | **PASS** | `/auth/token/refresh/` works |
| No unauthorized access | **PASS** | `/rides/history/` returns 401 without token |
| HTTPS only | **PASS** | `network_security_config.xml` blocks cleartext |
| Secure token storage | **PASS** | Capacitor secure storage on logout |

### Performance

| Test | Result | Notes |
|------|--------|-------|
| No crashes | **PASS** | No crashes during QA session |
| No loading loops | **PASS** | — |
| No duplicate ride requests | **PASS** | `BookingConfirmation` submit guard |
| No blank screens | **PASS** | — |
| No stuck buttons | **PASS** | — |
| No overlapping dialogs | **PASS** | — |

---

## Bugs found (all fixed in source for RC2)

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 1 | **Critical** | `GET /rides/active/` returned 404 — rider app could not restore in-progress trip or show PIN/tracking | Added `active_ride` view + URL in `backend/taxi/taxi/rides/` |
| 2 | **High** | "Forgot password?" link invisible on rider login (white text on white card) | `frontend/src/rider/lyft-rider.css` — lyft theme overrides for forgot/footer links |
| 3 | **High** | Password reset API hung >60s (SMTP `send_mail` blocked request) | `password_reset_views.py` — deliver code in background thread |
| 4 | **Medium** | Rider app did not refresh active ride on background → foreground | `RiderHome.js` — `visibilitychange` + Capacitor `appStateChange` |
| 5 | **Medium** | Waiting fee text could show `undefined` (shared with driver) | `frontend/src/utils/waitingFee.js` — use `MARKET.currency` |
| 6 | **Low** | `build-rider.bat` blocked on xcopy overwrite prompt | Added `/y` flag |

---

## Automated results

```
device-qa-rider-rc1.py     → 14/17 PASS (3 failures before fixes deployed)
backend pytest (rides+reset) → 9/9 PASS
```

---

## Required before RC2 sign-off

1. **Deploy backend** (`active_ride` endpoint + async password reset)
2. **Rebuild & install** rider APK with frontend fixes
3. Re-run device QA: PIN screen during `driver_arrived`, forgot-password visibility, password reset flow
4. Complete delivery + notification + rating checks on device

---

## Sign-off

| Layer | Result |
|-------|--------|
| API ride flow | **PASS** |
| Physical device RC1 | **FAIL** (fixes in source, deploy pending) |
