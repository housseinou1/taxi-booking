# Sprint 1 — Physical QA Status Tracker

**Document ID:** SPRINT1-QA-TRACKER-001  
**Release:** RC2 · Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4  
**Procedures:** `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`  
**Bug template:** `release/physical-device-qa/BUG_REPORT_TEMPLATE.md`

---

## Session header

| Field | Value |
|-------|-------|
| **Session date** | |
| **Lead tester** | |
| **Environment** | Production · https://api.yalataxi.live |
| **Device 1** | Model: _________________ Android: _________ |
| **Device 2** | Model: _________________ Android: _________ |
| **Pre-check API smoke** | ☐ PASS ☐ FAIL (`scripts/rc2-mobile-api-smoke.py`) |

---

## How to use

1. Execute each test per the checklist; record result in **PASS** or **FAIL** column (mark `X`).  
2. One row per test per device if testing on multiple devices (duplicate Test ID with device suffix in notes).  
3. Every **FAIL** requires a **Bug ID** (format: `BUG-S1-###`).  
4. **P0 FAIL** blocks beta sign-off until resolved and re-tested.  
5. Update **Session summary** when complete.

**Legend:** P0 = launch blocker · P1 = fix before scale · P2 = minor

---

## PART A — Rider 1.2.7 (31 tests)

| Test ID | Test name | Pri | Device | Android | Tester | Date | PASS | FAIL | Bug ID |
|---------|-----------|:---:|--------|---------|--------|------|:----:|:----:|--------|
| R-001 | Fresh install launch | P0 | | | | | ☐ | ☐ | |
| R-002 | Login with valid credentials | P0 | | | | | ☐ | ☐ | |
| R-003 | Login with invalid password | P1 | | | | | ☐ | ☐ | |
| R-004 | Session restore after force-stop | P0 | | | | | ☐ | ☐ | |
| R-005 | Logout | P1 | | | | | ☐ | ☐ | |
| R-010 | Location permission prompt | P0 | | | | | ☐ | ☐ | |
| R-011 | Current location on map | P0 | | | | | ☐ | ☐ | |
| R-012 | Pickup pin placement | P0 | | | | | ☐ | ☐ | |
| R-013 | Live driver tracking during ride | P0 | | | | | ☐ | ☐ | |
| R-020 | Notification permission (Android 13+) | P0 | | | | | ☐ | ☐ | |
| R-021 | Push: driver accepted ride | P0 | | | | | ☐ | ☐ | |
| R-022 | Push: driver arrived | P0 | | | | | ☐ | ☐ | |
| R-023 | Push: ride completed | P1 | | | | | ☐ | ☐ | |
| R-030 | Offline at login attempt | P1 | | | | | ☐ | ☐ | |
| R-031 | Offline during active ride | P0 | | | | | ☐ | ☐ | |
| R-040 | Request ride | P0 | | | | | ☐ | ☐ | |
| R-041 | Driver assigned | P0 | | | | | ☐ | ☐ | |
| R-042 | Driver arrived & pickup PIN | P0 | | | | | ☐ | ☐ | |
| R-043 | Trip in progress | P0 | | | | | ☐ | ☐ | |
| R-044 | Trip completed | P0 | | | | | ☐ | ☐ | |
| R-045 | Cancel before accept | P1 | | | | | ☐ | ☐ | |
| R-046 | Ride history | P1 | | | | | ☐ | ☐ | |
| R-050 | View wallet balance | P0 | | | | | ☐ | ☐ | |
| R-051 | Pay with cash (default) | P0 | | | | | ☐ | ☐ | |
| R-052 | Pay with wallet balance | P1 | | | | | ☐ | ☐ | |
| R-053 | Mobile money (Bankily/Masrvi/Seddad) | P1 | | | | | ☐ | ☐ | |
| R-054 | Rate driver after trip | P1 | | | | | ☐ | ☐ | |
| R-060 | Background during active ride | P0 | | | | | ☐ | ☐ | |
| R-061 | App restart during active ride | P0 | | | | | ☐ | ☐ | |
| R-062 | Network interruption recovery | P0 | | | | | ☐ | ☐ | |
| R-063 | Low memory / recents kill | P1 | | | | | ☐ | ☐ | |

**Rider subtotal:** Pass _____ / 31 · Fail _____ · P0 fails _____

---

## PART B — Driver 1.2.23 (27 tests)

