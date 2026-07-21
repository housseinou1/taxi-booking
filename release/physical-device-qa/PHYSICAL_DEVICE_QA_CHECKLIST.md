# Yala — Physical Device QA Checklist (Printable)

**Release:** RC2 / Sprint 1  
**API:** https://api.yalataxi.live  
**Environment:** Production (controlled beta)  
**Date:** _______________  
**Tester name:** _______________  
**Tester signature:** _______________  

---

## Builds under test

| App | Package | Version | Build type | APK/AAB path | Installed? |
|-----|---------|---------|------------|--------------|:----------:|
| Yala Rider | `com.yala.rider.mr` | **1.2.7** (19) | Release / Internal | `release/android/yala-rider-1.2.7-*` | ☐ |
| Yala Driver | `com.yala.driver.mr` | **1.2.23** (38) | Release / Internal | `release/android/yala-driver-1.2.23-*` | ☐ |
| Yala Delivery | `com.yala.delivery.mr` | **1.0.4** (6) | Release / Internal | `release/android/yala-delivery-1.0.4-*` | ☐ |

---

## Test devices

| # | Manufacturer / model | Android version | Google Play Services | FCM token captured? |
|---|----------------------|-----------------|----------------------|:-------------------:|
| 1 | | | ☐ Yes ☐ No | ☐ |
| 2 | | | ☐ Yes ☐ No | ☐ |

---

## Session prerequisites (all apps)

- [ ] Physical Android device (emulator **not** valid for sign-off)
- [ ] Device has mobile data **and** Wi‑Fi available for network tests
- [ ] Location services **On**; GPS mode **High accuracy**
- [ ] Battery ≥ 50% or device plugged in
- [ ] Production API reachable: `GET https://api.yalataxi.live/health/` → OK
- [ ] Test accounts provisioned (see below)
- [ ] Second device available for paired ride/delivery tests (driver + rider, or courier + merchant/rider)
- [ ] Screenshot folder created: `release/physical-device-qa/screenshots/<date>/`

### QA test accounts (production)

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Rider | `qa-rider-profile-fix@test.local` | *(secure channel)* | Approved rider |
| Driver | `qa-driver-profile-fix@test.local` | *(secure channel)* | Approved driver, documents OK |
| Courier | *(assign before session)* | | Delivery mode enabled |

> Do **not** record passwords in signed reports. Reference “credentials from QA vault” only.

### Automated pre-check (run before device session)

```bash
python scripts/rc2-mobile-api-smoke.py
python scripts/fix-qa-cert-accounts.py   # on server, if accounts need reset
```

| Pre-check | Pass ☐ | Fail ☐ | Notes |
|-----------|:------:|:------:|-------|
| API health 200 | ☐ | ☐ | |
| Rider login API | ☐ | ☐ | |
| Driver login API | ☐ | ☐ | |

---

## How to use this document

1. Execute tests **in order** within each app section where dependencies exist.
2. Mark **Pass ☐** or **Fail ☐** for each test.
3. Capture screenshots when **Screenshot = Yes** (filename: `<TestID>_<step>_<device>.png`).
4. Log failures in **Bug Report Template** (`BUG_REPORT_TEMPLATE.md`) — one bug per defect.
5. Block release sign-off if any **P0** test fails.

**Priority:** P0 = launch blocker · P1 = fix before beta scale · P2 = cosmetic / minor

---

<div style="page-break-after: always;"></div>

# PART A — Yala Rider 1.2.7

**Package:** `com.yala.rider.mr` · **Version:** 1.2.7 (19)

---

## A1 — Login & session

### R-001 — Fresh install launch

| | |
|---|---|
| **Preconditions** | App not installed; release APK/AAB sideloaded or from internal track |
| **Steps** | 1. Install Rider 1.2.7<br>2. Open app<br>3. Observe first screen |
| **Expected result** | Splash → login or onboarding; no crash; HTTPS API base `api.yalataxi.live` |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — first screen |
| **Priority** | P0 |
| **Notes** | |

