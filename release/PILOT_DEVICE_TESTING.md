# YALA Enterprise v1.0 — Pilot Device Testing Report

**Document ID:** PILOT-DEVICE-001  
**Date:** 2026-07-22  
**Device (historical):** Samsung SM-N986U1 (`R5CN80M3ZYJ`)  
**Builds:** Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4  
**Today's session:** adb **not available** on validation workstation — no new device captures

---

## Session status (2026-07-22)

| Item | Status |
|------|:------:|
| Physical device connected | ❌ adb not in PATH |
| LC1 APK installed today | ☐ Not executed |
| New screenshots/videos | ☐ None captured today |
| API-level validation | ✅ `platform-rc1-smoke.py` 34/40 PASS |

**All device results below are from observed prior QA sessions** unless marked as API-only (today).

---

## Test matrix

| Test | API (today) | Device (historical) | Evidence |
|------|:-----------:|:-------------------:|----------|
| Login | ✅ | ✅ | Smoke + `RIDER_RC1_QA_REPORT.md` |
| GPS | ☐ | ✅ | `rc1-gps-on.png`, "You are here" marker |
| Booking | ✅ | ✅ | Smoke request 201; `rider-rc1-04-requested.png` |
| Ride lifecycle | ❌ API | ✅ Device | API geofence fail; device PASS `DRIVER_RELEASE_QA_REPORT.md` |
| Delivery lifecycle | ❌ API | ⚠ Partial | API 400; RC4 delivery complete via API fallback |
| Push notifications | ☐ | ☐ | Not measured |
| Background behavior | ☐ | ⚠ | `rc1-foreground.png`, session restore PASS |
| Offline recovery | ☐ | ⚠ | Foreground refresh fix documented |
| Payments | ⚠ | ⚠ | API authorized; cash/wallet not device-tested |

---

## Screenshots (prior sessions)

| File | Description |
|------|-------------|
| `release/device-qa-rc/rider-rc1-01-launch.png` | Rider app launch |
| `release/device-qa-rc/rider-rc1-04-requested.png` | Ride requested |
| `release/device-qa-rc/rc1-gps-on.png` | GPS marker active |
| `release/device-qa-rc/rc1-pin-verified.png` | PIN verification |
| `release/device-qa-rc/rc4-final-rider-completed.png` | Completed ride |
| `release/device-qa-rc/rc4-final-rider-delivery-complete.png` | Delivery complete |
| `release/device-qa-driver-release/04-arrived.png` | Driver arrived slide |
| `release/device-qa-driver-release/04-pin.png` | PIN entry |

---

## Videos

No video artifacts captured in repository. Recommend screen recording during next device session for ride accept → complete path.

---

## Crash logs

| Source | Result |
|--------|--------|
| `release/device-qa-security-phase2/04-rider-logcat.txt` | Prior session — no fatal crash during smoke |
| Crashlytics | Not configured (PILOT-015) |
| Today's logcat | ☐ Not captured — no adb |

---

## Device QA verdict history

| Report | Date | Verdict | Key finding |
|--------|------|:-------:|-------------|
| `DRIVER_RELEASE_QA_REPORT.md` | 2026-07-09 | **PASS** | Full ride lifecycle on device |
| `RIDER_RC1_QA_REPORT.md` | 2026-07-07 | **FAIL** | Active ride restore, password reset |
| `RC4_FINAL_DEVICE_QA_REPORT.md` | RC4 session | **FAIL** | Driver go-online, accept button missing |

**Assessment:** Device behavior is **inconsistent across builds/sessions**. LC1 builds require fresh signed device QA before pilot expansion.

---

## Required before pilot user onboarding

1. Install LC1 APKs on `R5CN80M3ZYJ` (or equivalent)
2. Execute `release/DEVICE_QA_CHECKLIST.md` critical paths
3. Capture screenshots for login, book, complete, delivery
4. Record crash-free session metric manually (session count / crashes)

---

## Related

- [PILOT_ISSUES.md](./PILOT_ISSUES.md) — PILOT-005, PILOT-007, PILOT-008
- [PILOT_USER_VALIDATION.md](./PILOT_USER_VALIDATION.md)
