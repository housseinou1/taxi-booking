# YALA RC4 — Production Certification Report

**Date:** 2026-07-07  
**API:** `https://api.yalataxi.live`  
**Method:** Production API smoke (`platform-rc1-smoke.py`), targeted probes, prior device QA (RC1–RC3), code/artifact audit  
**Scope:** Verification only — no feature development, no UI redesign  

---

## Executive Summary

| Module | Verdict |
|--------|---------|
| **1. Rider** | **FAIL** |
| **2. Driver** | **FAIL** |
| **3. Delivery** | **FAIL** |
| **4. Admin** | **FAIL** |
| **5. Security** | **PARTIAL PASS** |
| **6. Performance** | **FAIL** |
| **7. Play Store Readiness** | **FAIL** |
| **Overall RC4** | **FAIL** |

---

## Git Commit IDs

| Commit | Description |
|--------|-------------|
| `e5ef9958` | fix(rc3): rider cancellation cleanup, Other reason textarea, driver notice colors |
| `10c905a1` | fix(rides): complete_ride enforces in_progress status guard |
| `97142936` | fix(driver): waiting fee MRU, offer expiry UI-only dismiss |
| `a4bac440` | Fix driver RC bugs: arrive distance gate, offer expiry API, stale ride state |
| `fcc020f6` | Finish driver PIN verify flow; bump driver app to 1.2.5 |

**HEAD:** `e5ef995815a5d019210cec9d5f134ad47048f081`

---

## App Versions (build.gradle)

| App | versionCode | versionName | Package |
|-----|-------------|-------------|---------|
| **Rider** | 15 | 1.2.3 | `com.yala.rider.mr` |
| **Driver** | 20 | 1.2.5 | `com.yala.driver.mr` |
| **Delivery** | 6 | 1.0.4 | `com.yala.delivery.mr` |
| **Admin** | 1 | 1.0.0 | `com.yala.admin.mr` |

### Signed AAB artifacts (release/android/)

| App | Latest AAB | Matches build.gradle? |
|-----|------------|----------------------|
| Rider | `yala-rider-1.2.3-15-20260706-204634.aab` | **YES** |
| Driver | `yala-driver-1.2.4-19-20260706-204634.aab` | **NO** — gradle is 1.2.5 / 20, no 1.2.5 AAB built |
| Delivery | `yala-delivery-1.0.4-6-20260706-204634.aab` | **YES** |
| Admin | No release AAB found | **NO** |

---

# 1. Rider — **FAIL**

| Check | Result | Evidence |
|-------|--------|----------|
| Registration | **FAIL** | UI present; full prod registration not certified E2E |
| Login | **PASS** | API + device (`qa-rider-profile-fix@test.local`) |
| Session restore | **PARTIAL** | JWT restore works; **active ride restore broken** — `GET /rides/active/` → **404 on prod** |
| Request ride | **PASS** | Smoke: HTTP 201, ride #30 |
| Driver assignment | **PASS** | `accepted` → `driver_arriving` |
| Live tracking | **PARTIAL** | WS + poll wired; not fully certified on device |
| Driver photo | **PARTIAL** | `RideTracker` renders photo URL; not device-verified |
| Vehicle photo | **PARTIAL** | Field wired; not device-verified |
| ETA updates | **PARTIAL** | WS ETA in `RideTracker`; not device-verified |
| PIN display | **FAIL** | API returns PIN (`6712****`); device RC1 showed home map during `driver_arrived` (missing active endpoint) |
| Chat | **PARTIAL** | `RideChat` integrated; prod E2E not certified |
| Call | **PASS** | `tel:` link in `RideTracker` when driver phone present |
| Share trip | **PARTIAL** | Safety/share panel wired; prod E2E not certified |
| SOS | **PARTIAL** | SOS opens `SafetyEmergencyPanel`; prod E2E not certified |
| Cancel ride | **PASS** | API cancel works; RC3 cleanup in `e5ef9958` (needs fresh APK) |
| Rating | **PASS** | Smoke: HTTP 200 post-complete |
| Tip | **PARTIAL** | `PostRidePayRate` tip UI; prod payment E2E not certified |
| Receipt | **PARTIAL** | Payment status in history API; receipt UI not certified |
| Ride history | **PASS** | `/rides/history/` updated after complete |