---

### R-002 — Login with valid credentials

| | |
|---|---|
| **Preconditions** | Registered approved rider account; network connected |
| **Steps** | 1. Enter email + password<br>2. Tap Login<br>3. Wait for home map |
| **Expected result** | HTTP 200 login; JWT stored; home map loads with user location |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — home after login |
| **Priority** | P0 |
| **Notes** | |

---

### R-003 — Login with invalid password

| | |
|---|---|
| **Preconditions** | Valid email; wrong password |
| **Steps** | 1. Enter email + wrong password<br>2. Tap Login |
| **Expected result** | Clear error message; no crash; fields remain editable |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — error state |
| **Priority** | P1 |
| **Notes** | |

---

### R-004 — Session restore after force-stop

| | |
|---|---|
| **Preconditions** | R-002 passed; user logged in |
| **Steps** | 1. Force-stop app (Settings → Apps)<br>2. Reopen app |
| **Expected result** | User remains logged in; home map loads without login screen |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — home after reopen |
| **Priority** | P0 |
| **Notes** | |

---

### R-005 — Logout

| | |
|---|---|
| **Preconditions** | User logged in |
| **Steps** | 1. Open menu / profile<br>2. Tap Log out<br>3. Confirm if prompted |
| **Expected result** | Returns to login; tokens cleared; back button does not restore session |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P1 |
| **Notes** | |

---

## A2 — GPS & location

### R-010 — Location permission prompt

| | |
|---|---|
| **Preconditions** | Fresh install or permissions reset for Rider app |
| **Steps** | 1. Open app and log in<br>2. Observe location permission dialog |
| **Expected result** | System permission prompt; app explains need for rides; graceful if denied |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — permission dialog |
| **Priority** | P0 |
| **Notes** | |

---

### R-011 — Current location on map

| | |
|---|---|
| **Preconditions** | Location permission granted; GPS on; outdoors or near window |
| **Steps** | 1. Open home map<br>2. Wait 10 s for fix |
| **Expected result** | Blue dot / “You are here” at approximate real position; map centers |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — map with user marker |
| **Priority** | P0 |
| **Notes** | |

---

### R-012 — Pickup pin placement

| | |
|---|---|
| **Preconditions** | Home map loaded |
| **Steps** | 1. Search or drag pickup pin<br>2. Confirm pickup location |
| **Expected result** | Pin moves; address updates; coordinates sent on request |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — pickup selected |
| **Priority** | P0 |
| **Notes** | |

---

### R-013 — Live driver tracking during ride

| | |
|---|---|
| **Preconditions** | Active ride with assigned driver (R-020+) |
| **Steps** | 1. Open ride tracker<br>2. Observe driver marker 30 s |
| **Expected result** | Driver marker updates; ETA shown; no frozen map |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — tracker with driver |
| **Priority** | P0 |
| **Notes** | |

---

## A3 — Push notifications

### R-020 — Notification permission (Android 13+)

| | |
|---|---|
| **Preconditions** | Android 13+ device; notifications not yet granted |
| **Steps** | 1. Login<br>2. Accept or deny notification permission when prompted |
| **Expected result** | OS prompt shown; app continues if denied with in-app status |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — permission dialog |
| **Priority** | P1 |
| **Notes** | |

---

### R-021 — Push: driver accepted ride

| | |
|---|---|
| **Preconditions** | Notifications allowed; FCM registered; ride requested |
| **Steps** | 1. Request ride (R-030)<br>2. Have driver accept on second device<br>3. Background Rider app |
| **Expected result** | Push notification received; tap opens ride tracker |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — notification shade |
| **Priority** | P0 |
| **Notes** | |

---

### R-022 — Push: driver arrived

| | |
|---|---|
| **Preconditions** | Ride accepted; driver marks arrived |
| **Steps** | 1. Driver taps Arrived<br>2. Observe rider device (foreground + background) |
| **Expected result** | Push + in-app status → driver arrived; pickup PIN shown if applicable |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — arrived state |
| **Priority** | P0 |
| **Notes** | |

