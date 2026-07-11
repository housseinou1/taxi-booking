# YALA RC3 Stabilization Report

**Date:** 2026-07-07  
**Scope:** Bug fixes only — no new features, no UI redesign  
**Verdict:** **FAIL** (code fixes applied locally; production deploy + device QA incomplete)

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| 1. Rider cancellation cleanup | **FIXED (source)** | WS leave, polling stops, idle home, "Ride cancelled" toast |
| 2. Rider cancel "Other" reason | **FIXED (source)** | 10-char min, label + placeholder per spec |
| 3. Driver stability | **FIXED (source)** | Green online toast, toggle stuck fix, doc dot logic |
| 4. Ride state sync | **FIXED (source)** | Immediate terminal clear on rider + driver |
| 5. Full QA | **PARTIAL** | API smoke 32/34; device E2E not re-run this pass |

---

## Bugs Fixed (this RC3 pass)

### Rider
- **`RiderHome.js`**: On cancel/WS cancel/poll-detected cancel — `leaveRideGroup`, clear `selectedRideId`, dispatch `RIDE_CANCELLED`, show **"Ride cancelled"** toast (5s).
- **`RiderHome.js`**: When active ride disappears, resolve terminal status via `getRideById` (cancel vs complete vs reset).
- **`RideTracker.js`**: Call `wsService.leaveRideGroup` before cancel API; align "Other" copy to spec.

### Driver
- **`DriverDashboardNew.js`**: Online success uses **green** banner (`onlineNotice`), not red error banner.
- **`DriverDashboardNew.js`**: `finishToggle()` on prep-error path — prevents stuck **"Updating..."**.
- **`DriverDashboardNew.js`**: Terminal rides (`cancelled`/`completed`) clear `activeRideSnapshotRef` immediately; WS routes through `handleRideStatusChange`.
- **`documentReview.js`**: `driverNeedsDocumentAlert()` — red dot only for missing/rejected/expired, not "under review".

---

## Commit IDs

RC3 fixes are **uncommitted** (working tree). Latest committed HEAD:

| Commit | Message |
|--------|---------|
| `10c905a1` | fix(rides): complete_ride now enforces in_progress status guard |
| `97142936` | fix(driver): waiting fee MRU, offer expiry UI-only dismiss |
| `a4bac440` | Fix driver RC bugs: arrive distance gate, offer expiry API, stale ride state |
| `fcc020f6` | Finish driver PIN verify flow; bump driver app to 1.2.5 |

**RC3 commit:** _pending user request to commit_

---

## APK / AAB Versions (build.gradle)

| App | versionCode | versionName | Package |
|-----|-------------|-------------|---------|
| Rider | 15 | 1.2.3 | com.yala.rider.mr |
| Driver | 20 | 1.2.5 | com.yala.driver.mr |
| Delivery | 6 | 1.0.4 | com.yala.delivery.mr |

**Note:** `www/` bundles updated locally (`main.0fdc8d72.js` rider, `main.35cd6378.js` driver) but Gradle APK/AAB rebuild blocked by `JAVA_HOME` on this machine. Install fresh builds on device before RC3 sign-off.

---

## QA Results

### Unit tests (targeted)
- `RideTracker.test.js` — pass after `leaveRideGroup` mock fix
- `RideContext.property.test.js` — pass

### API smoke (`scripts/platform-rc1-smoke.py`) — **32/34 PASS**

| Flow | Result |
|------|--------|
| Rider request / accept / PIN / start / complete / rate | **PASS** |
| Driver earnings update | **PASS** |
| Delivery request | **FAIL** — 403 phone not verified on prod |
| Admin dashboard login | **FAIL** — `sakho@admin.mr` 401 on prod |
| `GET /rides/active/` after complete | 404 on prod (endpoint not deployed) |

### Device E2E (not re-run RC3)
Prior RC1 device QA blockers still apply: outdated APKs, prod backend not deployed, rider PIN screen intermittent on device.

---

## Remaining Blockers

1. **Deploy backend** — `/rides/active/`, password-reset async, admin account on prod.
2. **Rebuild & install APKs** — `JAVA_HOME` + cap sync + Gradle release build.
3. **Prod delivery QA** — verify rider phone for delivery test account.
4. **Prod admin** — run `create_admin.py` or equivalent for `sakho@admin.mr`.
5. **Device confirmation** — rider cancel cleanup, driver online toast color, ride clear on both sides (needs fresh APK on SM_N986U1).

---

## Files Changed (RC3)

- `frontend/src/rider/components/RiderHome.js`
- `frontend/src/rider/components/RiderHome.css`
- `frontend/src/rider/components/RideTracker.js`
- `frontend/src/rider/components/RideTracker.test.js`
- `frontend/src/driver/DriverDashboardNew.js`
- `frontend/src/driver/utils/documentReview.js`
