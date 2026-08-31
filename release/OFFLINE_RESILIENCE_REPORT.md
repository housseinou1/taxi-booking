# YALA Enterprise v1.0 — Offline Resilience & Network Recovery Report

**Document ID:** YALA-REL-OFFLINE-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0 Release Candidate  
**Scope:** Network detection, request retry, local queue, maps, WebSocket recovery, push notifications  
**Rule:** No new business features; reliability and UX improvements only.

---

## Executive Summary

| Part | Status | Notes |
|------|:------:|-------|
| 1 — Network detection | **IMPROVED** | Global banner added; delivery had prior coverage |
| 2 — Request retry | **PARTIAL** | Auth refresh + URL failover; withdrawal idempotency extended |
| 3 — Local queue | **NOT IMPLEMENTED** | No offline mutation queue (documented gap) |
| 4 — Maps | **IMPROVED** | Rider tile-error fallback added; GPS fallbacks exist |
| 5 — WebSocket recovery | **STRONG** | Backoff reconnect + active ride polling all apps |
| 6 — Push notifications | **PARTIAL** | FCM wired; missed-push reconciliation via polling |

### Recommendation

**READY WITH CONDITIONS** — safe for **closed beta** on real mobile networks.

| Tier | Verdict |
|------|---------|
| Closed beta (≤25 users) | **READY WITH CONDITIONS** |
| Public launch | **NOT READY** |

**Conditions:**

1. Physical device QA on flaky-network scenarios (airplane mode, tunnel, 2G throttle).
2. Deploy frontend build containing sprint fixes (network banner, map tile message, payout idempotency).
3. Accept that ride/delivery POST endpoints lack idempotency keys until v1.1.
4. No offline action queue — users must retry manually when back online.

---

## Tests Performed

| Test | Method | Result |
|------|--------|:------:|
| Code audit — network detection | Static analysis across `frontend/src/` | Documented per app |
| Code audit — retry/idempotency | Static analysis `authenticatedApi.js`, `payments/` | Documented |
| Code audit — WebSocket reconnect | Review `socket.js`, `useDriverWebSocket.js`, `wsService.js` | PASS (design) |
| Code audit — push routing | Review `native/push.js`, `App.js` init | PASS (design) |
| Code audit — map/GPS fallbacks | Review `MapView`, `DriverDashboardNew`, `native/location.js` | PARTIAL |
| Backend open-ride guard | `taxi/rides/views.py` duplicate prevention | PASS |
| Withdrawal idempotency | `payments/withdrawal_service.py` + unique constraint | PASS |
| Production API health | `GET /api/health/ready/` | PASS (prior session) |
| Live device network QA | Physical device | **NOT EXECUTED** (no device attached) |

---

## Issues Fixed (This Sprint)

| # | Fix | File(s) | Part |
|---|-----|---------|------|
| 1 | **Global network status banner** — offline, slow connection, connection restored | `hooks/useNetworkStatus.js`, `components/NetworkStatusBanner.js`, `App.js` | 1 |
| 2 | **Wired unused offline ride cache** on driver dashboard with stale-data banner | `driver/hooks/useOfflineCache.js` → `DriverDashboardNew.js` | 3 (read cache) |
| 3 | **Withdrawal idempotency** on legacy payout panel (prevent duplicate payouts on retry) | `driver/components/DriverPayoutPanel.js` | 2 |
| 4 | **Map tile unavailable message** when OSM tiles fail to load | `rider/components/MapView.js`, `MapView.css` | 4 |

---

## Part 1 — Network Detection

### Before sprint

| App | Offline detect | Slow connection | Restored message | Banner |
|-----|:--------------:|:---------------:|:----------------:|:------:|
| Rider | ❌ | ❌ | ❌ | ❌ |
| Driver | ❌ (prod dashboard) | ❌ | ❌ | CSS only, unused |
| Delivery courier | ⚠ `navigator.onLine` on errors | ❌ | ✅ toast | ❌ |
| Admin | ❌ | ❌ | ❌ | N/A (web) |

### After sprint

| App | Offline detect | Slow connection | Restored message |
|-----|:--------------:|:---------------:|:----------------:|
| All native apps | ✅ `online`/`offline` events | ✅ `navigator.connection` when available | ✅ 4s green banner |

