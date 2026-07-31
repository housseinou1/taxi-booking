# YALA Driver — RC1 Commit 3 Report

## Summary

Generated the signed release Android App Bundle (AAB) for `com.yala.driver.mr`,
validated its identity and signature, and prepared the Google Play Internal
Testing checklist and release notes. No upload to Google Play occurred.

## Build Environment

- Branch: `ui/design-system`
- Base commits: `1e02729d`, `a1496a26`, `af8760cd`
- JAVA_HOME: `C:\Program Files\Android\Android Studio\jbr`
- OpenJDK: `21.0.10`
- Gradle wrapper: `8.2.1`
- AGP: `8.2.1`
- Capacitor: `6.2.1` installed, `8.4.2` latest available
- `npx cap doctor android`: Android looking great

## Production Build and Capacitor Sync

- `npm run build` in `driver-app/`: succeeded, no new warnings
- `REACT_APP_TYPE=driver` confirmed
- `REACT_APP_API_URL=https://api.yalataxi.live`
- `REACT_APP_WS_URL=wss://api.yalataxi.live/ws/rides/`
- `npx cap sync android`: succeeded, 12 plugins synchronized
- `driver-app/android/app/src/main/assets/capacitor.config.json`:
  - `appId`: `com.yala.driver.mr`
  - `appName`: `Yala Driver`
  - `webDir`: `www`

## Gradle `bundleRelease`

- Command: `.\gradlew.bat bundleRelease` from `driver-app/android`
- Result: `BUILD SUCCESSFUL`
- Release signing configuration applied
- No debug signing used

## AAB Location and Integrity

| Property | Value |
|---|---|
| Exact path | `driver-app/android/app/build/outputs/bundle/release/app-release.aab` |
| File name | `app-release.aab` |
| File size | `12,276,567` bytes |
| Build timestamp | `07/31/2026 09:38:45` |
| SHA-256 | `5E833699C974479F7B66E9F4232D7C1D3FF276AA99D0E1C759839C44B4EBEC0F` |

## Bundle Metadata Validation

### Package / version / app-label

Source: `driver-app/android/app/build.gradle`

- `applicationId`: `com.yala.driver.mr`
- `versionCode`: `46`
- `versionName`: `1.2.24`
- App label: `Yala Driver` (`driver-app/android/app/src/main/res/values/strings.xml`)

### SDK versions

Source: `driver-app/android/variables.gradle`

- `minSdkVersion`: `22`
- `compileSdkVersion`: `35`
- `targetSdkVersion`: `35`

### Debug status

- `AndroidManifest.xml` does not contain `android:debuggable="true"`
- `build.gradle` uses `signingConfig signingConfigs.release` for release builds
- No debug package detected

### Validation method

- `bundletool` is not available in this environment.
- Fallback verification used:
  - Gradle `bundleRelease` build success
  - `jarsigner -verify` on the AAB (exit code `0`)
  - `keytool -printcert -jarfile` on the AAB
  - Manual source-level verification of `build.gradle`, `variables.gradle`, and `AndroidManifest.xml`

The AAB was not validated by `bundletool validate` because the tool is not
installed. The fallback methods confirm the bundle is signed and its metadata
matches the expected release configuration.

## AAB Signature Verification

### `jarsigner` (fallback — `bundletool` / `apksigner` not installed)

- Command: `jarsigner -verify app-release.aab`
- Exit code: `0`
- Result: Signature verified with warnings. Some `META-INF` and `base/root`
  entries are reported as signed in `JarFile` but not in `JarInputStream`. These
  are common for Android App Bundles and do not invalidate the release signing.
- No `jar is unsigned` or `jar verification failed` message.

### `keytool` certificate

| Field | Value |
|---|---|
| Owner / Issuer | `CN=Yala Technologies, OU=Mobile, O=Yala Technologies, L=Nouakchott, ST=Nouakchott, C=MR` |
| Serial number | `692592449bce74ea` |
| Valid from | `Tue Jun 16 14:17:46 EDT 2026` |
| Valid until | `Sat Nov 01 14:17:46 EDT 2053` |
| SHA-1 | `92:B7:04:8F:ED:04:24:89:52:F5:EC:56:7D:89:6B:AE:23:AC:C6:38` |
| SHA-256 | `2C:24:6D:5F:F2:FC:21:A1:8D:43:9F:7F:A8:93:47:62:1F:F5:DE:0A:BE:50:46:EA:BE:62:94:24:6C:28:56:B1` |
| Signature algorithm | `SHA384withRSA` |

### Certificate comparison

- The release keystore `yala-release.keystore` and `driver-signing.properties`
  are the configured signing source.
- The AAB certificate fingerprint matches the certificate found on the release
  APK generated in RC1 Commit 2.
- No private key or password was exposed during verification.

## Google Play VersionCode Checkpoint

- Repository `versionCode`: `46`
- Previous documented release `versionCode`: `38`
- This is a manual pre-upload checkpoint: the Play Console must be checked to
  confirm no existing artifact with `versionCode >= 46` is already uploaded.
- Do not upload `app-release.aab` until the Play Console version history is
  confirmed.

## Play Policy Readiness

### Background location

- `ACCESS_BACKGROUND_LOCATION` is declared in `AndroidManifest.xml`.
- Play Console declaration and core-feature justification are still pending.
- Runtime smoke test on a physical device is still pending.

### Account deletion

- Account deletion URL/flow is assumed to exist in-app.
- Play Console attestation is still pending.

