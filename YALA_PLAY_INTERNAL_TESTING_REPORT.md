# YALA Play Internal Testing Report

**Mission LP-2**
**Branch:** `release/launch-certification`
**Date:** 2026-08-03

---

## Application Summary

| App | Package | versionCode | versionName | AAB Size | SHA-256 | Cert Expiry |
|-----|---------|-------------|-------------|----------|---------|-------------|
| Rider | com.yala.rider.mr | 26 | 1.2.9 | 11.48 MB | 53DD2C1E...E8BBF6 | 2053-11-01 |
| Driver | com.yala.driver.mr | 46 | 1.2.24 | 11.71 MB | 5E833699...EBEC0F | 2053-11-01 |
| Delivery | com.yala.delivery.mr | 6 | 1.0.4 | 11.60 MB | F3C35A1B...B0A270 | 2053-11-16 |

---

## AAB Verification

| Check | Rider | Driver | Delivery |
|-------|-------|--------|----------|
| AAB exists | ✅ | ✅ | ✅ |
| Signed | ✅ | ✅ | ✅ |
| Package correct | ✅ | ✅ | ✅ |
| versionCode unique | ✅ (26) | ✅ (46) | ✅ (6) |
| Certificate valid | ✅ 2053 | ✅ 2053 | ✅ 2053 |

---

## Signing Certificates

| App | Keystore | Alias | DN |
|-----|----------|-------|-----|
| Rider | yala-release.keystore | yala-key | CN=Yala Technologies, OU=Mobile, O=Yala Technologies, L=Nouakchott, C=MR |
| Driver | yala-release.keystore | yala-key | CN=Yala Technologies, OU=Mobile, O=Yala Technologies, L=Nouakchott, C=MR |
| Delivery | yala-delivery-upload-key.jks | yala_delivery_upload | CN=Yala Delivery, OU=Mobile, O=Yala Technologies, L=Nouakchott, C=MR |

---

## Google Play Console Checklist

### Per-App Configuration

| Item | Required | Rider | Driver | Delivery |
|------|----------|-------|--------|----------|
| Package registered | Yes | ⏸ Manual | ⏸ Manual | ⏸ Manual |
| Upload cert matches | Yes | ⏸ Manual | ⏸ Manual | ⏸ Manual |
| versionCode available | Yes | ⏸ Manual | ⏸ Manual | ⏸ Manual |
| Internal Testing track | Yes | ⏸ Create | ⏸ Create | ⏸ Create |

### Store Listing (per app)

| Item | Status |
|------|--------|
| App name | ✅ Yala Rider / Yala Driver / Yala Delivery |
| Short description | ⏸ Write |
| Full description | ⏸ Write |
| Feature graphic (1024×500) | ⏸ Create |
| Phone screenshots (min 2) | ⏸ Capture |
| App icon | ✅ (in resources/) |
| App category | ⏸ Select (Maps & Navigation) |

### Content & Privacy

| Item | Value | Status |
|------|-------|--------|
| Privacy Policy URL | https://www.yalataxi.live/legal/privacy/ | ✅ |
| Account Deletion URL | https://www.yalataxi.live/legal/account-deletion/ | ✅ |
| Support email | ⏸ Set in Console | Manual |
| Data Safety: Location | Collected for ride/delivery tracking | ⏸ Declare |
| Data Safety: Phone | Authentication | ⏸ Declare |
| Data Safety: Device ID | Firebase push notifications | ⏸ Declare |
| Background Location | Active ride/delivery tracking | ⏸ Declare |
| Notification permission | Ride/delivery status updates | ⏸ Declare |

### Release Notes (suggested)

**Rider v1.2.9:**
```
Book rides across Mauritania. Real-time tracking, fare estimates,
multiple ride types, promo codes, and cashless payments.
```

**Driver v1.2.24:**
```
Accept rides, navigate to passengers, earn with Yala.
Real-time GPS, earnings dashboard, document management.
```

**Delivery v1.0.4:**
```
Deliver packages across Mauritania. Accept orders, navigate,
earn with real-time tracking and in-app chat.
```

---

## Manual Upload Steps

For each app (Rider, Driver, Delivery):

1. Open Google Play Console → Select app
2. Go to Release → Testing → Internal testing
3. Create new release
4. Upload `app-release.aab`
5. Add release notes
6. Review and roll out to Internal Testing
7. Add testers (email list)
8. Share Internal Testing link

---

## Ready for Internal Testing?

| App | AAB | Signing | Package | Version | Status |
|-----|-----|---------|---------|---------|--------|
| Rider | ✅ | ✅ | ✅ | ✅ | **READY** |
| Driver | ✅ | ✅ | ✅ | ✅ | **READY** |
| Delivery | ✅ | ✅ | ✅ | ✅ | **READY** |

```
✅ ALL THREE APPS READY FOR INTERNAL TESTING UPLOAD
```

---

## Confirmations

- ✅ No upload performed
- ✅ No production rollout
- ✅ No Closed Testing started
- ✅ All AABs signed with production keys
- ✅ All packages verified
- ✅ All versions confirmed