### No cached ride state after cancel / timeout / completion

| Scenario | Result | Evidence |
|----------|--------|----------|
| After **cancel** | **PARTIAL** | RC3: `RIDE_CANCELLED`, WS leave, toast — **not on installed device APK** |
| After **timeout** | **FAIL** | No prod E2E; active endpoint 404 prevents reliable restore/clear |
| After **completion** | **PARTIAL** | API completes; smoke notes active endpoint 404; client may retain stale state |

---

# 2. Driver — **FAIL**

| Check | Result | Evidence |
|-------|--------|----------|
| Login | **PASS** | API + device |
| Go Online | **PASS** | Availability toggle <5s in smoke; device RC1 PASS |
| Go Offline | **PASS** | Device RC1 PASS |
| Receive request | **PASS** | Offer sheet with fare/route |
| 30-second timer | **PASS** | Device RC1: countdown + dismiss |
| Missed ride | **PASS*** | Fixed in `97142936`; **needs APK 1.2.5 rebuild** |
| Acceptance rate | **PASS** | Shown on dashboard |
| Driver score | **PASS** | Level/rating on profile |
| PIN verification | **PASS** | Smoke 13/13 flow; device PIN UI renders |
| Start Ride | **PASS** | API `in_progress` after PIN |
| Complete Ride | **PASS** | API `completed` |
| Waiting fee | **PASS*** | MRU fix in `97142936`; needs rebuild |
| Earnings | **PASS** | Smoke: 1218 → 1470 MRU |
| Wallet | **PARTIAL** | Earnings chip; full wallet E2E not certified |
| Ride history | **PASS** | `/drivers/me/rides/` |
| Logout | **PASS** | Device RC1 + `clearAuthSession` |

### Stability

| Check | Result | Evidence |
|-------|--------|----------|
| No crashes | **PARTIAL** | No crash in scripted QA; not soak-tested |
| No freezes | **PARTIAL** | RC3 fixed stuck "Updating..." in source |
| No infinite loading | **PARTIAL** | API timeouts OK; UI loops not exhaustively tested |
| No duplicate ride requests | **PASS** | Idempotent complete/confirm in smoke |

---

# 3. Delivery — **FAIL**

| Check | Result | Evidence |
|-------|--------|----------|
| Merchant order | **FAIL** | Not certified on prod |
| Driver assignment | **FAIL** | Blocked — cannot create delivery |
| Pickup PIN | **FAIL** | E2E blocked |
| Delivery PIN | **FAIL** | E2E blocked |
| Proof photo | **FAIL** | Upload validation exists (security PASS) but flow not run |
| Complete delivery | **FAIL** | Smoke: **HTTP 403** — "Verify your phone number before requesting a delivery" |
| Wallet | **FAIL** | Not certified |
| Earnings | **FAIL** | Not certified |

**Note:** Customer + courier login PASS; courier profile loads. QA rider account is **not phone-verified** on production.

---

# 4. Admin — **FAIL**

| Check | Result | Evidence |
|-------|--------|----------|
| Admin login | **FAIL** | `sakho@admin.mr` → **401** on prod; alternate admin emails also fail |
| Dashboard | **FAIL** | Blocked by login |
| Live rides | **FAIL** | Blocked by login |
| Driver approval | **PARTIAL** | Code + API exist (`POST /drivers/approve/`); not live-tested |
| Rider management | **PARTIAL** | Code audit PASS; not live-tested |
| Earnings | **PARTIAL** | Analytics endpoints exist; not live-tested |
| Reports | **PARTIAL** | `AnalyticsDashboard` wired; not live-tested |
| Cancellation analytics | **PARTIAL** | Backend analytics exist; not live-tested |
| Security logs | **PARTIAL** | `/security/admin/audit-logs/` in code; not live-tested |

---

# 5. Security — **PARTIAL PASS**

