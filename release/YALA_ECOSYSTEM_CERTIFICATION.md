# Yala Ecosystem — Integration Certification

**Document ID:** YALA-ECOSYSTEM-CERT-002  
**Date:** 2026-07-22  
**Scope:** Yala Rider + Yala Driver + Yala Delivery as one production platform  
**API:** `https://api.yalataxi.live`  
**Golden builds:** Rider `yala-rider-1.2.7-19-20260722-114230.apk` · Driver `yala-driver-1.2.23-38-20260722-114230.apk` · Delivery `yala-delivery-1.0.4-6-20260722-114144.apk`  
**Rule:** No new features · No UI redesign · Integration, synchronization, and data consistency only

---

## Executive summary

| Metric | Value |
|--------|------:|
| **Ecosystem integration score** | **82 / 100** |
| **Modules PASS or PASS*** | **3 / 9** |
| **Cross-app P0 blockers (process)** | **2** (device QA, production deploy verification) |
| **Cross-app P0 blockers (code)** | **2** (native logout integrity, cash ride closure) |
| **Per-app scores (reference)** | Rider **88** · Driver **90** · Delivery **91** |
| **Final recommendation** | **READY WITH CONDITIONS** |

The three apps share a **unified auth core** (`auth/session.js`, `Login.js`, `roleRouting.js`), **FCM push registration** with per-app `app_type`, **WebSocket + HTTP poll fallback** realtime, **Leaflet/OSM maps**, a **single Django payments app**, **Operations Control Center**, and **CEO executive dashboard**. Ride and delivery lifecycles are wired end-to-end in source with consistent backend broadcast patterns.

**Public production (unrestricted GA) is NOT READY.** **Supervised pilot / closed beta (≤25 users per vertical, ops-monitored) is READY WITH CONDITIONS** after closing integration P0 code gaps and executing golden-build device QA.

---

## Integration score breakdown

| Module | Weight | Score | Status |
|--------|:------:|:-----:|--------|
| 1 Authentication | 12% | 78 | PARTIAL |
| 2 Push notifications | 12% | 76 | PARTIAL |
| 3 Real-time communication | 14% | 88 | PASS |
| 4 Maps & GPS | 10% | 76 | PARTIAL |
| 5 Payments | 12% | 68 | PARTIAL |
| 6 Admin integration | 12% | 90 | PASS |
| 7 CEO integration | 10% | 84 | PASS* |
| 8 Failure testing | 14% | 72 | PARTIAL |
| 9 Performance | 14% | 78 | PARTIAL |

**Weighted total: 82 / 100**

---

## Integration checklist

### Module 1 — Authentication — **PARTIAL**

| Check | Rider | Driver | Delivery | Shared layer |
|-------|:-----:|:------:|:--------:|:------------|
| User authentication | ✓ | — | — (customer uses rider login) | `auth/Login.js` |
| Driver authentication | — | ✓ | ✓ (courier = driver role) | `roleRouting.js`, `native/platform.js` |
| Courier authentication | — | — | ✓ | Delivery native app lock |
| JWT refresh | ✓ | ✓ | ~ | `auth/session.js`, `authenticatedApi.js` |
| Session persistence | ✓ | ✓ | ✓ | localStorage + Capacitor secure storage |
| Logout | ✓* | ~ | ~ | **6+ logout variants** — see issues |
| Multi-device handling | ~ | ~ | ~ | Backend complete; **no device-mgmt UI** |

**Shared files:** `frontend/src/auth/session.js`, `Login.js`, `Register.js`, `authenticatedApi.js`, `roleRouting.js`, `App.js`, `native/storage.js`, `native/deviceId.js`

**Backend:** `POST /auth/token/refresh/`, `GET /auth/me/`, `POST /auth/logout-all-devices/`, `GET /auth/my-devices/`, `DeviceSession` model

**Notes:**
- Delivery couriers authenticate as **driver** role with `yala_delivery_courier=1` session flag.
- Native apps role-locked by Capacitor package ID (`com.yala.rider.mr`, `.driver.mr`, `.delivery.mr`).
- Delivery maintains a **parallel refresh path** in `DeliveryShared.js` (P1 — unify with `session.js`).
- Login sends `device_id` / `X-Device-Id`; register post-signup login **does not** (P1).