| Test ID | Test name | Pri | Device | Android | Tester | Date | PASS | FAIL | Bug ID |
|---------|-----------|:---:|--------|---------|--------|------|:----:|:----:|--------|
| D-001 | Fresh install launch | P0 | | | | | ☐ | ☐ | |
| D-002 | Login approved driver | P0 | | | | | ☐ | ☐ | |
| D-003 | Rejected/pending driver blocked | P1 | | | | | ☐ | ☐ | |
| D-004 | Session restore after force-stop | P0 | | | | | ☐ | ☐ | |
| D-010 | Go online | P0 | | | | | ☐ | ☐ | |
| D-011 | Go offline | P1 | | | | | ☐ | ☐ | |
| D-012 | GPS location updates while online | P0 | | | | | ☐ | ☐ | |
| D-013 | Arrive geofence at pickup | P0 | | | | | ☐ | ☐ | |
| D-020 | New ride offer push | P0 | | | | | ☐ | ☐ | |
| D-021 | Ride cancelled by rider push | P1 | | | | | ☐ | ☐ | |
| D-030 | Offline while online | P1 | | | | | ☐ | ☐ | |
| D-031 | Accept offer fails offline | P1 | | | | | ☐ | ☐ | |
| D-040 | Receive & accept offer | P0 | | | | | ☐ | ☐ | |
| D-041 | Decline / timeout offer | P1 | | | | | ☐ | ☐ | |
| D-042 | Verify pickup PIN | P0 | | | | | ☐ | ☐ | |
| D-043 | Start ride (without PIN blocked) | P0 | | | | | ☐ | ☐ | |
| D-044 | Start & complete ride | P0 | | | | | ☐ | ☐ | |
| D-045 | Cancel before trip starts | P1 | | | | | ☐ | ☐ | |
| D-046 | Cancel blocked after trip starts | P1 | | | | | ☐ | ☐ | |
| D-050 | View wallet & earnings | P0 | | | | | ☐ | ☐ | |
| D-051 | Transaction history | P1 | | | | | ☐ | ☐ | |
| D-052 | Request withdrawal (cash out) | P0 | | | | | ☐ | ☐ | |
| D-053 | Withdrawal OTP verification | P0 | | | | | ☐ | ☐ | |
| D-054 | Withdrawal over balance rejected | P1 | | | | | ☐ | ☐ | |
| D-060 | Background during active ride | P0 | | | | | ☐ | ☐ | |
| D-061 | App restart during active ride | P0 | | | | | ☐ | ☐ | |
| D-062 | Network interruption mid-ride | P0 | | | | | ☐ | ☐ | |

**Driver subtotal:** Pass _____ / 27 · Fail _____ · P0 fails _____

---

## PART C — Delivery 1.0.4 (18 tests)

| Test ID | Test name | Pri | Device | Android | Tester | Date | PASS | FAIL | Bug ID |
|---------|-----------|:---:|--------|---------|--------|------|:----:|:----:|--------|
| C-001 | Fresh install launch | P0 | | | | | ☐ | ☐ | |
| C-002 | Login approved courier | P0 | | | | | ☐ | ☐ | |
| C-003 | Session restore | P0 | | | | | ☐ | ☐ | |
| C-010 | Go online (delivery mode) | P0 | | | | | ☐ | ☐ | |
| C-011 | GPS at pickup / delivery | P0 | | | | | ☐ | ☐ | |
| C-020 | New delivery offer | P0 | | | | | ☐ | ☐ | |
| C-021 | Delivery cancelled push | P1 | | | | | ☐ | ☐ | |
| C-030 | Offline banner | P1 | | | | | ☐ | ☐ | |
| C-040 | Accept delivery | P0 | | | | | ☐ | ☐ | |
| C-041 | Confirm pickup | P0 | | | | | ☐ | ☐ | |
| C-042 | Confirm delivered | P0 | | | | | ☐ | ☐ | |
| C-043 | Delivery history | P1 | | | | | ☐ | ☐ | |
| C-050 | View earnings wallet | P0 | | | | | ☐ | ☐ | |
| C-051 | Cash out / withdrawal | P0 | | | | | ☐ | ☐ | |
| C-052 | COD / payment confirmation | P1 | | | | | ☐ | ☐ | |
| C-060 | Background during active delivery | P0 | | | | | ☐ | ☐ | |
| C-061 | App restart during delivery | P0 | | | | | ☐ | ☐ | |
| C-062 | Network interruption recovery | P0 | | | | | ☐ | ☐ | |

**Delivery subtotal:** Pass _____ / 18 · Fail _____ · P0 fails _____

---

## PART D — Cross-app paired (4 tests)

Requires Rider + Driver devices together.

| Test ID | Test name | Pri | Device(s) | Android | Tester | Date | PASS | FAIL | Bug ID |
|---------|-----------|:---:|-----------|---------|--------|------|:----:|:----:|--------|
| X-001 | Full ride lifecycle end-to-end | P0 | Rider + Driver | / | | | ☐ | ☐ | |
| X-002 | Push notifications both devices | P0 | Rider + Driver | / | | | ☐ | ☐ | |
| X-003 | Rider rates driver after ride | P1 | Rider | | | | ☐ | ☐ | |
| X-004 | Earnings + payment same ride ID | P0 | Rider + Driver | / | | | ☐ | ☐ | |

**Cross-app subtotal:** Pass _____ / 4 · Fail _____ · P0 fails _____

---

## Session summary

| App | Version | Total | Pass | Fail | P0 fail | Certified |
|-----|---------|:-----:|:----:|:----:|:-------:|:---------:|
| Rider | 1.2.7 | 31 | | | | ☐ Yes ☐ No |
| Driver | 1.2.23 | 27 | | | | ☐ Yes ☐ No |
| Delivery | 1.0.4 | 18 | | | | ☐ Yes ☐ No |
| Cross-app | — | 4 | | | | ☐ Yes ☐ No |
| **Grand total** | | **80** | | | | |

### Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Engineering | | | |
| Ops Manager | | | |

**Beta device QA gate:** ☐ PASS (zero P0 open) · ☐ FAIL · ☐ PASS WITH P1 DEFERRALS (CEO approval)

**Closes blocker:** ISSUE-RC2-P0-001 when signed with zero P0 failures.
