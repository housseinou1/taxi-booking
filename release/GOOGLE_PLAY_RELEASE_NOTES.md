# YALA Enterprise v1.0 — Google Play Release Notes

**Document ID:** YALA-GP-RELEASE-NOTES-001  
**Date:** 2026-07-22  
**Enterprise release:** YALA Enterprise **1.0.0**  
**Target channel:** Google Play **Internal Testing**  
**Golden commit:** `f6ffdcb4`

---

## What's new

### Yala Rider (`com.yala.rider.mr` · v1.2.7 / 19)

- YALA Enterprise v1.0.0 golden release — stable ride booking for Nouakchott pilot
- Real-time driver tracking and secure pickup PIN verification
- Yala Wallet, referrals, saved places, and trip history
- Privacy policy and account-deletion links in Settings
- Improved splash screen, app icons, and notification support
- Legal terms acceptance flow aligned with Play Store requirements

### Yala Driver (`com.yala.driver.mr` · v1.2.23 / 38)

- YALA Enterprise v1.0.0 golden release — driver and courier operations
- Go online/offline, accept rides and deliveries from one app
- Earnings dashboard, wallet, withdrawals, and document upload
- GPS arrive/start/complete workflow with geofence safety
- Session stability and native WebView improvements from RC/LC1 hardening
- Push notification support (FCM when configured)

### Yala Delivery (`com.yala.delivery.mr` · v1.0.4 / 6)

- YALA Enterprise v1.0.0 golden release — courier delivery network
- Multi-category deliveries: food, pharmacy, grocery, parcel, documents
- PIN-verified pickup and dropoff with proof-of-delivery photo
- Live tracking, in-app chat, and masked calls
- Prepay payment methods (Bankily, Masrvi, card) — cash not supported for customer requests
- Rebuilt signed AAB/APK **2026-07-22** from golden codebase

---

## Known limitations

| Limitation | Apps | Notes |
|------------|------|-------|
| Real Estate apps not in v1.0 | All RE apps | No Android wrappers exist — **not publishable** |
| Enterprise version vs Play `versionName` | Rider, Driver, Delivery | Play shows store-continuity versions (1.2.7 / 1.2.23 / 1.0.4); enterprise bundle is **1.0.0** |
| iOS not submitted | All | Android-only internal testing |
| Crashlytics not instrumented | All | Manual logcat / Play pre-launch report required |
| Delivery prod E2E | Delivery | Production smoke HTTP 400 on QA account — verify before expanding testers |
| Physical device sign-off pending | All | Internal testing only until QA completes |
| Dual referral systems | Rider | Documented KNOWN-001 — defer v1.1 |
| Offsite backups | Platform | Ops blocker for public launch, not internal track |

Reference: [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md)

---

## Upgrade notes

### For internal testers

1. **Uninstall** any debug or sideloaded build before installing the Internal Testing build (signature must match Play upload key).
2. Join the Internal Testing track via Play Console invite link.
3. Accept updated Terms & Privacy on first launch (ride and delivery legal flows).
4. Verify phone number before requesting deliveries.
5. Enable location and notification permissions when prompted.

### For release managers

| App | versionCode rule | Next upload |
|-----|------------------|-------------|
| Rider | Must exceed **19** | Increment only when uploading new binary |
| Driver | Must exceed **38** | Increment only when uploading new binary |
| Delivery | Must exceed **6** | Increment only when uploading new binary |

**Do not** decrease `versionCode`. Upload **AAB** to Internal Testing; distribute **APK** only via Play internal link or direct sideload of the same signed release artifact.

### Store listing URLs (verified live 2026-07-22)

| Item | URL |
|------|-----|
| Privacy Policy | https://www.yalataxi.live/privacy |
| Terms of Service | https://www.yalataxi.live/terms |
| Account Deletion | https://yalataxi.live/account-deletion |
| Support (Rider) | support@yalataxi.live |
| Support (Driver) | drivers@yala.mr |
| Support (Delivery) | couriers@yala.mr |

---

## Play Console “What's new” (copy-paste)

### Rider (English)

```
YALA Enterprise v1.0 — Internal Testing
• Stable ride booking with live tracking and pickup PIN
• Wallet, referrals, and safety tools
• Privacy and account-deletion links in Settings
• Bug fixes and performance improvements for Nouakchott pilot
```

### Driver (English)

```
YALA Enterprise v1.0 — Internal Testing
• Accept rides and deliveries from one driver app
• Improved session stability and GPS workflow
• Earnings, wallet, and document management
• Bug fixes from RC/LC1 hardening
```

### Delivery (English)

```
YALA Enterprise v1.0 — Internal Testing
• Courier dashboard with live tracking and PIN handoff
• Food, pharmacy, grocery, and parcel categories
• Prepay delivery requests (Bankily, Masrvi, card)
• Rebuilt for golden release quality
```

---

## Artifact reference (2026-07-22 builds)

| App | Signed AAB | Internal APK |
|-----|------------|--------------|
| Rider | `release/android/yala-rider-1.2.7-19-20260722-114230.aab` | `release/android/yala-rider-1.2.7-19-20260722-114230.apk` |
| Driver | `release/android/yala-driver-1.2.23-38-20260722-114230.aab` | `release/android/yala-driver-1.2.23-38-20260722-114230.apk` |
| Delivery | `release/android/yala-delivery-1.0.4-6-20260722-114144.aab` | `release/android/yala-delivery-1.0.4-6-20260722-114144.apk` |

Build command: `scripts/build-release-aabs.ps1` or per-app `gradlew bundleRelease assembleRelease` with signing properties configured.
