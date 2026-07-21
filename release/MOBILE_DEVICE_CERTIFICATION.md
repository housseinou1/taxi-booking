# Phase 16 — Mobile Device Certification

**Requirement:** Physical Android devices only — cannot be fully automated from CI.

This document tracks API-level pre-checks and manual device sign-off.

## Apps & versions

| App | Package | Version | AAB |
|-----|---------|---------|-----|
| Yala Rider | `com.yala.rider.mr` | 1.2.7 (19) | `release/android/yala-rider-1.2.7-19-*.aab` |
| Yala Driver | `com.yala.driver.mr` | 1.2.23 (38) | `release/android/yala-driver-1.2.23-38-*.aab` |
| Yala Delivery | `com.yala.delivery.mr` | 1.0.4 (6) | TBD |

## API smoke (automated pre-check)

Run on production before device QA:

```bash
python scripts/launch-certification-prod.py
python scripts/verify-prod-driver-profile-api.py  # if available
```

## Manual device checklist

Test on **physical Android** with production API `https://api.yalataxi.live`.

### Yala Rider

| Flow | Device result | Tester | Date |
|------|---------------|--------|------|
| Login | ☐ PASS ☐ FAIL | | |
| Registration | ☐ PASS ☐ FAIL | | |
| Request ride | ☐ PASS ☐ FAIL | | |
| Trip lifecycle | ☐ PASS ☐ FAIL | | |
| Wallet | ☐ PASS ☐ FAIL | | |
| Notifications | ☐ PASS ☐ FAIL | | |
| Offline recovery | ☐ PASS ☐ FAIL | | |

### Yala Driver

| Flow | Device result | Tester | Date |
|------|---------------|--------|------|
| Login | ☐ PASS ☐ FAIL | | |
| Go online/offline | ☐ PASS ☐ FAIL | | |
| Receive & complete ride | ☐ PASS ☐ FAIL | | |
| Wallet | ☐ PASS ☐ FAIL | | |
| Withdrawal | ☐ PASS ☐ FAIL | | |
| Notifications | ☐ PASS ☐ FAIL | | |
| Offline recovery | ☐ PASS ☐ FAIL | | |

### Yala Delivery

| Flow | Device result | Tester | Date |
|------|---------------|--------|------|
| Login | ☐ PASS ☐ FAIL | | |
| Delivery lifecycle | ☐ PASS ☐ FAIL | | |
| Notifications | ☐ PASS ☐ FAIL | | |

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Ops Manager | | | |

**Status:** PENDING physical device regression (Blocker 3 — requires on-site QA)
