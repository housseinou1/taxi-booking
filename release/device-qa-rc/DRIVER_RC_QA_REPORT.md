# Yala Driver — Release Candidate QA Report

**Date:** 2026-07-07  
**Build:** `yala-driver-1.2.5-20-rc-debug.apk`  
**API:** `https://api.yalataxi.live`  
**Scope:** Bug fixes only (no features, no UI redesign, no refactoring)

---

## Executive summary

| Layer | Result | Notes |
|-------|--------|-------|
| Production API (ride-state) | **PASS** | 13/13 automated checks |
| Backend unit tests | **PASS** | 7/7 ride PIN/start/cancel tests |
| Frontend unit tests | **PASS** | RideStatusButtons + ActionPanel (49 tests) |
| Physical device E2E | **BLOCKED** | No Android device connected via ADB |

**RC verdict: CONDITIONAL PASS** — API and automated regression pass; full device checklist requires physical QA on connected hardware before store release.

---

## Bugs fixed in this RC (pre-device)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | Critical | Driver could mark Arrived without GPS distance | Pass `distanceToNextKm` from dashboard; require reliable distance in `RideStatusButtons` |
| 2 | Critical | Expired offer skipped decline/miss API | `handleOfferExpired` now calls `declineRide` (server miss recorded) |
| 3 | Critical | Stale ghost active ride after cancel/complete | Clear snapshot on terminal states; stop keeping empty API responses |
| 4 | High | Double accept on auto-accept / rapid tap | `acceptingRideId` guard + optimistic offer removal |
| 5 | High | Accept button allowed double-tap | `accepting` state on `RideRequestCard` |
| 6 | High | Go Online skipped agreement gate | `ensureDriverAgreementBeforeOnline` before toggle |
| 7 | High | Unapproved drivers could go online | Block toggle when `status !== approved` |
| 8 | High | Ride actions used raw JWT (no refresh) | `RideStatusButtons` uses `authenticatedApi` |
| 9 | Medium | GPS denied silently snapped to default | Red banner when location unavailable |
| 10 | Medium | No refresh after background/foreground | `visibilitychange` + Capacitor `appStateChange` refresh |
| 11 | Medium | Logout left push token registered | `unregisterPushNotifications` on driver logout |

---

## Checklist — device QA (pending hardware)

| # | Test | Status | Evidence |
|---|------|--------|----------|
| 1 | Login | **PENDING** | Requires ADB device |
| 2 | Restore session | **PENDING** | Requires ADB device |
| 3 | Go Online | **PENDING** | API + code review PASS |
| 4 | Receive request | **PENDING** | WebSocket + offer card wired |
| 5 | Countdown expires | **FIXED** | Decline API on expiry (code) |
| 6 | Missed ride penalty | **PENDING** | Decline API now called on expiry |
| 7 | Accept ride | **FIXED** | Double-tap guard (code) |
| 8 | Navigate to rider | **PENDING** | External maps links in RideStatusButtons |
| 9 | Arrived | **FIXED** | Distance gate (code) |
| 10 | Verify PIN | **PASS** | API 13/13 |
| 11 | Cancel before Start Ride | **PASS** | API 13/13 |
| 12 | Start Ride | **PASS** | API 13/13 |
| 13 | Live navigation | **PENDING** | Device test |
| 14 | Complete Ride | **PENDING** | Device test |
| 15 | Rider rating | **PENDING** | Rider-side flow |
| 16 | Earnings updated | **PENDING** | Device test |
| 17 | Go Offline | **PENDING** | Device test |
| 18 | Logout | **FIXED** | Push unregister (code) |
| 19 | Restart app | **PENDING** | Session restore via `restoreAuthSession` |
| 20 | Login restore | **PENDING** | Device test |
| 21 | Background/foreground | **FIXED** | Resume refresh hook (code) |
| 22 | Weak network | **PENDING** | Device test |
| 23 | Offline recovery | **PENDING** | Device test |
| 24 | GPS disabled | **FIXED** | Banner + arrive blocked without distance |
| 25 | Notification tap | **PENDING** | Opens `/driver` (ride_id deep-link not yet wired) |
| 26 | Incoming ride while backgrounded | **PENDING** | Device test |

---

## UX stability checks

| Check | Status |
|-------|--------|
| No freezes | **PENDING** (device) |
| No double taps required | **FIXED** (accept guard) |
| No loading loops | **FIXED** (toggle watchdog + stale ride clear) |
| No overlapping banners | **IMPROVED** (GPS banner offset) |
| No clipped dialogs | **PENDING** (device) |
| No invisible buttons | **IMPROVED** (nav sheet auto-expands on active ride) |
| No stale ride states | **FIXED** (snapshot reconciliation) |
| No crashes | **PENDING** (device) |

---

## Automated regression (executed)

```
verify-prod-driver-ride-flow.py  → 13/13 PASS
backend ride tests               → 7/7 PASS
RideStatusButtons.test.js        → PASS
ActionPanel.test.js              → PASS
```

---

## Install RC build on device

```powershell
adb install -r release\device-qa-rc\yala-driver-1.2.5-20-rc-debug.apk
python scripts\device-qa-driver-pin-flow.py
```

**QA accounts:** `qa-driver-final-qa@test.local` / `QaDriverFinal!2026`

---

## Remaining before store AAB

1. Connect physical Android device and complete checklist rows marked PENDING
2. Deploy RC frontend fixes to production (`git pull` + frontend build on server)
3. Optional: notification deep-link to specific `ride_id` on tap
4. Bump to `1.2.6` and build signed AAB after device sign-off

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| API QA | Automated | 2026-07-07 | PASS |
| Device QA | — | — | BLOCKED (no device) |
| RC approval | — | — | Conditional |
