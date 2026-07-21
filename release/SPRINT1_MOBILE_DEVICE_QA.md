# Sprint 1 — Physical Android Device QA Report

**Release:** v1.0.0-rc2 / Sprint 1  
**Date:** 2026-07-21  
**API:** https://api.yalataxi.live  
**Tester signature:** _________________________ **NOT SIGNED — TESTING NOT EXECUTED**  
**Device model / Android version:** _________________________  

---

## Verdict: **NOT CERTIFIED**

Physical device testing was **not performed** during Sprint 1. This document records the required checklist and blocker status for launch sign-off.

---

## Builds under test

| App | Package | Version | AAB on server |
|-----|---------|---------|---------------|
| Yala Rider | `com.yala.rider.mr` | 1.2.7 (19) | ✅ |
| Yala Driver | `com.yala.driver.mr` | 1.2.23 (38) | ✅ |
| Yala Delivery | `com.yala.delivery.mr` | 1.0.4 (6) | ✅ |

---

## Yala Rider

| Flow | Pass | Fail | Notes |
|------|:----:|:----:|-------|
| Registration | ☐ | ☑ | Not tested |
| Login | ☐ | ☑ | Not tested |
| Booking | ☐ | ☑ | Not tested |
| Ride lifecycle | ☐ | ☑ | Not tested |
| Wallet | ☐ | ☑ | Not tested |
| Rating | ☐ | ☑ | Not tested |
| GPS | ☐ | ☑ | Not tested |
| Push notifications | ☐ | ☑ | Not tested |
| Offline recovery | ☐ | ☑ | Not tested |

---

## Yala Driver

| Flow | Pass | Fail | Notes |
|------|:----:|:----:|-------|
| Registration / Login | ☐ | ☑ | Not tested |
| Go online / offline | ☐ | ☑ | Not tested |
| Accept → arrive → start → finish | ☐ | ☑ | Not tested |
| Wallet | ☐ | ☑ | Not tested |
| Withdrawal | ☐ | ☑ | Not tested |
| GPS | ☐ | ☑ | Not tested |
| Push notifications | ☐ | ☑ | Not tested |
| Offline recovery | ☐ | ☑ | Not tested |

---

## Yala Delivery

| Flow | Pass | Fail | Notes |
|------|:----:|:----:|-------|
| Login | ☐ | ☑ | Not tested |
| Order → accept → pickup → delivered | ☐ | ☑ | Not tested |
| Payment | ☐ | ☑ | Not tested |
| GPS | ☐ | ☑ | Not tested |
| Push notifications | ☐ | ☑ | Not tested |
| Offline recovery | ☐ | ☑ | Not tested |

---

## API pre-check (automated)

Run before device session:

```bash
python scripts/rc2-mobile-api-smoke.py
```

**Sprint 1 status:** Requires QA test accounts on production.

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | **PENDING** | |
| Engineering | | **PENDING** | |
| Product / CEO | | **PENDING** | |

**Launch impact:** Mobile certification remains a **P0 blocker** for commercial GO.
