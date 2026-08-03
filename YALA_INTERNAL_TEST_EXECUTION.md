# YALA Internal Test Execution Plan

**Mission LP-3**
**Date:** 2026-08-03

---

## Play Console Checklist

### Already Complete ✅

| Item | Rider | Driver | Delivery |
|------|-------|--------|----------|
| AAB signed & verified | ✅ | ✅ | ✅ |
| Package identity confirmed | ✅ | ✅ | ✅ |
| versionCode set | ✅ (26) | ✅ (46) | ✅ (6) |
| Firebase client registered | ✅ | ✅ | ✅ |
| Privacy Policy URL | ✅ | ✅ | ✅ |
| Account Deletion URL | ✅ | ✅ | ✅ |
| Release notes drafted | ✅ | ✅ | ✅ |
| Production API configured | ✅ | ✅ | ✅ |

### Manual Play Console Tasks ⏸

| # | Task | App | Notes |
|---|------|-----|-------|
| 1 | Create app listing (if new) | All 3 | Required for first upload |
| 2 | Upload AAB to Internal Testing | All 3 | `app-release.aab` from each |
| 3 | Set release name | All 3 | e.g. "1.2.9 (26)" |
| 4 | Add release notes | All 3 | Use prepared text from LP-2 |
| 5 | Complete Data Safety form | All 3 | Location, Phone, Device ID |
| 6 | Declare Background Location | Driver, Delivery | Active ride/delivery tracking |
| 7 | Content rating questionnaire | All 3 | Expected: Everyone |
| 8 | Upload screenshots (min 2) | All 3 | Phone screenshots per app |
| 9 | Upload feature graphic | All 3 | 1024×500 PNG |
| 10 | Set support email | All 3 | e.g. support@yalataxi.live |
| 11 | Set app category | All 3 | Maps & Navigation |
| 12 | Add tester emails | All 3 | Internal Testing group |
| 13 | Verify upload certificate | All 3 | SHA-1 matches keystore |
| 14 | Roll out to Internal Testing | All 3 | After all above complete |

---

## Data Safety Declarations

### Rider
| Data type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Approximate location | Yes | No | Ride pickup/destination |
| Precise location | Yes | No | Live ride tracking |
| Phone number | Yes | No | Account authentication |
| Name | Yes | No | Profile display |
| Payment info | Yes | No | Ride payments |
| App interactions | Yes | No | Analytics |
| Device ID | Yes | No | Push notifications |

### Driver
| Data type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Precise location | Yes | Yes (with rider during trip) | Navigation + ETA |
| Background location | Yes | No | Active ride tracking |
| Phone number | Yes | No | Authentication |
| Name, Photo | Yes | Yes (with rider) | Driver identity |
| Vehicle info | Yes | Yes (with rider) | Trip information |
| Financial info | Yes | No | Earnings + withdrawals |
| Device ID | Yes | No | Push notifications |

### Delivery
| Data type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Precise location | Yes | Yes (with customer) | Delivery tracking |
| Background location | Yes | No | Active delivery tracking |
| Phone number | Yes | No | Authentication |
| Name, Photo | Yes | No | Courier identity |
| Financial info | Yes | No | Earnings |
| Device ID | Yes | No | Push notifications |

---

## QA Execution Plan — Two-Device Test

### Prerequisites
- Device A: Samsung Note 20 Ultra (Android 13) — Rider/Customer
- Device B: Second Android device — Driver/Courier
- Both on same WiFi or mobile data
- Production backend live at www.yalataxi.live
- Test accounts: 1 approved rider + 1 approved driver + 1 approved courier

---

### Test Suite 1: Ride Flow (Rider + Driver)

