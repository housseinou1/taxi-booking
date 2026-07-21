# Yala Mobile — Bug Report Template

**Use one copy of this form per defect.** Attach to QA session folder.  
**Related checklist:** `PHYSICAL_DEVICE_QA_CHECKLIST.md`

---

## Bug ID

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-____-___ *(e.g. BUG-R-042-001)* |
| **Report date** | |
| **Reporter** | |
| **QA session date** | |

---

## Classification

| Field | Value |
|-------|-------|
| **App** | ☐ Rider 1.2.7 · ☐ Driver 1.2.23 · ☐ Delivery 1.0.4 |
| **Package** | `com.yala.rider.mr` / `com.yala.driver.mr` / `com.yala.delivery.mr` |
| **Checklist test ID** | *(e.g. R-042, D-052, C-040)* |
| **Priority** | ☐ P0 (launch blocker) · ☐ P1 (high) · ☐ P2 (low) |
| **Severity** | ☐ Critical · ☐ Major · ☐ Minor · ☐ Trivial |
| **Category** | ☐ Login · ☐ GPS · ☐ Push · ☐ Offline · ☐ Ride flow · ☐ Delivery flow · ☐ Wallet · ☐ Cash out · ☐ Payments · ☐ Background/FG · ☐ App restart · ☐ Network recovery · ☐ Other |

---

## Environment

| Field | Value |
|-------|-------|
| **API** | https://api.yalataxi.live |
| **Build** | Version ______ (code _____) · ☐ Release ☐ Debug ☐ Internal track |
| **Device** | Manufacturer / model: |
| **Android version** | |
| **Google Play Services** | ☐ Yes ☐ No · Version: |
| **Network** | ☐ Wi‑Fi ☐ 4G/5G · Carrier: |
| **Location** | City / test area: |
| **Test account** | *(email only — no password)* |

---

## Summary

**One-line title:**  
_______________________________________________________________________________

---

## Preconditions

*(What must be true before the bug occurs)*

1.  
2.  
3.  

---

## Steps to reproduce

1.  
2.  
3.  
4.  

---

## Expected result

*(From checklist or product spec)*



---

## Actual result

*(What happened instead)*



---

## Reproducibility

☐ Always (100%) · ☐ Often (>50%) · ☐ Sometimes (~25%) · ☐ Once · ☐ Unable to reproduce

---

## Evidence

| Attachment | Filename | Required? |
|------------|----------|-----------|
| Screenshot(s) | | ☐ Yes ☐ No |
| Screen recording | | ☐ Yes ☐ No |
| Logcat excerpt | | ☐ Yes ☐ No |

**Screenshot paths:**  
`release/physical-device-qa/screenshots/<date>/________________`

**Logcat capture command (if needed):**
```bash
adb logcat -d | grep -iE "yala|capacitor|chromium|firebase" > bug-<ID>-logcat.txt
```

---

## Impact

**User impact:**  
*(e.g. cannot complete ride, wrong fare, crash on launch)*



**Business / launch impact:**  
☐ Blocks closed beta · ☐ Blocks commercial launch · ☐ Workaround exists · ☐ Cosmetic only

---

## Workaround (if any)



---

## Engineering triage *(filled by dev)*

| Field | Value |
|-------|-------|
| **Status** | ☐ New · ☐ Confirmed · ☐ In progress · ☐ Fixed · ☐ Won't fix · ☐ Duplicate |
| **Duplicate of** | BUG-____-___ |
| **Root cause** | |
| **Fix version** | |
| **Fix commit / PR** | |
| **Retest required** | ☐ Yes ☐ No · Test ID: ______ |

---

## Retest (after fix)

| Field | Result |
|-------|--------|
| **Retest date** | |
| **Retester** | |
| **Build verified** | Version ______ |
| **Result** | ☐ Pass · ☐ Fail |
| **Notes** | |

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| Reporter | | |
| QA Lead | | |
| Engineering owner | | |

---

# Bug log summary (session rollup)

*Copy rows as bugs are filed during the QA session.*

| Bug ID | App | Test ID | Priority | Title | Status |
|--------|-----|---------|----------|-------|--------|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

---

# Quick reference — priority definitions

| Priority | Definition | Launch rule |
|----------|------------|-------------|
| **P0** | Crash, data loss, cannot complete core flow (login, ride, delivery, payment, cash out) | **Must fix** before any GO |
| **P1** | Major UX defect, wrong amounts, push/GPS unreliable, poor offline handling | Fix before beta scale or document waiver |
| **P2** | Cosmetic, copy, non-blocking edge case | Backlog |

---

*Template version: RC2 · 2026-07-21*