**Implementation:** `NetworkStatusBanner` mounted in `App.js` `withInstall()` for all non-web app types.

**Remaining gaps:**

- `@capacitor/network` not integrated (browser events only — adequate for WebView)
- No persistent top banner on delivery (uses toasts + global banner now)
- Admin web has no network banner (acceptable for v1.0 web-only admin)

---

## Part 2 — Request Retry & Safe Behavior

### Critical API audit

| API | UI duplicate guard | Backend guard | Idempotency key | Retry on network fail |
|-----|:------------------:|:-------------:|:---------------:|:---------------------:|
| Ride booking (`POST /rides/request/`) | ✅ `BookingConfirmation` ref | ✅ One open ride per rider | ❌ | ❌ (user must retry) |
| Ride acceptance | ✅ `acceptingRideIdRef` | ✅ `select_for_update` | ❌ | ❌ |
| Ride completion | ✅ Status guards | ✅ State machine | ❌ | ❌ |
| Delivery status updates | ✅ `actionLockRef` | ✅ Assignment locks | ❌ | ❌ |
| Withdrawals | ✅ `withdrawing` state | ✅ Key + pending check | ✅ **Fixed on PayoutPanel** | Auth 401 retry only |
| Maintenance requests | N/A | N/A | N/A | Real Estate N/A v1.0 |
| Rent collection | N/A | N/A | N/A | Real Estate N/A v1.0 |

### Retry infrastructure

| Layer | Behavior | File |
|-------|----------|------|
| Auth 401 retry | Single retry after token refresh | `auth/authenticatedApi.js` |
| API URL failover | Next candidate on network/502/503/504/429 | `apiFallback.js` |
| Delivery fetch 401 | Single refresh retry | `delivery/DeliveryShared.js` |
| Driver earnings load | Up to 3 retries with backoff | `driver/DriverEarnings.js` |
| WebSocket reconnect | Exponential backoff | `socket.js`, `wsService.js`, delivery hooks |

**Not implemented:** Generic HTTP retry on transient network errors for ride/delivery POST.

---

## Part 3 — Local Queue

### Status: **NOT IMPLEMENTED**

No persisted offline mutation queue exists. Failed POST requests are **not** automatically replayed on reconnect.

### What exists instead

| Mechanism | Scope | Persists across reload? |
|-----------|-------|:----------------------:|
| `useOfflineCache` | Active ride JSON read cache | ✅ localStorage |
| WS `pendingMessages[]` | In-flight WS messages | ❌ memory only |
| Service worker | GET/app-shell cache only | N/A |
| Session offline fallback | Cached user profile | ✅ |

### Recommendation (v1.1)

Implement a minimal `localStorage` outbox for:
1. Ride request (with client-generated idempotency key)
2. Delivery status transitions

Out of scope for v1.0 per feature freeze — manual retry is acceptable for closed beta.

---

## Part 4 — Maps

### GPS unavailable / delayed

| App | GPS unavailable UI | Location delayed fallback |
|-----|:------------------:|:-------------------------:|
| Rider | ⚠ Booking step only | ✅ `MARKET.defaultPickup` center |
| Driver | ✅ Banners in `DriverDashboardNew` | ✅ Last in-service position ref |
| Delivery | ⚠ Silent fallback to `MARKET.center` | ✅ 12s timeout, 15s max age |

### Map tiles

| App | Tile error handling | After sprint |
|-----|:-------------------:|:------------:|
| Rider | ❌ → ✅ fallback message | **Fixed** |
| Driver | ❌ | Open (v1.1) |
| Delivery | ❌ | Open (v1.1) |

**Rider message:** *"Map tiles unavailable — location markers may still update"*

---

## Part 5 — WebSocket Recovery

### Implementation matrix

| App | Client | Reconnect | Dedup events | Active trip recovery |
|-----|--------|:---------:|:------------:|:--------------------:|
| Rider | `wsService.js` | ✅ 1.5× backoff max 10s | ⚠ Ride ID filter | ✅ API poll + foreground refresh |
| Driver | `socket.js` (prod) | ✅ Backoff + URL candidates | ✅ 4s dedup key | ✅ 5s poll + snapshot ref |
| Delivery courier | `useDeliveryCourierRealtime.js` | ✅ 2× backoff to 16s | ⚠ Offer merge | ⚠ Poll + online event |
| Delivery customer | `useDeliveryTrackingRealtime.js` | ✅ | Partial | ✅ 5s API poll |