---

### R-023 — Push: ride completed

| | |
|---|---|
| **Preconditions** | Ride in progress |
| **Steps** | 1. Driver completes ride<br>2. Observe rider notification |
| **Expected result** | Completion push; payment/rating screen or prompt |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — completion notification |
| **Priority** | P1 |
| **Notes** | |

---

## A4 — Offline mode

### R-030 — Offline at login attempt

| | |
|---|---|
| **Preconditions** | Logged out; enable Airplane mode |
| **Steps** | 1. Open app<br>2. Attempt login |
| **Expected result** | Friendly offline message; no infinite spinner; retry when online |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — offline error |
| **Priority** | P1 |
| **Notes** | |

---

### R-031 — Offline during active ride

| | |
|---|---|
| **Preconditions** | Active ride on tracker; then enable Airplane mode 30 s |
| **Steps** | 1. Disable network mid-ride<br>2. Re-enable network |
| **Expected result** | Cached UI remains; reconnect syncs status; no duplicate rides |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — before/after reconnect |
| **Priority** | P0 |
| **Notes** | |

---

## A5 — Ride flow (end-to-end)

### R-040 — Request ride

| | |
|---|---|
| **Preconditions** | Logged in; no open ride; driver online nearby (test driver device) |
| **Steps** | 1. Set pickup + destination<br>2. Accept terms if prompted<br>3. Tap Request ride |
| **Expected result** | Ride created; searching / waiting UI; API status `requested` |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — searching state |
| **Priority** | P0 |
| **Notes** | Ride ID: _________ |

---

### R-041 — Driver assigned

| | |
|---|---|
| **Preconditions** | R-040; driver accepts |
| **Steps** | 1. Driver accepts on driver device<br>2. Observe rider UI |
| **Expected result** | Driver name/photo/vehicle shown; status `driver_arriving` |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — assigned state |
| **Priority** | P0 |
| **Notes** | |

---

### R-042 — Driver arrived & pickup PIN

| | |
|---|---|
| **Preconditions** | Driver en route |
| **Steps** | 1. Driver marks arrived at pickup GPS<br>2. View rider PIN screen |
| **Expected result** | Status `driver_arrived`; pickup PIN visible to rider; driver must verify PIN |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — PIN / arrived UI |
| **Priority** | P0 |
| **Notes** | |

---

### R-043 — Trip in progress

| | |
|---|---|
| **Preconditions** | PIN verified; driver starts trip |
| **Steps** | 1. Driver starts ride<br>2. Observe rider tracker |
| **Expected result** | Status `in_progress`; timer/distance updates; cancel restricted |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — in progress |
| **Priority** | P0 |
| **Notes** | |

---

### R-044 — Trip completed

| | |
|---|---|
| **Preconditions** | Trip in progress |
| **Steps** | 1. Driver completes ride<br>2. Observe rider end-of-ride flow |
| **Expected result** | Status `completed`; fare shown; payment + rating prompts |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — completion screen |
| **Priority** | P0 |
| **Notes** | |

---

### R-045 — Cancel before accept

| | |
|---|---|
| **Preconditions** | New ride request; no driver assigned |
| **Steps** | 1. Request ride<br>2. Cancel from rider app |
| **Expected result** | Status `cancelled`; no charge or documented fee per policy |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P1 |
| **Notes** | |

---

### R-046 — Ride history

| | |
|---|---|
| **Preconditions** | At least one completed ride (R-044) |
| **Steps** | 1. Open ride history<br>2. Open latest trip detail |
| **Expected result** | Completed ride listed with fare, route summary, date |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — history entry |
| **Priority** | P1 |
| **Notes** | |

---

## A6 — Wallet & payments

### R-050 — View wallet balance

| | |
|---|---|
| **Preconditions** | Logged in |
| **Steps** | 1. Open Wallet from menu<br>2. View balance and currency (MRU) |
| **Expected result** | Balance loads; matches API `/payments/wallet/` |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — wallet screen |
| **Priority** | P1 |
| **Notes** | |

