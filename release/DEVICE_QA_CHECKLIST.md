# YALA Enterprise v1.0 — RC3 Device QA Checklist

**Document ID:** RC3-DEVICE-QA-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-rc3  
**API:** https://api.yalataxi.live  
**Environment:** Staging (preferred) or Production (controlled beta)  
**Status:** **READY FOR EXECUTION** — builds require RC3 rebuild after 2026-07-22 code changes

---

## Builds under test

| App | Package | Version (prior build) | RC3 rebuild required | Path |
|-----|---------|:---------------------:|:--------------------:|------|
| Yala Rider | `com.yala.rider.mr` | 1.2.7 (19) | **YES** | `release/android/yala-rider-*` |
| Yala Driver | `com.yala.driver.mr` | 1.2.23 (38) | **YES** | `release/android/yala-driver-*` |
| Yala Delivery | `com.yala.delivery.mr` | 1.0.4 (6) | **YES** | `release/android/yala-delivery-*` |

**Rebuild command (Windows):**
```powershell
.\scripts\build-step1-rider-driver.ps1
.\scripts\build-delivery.bat
```

Record new APK/AAB paths in the sign-off section below.

---

## Test devices

| # | Manufacturer / model | Android version | Play Services | FCM token captured |
|---|----------------------|-----------------|:-------------:|:------------------:|
| 1 | | | ☐ | ☐ |
| 2 | | | ☐ | ☐ |

**Rules:** Physical device only — emulator not valid for RC sign-off. Battery ≥ 50%. Location **High accuracy**.

---

## Session prerequisites

- [ ] RC3 APK/AAB installed on test device(s)
- [ ] Production or staging API reachable (`GET /api/health/ready/` → OK)
- [ ] QA test accounts provisioned (credentials from QA vault — do not record passwords)
- [ ] Second device available for paired ride/delivery tests
- [ ] Screenshot folder: `release/device-qa-rc3/screenshots/<date>/`
- [ ] Logcat capture enabled for crash investigation

---

## 1. Login

| # | Test | Rider | Driver | Delivery | Pass |
|---|------|:-----:|:------:|:--------:|:----:|
| L1 | Email/password login | ☐ | ☐ | ☐ | ☐ |
| L2 | Invalid credentials → clear error | ☐ | ☐ | ☐ | ☐ |
| L3 | Token refresh / session persistence | ☐ | ☐ | ☐ | ☐ |
| L4 | Logout clears session | ☐ | ☐ | ☐ | ☐ |
| L5 | Biometric unlock (if enabled) | ☐ | ☐ | N/A | ☐ |

---

## 2. Registration

| # | Test | Rider | Driver | Delivery | Pass |
|---|------|:-----:|:------:|:--------:|:----:|
| R1 | New account registration flow | ☐ | ☐ | ☐ | ☐ |
| R2 | Email/phone verification | ☐ | ☐ | ☐ | ☐ |
| R3 | Terms & privacy acceptance | ☐ | ☐ | ☐ | ☐ |
| R4 | Document upload (driver/courier) | N/A | ☐ | ☐ | ☐ |
| R5 | Pending → approved state visible | N/A | ☐ | ☐ | ☐ |

---

## 3. Booking (Rider / Delivery customer)

| # | Test | Pass | Notes |
|---|------|:----:|-------|
| B1 | Set pickup + destination on map | ☐ | |
| B2 | Fare estimate displayed | ☐ | |
| B3 | Request ride / delivery | ☐ | |
| B4 | Promo code applied (if applicable) | ☐ | |
| B5 | Payment method selection | ☐ | |
| B6 | Merchant cart checkout (delivery) | ☐ | Verify destination coords dispatch |

---

## 4. Ride lifecycle