### Driver production path note

`useDriverWebSocket.js` (30s reconnect cap) exists but **production uses `socket.js`** via `DriverDashboardNew.js`. Both provide adequate recovery.

### Duplicate event prevention (driver — reference implementation)

```javascript
// shouldProcessRideEvent — 4s dedup window
{source}:{type}:{rideId}
```

File: `frontend/src/driver/DriverDashboardNew.js`

---

## Part 6 — Push Notifications

| Feature | Rider | Driver | Delivery |
|---------|:-----:|:------:|:----------:|
| FCM registration | ✅ | ✅ | ✅ |
| Tap navigation | ✅ | ✅ | ✅ |
| Foreground handler | ⚠ NotificationCenter only | ✅ `yala:push-received` + dedup | ✅ Offer alert loop |
| Background recovery | ⚠ API poll | ⚠ API poll | ⚠ API poll + WS refresh |
| Missed notification sync | ❌ | ❌ | ❌ |
| Delayed delivery handling | ❌ explicit | ❌ explicit | ❌ explicit |

**Compensation:** HTTP polling (rider 3s during tracking, driver 5s, delivery 5s) and foreground `appStateChange` / `visibilitychange` refresh.

**Gap:** Rider app Capacitor shell lacks `@capacitor/haptics` plugin — vibration alerts may not fire natively on rider device.

---

## Remaining Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| OFF-R01 | No offline mutation queue — failed bookings lost until user retries | **High** | Manual retry UX; v1.1 outbox |
| OFF-R02 | Ride/payment POST lacks idempotency keys | **High** | Backend open-ride guard; user must not double-tap |
| OFF-R03 | Live device network QA not executed | **Critical** | Run `DEVICE_QA_CHECKLIST` offline scenarios |
| OFF-R04 | Driver/delivery map tile errors silent | **Medium** | Copy rider pattern in v1.1 |
| OFF-R05 | Rider WS reconnect invisible to user | **Low** | Global banner now covers device offline |
| OFF-R06 | Missed push notifications not reconciled | **Medium** | Polling compensates; document for beta users |
| OFF-R07 | `window.confirm()` in safety panels during offline | **Low** | v1.1 accessible modal |
| OFF-R08 | Maintenance/rent collection N/A | N/A | Real Estate not in v1.0 |

---

## Application Sign-Off

| Application | Offline resilience | Recommendation |
|-------------|:--------------------:|:--------------:|
| Yala Rider | **IMPROVED** — global banner + map tile message | **READY WITH CONDITIONS** |
| Yala Driver | **IMPROVED** — banner + ride cache wired | **READY WITH CONDITIONS** |
| Yala Delivery | **ADEQUATE** — had best prior coverage + global banner | **READY WITH CONDITIONS** |
| Real Estate (×5) | N/A | N/A |
| Admin (web) | N/A | N/A |

---

## v1.1 Roadmap (reliability only)

1. Offline outbox for ride request + delivery status transitions
2. Idempotency-Key header on ride/delivery POST endpoints
3. Map tile fallback on driver + delivery maps
4. `@capacitor/network` + `@capacitor/haptics` in rider-app shell
5. Missed-notification reconciliation endpoint
6. Generic HTTP retry (max 2) on idempotent GET + safe POST with keys
7. Replace `window.confirm()` in safety flows with accessible modals

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| `release/PRODUCTION_HARDENING_REPORT.md` | API idempotency gaps |
| `release/UX_POLISH_REPORT.md` | Offline banner UX |
| `release/INSTALLATION_CERTIFICATION.md` | Device QA gate |
| `release/DEVICE_QA_CHECKLIST.md` | Offline test procedures |

---

## Sign-Off

| Role | Status | Date |
|------|:------:|------|
| Engineering (resilience sprint) | ✅ Complete | 2026-07-22 |
| Device QA (network scenarios) | ☐ Pending | |
| CEO sign-off | ☐ Pending | |

**Final recommendation: READY WITH CONDITIONS for closed beta.**