---

### R-051 — Pay with cash (default)

| | |
|---|---|
| **Preconditions** | Completed ride R-044 |
| **Steps** | 1. Select cash payment if prompted<br>2. Confirm |
| **Expected result** | Payment recorded; receipt/history updated |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — payment confirmation |
| **Priority** | P0 |
| **Notes** | |

---

### R-052 — Pay with wallet balance

| | |
|---|---|
| **Preconditions** | Wallet balance > ride fare |
| **Steps** | 1. Complete ride<br>2. Choose wallet payment |
| **Expected result** | Wallet debited; balance decreases; receipt shows wallet |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — wallet payment |
| **Priority** | P1 |
| **Notes** | |

---

### R-053 — Mobile money (Bankily / Masrvi / Seddad)

| | |
|---|---|
| **Preconditions** | Payment gateway configured in prod |
| **Steps** | 1. Select mobile money option<br>2. Complete provider flow (test mode if available) |
| **Expected result** | Redirect/confirm succeeds or clear error; no stuck spinner |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — provider screen |
| **Priority** | P1 |
| **Notes** | |

---

### R-054 — Rate driver after trip

| | |
|---|---|
| **Preconditions** | Completed ride |
| **Steps** | 1. Submit 5-star rating + optional comment<br>2. Confirm |
| **Expected result** | Thank-you confirmation; rating persisted in history |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P2 |
| **Notes** | |

---

## A7 — Background / foreground & lifecycle

### R-060 — Background during active ride

| | |
|---|---|
| **Preconditions** | Active ride (assigned or in progress) |
| **Steps** | 1. Press Home<br>2. Wait 60 s<br>3. Return via recents |
| **Expected result** | Ride state preserved; WebSocket/polling resumes; map not blank |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — after return to foreground |
| **Priority** | P0 |
| **Notes** | |

---

### R-061 — App restart during active ride

| | |
|---|---|
| **Preconditions** | Active ride on tracker |
| **Steps** | 1. Force-stop Rider app<br>2. Reopen app |
| **Expected result** | Active ride restored from `/rides/active/`; tracker resumes |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — restored tracker |
| **Priority** | P0 |
| **Notes** | |

---

### R-062 — Network interruption recovery

| | |
|---|---|
| **Preconditions** | Active ride |
| **Steps** | 1. Toggle Airplane mode 20 s mid-ride<br>2. Disable Airplane mode<br>3. Wait 30 s |
| **Expected result** | Reconnect without crash; status syncs; no duplicate requests |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P0 |
| **Notes** | |

---

### R-063 — Low memory / recents kill

| | |
|---|---|
| **Preconditions** | Active ride; open 4+ heavy apps |
| **Steps** | 1. Switch apps to pressure memory<br>2. Return to Rider |
| **Expected result** | App recovers or restores ride; no silent data loss |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P2 |
| **Notes** | |

---

## Rider summary

| Category | Tests | Pass | Fail | Blocked |
|----------|:-----:|:----:|:----:|:-------:|
| Login & session | 5 | | | |
| GPS | 4 | | | |
| Push | 4 | | | |
| Offline | 2 | | | |
| Ride flow | 7 | | | |
| Wallet & payments | 5 | | | |
| Lifecycle / network | 4 | | | |
| **Total** | **31** | | | |

**Rider sign-off:** Pass ☐ · Fail ☐ · Tester: _______________ Date: _______________

---

<div style="page-break-after: always;"></div>

# PART B — Yala Driver 1.2.23

**Package:** `com.yala.driver.mr` · **Version:** 1.2.23 (38)

---

## B1 — Login & session

### D-001 — Fresh install launch

| | |
|---|---|
| **Preconditions** | Driver app not installed |
| **Steps** | 1. Install Driver 1.2.23<br>2. Open app |
| **Expected result** | Login or registration; no crash |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### D-002 — Login approved driver