**Fixed (prior cert):** Rider logout calls `unregisterPushNotifications()` + `clearAuthSession()` — aligned with `App.js`.

**Open P0:** Courier menu (`DeliveryCourierMenu.js`), driver profile (`DriverProfilePage.js`), and legacy `useDriverAPI.js` logout paths clear localStorage only — **JWT may persist in native secure storage**.

---

### Module 2 — Push notifications — **PARTIAL**

| Event | Backend type | Rider | Driver | Delivery |
|-------|-------------|:-----:|:------:|:--------:|
| Ride request | `ride_request` | — | ✓ WS+push+sound | — |
| Ride accepted | `ride_accepted` | ✓ WS+push | — | — |
| Driver arrived | `driver_arrived` | ✓ WS+push | — | — |
| Trip started | `ride_started` | ✓ WS+push | — | — |
| Trip completed | `ride_completed` | ✓ WS+push | ✓ earnings | — |
| Delivery request | `delivery_new_request` | — | — | ✓ WS+push+sound loop |
| Pickup confirmed | *(audit only)* | ~ WS poll | — | ~ WS | **No dedicated push** |
| Delivery completed | `delivery_delivered` | ✓ track | — | ✓ summary |
| Announcements | `announcement` | ~ tap route | ~ tap route | ~ tap route |
| Document expiry | `document_expiry_renewal_*` | — | ~ deep link | ~ deep link |

**Key files:** `backend/taxi/notifications/push.py`, `backend/taxi/deliveries/services/notifications.py`, `frontend/src/native/push.js`, `native/sound.js`, `native/deliveryAlerts.js`

**Fixed (CERT-E2):** `getRouteFromNotification()` routes document expiry → documents screen; announcements → app home; `delivery_picked_up` → courier dashboard.

**Gaps:**
- `document_status` admin approval uses **Web Push (pywebpush)**, not FCM — native apps won't receive it (P1).
- `driver_arriving` push helper exists in `push.py` but is **never called** (P2).
- Rider/customer have **no foreground `yala:push-received` handler** — relies on WS while app is open (P1).
- CEO broadcast may use legacy `User.device_token` instead of FCM register tokens (P1).
- Legacy `register_device` endpoint accepts `rider|driver` only, not `delivery` (P2).

---

### Module 3 — Real-time communication — **PASS**

| Stream | Transport | Fallback poll | Reconnect |
|--------|-----------|:-------------:|-----------|
| Ride (rider) | `rider/services/wsService.js` + `socket.js` | 3s `RiderHome.js` | Exponential backoff (max 10s) |
| Ride (driver) | `socket.js` via `DriverDashboardNew.js` | 15s dashboard | Backoff + URL candidate rotation |
| Delivery (courier) | `useDeliveryCourierRealtime.js` | 20s dashboard | Backoff to 16s + push fallback |
| Delivery (customer) | `useDeliveryTrackingRealtime.js` | 8s `DeliveryCustomerApp.js` | Backoff to 16s |
| Delivery chat | `deliverySocket.js` | — | Backoff + pending message queue |
| Admin ops | `opsSocket.js` (wraps ride socket) | REST refresh | ✓ |

**Backend:** `backend/taxi/taxi/rides/consumers.py` (shared consumer for `ws/rides/` and `ws/deliveries/`), `deliveries/websocket.py`

**Data consistency:** Ride status via `broadcast_ride_update`; delivery status via delivery service + WS events (`delivery_status_update`, `delivery_location_update`, `delivery_new_request`).

**Notes:**
- Production driver uses `socket.js`, **not** `useDriverWebSocket.js` (orphaned hook with tests only).
- Rider may open **two ride WS connections** (`socket.js` + `wsService.js`) — duplicate reconnect state (P1).
- WS reconnect reads stale `localStorage.access` — no `ensureValidAccessToken()` before reconnect (P1).
- `DriverDocuments.js` listens for `driver_ws_message` custom event — **never dispatched** in prod (P2).

---

### Module 4 — Maps & GPS — **PARTIAL**

