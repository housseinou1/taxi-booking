# YALA Internal Testing Plan

**Mission 18 — Phase 1**
**Date:** 2026-08-03

---

## Purpose

This document defines the test plan for YALA Internal Testing on
Google Play before promoting to Closed Beta or Production.

---

## Apps Under Test

| App | Package | Version | Track |
|-----|---------|---------|-------|
| Rider | com.yala.rider.mr | 1.2.9 (26) | Internal Testing |
| Driver | com.yala.driver.mr | 1.2.24 (46) | Internal Testing |
| Delivery | com.yala.delivery.mr | 1.0.4 (6) | Internal Testing |

---

## Test Environment

| Component | URL / Config |
|-----------|-------------|
| API | https://www.yalataxi.live |
| WebSocket (rides) | wss://www.yalataxi.live/ws/rides/ |
| WebSocket (deliveries) | wss://www.yalataxi.live/ws/deliveries/ |
| Firebase | Project 915044985428 |
| Backend Health | https://www.yalataxi.live/health/ |

---

## Test Accounts Required

| Role | Email | Status |
|------|-------|--------|
| Rider (approved) | TBD | Must have rider_status=approved |
| Driver (approved) | TBD | Must have DriverProfile.status=approved |
| Courier (approved) | TBD | Must have courier documents approved |
| Admin | TBD | Must have is_staff=True |

---

## Internal Testing Scope

### Phase 1 — Installation & Launch (Day 1)
- [ ] Download from Internal Testing link
- [ ] Install successfully
- [ ] App launches without crash
- [ ] Correct branding per app
- [ ] No debug indicators
- [ ] GPS permission prompt appears

### Phase 2 — Authentication (Day 1)
- [ ] Register new account
- [ ] Login with valid credentials
- [ ] Invalid credentials rejected
- [ ] JWT refresh works (wait 15+ minutes)
- [ ] Logout clears session
- [ ] Re-login after logout

### Phase 3 — Rider Booking (Day 1-2)
- [ ] Map loads with current location
- [ ] Pickup selection
- [ ] Destination selection
- [ ] Route rendered
- [ ] Fare estimate displayed (backend-authoritative)
- [ ] Ride type selector (Regular/XL/Comfort/Share)
- [ ] Confirm Booking succeeds
- [ ] "Searching for driver" state
- [ ] Cancellation before match

### Phase 4 — Driver Trip (Day 2-3)
- [ ] Go Online
- [ ] Receive push notification for ride
- [ ] Accept ride
- [ ] Navigation to pickup
- [ ] Mark Arrived
- [ ] Enter PIN / Start ride
- [ ] Live tracking during trip
- [ ] Complete ride
- [ ] Earnings update
- [ ] Go Offline

### Phase 5 — Complete Trip Cycle (Day 3)
- [ ] Rider books → Driver accepts → Trip completes
- [ ] Rider sees fare and receipt
- [ ] Driver sees earnings
- [ ] Both can rate
- [ ] Trip appears in both histories
- [ ] Payment authorized and captured

### Phase 6 — Delivery (Day 4)
- [ ] Courier login
- [ ] Go Online
- [ ] Accept delivery request
- [ ] Navigate to pickup
- [ ] Confirm picked up
- [ ] Navigate to destination
- [ ] Mark delivered
- [ ] Earnings appear in wallet

### Phase 7 — Edge Cases (Day 5)
- [ ] Rider cancels after driver accepts (fee applied)
- [ ] Driver cancels (penalty applied)
- [ ] Waiting fee (arrive + wait > 3 min + start)
- [ ] No-show scenario
- [ ] App backgrounded and resumed
- [ ] Network loss and recovery
- [ ] Force close and reopen

---

## Success Criteria

| Criterion | Threshold |
|-----------|-----------|
| Crash rate | < 1% |
| ANR rate | < 0.5% |
| Trip completion | > 90% |
| Payment success | 100% |
| Push delivery | > 95% |
| GPS accuracy | < 50m |

---

## Promotion Criteria

**Internal → Closed Beta:**
- All Phase 1-5 tests pass
- No P0 or P1 issues
- Crash rate < 1%

**Closed Beta → Production:**
- All Phase 1-7 tests pass
- 50+ successful trips
- No P0 issues
- Data Safety approved
- Store listing complete

---

## Timeline

| Day | Activity |
|-----|----------|
| 1 | Upload to Internal Testing, install, auth tests |
| 2 | Rider booking tests |
| 3 | Driver trip + complete cycle |
| 4 | Delivery flow |
| 5 | Edge cases + final sign-off |