| | |
|---|---|
| **Preconditions** | Approved driver account; documents valid |
| **Steps** | 1. Enter credentials<br>2. Login |
| **Expected result** | Dashboard loads; profile status approved |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — dashboard |
| **Priority** | P0 |
| **Notes** | |

---

### D-003 — Rejected / pending driver blocked

| | |
|---|---|
| **Preconditions** | Pending or rejected test account (if available) |
| **Steps** | 1. Login with pending account |
| **Expected result** | Clear message; cannot go online |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

### D-004 — Session restore after force-stop

| | |
|---|---|
| **Preconditions** | D-002 passed |
| **Steps** | 1. Force-stop app<br>2. Reopen |
| **Expected result** | Still logged in; dashboard loads |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P0 |
| **Notes** | |

---

## B2 — Go online / offline & GPS

### D-010 — Go online

| | |
|---|---|
| **Preconditions** | Approved driver; terms signed; location permission granted |
| **Steps** | 1. Tap Go Online<br>2. Confirm availability toggle |
| **Expected result** | Status online; location streaming starts; eligible for offers |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — online indicator |
| **Priority** | P0 |
| **Notes** | |

---

### D-011 — Go offline

| | |
|---|---|
| **Preconditions** | Driver online; no active ride |
| **Steps** | 1. Tap Go Offline |
| **Expected result** | No new offers; toggle shows offline |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P1 |
| **Notes** | |

---

### D-012 — GPS location updates while online

| | |
|---|---|
| **Preconditions** | Driver online; move 50+ m or simulate location |
| **Steps** | 1. Walk/drive 1 min<br>2. Check admin/dispatch sees updated position (optional) |
| **Expected result** | App sends location; no “GPS unavailable” loop |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — map with driver pin |
| **Priority** | P0 |
| **Notes** | |

---

### D-013 — Arrive geofence at pickup

| | |
|---|---|
| **Preconditions** | Accepted ride; near pickup coordinates |
| **Steps** | 1. Navigate to pickup<br>2. Tap Arrived at pickup GPS |
| **Expected result** | Arrived succeeds at pickup; fails with clear message if too far |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — arrived success |
| **Priority** | P0 |
| **Notes** | |

---

## B3 — Push notifications

### D-020 — New ride offer push

| | |
|---|---|
| **Preconditions** | Driver online; notifications allowed; rider requests ride |
| **Steps** | 1. Background driver app<br>2. Rider requests ride |
| **Expected result** | Offer push + in-app offer modal/sound |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — offer notification |
| **Priority** | P0 |
| **Notes** | |

---

### D-021 — Ride cancelled by rider push

| | |
|---|---|
| **Preconditions** | Accepted ride |
| **Steps** | 1. Rider cancels<br>2. Observe driver notification |
| **Expected result** | Cancel push; driver returned to online idle |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## B4 — Offline mode

### D-030 — Offline while online

| | |
|---|---|
| **Preconditions** | Driver online |
| **Steps** | 1. Enable Airplane mode 30 s<br>2. Restore network |
| **Expected result** | Offline banner; auto-reconnect; online state recoverable |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — offline banner |
| **Priority** | P1 |
| **Notes** | |

---

### D-031 — Accept offer fails offline

| | |
|---|---|
| **Preconditions** | Ride offer visible; then Airplane mode |
| **Steps** | 1. Disable network<br>2. Tap Accept |
| **Expected result** | Error message; offer not partially accepted |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## B5 — Ride flow (end-to-end)

### D-040 — Receive & accept offer

| | |
|---|---|
| **Preconditions** | Driver online; rider requests (R-040) |
| **Steps** | 1. View offer<br>2. Tap Accept |
| **Expected result** | Ride assigned; navigation to pickup starts |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — accepted ride |
| **Priority** | P0 |
| **Notes** | Ride ID: _________ |

---

### D-041 — Decline / timeout offer