| # | Test | Rider | Driver | Pass |
|---|------|:-----:|:------:|:----:|
| RL1 | Driver receives request notification | ☐ | ☐ | ☐ |
| RL2 | Driver accepts ride | ☐ | ☐ | ☐ |
| RL3 | Driver en route / arriving | ☐ | ☐ | ☐ |
| RL4 | Geofence arrive validation | N/A | ☐ | ☐ |
| RL5 | PIN verify / start ride | ☐ | ☐ | ☐ |
| RL6 | In-progress tracking (map updates) | ☐ | ☐ | ☐ |
| RL7 | Complete ride | ☐ | ☐ | ☐ |
| RL8 | Rate ride + receipt | ☐ | N/A | ☐ |
| RL9 | Driver rewards points updated | N/A | ☐ | ☐ |
| RL10 | Cancel ride (rider + driver scenarios) | ☐ | ☐ | ☐ |

---

## 5. Delivery lifecycle

| # | Test | Customer | Courier | Pass |
|---|------|:--------:|:-------:|:----:|
| DL1 | Create standalone delivery | ☐ | N/A | ☐ |
| DL2 | Merchant order → delivery auto-created | ☐ | N/A | ☐ |
| DL3 | Courier assigned notification | ☐ | ☐ | ☐ |
| DL4 | Pickup + dropoff instructions visible | ☐ | ☐ | ☐ |
| DL5 | Status transitions to delivered | ☐ | ☐ | ☐ |
| DL6 | Delivery failure surfaces error (merchant ready) | N/A | N/A | ☐ |

---

## 6. Payments

| # | Test | Pass | Notes |
|---|------|:----:|-------|
| P1 | Cash ride payment flow | ☐ | |
| P2 | Card / wallet authorization | ☐ | |
| P3 | Delivery prepay | ☐ | |
| P4 | Merchant order payment at checkout | ☐ | |
| P5 | Driver withdrawal request (if in scope) | ☐ | |
| P6 | Refund visible in wallet history | ☐ | |

---

## 7. Notifications

| # | Test | Pass | Notes |
|---|------|:----:|-------|
| N1 | FCM token registered on login | ☐ | |
| N2 | Push on ride request (driver) | ☐ | |
| N3 | Push on driver assigned (rider) | ☐ | |
| N4 | Push on delivery status change | ☐ | |
| N5 | In-app notification center | ☐ | |
| N6 | Notification tap opens correct screen | ☐ | |

---

## 8. GPS

| # | Test | Pass | Notes |
|---|------|:----:|-------|
| G1 | Current location acquired < 10s | ☐ | |
| G2 | Map centers on user location | ☐ | |
| G3 | Driver location broadcasts during ride | ☐ | |
| G4 | Background location (driver online) | ☐ | |
| G5 | GPS off → clear error message | ☐ | |
| G6 | Absurd coordinates rejected | ☐ | Driver hotfix verified in 1.2.23 |

---

## 9. Offline / poor network

| # | Test | Pass | Notes |
|---|------|:----:|-------|
| O1 | Airplane mode → graceful error | ☐ | |
| O2 | Slow 3G — app remains usable | ☐ | |
| O3 | Request retry after reconnect | ☐ | |
| O4 | Ride state sync after reconnect | ☐ | RC3 fix area |
| O5 | Offline queue (if applicable) | ☐ | |

---

## 10. Crash monitoring

| # | Test | Pass | Notes |
|---|------|:----:|-------|
| C1 | No crash on cold start (3×) | ☐ | |
| C2 | No crash on background → foreground | ☐ | |
| C3 | No ANR on dashboard load | ☐ | |
| C4 | Sentry/crash report captured (if configured) | ☐ | |
| C5 | Logcat reviewed — no fatal exceptions | ☐ | |

---

## Defect log

| ID | App | Severity | Description | Screenshot | Status |
|----|-----|:--------:|-------------|------------|--------|
| | | P0/P1/P2 | | | Open |

Use `release/physical-device-qa/BUG_REPORT_TEMPLATE.md` for detailed reports.

---

## Sign-off

| Field | Value |
|-------|-------|
| **Tester name** | |
| **Test date** | |
| **Build IDs installed** | Rider: ___ Driver: ___ Delivery: ___ |
| **Environment** | ☐ Staging ☐ Production (beta) |
| **Overall result** | ☐ PASS ☐ PASS WITH CONDITIONS ☐ FAIL |

| Role | Signature | Date |
|------|-----------|------|
| Mobile QA Lead | | |
| Release Manager | | |

**Reference:** Extended checklist — [physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md](./physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md)