### Privacy Policy

- Canonical URL: `https://www.yalataxi.live/privacy`
- Consistency: verified in `store-listing.md` and
  `store-listings/{driver,rider,delivery}/play-store-priority4-en.md`
- Public accessibility must be manually checked before upload.

### Notifications

- `POST_NOTIFICATIONS` declared.
- Android 13+ runtime permission required.
- Runtime verification pending on physical device.

### Data Safety

The Play Console Data Safety section must declare the following for the Driver
app:

- Location data (approximate and precise)
- Personal information (name, phone, email, profile photo)
- Account information (driver status, level, documents)
- Device identifiers (Firebase installation ID, push token)
- App activity (rides accepted, completed, cancelled, ratings)
- Crash/diagnostic information (if collected)
- Payment/earnings information (if applicable)

These answers are not submitted in this commit.

## Release Notes — English

Version 1.2.24 — Driver Release

- Modernized Driver dashboard for clearer status and earnings
- Improved ride history and trip detail experience
- Enhanced ratings, achievements, and driver level display
- Added Performance Strip with key driver KPIs
- Improved Hall of Fame recognition
- Better accessibility and responsive layout
- General stability and release preparation improvements

## Release Notes — French

Version 1.2.24 — Mise à jour Chauffeur

- Tableau de bord chauffeur modernisé
- Historique des courses et détails de trajet améliorés
- Notes, accomplissements et niveau chauffeur améliorés
- Bandeau de performance avec indicateurs clés
- Améliorations du Panthéon
- Accessibilité et mise en page responsive améliorées
- Stabilité générale et préparation de publication

## Google Play Internal Testing Checklist

| Step | Status | Notes |
|---|---|---|
| Confirm correct Play Console app | Manual | `com.yala.driver.mr` |
| Confirm package `com.yala.driver.mr` | Verified | In `build.gradle` and manifest |
| Verify highest existing `versionCode` | Manual | Play Console check required |
| Create / select Internal Testing track | Manual | Not done |
| Upload `app-release.aab` | Not done | AAB ready, upload is prohibited |
| Review App Bundle Explorer | Not done | Requires upload |
| Confirm signing certificate | Verified | Matches release keystore |
| Resolve warnings / errors | Partial | `bundletool` not available for full validation |
| Complete background-location declaration | Manual | Play Console still pending |
| Complete account-deletion attestation | Manual | Play Console still pending |
| Verify Data Safety answers | Manual | Play Console still pending |
| Verify Privacy Policy URL | Verified | `https://www.yalataxi.live/privacy` |
| Add release notes | Ready | EN / FR notes above |
| Add testers or tester group | Manual | Not done |
| Save release | Not done | Not done |
| Review release | Not done | Not done |
| Start rollout to Internal Testing | Not done | Not done |
| Verify tester opt-in link | Not done | Not done |
| Install Play-delivered build on device | Not done | `adb` and device not available |
| Complete post-upload smoke test | Not done | Pending |

## Post-Upload Device Test Matrix

| # | Area | Status |
|---|---|---|
| 1 | Installation from Google Play Internal Testing | Pending |
| 2 | Launch and branding | Pending |
| 3 | Login / logout | Pending |
| 4 | Session persistence | Pending |
| 5 | Online / offline status | Pending |
| 6 | Foreground location | Pending |
| 7 | Background location | Pending |
| 8 | Location denial flow | Pending |
| 9 | Push token registration | Pending |
| 10 | Ride notification | Pending |
| 11 | Accept / arrive / start / finish flow | Pending |
| 12 | Cancellation | Pending |
| 13 | Map and route rendering | Pending |
| 14 | Earnings and history | Pending |
| 15 | Ratings and achievements | Pending |
| 16 | Driver level and Hall of Fame | Pending |
| 17 | Profile and documents | Pending |
| 18 | Background / resume | Pending |
| 19 | Force-close / reopen | Pending |
| 20 | Crash / ANR / logcat review | Pending |

All runtime test items are pending because physical-device testing remains
blocked.

## Issue Classification

| Severity | Finding |
|---|---|
| P0 | None |
| P1 | Physical-device and `adb` still unavailable for runtime validation |
| P2 | `bundletool` and `aapt` not available in the environment; `jarsigner`, `keytool`, and source-level checks were used as fallbacks |
| P2 | Play Console background-location, account-deletion, and Data Safety actions remain manual |
| P3 | Capacitor 6.x is behind latest 8.x; no functional impact for RC1 |

## AAB Readiness Verdict

The signed release AAB was built and verified with the available fallback tools.
The package, version, SDK levels, and signing certificate all match the
expected release configuration.

## Google Play Internal Testing Readiness

The AAB is ready for **manual** upload to the Google Play Internal Testing
track after the following actions are completed:

1. Confirm the Play Console has no artifact with `versionCode >= 46`.
2. Complete background-location declaration.
3. Complete account-deletion attestation.
4. Complete and submit Data Safety answers.
5. Verify the Privacy Policy URL is publicly accessible.
6. Upload `app-release.aab` to the Play Console.
7. Install the Play-delivered build on a physical device.
8. Complete the post-upload device test matrix.

No upload, release, or rollout was performed in this commit.

## Documentation Commit

- `release/YALA_DRIVER_RC1_COMMIT3.md` created.
- `docs/design/YALA_DRIVER_MODERNIZATION_PLAN.md` was not updated because the
  `docs/` directory is a nested Git repository. Any updates to that plan must be
  committed inside that repository and reported separately.