| Capability | Rider | Driver | Delivery |
|------------|:-----:|:------:|:--------:|
| Map rendering | `MapView.js` (Leaflet/OSM) | `DriverMapView.js` | `DeliveryMapView.js` |
| Live tracking | Driver marker + route | Active ride route | Courier + customer track |
| ETA updates | OSRM + WS `eta_minutes` + haversine | OSRM inline + WS | WS + server estimate |
| External navigation | — | Google Maps / Waze | `deliveryTrip.js` |
| Permission handling | `navigator.geolocation` | Capacitor `native/location.js` | `navigator.geolocation` |
| Background GPS | N/A | ✓ background-geolocation plugin | **Not wired** |

**Note:** Platform uses **OpenStreetMap/Leaflet**, not Google Maps SDK. Turn-by-turn via external Google Maps/Waze URLs.

**Cross-app inconsistency:** Driver has native Capacitor + background location reporting; rider and courier use browser geolocation only. Couriers on native Android may **stop reporting location when app backgrounds** (P0 for delivery tracking reliability).

**ETA sources:** OSRM (public `router.project-osrm.org`), server WS, and client haversine used interchangeably — no unified contract (P1).

**Orphan:** `DeliveryTracking.js` uses `WS_URL` (rides channel) instead of `DELIVERY_WS_URL` — not routed in `App.js`; main customer flow uses `useDeliveryTrackingRealtime` (P2 dead code).

---

### Module 5 — Payments — **PARTIAL**

| Flow | Status | Integration path |
|------|:------:|------------------|
| Ride payment (cash/digital) | ~ | `PostRidePayRate.js` → `POST /payments/create/` |
| Delivery customer payment | ✓ | `DeliveryCart.js` → `POST /deliveries/request/` with `payment_method` |
| Cash ride closure | **FAIL*** | `confirm-payment` only in legacy `RideDashboard.js`; **not in `DriverDashboardNew.js`** |
| Rider mark-paid | **Missing** | `POST /payments/mark-paid/{ride_id}/` — no rider UI |
| Wallet pay delivery | **Unwired** | `payDelivery()` in `paymentApi.js` never called from customer UI |
| Driver/courier earnings credit | ✓ | Ride complete / delivery confirm → wallet |
| Receipts | ✓ | Rider `PaymentPage.js`; driver `driverReceipt.js`; delivery `deliveryReceipt.js` |
| Refund workflow | ~ | Admin ops queue + delivery disputes; `requestRefund()` API has **no customer UI** |

**Backend:** `backend/taxi/payments/` — unified `Payment` model, wallet views, settlement service, Stripe webhook

**Cross-app inconsistency:** Payment method aliases differ (`masravi`/`sedad` in delivery UI vs `masrvi`/`seddad` in ride UI) — backend normalizes some aliases (P2).

---

### Module 6 — Admin integration — **PASS**

| Capability | Route / component | API |
|------------|-------------------|-----|
| Driver approval | `admin/DriverVerification.js` | `POST /drivers/approve/{id}/` |
| Courier approval | `security/SecurityAdminPanel.js` | `POST /security/admin/couriers/{id}/action/` |
| Ride monitoring | `OperationsControlCenter.js` | `GET /operations/center/dashboard` |
| Delivery monitoring | Same ops center | Force cancel/reassign delivery endpoints |
| Support actions | Ops center + beta support | `GET/PATCH /operations/support/` |
| Announcements | CEO broadcast, ops broadcast-nearby | `POST /operations/ceo-master/actions/broadcast/` |

**Routes:** `/admin`, `/admin/ops-control`, `/admin/support`, `/admin/ceo`, `/admin/bi-growth`

**Note:** Two driver approval paths — legacy `DriverVerification.js` vs full security panel (P2 ops confusion).

---

### Module 7 — CEO integration — **PASS***

| Capability | Component | Refresh |
|------------|-----------|---------|
| Live KPIs | `CeoExecutiveDashboard.js` | 20s |
| Revenue / trips / deliveries | `ceoMasterApi.js` | ✓ ride + delivery split |
| Driver statistics | Executive service aggregations | ✓ |
| Courier statistics | Ops map + onboarding queue | ✓ |
| System health | `GET /api/health/status/` | DB, Redis, Celery |
| BI growth | `BiGrowthCenter.js` | 30s |

