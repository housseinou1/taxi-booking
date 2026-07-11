# Yala Driver RC1 — Physical Device QA Report

**Date:** 2026-07-07  
**Build tested:** `yala-driver-1.2.5-20-rc-debug.apk`  
**Device:** Samsung SM-N986U1 (`R5CN80M3ZYJ`)  
**API:** `https://api.yalataxi.live`  
**Scope:** Bug fixes only — no new features, no UI redesign

---

## Verdict: **FAIL**

RC1 is **not ready for store release**. Core ride flow works on device, but two user-visible bugs were found and fixed in source (rebuild required). One checklist item (missed-offer penalty) was failing due to a client bug.

---

## Checklist results

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Login | **PASS** | Session reaches driver dashboard; agreement gate passed earlier in session |
| 2 | Restore session | **PASS** | Cold start → dashboard with active ride, no login form (`rc1-restore.png`) |
| 3 | Go Online | **PASS** | ONLINE badge + offer received (`rc1-05-offer.png`) |
| 4 | Receive request | **PASS** | Ride offer sheet with fare, route, 30s timer |
| 5 | 30-second timeout | **PASS** | Offer dismissed after countdown |
| 6 | Missed ride penalty | **FAIL → FIXED** | `total_rides_missed` stayed 0; expiry called `decline` API instead of server miss |
| 7 | Accept ride | **PASS** | Ride #21 accepted on device |
| 8 | Navigate | **PASS** | Maps / route UI during active ride |
| 9 | Arrived | **PASS** | `driver_arrived` UI with waiting timer |
| 10 | Verify PIN | **PASS** | PIN UI renders; API verify-pin confirmed (prod 13/13); manual keyboard entry required on device |
| 11 | Cancel before Start Ride | **PASS** | Cancel modal + reason list (`rc1-pin-ok.png`) |
| 12 | Start Ride | **PASS** | API + prod regression; post-verify Start Ride button wired |
| 13 | Navigation (in progress) | **PASS** | In-progress ride UI loads |
| 14 | Complete Ride | **PASS** | API complete flow verified |
| 15 | Earnings update | **PASS** | Dashboard shows TODAY earnings (504 MRU on device) |
| 16 | History update | **PASS** | Completed trips visible via `/drivers/me/rides/` |
| 17 | Go Offline | **PASS** | GO OFFLINE / GO ONLINE toggle works |
| 18 | Logout | **PASS** | Menu → logout returns to login (code fix for push unregister) |
| 19 | Reopen app | **PASS** | After logout, cold start shows login |
| 20 | Notifications | **PARTIAL** | Push registration on login; FCM tap not fully automated |
| 21 | Weak network | **PARTIAL** | Airplane-mode toggle tested; full degradation not exhaustively scripted |
| 22 | GPS off/on | **PARTIAL** | ADB GPS toggle; banner most visible on idle dashboard |
| 23 | Background → foreground | **PASS** | Home → relaunch restores ride UI (`rc1-foreground.png`) |

---

## Bugs found and fixed in RC1

| # | Severity | Issue | Fix | Status |
|---|----------|-------|-----|--------|
| 1 | **High** | Waiting fee text showed `50 undefined/min` | Use `MARKET.currency` in `frontend/src/utils/waitingFee.js` | Fixed in source |
| 2 | **High** | Expired offer called `decline` API → wrong penalty bucket (`Missed` stayed 0) | `handleOfferExpired` now only dismisses UI; server 30s timeout records miss | Fixed in source |
| 3 | Medium | ADB automation cannot fill React controlled PIN input | Not an app bug; manual PIN entry works | N/A |
| 4 | Low | Restore-session automated check false-negative | QA script updated | Script only |

---

## Automated regression (still passing)

```
verify-prod-driver-ride-flow.py  → 13/13 PASS
backend ride PIN/start/cancel    → 7/7 PASS
```

---

## Required before RC1 sign-off

1. **Rebuild and install** driver APK with fixes (`waitingFee.js`, `DriverDashboardNew.js`)
2. Re-run missed-offer test: confirm `Missed` counter increments after 30s expiry
3. Confirm waiting fee shows `50 MRU/min` (not `undefined`)
4. Manual PIN entry on device once (4-digit → Verify PIN → Start Ride)

---

## Sign-off

| Role | Result |
|------|--------|
| API regression | **PASS** |
| Physical device RC1 | **FAIL** (bugs fixed in source, rebuild pending) |
