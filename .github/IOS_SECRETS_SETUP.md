# iOS CI – GitHub Secrets Setup Guide

All secrets go to: **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**

---

## Step 1 — Apple Developer Account prerequisites

Before adding any secrets:

1. Sign in to [developer.apple.com](https://developer.apple.com)
2. Create **3 App IDs** (Identifiers):
   - `com.yala.driver.mr`
   - `com.yala.rider.mr`
   - `com.yala.delivery.mr`
3. Create **3 App Store Connect app entries** at [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
4. Create **3 Distribution Provisioning Profiles** (App Store type, one per bundle ID)
5. Create an **iOS Distribution Certificate** (`.p12`)

---

## Step 2 — Secrets to add

### Shared across all apps

| Secret name | How to get it |
|---|---|
| `APPLE_TEAM_ID` | developer.apple.com → Account → Membership → Team ID (10-char string like `AB12CD34EF`) |
| `IOS_DISTRIBUTION_CERT_BASE64` | Export your iOS Distribution cert from Keychain as `.p12`, then: `base64 -i cert.p12 \| pbcopy` |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | The password you set when exporting the `.p12` |
| `IOS_KEYCHAIN_PASSWORD` | Any strong random password — only used to protect the temporary CI keychain |

### App Store Connect API Key (for TestFlight upload)

1. Go to [appstoreconnect.apple.com/access/api](https://appstoreconnect.apple.com/access/api)
2. Create a key with **App Manager** role
3. Download the `.p8` file (only downloadable once)

| Secret name | Value |
|---|---|
| `ASC_KEY_ID` | The Key ID shown in App Store Connect (e.g. `ABCD123456`) |
| `ASC_ISSUER_ID` | The Issuer ID shown on the same page (UUID format) |
| `ASC_PRIVATE_KEY_BASE64` | `base64 -i AuthKey_XXXX.p8 \| pbcopy` |

### Per-app provisioning profile secrets

For **each app**, download its Distribution Provisioning Profile from developer.apple.com,
then run: `base64 -i MyProfile.mobileprovision | pbcopy`

| Secret name | Value |
|---|---|
| `IOS_DRIVER_PROVISIONING_PROFILE_BASE64` | Base64 of driver Distribution profile |
| `IOS_DRIVER_PROFILE_NAME` | Exact profile name as shown in developer.apple.com (e.g. `Yala Driver Distribution`) |
| `IOS_RIDER_PROVISIONING_PROFILE_BASE64` | Base64 of rider Distribution profile |
| `IOS_RIDER_PROFILE_NAME` | Exact profile name (e.g. `Yala Rider Distribution`) |
| `IOS_DELIVERY_PROVISIONING_PROFILE_BASE64` | Base64 of delivery Distribution profile |
| `IOS_DELIVERY_PROFILE_NAME` | Exact profile name (e.g. `Yala Delivery Distribution`) |

---

## Step 3 — Trigger a build

Push a git tag matching the workflow trigger:

```bash
# Driver app
git tag driver-v1.0.0
git push origin driver-v1.0.0

# Rider app
git tag rider-v1.0.0
git push origin rider-v1.0.0

# Delivery app
git tag delivery-v1.0.0
git push origin delivery-v1.0.0
```

Or trigger manually: GitHub → Actions → select workflow → Run workflow.

---

## Step 4 — After a successful build

1. The `.ipa` is uploaded as a GitHub Actions artifact (kept 14 days)
2. It is automatically submitted to **TestFlight**
3. In App Store Connect → TestFlight, add internal testers
4. When ready for public release: App Store Connect → Submit for Review

---

## Workflow files

| File | Triggers on |
|---|---|
| `.github/workflows/ios-driver.yml` | `driver-v*` tags |
| `.github/workflows/ios-rider.yml` | `rider-v*` tags |
| `.github/workflows/ios-delivery.yml` | `delivery-v*` tags |

All run on **macos-14** (Apple Silicon, Xcode 15).