| | |
|---|---|
| **Preconditions** | New offer |
| **Steps** | 1. Tap Decline or wait for timeout |
| **Expected result** | Offer cleared; driver stays online; no stuck state |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P1 |
| **Notes** | |

---

### D-042 — Verify pickup PIN

| | |
|---|---|
| **Preconditions** | Arrived at pickup; rider sees PIN |
| **Steps** | 1. Enter correct PIN<br>2. Submit |
| **Expected result** | PIN verified; Start ride enabled |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — PIN verified |
| **Priority** | P0 |
| **Notes** | |

---

### D-043 — Start ride (without PIN blocked)

| | |
|---|---|
| **Preconditions** | Arrived but PIN **not** verified |
| **Steps** | 1. Tap Start ride |
| **Expected result** | Blocked with message to verify PIN first |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — blocked message |
| **Priority** | P0 |
| **Notes** | |

---

### D-044 — Start & complete ride

| | |
|---|---|
| **Preconditions** | PIN verified |
| **Steps** | 1. Start ride<br>2. Complete ride at destination |
| **Expected result** | Status `in_progress` → `completed`; earnings updated |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — completed |
| **Priority** | P0 |
| **Notes** | |

---

### D-045 — Cancel before trip starts

| | |
|---|---|
| **Preconditions** | Accepted, not yet in progress |
| **Steps** | 1. Cancel with reason |
| **Expected result** | Ride cancelled; penalty rules applied per policy |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P1 |
| **Notes** | |

---

### D-046 — Cancel blocked after trip starts

| | |
|---|---|
| **Preconditions** | Ride in progress |
| **Steps** | 1. Attempt cancel |
| **Expected result** | Blocked with clear message |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## B6 — Wallet, earnings & cash out

### D-050 — View wallet & earnings

| | |
|---|---|
| **Preconditions** | At least one completed ride |
| **Steps** | 1. Open Wallet / Earnings |
| **Expected result** | Balance matches API; last trip earning listed |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — wallet |
| **Priority** | P0 |
| **Notes** | |

---

### D-051 — Transaction history

| | |
|---|---|
| **Preconditions** | Completed rides / withdrawals |
| **Steps** | 1. Open transaction history |
| **Expected result** | Credits for trips; debits for withdrawals; correct dates |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

### D-052 — Request withdrawal (cash out)

| | |
|---|---|
| **Preconditions** | Wallet balance ≥ minimum withdrawal; bank/mobile money profile set |
| **Steps** | 1. Tap Withdraw / Cash out<br>2. Enter amount<br>3. Submit |
| **Expected result** | OTP or confirmation step; pending withdrawal created |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — withdrawal submitted |
| **Priority** | P0 |
| **Notes** | |

---

### D-053 — Withdrawal OTP verification

| | |
|---|---|
| **Preconditions** | D-052 initiated |
| **Steps** | 1. Enter OTP from SMS/app<br>2. Confirm |
| **Expected result** | Withdrawal status pending/approved; balance reserved |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — OTP screen |
| **Priority** | P0 |
| **Notes** | |

---

### D-054 — Withdrawal over balance rejected

| | |
|---|---|
| **Preconditions** | Known wallet balance |
| **Steps** | 1. Request amount > balance |
| **Expected result** | Validation error; no withdrawal created |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## B7 — Background / foreground & lifecycle

### D-060 — Background during active ride

| | |
|---|---|
| **Preconditions** | Active ride (accepted or in progress) |
| **Steps** | 1. Home button 60 s<br>2. Return to app |
| **Expected result** | Ride screen restored; GPS continues |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### D-061 — App restart during active ride

| | |
|---|---|
| **Preconditions** | Active ride |
| **Steps** | 1. Force-stop app<br>2. Reopen |
| **Expected result** | Active ride restored; can continue flow |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### D-062 — Network interruption mid-ride

| | |
|---|---|
| **Preconditions** | Active ride |
| **Steps** | 1. Airplane mode 20 s<br>2. Restore<br>3. Complete ride |
| **Expected result** | Sync recovers; complete ride succeeds |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P0 |
| **Notes** | |