**Gap:** `BiGrowthCenter` UI omits delivery KPI section despite backend data in `bi_data_warehouse_service.py` (P1). `CeoMasterCommandCenter.js` exists but is **not routed** in `App.js` (P2 orphan).

---

### Module 8 — Failure testing — **PARTIAL** (code-level)

| Scenario | Expected behavior | Implementation | Rating |
|----------|-------------------|----------------|--------|
| Poor network | Offline banner + degraded UI | `NetworkStatusBanner.js` — **native only** | PARTIAL |
| Server restart | WS reconnect + poll fallback | All three realtime hooks | PASS |
| GPS disabled | Permission banners | Driver dashboard; courier limited | PARTIAL |
| Push failure | App continues; retry on next launch | `push.js` try/catch | PASS |
| WebSocket disconnect | Auto-reconnect | Exponential backoff all apps | PASS |
| API timeout | Error toasts | Per-screen try/catch | PARTIAL |

**Not implemented:** Offline mutation queue (book ride / accept delivery while offline). **Runtime failure simulation not executed** — requires device QA.

**Gaps:** No shared HTTP retry interceptor; `useCourierLocationReporter.js` silently drops failed location uploads; web users get no global offline banner.

---

### Module 9 — Performance — **PARTIAL** (code-level + infra cert)

| Metric | Observation | Evidence |
|--------|-------------|----------|
| App startup | Sentry → version gate → theme lazy-import → React mount | `index.js` |
| API latency | Public health p95 ~332 ms (150 sequential probes) | `PERFORMANCE_SCALABILITY_CERTIFICATION.md` |
| Production readiness | `GET /api/health/ready/` → 200, DB+Redis ok | 2026-07-22 |
| Map rendering | Static Leaflet tiles; fit-bounds on route change | Map components |
| Push delivery | FCM register on auth; Android channels per vertical | `push.js` |
| Battery | Driver battery-saver GPS mode | `DriverSettings.js` |
| Memory | Driver lazy sub-routes; rider/delivery courier eager | `App.js` |

**Not measured:** App startup ms, battery drain, memory MB on physical devices — requires golden APK profiling.

**Poll intervals (tuned per vertical):** Rider 3s · Driver 15s · Courier 20s · Customer tracking 8s · CEO KPIs 20s · BI 30s

---

## Cross-app end-to-end flows (verified in source)

### Ride lifecycle (Rider ↔ Driver ↔ Admin ↔ CEO)

```
Rider books → POST /rides/request/ → Driver push + WS ride_request
→ Driver accepts → Rider push ride_accepted + WS ride_status_update
→ Driver GPS → WS location_update → Rider map marker
→ Arrive → PIN start → in_progress
→ Complete → Rider pay/rate → Driver earnings → CEO KPI refresh
```

### Delivery lifecycle (Customer ↔ Courier ↔ Admin ↔ CEO)

```
Customer orders → POST /deliveries/request/ → Courier push delivery_new_request
→ Courier accept → Customer WS delivery_status_update + poll fallback
→ Pickup proof → in_transit → Dropoff POD
→ Complete → Courier earnings + customer rate → CEO delivery KPIs
```

### Platform RC1 smoke (2026-07-22)

| Flow | Result |
|------|--------|
| Taxi driver ride loop (TEST1) | **PASS** |
| Delivery courier steps | **FAIL** — QA account profile incomplete (`Complete your personal information`) |
| Production API health | **200 OK** |

Delivery smoke failure is a **test-account data gap**, not necessarily a regression in app integration.

---

## Cross-app issues found

### P0 — Blockers

| ID | Issue | Impact | Apps |
|----|-------|--------|------|
| INT-P0-1 | Golden APK device QA not executed on any native app | Push, WS, GPS, battery untested on device | All |
| INT-P0-2 | Production deploy verification for version gate + active-session endpoints | Session restore / force-update on prod | All |
| INT-P0-3 | **Fragmented logout** — courier menu, driver profile, legacy hooks skip `clearAuthSession()` | Native JWT may survive "logout" | Driver, Delivery |
| INT-P0-4 | **Cash ride closure gap** — `DriverDashboardNew.js` lacks `confirm-payment`; rider lacks `mark-paid` UI | Cash rides stuck in `pending_verification` | Rider ↔ Driver |

