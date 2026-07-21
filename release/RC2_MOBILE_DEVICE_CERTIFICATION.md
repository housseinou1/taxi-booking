# RC2 Physical Android Device Certification

**Release:** v1.0.0-rc2  
**Requirement:** Real physical Android devices only  
**API:** https://api.yalataxi.live  

## Builds under test

| App | Package | Version | AAB |
|-----|---------|---------|-----|
| Yala Rider | `com.yala.rider.mr` | 1.2.7 (19) | `release/android/yala-rider-1.2.7-19-*.aab` |
| Yala Driver | `com.yala.driver.mr` | 1.2.23 (38) | `release/android/yala-driver-1.2.23-38-*.aab` |
| Yala Delivery | `com.yala.delivery.mr` | 1.0.4 (6) | TBD |

## API pre-check (automated)

```bash
python scripts/rc2-mobile-api-smoke.py
```

## Device checklist — Rider

| Flow | Pass | Fail | Tester | Date |
|------|------|------|--------|------|
| Login | ☐ | ☐ | | |
| Registration | ☐ | ☐ | | |
| Ride booking | ☐ | ☐ | | |
| Ride lifecycle | ☐ | ☐ | | |
| Wallet | ☐ | ☐ | | |
| Push notifications | ☐ | ☐ | | |
| GPS | ☐ | ☐ | | |
| Offline recovery | ☐ | ☐ | | |
| App update | ☐ | ☐ | | |
| App restart | ☐ | ☐ | | |

## Device checklist — Driver

| Flow | Pass | Fail | Tester | Date |
|------|------|------|--------|------|
| Login | ☐ | ☐ | | |
| Go online/offline | ☐ | ☐ | | |
| Ride lifecycle | ☐ | ☐ | | |
| Wallet | ☐ | ☐ | | |
| Withdrawal | ☐ | ☐ | | |
| Push notifications | ☐ | ☐ | | |
| GPS | ☐ | ☐ | | |
| Offline recovery | ☐ | ☐ | | |
| App restart | ☐ | ☐ | | |

## Device checklist — Delivery

| Flow | Pass | Fail | Tester | Date |
|------|------|------|--------|------|
| Login | ☐ | ☐ | | |
| Delivery lifecycle | ☐ | ☐ | | |
| Payment | ☐ | ☐ | | |
| Push notifications | ☐ | ☐ | | |
| GPS | ☐ | ☐ | | |
| Offline recovery | ☐ | ☐ | | |

## Prior device evidence (RC1 — requires re-run on current builds)

| App | Last device test | Verdict |
|-----|------------------|---------|
| Rider | 2026-07-07 v1.2.1 | FAIL — fixes since deployed |
| Driver | 2026-07-07 v1.2.5 | FAIL — fixes since deployed |
| Delivery | Not certified | PENDING |

**RC2 device sign-off:** PENDING — must re-run on Rider 1.2.7 / Driver 1.2.23 / Delivery 1.0.4 APKs.