---

## Driver summary

| Category | Tests | Pass | Fail | Blocked |
|----------|:-----:|:----:|:----:|:-------:|
| Login & session | 4 | | | |
| Online & GPS | 4 | | | |
| Push | 2 | | | |
| Offline | 2 | | | |
| Ride flow | 7 | | | |
| Wallet & cash out | 5 | | | |
| Lifecycle / network | 3 | | | |
| **Total** | **27** | | | |

**Driver sign-off:** Pass ☐ · Fail ☐ · Tester: _______________ Date: _______________

---

<div style="page-break-after: always;"></div>

# PART C — Yala Delivery 1.0.4

**Package:** `com.yala.delivery.mr` · **Version:** 1.0.4 (6)

---

## C1 — Login & session

### C-001 — Fresh install launch

| | |
|---|---|
| **Preconditions** | Delivery app not installed |
| **Steps** | 1. Install Delivery 1.0.4<br>2. Open app |
| **Expected result** | Login screen; no crash |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-002 — Login approved courier

| | |
|---|---|
| **Preconditions** | Approved courier / delivery driver account |
| **Steps** | 1. Login with credentials |
| **Expected result** | Home / dashboard loads |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-003 — Session restore

| | |
|---|---|
| **Preconditions** | Logged in |
| **Steps** | 1. Force-stop<br>2. Reopen |
| **Expected result** | Session persisted |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P0 |
| **Notes** | |

---

## C2 — Go online & GPS

### C-010 — Go online (delivery mode)

| | |
|---|---|
| **Preconditions** | Approved courier; location permission granted |
| **Steps** | 1. Toggle Go Online / Delivery mode |
| **Expected result** | Online; eligible for delivery offers |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — online state |
| **Priority** | P0 |
| **Notes** | |

---

### C-011 — GPS at pickup / delivery

| | |
|---|---|
| **Preconditions** | Active delivery |
| **Steps** | 1. Navigate to pickup<br>2. Confirm pickup at GPS<br>3. Navigate to drop-off |
| **Expected result** | Geofence validation; clear errors if too far |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** — pickup & delivered |
| **Priority** | P0 |
| **Notes** | |

---

## C3 — Push notifications

### C-020 — New delivery offer

| | |
|---|---|
| **Preconditions** | Courier online; test delivery created |
| **Steps** | 1. Background app<br>2. Trigger delivery assignment |
| **Expected result** | Push received; tap opens offer |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-021 — Delivery cancelled push

| | |
|---|---|
| **Preconditions** | Accepted delivery |
| **Steps** | 1. Cancel from sender/admin<br>2. Observe courier device |
| **Expected result** | Cancel notification; UI resets |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## C4 — Offline mode

### C-030 — Offline banner

| | |
|---|---|
| **Preconditions** | Logged in |
| **Steps** | 1. Airplane mode 30 s<br>2. Restore |
| **Expected result** | Offline indicator; sync on reconnect |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## C5 — Delivery flow (end-to-end)

### C-040 — Accept delivery

| | |
|---|---|
| **Preconditions** | Courier online; delivery order available |
| **Steps** | 1. View offer details<br>2. Accept |
| **Expected result** | Status accepted; pickup address shown |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | Delivery ID: _________ |

---

### C-041 — Confirm pickup

| | |
|---|---|
| **Preconditions** | Accepted delivery; at pickup location |
| **Steps** | 1. Tap Confirm pickup / Picked up |
| **Expected result** | Status → picked up / en route; timestamp recorded |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-042 — Confirm delivered

| | |
|---|---|
| **Preconditions** | En route to customer |
| **Steps** | 1. Arrive at drop-off GPS<br>2. Tap Delivered / Complete |
| **Expected result** | Status delivered; earnings credited |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-043 — Delivery history

| | |
|---|---|
| **Preconditions** | C-042 completed |
| **Steps** | 1. Open delivery history |
| **Expected result** | Completed delivery listed with fee and time |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## C6 — Wallet, payments & earnings