| # | Step | Device | Expected Result | Pass/Fail |
|---|------|--------|-----------------|-----------|
| 1.1 | Rider: Login | A | Home screen with map | ⬜ |
| 1.2 | Driver: Login | B | Home screen with map + Go Online | ⬜ |
| 1.3 | Driver: Go Online | B | Status = online, receiving requests | ⬜ |
| 1.4 | Rider: Select pickup | A | Map marker placed | ⬜ |
| 1.5 | Rider: Select destination | A | Route shown, fare estimated | ⬜ |
| 1.6 | Rider: Choose Regular | A | Fare displayed (e.g. 175+ MRU) | ⬜ |
| 1.7 | Rider: Confirm Booking | A | "Searching for driver" state | ⬜ |
| 1.8 | Driver: Receive request | B | Push notification + ride card | ⬜ |
| 1.9 | Driver: Accept | B | Status → driver_arriving | ⬜ |
| 1.10 | Rider: See driver accepted | A | Driver info + tracking | ⬜ |
| 1.11 | Driver: Navigate to pickup | B | Navigation link works | ⬜ |
| 1.12 | Driver: Mark Arrived | B | Status → driver_arrived | ⬜ |
| 1.13 | Rider: See driver arrived | A | PIN displayed | ⬜ |
| 1.14 | Driver: Enter PIN + Start | B | Status → in_progress | ⬜ |
| 1.15 | Driver: Complete ride | B | Status → completed | ⬜ |
| 1.16 | Rider: See completion | A | Fare + rate driver prompt | ⬜ |
| 1.17 | Rider: Rate driver | A | Rating submitted | ⬜ |
| 1.18 | Driver: See earnings | B | Earnings updated on dashboard | ⬜ |
| 1.19 | Both: Check history | A+B | Trip appears in both histories | ⬜ |

### Test Suite 2: Cancellation

| # | Step | Expected | Pass/Fail |
|---|------|----------|-----------|
| 2.1 | Rider cancels before match | No fee, ride cancelled | ⬜ |
| 2.2 | Rider cancels after driver accepts | Cancellation fee applied | ⬜ |
| 2.3 | Driver cancels | Driver penalty, rider notified | ⬜ |

### Test Suite 3: Delivery Flow (Customer + Courier)

| # | Step | Device | Expected | Pass/Fail |
|---|------|--------|----------|-----------|
| 3.1 | Courier: Login | B | Home with Go Online | ⬜ |
| 3.2 | Courier: Go Online | B | Available for deliveries | ⬜ |
| 3.3 | Customer: Request delivery | A | Delivery created | ⬜ |
| 3.4 | Courier: Receive request | B | Notification + card | ⬜ |
| 3.5 | Courier: Accept | B | Assigned to delivery | ⬜ |
| 3.6 | Courier: Navigate to pickup | B | Route shown | ⬜ |
| 3.7 | Courier: Confirm picked up | B | Status updated | ⬜ |
| 3.8 | Courier: Navigate to drop | B | Destination route | ⬜ |
| 3.9 | Courier: Mark delivered | B | Delivery complete | ⬜ |
| 3.10 | Courier: Check wallet | B | Earnings credited | ⬜ |

### Test Suite 4: Executive Dashboard

| # | Step | Expected | Pass/Fail |
|---|------|----------|-----------|
| 4.1 | Login as admin | Access admin panel | ⬜ |
| 4.2 | View Ops Center Home | KPIs displayed | ⬜ |
| 4.3 | View Live Map | Markers on map | ⬜ |
| 4.4 | View Finance | Revenue charts | ⬜ |
| 4.5 | View Command Center | Tabs load | ⬜ |

---

## Success Criteria

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| App launch | 100% success | All 3 apps open without crash |
| Login | 100% success | Valid creds → authenticated |
| Ride booking | 100% success | Request reaches backend, status 201 |
| Driver acceptance | 100% | Ride transitions to driver_arriving |
| Ride completion | >90% | Full cycle completes |
| Payment capture | 100% | No orphaned authorizations |
| Push delivery | >90% | Notifications received on both devices |
| GPS accuracy | <100m | Driver position visible on rider map |
| Earnings consistency | 100% | Dashboard = Earnings page |
| No crash | 0 crashes | logcat clean |
| No ANR | 0 ANR | No Application Not Responding |

---

## Blockers for Internal Testing

| # | Item | Status |
|---|------|--------|
| 1 | AABs ready | ✅ |
| 2 | Production backend live | ✅ (/health/ = ok) |
| 3 | Firebase configured | ✅ |
| 4 | Play Console manual setup | ⏸ Required before upload |
| 5 | Test accounts on production | ⏸ Need approved driver + rider |

---

## Launch Readiness

| Stage | Readiness | Blocker |
|-------|-----------|---------|
| Internal Testing | **95%** | Play Console setup (manual) |
| Closed Beta | 85% | 2-device QA pass required |
| Public Launch | 75% | Data Safety + screenshots + QA + monitoring |
