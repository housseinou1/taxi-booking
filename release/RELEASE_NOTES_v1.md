# YALA Platform v1.0 — Release Notes (RC1)

**Document ID:** YALA-RELEASE-NOTES-V1-RC1  
**Date:** 2026-07-23  
**Enterprise release:** YALA Enterprise **1.0.0 RC1**  
**Target channel:** Google Play **Internal Testing**  
**Feature freeze:** Active — bug fixes only

---

## What's in this release

### Yala Rider (`com.yala.rider.mr` · v1.2.8 / 20)

- RC1 rebuild from current golden source including Sprint 5–8 hardening
- Real-time driver tracking, pickup PIN, wallet, referrals, saved places
- Safety emergency panel and notification center
- Performance polish: memoized ride context, throttled map/ETA updates, lazy secondary routes
- Offline booking gate and network status banner
- Privacy policy, terms, and account-deletion links in Settings

### Yala Driver (`com.yala.driver.mr` · v1.2.25 / 40)

- RC1 rebuild — rides and deliveries from one driver app
- Go online/offline, accept/complete workflow with GPS geofence
- Earnings dashboard, wallet, withdrawals, document upload
- Push notification support (FCM when device permissions granted)
- Session stability and native WebView improvements

### Yala Delivery (`com.yala.delivery.mr` · v1.0.5 / 7)

- RC1 rebuild — courier delivery network
- Multi-category deliveries: food, pharmacy, grocery, parcel, documents
- PIN-verified pickup/dropoff with proof-of-delivery photo
- Live tracking, in-app chat, masked calls
- Prepay payment methods (Bankily, Masrvi, card)

---

## RC1 build artifacts (2026-07-23)

| App | Upload AAB (Play) | Sideload APK (internal QA) |
|-----|-------------------|----------------------------|
| Rider | `release/android/yala-rider-1.2.8-20-20260723-090505.aab` | `release/android/yala-rider-1.2.8-20-20260723-090505.apk` |
| Driver | `release/android/yala-driver-1.2.25-40-20260723-090505.aab` | `release/android/yala-driver-1.2.25-40-20260723-090505.apk` |
| Delivery | `release/android/yala-delivery-1.0.5-7-20260723-085812.aab` | `release/android/yala-delivery-1.0.5-7-20260723-090505.apk` |

All artifacts: release-signed, `jarsigner -verify` **PASS**, production API `https://www.yalataxi.live`.

---

## Bug fixes in RC1 (P0)

| Fix | Component |
|-----|-----------|
| `LocationInput.css` missing selector blocked production build | Rider |
| `RiderNotificationsPage` NotificationCenter import path | Rider |

No new features. No API or database schema changes.

---

## Known issues

| ID | Severity | Issue | Workaround |
|----|:--------:|-------|------------|
| KNOWN-RC1-001 | P0 | Physical device QA not signed off | Supervised tester cohort only |
| KNOWN-RC1-002 | P0 | Delivery prod E2E fails on QA courier account | Taxi + driver internal testing first |
| KNOWN-RC1-003 | P1 | Push delivery matrix not verified on devices | Manual notification checks during QA |
| KNOWN-RC1-004 | P1 | Play Console Data Safety / content rating pending | Complete before open testing |
| KNOWN-RC1-005 | P1 | 6 Rider unit tests failing (381/387 pass) | Non-blocking for internal upload |
| KNOWN-RC1-006 | P2 | Dual referral systems (Rider) | Documented; defer v1.1 |
| KNOWN-RC1-007 | P2 | Offsite backup DR not configured | Local backups only; blocks public GA |

Full register: [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md)

---

## Upgrade notes

### For internal testers

1. **Uninstall** any debug or sideloaded build with a mismatched signature before installing from Play Internal Testing.
2. Accept the Internal Testing invite link from Play Console.
3. Accept updated Terms & Privacy on first launch.
4. Grant **location** and **notification** permissions when prompted.
5. Verify phone number before requesting deliveries.

### For release managers

| App | Previous versionCode | RC1 versionCode | Rule |
|-----|:--------------------:|:-----------------:|------|
| Rider | 19 | **20** | Must monotonically increase |
| Driver | 38–39 | **40** | Must monotonically increase |
| Delivery | 6 | **7** | Must monotonically increase |

Upload **AAB only** to Play Console Internal Testing. Distribute APK via Play internal link or signed sideload of the same RC1 artifact — do not mix debug builds.

---

## Support contacts

| Audience | Contact |
|----------|---------|
| Riders | support@yalataxi.live |
| Drivers | drivers@yala.mr |
| Couriers | couriers@yala.mr |
| Engineering / incidents | See [INCIDENT_RESPONSE.md](../docs/INCIDENT_RESPONSE.md) |

---

## Rollback plan

1. **Play Console:** Stop rollout on Internal Testing track; re-publish prior binary if critical regression found.
2. **No backend rollback required** — RC1 is mobile-only; API unchanged.
3. **Verification after rollback:** `python scripts/platform-rc1-smoke.py` (TEST1-TAXI must pass).
4. **Communicate** to tester cohort via ops channel within 1 hour of rollback decision.

---

## Play Console “What's new” (copy-paste)

### Rider

```
YALA v1.0 RC1 — Internal Testing
• Rebuilt for production with performance and stability fixes
• Live tracking, pickup PIN, wallet, and safety tools
• Bug fixes from certification sprints 5–8
```

### Driver

```
YALA v1.0 RC1 — Internal Testing
• Rebuilt driver app with session and GPS improvements
• Accept rides and deliveries, earnings and documents
• Production-ready signing and notification support
```

### Delivery

```
YALA v1.0 RC1 — Internal Testing
• Rebuilt courier app for golden release quality
• PIN handoff, live tracking, multi-category deliveries
• Prepay delivery requests (Bankily, Masrvi, card)
```

---

## Certification reference

Full RC1 evidence: [docs/releases/YALA_RC1_CERTIFICATION.md](../docs/releases/YALA_RC1_CERTIFICATION.md)

**Recommendation:** **GO WITH CONDITIONS** — proceed to Google Play Internal Testing with supervised tester cohort.