### C-050 — View earnings wallet

| | |
|---|---|
| **Preconditions** | Completed delivery |
| **Steps** | 1. Open Wallet / Earnings |
| **Expected result** | Balance increased by delivery fee |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-051 — Cash out / withdrawal

| | |
|---|---|
| **Preconditions** | Balance ≥ minimum; payout method configured |
| **Steps** | 1. Request withdrawal<br>2. Complete OTP if required |
| **Expected result** | Withdrawal pending; balance updated |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

### C-052 — COD / payment confirmation (if applicable)

| | |
|---|---|
| **Preconditions** | Cash-on-delivery order |
| **Steps** | 1. Complete delivery<br>2. Record payment collected |
| **Expected result** | Payment status updated; receipt in history |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P1 |
| **Notes** | |

---

## C7 — Background / foreground & lifecycle

### C-060 — Background during active delivery

| | |
|---|---|
| **Preconditions** | Active delivery |
| **Steps** | 1. Home 60 s<br>2. Return |
| **Expected result** | Delivery state preserved |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-061 — App restart during delivery

| | |
|---|---|
| **Preconditions** | Active delivery |
| **Steps** | 1. Force-stop<br>2. Reopen |
| **Expected result** | Active delivery restored |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **Yes** |
| **Priority** | P0 |
| **Notes** | |

---

### C-062 — Network interruption recovery

| | |
|---|---|
| **Preconditions** | Active delivery |
| **Steps** | 1. Airplane 20 s<br>2. Restore<br>3. Complete delivery |
| **Expected result** | No crash; complete succeeds |
| **Pass ☐ Fail ☐** | |
| **Screenshot** | **No** |
| **Priority** | P0 |
| **Notes** | |

---

## Delivery summary

| Category | Tests | Pass | Fail | Blocked |
|----------|:-----:|:----:|:----:|:-------:|
| Login & session | 3 | | | |
| Online & GPS | 2 | | | |
| Push | 2 | | | |
| Offline | 1 | | | |
| Delivery flow | 4 | | | |
| Wallet & payments | 3 | | | |
| Lifecycle / network | 3 | | | |
| **Total** | **18** | | | |

**Delivery sign-off:** Pass ☐ · Fail ☐ · Tester: _______________ Date: _______________

---

<div style="page-break-after: always;"></div>

# PART D — Cross-app paired test (recommended)

Run once with Rider + Driver devices together.

| ID | Test | Pass ☐ | Fail ☐ | Screenshot |
|----|------|:------:|:------:|:----------:|
| X-001 | Full ride: request → accept → arrive → PIN → start → complete | ☐ | ☐ | **Yes** |
| X-002 | Push notifications on both devices during X-001 | ☐ | ☐ | **Yes** |
| X-003 | Rider rates driver after X-001 | ☐ | ☐ | No |
| X-004 | Driver earnings + rider payment reflect same ride ID | ☐ | ☐ | **Yes** |

---

# Final certification

| App | Version | Total tests | Pass | Fail | P0 failures | Certified? |
|-----|---------|:-----------:|:----:|:----:|:-----------:|:----------:|
| Rider | 1.2.7 | 31 | | | | ☐ Yes ☐ No |
| Driver | 1.2.23 | 27 | | | | ☐ Yes ☐ No |
| Delivery | 1.0.4 | 18 | | | | ☐ Yes ☐ No |

**Overall verdict:** ☐ **PASS** (all P0 pass, ≤2 P1 open with waiver) · ☐ **FAIL**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Mobile Engineering | | | |
| Product / Launch | | | |

**Launch impact:** Unsigned physical QA remains **P0 blocker** for commercial launch per RC2 certification.

---

*Document: `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`*  
*Bug template: `release/physical-device-qa/BUG_REPORT_TEMPLATE.md`*  
*Print tip: Export to PDF from browser (Ctrl+P) with headers/footers off for clean pages.*