| Check | Result | Evidence |
|-------|--------|----------|
| JWT | **PASS** | Login returns access + refresh |
| Token refresh | **PASS** | Smoke: HTTP 200 |
| Session expiration | **PARTIAL** | Refresh wired; expiry UX not soak-tested |
| Secure storage | **PARTIAL** | JWT in `localStorage` (Capacitor standard); no hardware keystore for tokens |
| HTTPS | **PASS** | API on `https://`; HTTP redirects/blocks |
| WSS | **PARTIAL** | Prod URL `wss://api.yalataxi.live/ws/rides/`; automated WSS auth test skipped (no `websocket-client`) |
| Rate limiting | **PASS** | Login abuse returns 429 (observed during QA) |
| Upload validation | **PASS** | Bad file type → HTTP 403 |
| PIN lockout | **PASS** | Wrong PIN rejected; `pin_lockout_retry` in `abuse.py` |
| Fraud detection | **PARTIAL** | `fraud_service`, admin fraud endpoints exist; not E2E certified |

---

# 6. Performance — **FAIL**

| Check | Result | Evidence |
|-------|--------|----------|
| Cold launch | **NOT TESTED** | No benchmark data |
| Warm launch | **NOT TESTED** | — |
| Background restore | **PARTIAL** | Driver foreground refresh PASS; rider not certified |
| GPS recovery | **PARTIAL** | Driver ADB toggle only |
| Offline recovery | **PARTIAL** | Airplane mode toggle only |
| Weak network | **NOT TESTED** | — |
| Memory usage | **NOT TESTED** | — |
| Battery usage | **NOT TESTED** | — |
| WebSocket reconnect | **PARTIAL** | Reconnect logic in `wsService.js`; not soak-tested |

---

# 7. Play Store Readiness — **FAIL**

| Check | Result | Evidence |
|-------|--------|----------|
| Signed AAB | **PARTIAL** | Rider 1.2.3 + Delivery 1.0.4 AABs exist; **Driver 1.2.5 AAB missing**; Admin AAB missing |
| Release keystore | **PASS** | `yala-release.keystore` + env-based signing in `build.gradle` |
| VersionCode | **PASS** | Defined per app (see table above) |
| VersionName | **PASS** | Semantic versions in gradle |
| Play Integrity | **NOT TESTED** | No attestation run |
| Google Maps key | **FAIL** | Bundle embeds `your_google_maps_browser_key` placeholder |
| Privacy policy | **PASS** | `https://yalataxi.live/privacy-policy` → HTTP 200 |
| Account deletion | **PASS** | `https://yalataxi.live/account-deletion` → HTTP 200 |
| Crash-free startup | **PARTIAL** | Device launches; no Crashlytics soak report |
| No debug logs | **FAIL** | `console.log` remains in production bundles (e.g. driver dashboard) |
| No localhost | **PASS** | Prod builds use `https://api.yalataxi.live` (`isDev=false`) |
| No HTTP | **PASS** | API/WSS use HTTPS/WSS in prod config |

**Additional blockers:** Stripe publishable key in bundle is `pk_test_*` (test mode).

---

# Remaining Blockers (all)

1. **`GET /rides/active/` returns 404 on production** — rider session restore and PIN screen reliability broken.
2. **Backend not fully deployed** — RC3/RC2 fixes may not be on prod; active ride route missing.
3. **Admin account not provisioned on prod** — `sakho@admin.mr` 401; entire admin module untestable.
4. **Delivery E2E blocked** — QA rider phone not verified (403).
5. **Driver AAB 1.2.5 (versionCode 20) not built** — latest artifact is 1.2.4-19; RC3 driver fixes not in store bundle.
6. **Device QA incomplete** — Rider PIN on device, tip/receipt/chat/share/SOS not certified E2E.
7. **Google Maps API key is placeholder** — maps may fail in production Google Maps views.
8. **Stripe test key in production bundle** — card payments not production-ready.
9. **Performance certification not executed** — cold/warm launch, memory, battery, weak network.
10. **WSS auth not automated** — manual verification still required.
11. **Admin app has no release AAB** — not submission-ready.
12. **Debug `console.log` in shipped JS** — Play review / quality concern.
13. **Password reset** — prod timeout reported in RC1 (SMTP); not re-certified PASS.
14. **Play Integrity / crash-free metrics** — not measured.

---

# API Smoke Summary (2026-07-07)

**32 / 34 checks PASS** — `scripts/platform-rc1-smoke.py`

- Taxi full lifecycle: **PASS** (request → accept → PIN → start → complete → rate → pay)
- Delivery request: **FAIL** (403 phone verify)
- Admin login: **FAIL** (401)
- Stale active ride: **FAIL** (404 — endpoint not deployed)

---

# Is Yala ready for Google Play release?

## **NO**