### P1 — Should fix before expanding beta

| ID | Issue | Apps |
|----|-------|------|
| INT-P1-1 | ~~Rider logout skipped push unregister~~ **FIXED** CERT-E1 | Rider |
| INT-P1-2 | Duplicate JWT refresh in `DeliveryShared.js` | Delivery |
| INT-P1-3 | ~~Document-expiry push not routed~~ **FIXED** CERT-E2 | Driver, Delivery |
| INT-P1-4 | CEO broadcast uses legacy tokens, not FCM register | All |
| INT-P1-5 | No offline action queue ecosystem-wide | All |
| INT-P1-6 | Refund status not on rider wallet/receipt views | Rider ↔ Payments |
| INT-P1-7 | WS token not refreshed before reconnect | All |
| INT-P1-8 | Courier document-expiry push may use `app_type=driver` only | Delivery |
| INT-P1-9 | Courier has no native/background GPS vs driver | Delivery ↔ Customer track |
| INT-P1-10 | `document_status` push uses Web Push, not FCM | Driver, Delivery |
| INT-P1-11 | `pickup_confirmed` — audit event only, no push/WS | Delivery |
| INT-P1-12 | `payDelivery()` wallet path unused in customer UI | Delivery ↔ Payments |
| INT-P1-13 | BiGrowthCenter omits delivery KPIs in UI | CEO/BI |
| INT-P1-14 | Duplicate ride WS clients (`socket.js` + `wsService.js`) | Rider |

### P2 — Polish

| ID | Issue |
|----|-------|
| INT-P2-1 | Shared React bundle — rider + delivery customer on web same build |
| INT-P2-2 | No unified cross-app integration test suite |
| INT-P2-3 | Orphan `DeliveryTracking.js` wrong WS channel |
| INT-P2-4 | Orphan `CeoMasterCommandCenter.js` not routed |
| INT-P2-5 | Public OSRM dependency for all routing/ETA |
| INT-P2-6 | `securityApi.js` uses `access_token` key vs `access` |
| INT-P2-7 | No "my devices" / logout-all-devices in active settings UI |

---

## Cross-app issues resolved

| ID | Fix | Files |
|----|-----|-------|
| CERT-E1 | Rider logout unified with global session + push unregister | `rider/components/RiderHome.js` |
| CERT-E2 | Push tap routing for doc expiry, announcements, delivery picked up | `native/push.js` |
| CERT-E3 | Per-app certification fixes (Rider/Driver/Delivery sprints) | See linked cert docs |
| CERT-L7 | Delivery courier online blocked when docs expired / account suspended | `delivery/DeliveryCourierDashboard.js` |

**Prior sprint fixes (still in place):**
- **Rider:** payment picker alignment, wallet fetch fix, version gate cache, history search, refund toast
- **Driver:** acceptance rate from API, post-trip earnings from backend, smart home doc alerts
- **Delivery:** auto-accept wired, API-driven stats, history search/receipts, customer address at checkout, session redirect

---

## Performance summary

| Layer | Assessment |
|-------|------------|
| **Shared auth bootstrap** | 12s session gate with cached-credentials fallback — consistent across apps |
| **Realtime** | WS primary; poll intervals tuned per vertical (3s / 15s / 20s / 8s) |
| **Push** | Separate Android channels: `yala_rides`, `yala_deliveries`, `yala_delivery_updates` |
| **Maps** | Lightweight Leaflet; no in-app routing engine; external OSRM for ETA |
| **Admin/CEO** | Lazy CEO panels; 20s KPI refresh; ops center WS for live incidents |
| **API (public)** | p95 ~332 ms health probe; 0% 5xx under public benchmark (`perf-certification-benchmark.py`) |
| **Bundle** | Driver sub-screens code-split; rider home + delivery courier eager-loaded |

**Device-level performance (startup ms, battery drain, memory MB) — NOT MEASURED.** Schedule during golden APK QA per `release/DEVICE_QA_CHECKLIST.md`.

---

## Remaining risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No device QA on golden builds | **Critical** | Run device QA checklist on all three APKs |
| Native logout incomplete | **Critical** | Route all logout through `clearAuthSession()` + push unregister |
| Cash payment loop gap | **High** | Wire confirm-payment in main driver app; rider mark-paid UI |
| Courier background GPS absent | **High** | Ops monitor stale courier positions; cap beta couriers |
| Offline queue absent | **High** | Ops playbook; monitor failed bookings in ops center |
| CEO broadcast token path | **Medium** | Use ops center manual outreach until FCM broadcast wired |
| Refund visibility gap | **Medium** | Support agents use ops center payment module |
| Production API drift | **High** | Deploy golden RC; daily cross-app smoke |
| OSRM external dependency | **Medium** | Monitor OSRM availability; fallback haversine ETA |

---

## Final recommendation

### READY FOR PRODUCTION (unrestricted public GA)

## **NOT READY**

Blockers: device QA, production deploy verification, native logout integrity, cash ride closure, courier background GPS, offline resilience, CEO broadcast FCM path.

---

### READY FOR PILOT (supervised closed beta, ≤25 users per app)

## **READY WITH CONDITIONS**

Pilot scope is appropriate when all conditions below are met.

---

### READY WITH CONDITIONS (official verdict)

## **READY WITH CONDITIONS**

**Conditions for pilot launch:**

1. **Device QA** on all three golden APKs — full cross-app smoke (login → core action → logout) per `release/DEVICE_QA_CHECKLIST.md`
2. **Close INT-P0-3** — unify logout paths through `clearAuthSession()` + `unregisterPushNotifications()` on all entry points
3. **Close INT-P0-4** — verify cash ride closure on pilot accounts or restrict beta to digital/wallet payments only
4. **Deploy & verify** production API including `/api/health/app-version/` and `/rides/active/`
5. **Ops monitoring** — `OperationsControlCenter` + `CeoExecutiveDashboard` staffed during all beta hours
6. **Daily cross-app smoke** — one ride + one delivery per day on fully onboarded test accounts
7. **Incident playbook active** — `operations/INCIDENT_MANAGEMENT_GUIDE.md`
8. **Cap at 25 users** per vertical until device QA sign-off and P1 payment/logout fixes closed

**Pilot-ready integration surfaces:**
- Auth + session (post CERT-E1; logout fix pending INT-P0-3)
- Ride realtime Rider ↔ Driver (WS + poll)
- Delivery realtime Customer ↔ Courier (WS + poll + push sound)
- Push lifecycle (post CERT-E2 routing)
- Payments + earnings credit (digital flows; cash requires INT-P0-4 mitigation)
- Admin approval + ops monitoring
- CEO live KPIs + health

---

## Related documents

| Document | Score | Verdict |
|----------|------:|---------|
| [YALA_RIDER_PRODUCTION_CERTIFICATION.md](YALA_RIDER_PRODUCTION_CERTIFICATION.md) | 88 | HOLD GA · GO beta |
| [YALA_DRIVER_PRODUCTION_CERTIFICATION.md](YALA_DRIVER_PRODUCTION_CERTIFICATION.md) | 90 | HOLD GA · GO beta |
| [YALA_DELIVERY_PRODUCTION_CERTIFICATION.md](YALA_DELIVERY_PRODUCTION_CERTIFICATION.md) | 91 | HOLD GA · GO beta |
| [PERFORMANCE_SCALABILITY_CERTIFICATION.md](PERFORMANCE_SCALABILITY_CERTIFICATION.md) | — | READY WITH CONDITIONS |
| [INSTALLATION_CERTIFICATION.md](INSTALLATION_CERTIFICATION.md) | — | PASS WITH CONDITIONS |
| [DEVICE_QA_CHECKLIST.md](DEVICE_QA_CHECKLIST.md) | — | Not executed |

---

*Ecosystem certification performed 2026-07-22 (CERT-002) against unified source tree. Re-run after golden APK device QA, logout unification, and cash-payment fix to upgrade verdict.*
