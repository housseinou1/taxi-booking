# YALA Driver — RC1 Commit 2 Report

## Summary

Generated the signed release APK for `com.yala.driver.mr`, verified the APK
signature and package identity, and attempted device validation. No AAB was
generated and nothing was uploaded to Google Play.

## Build Environment

- Branch: `ui/design-system`
- Base commits: `1e02729d` (RC1 C1 main), `a1496a26` (RC1 C1 docs)
- JAVA_HOME: `C:\Program Files\Android\Android Studio\jbr`
- OpenJDK: `21.0.10`
- Gradle wrapper: `8.2.1`
- AGP: `8.2.1`
- Capacitor: `6.x` (cli/core/android)
- Firebase package match: `com.yala.driver.mr` in `google-services.json`
- `npx cap doctor android`: Android looking great

## Production Build and Capacitor Sync

- `npm run build` in `driver-app/`: succeeded, no new warnings.
- `REACT_APP_TYPE=driver` in `frontend/.env.driver`.
- `npx cap sync android`: succeeded, 12 Capacitor plugins synchronized.
- `driver-app/android/app/src/main/assets/capacitor.config.json`:
  - `appId: com.yala.driver.mr`
  - `appName: Yala Driver`
  - `webDir: www`

## Gradle `assembleRelease`

- Command: `C:> .\gradlew.bat assembleRelease`
- Result: `BUILD SUCCESSFUL in 5m 32s`
- 544 actionable tasks, 244 executed, 300 up-to-date.

## APK Location and Integrity

- Path: `driver-app/android/app/build/outputs/apk/release/app-release.apk`
- File name: `app-release.apk`
- Size: `14,208,948` bytes
- Build timestamp: `07/31/2026 08:58:41`
- SHA-256: `86F2BC4254DD9BA87D8F49E033E738AF08066C2AD2456DF5A4F0EC93980D3BF9`

## Package / Version / App-Label Verification

Source: `driver-app/android/app/build/outputs/apk/release/output-metadata.json`

- `applicationId`: `com.yala.driver.mr`
- `variantName`: `release`
- `versionCode`: `46`
- `versionName`: `1.2.24`
- `outputFile`: `app-release.apk`

These values match the requested app identity.

The application label `Yala Driver` is defined in
`driver-app/android/app/src/main/res/values/strings.xml` and was stamped into
`www/index.html` during the build.

## APK Signature Verification

### `jarsigner` (fallback — `apksigner` not available in this environment)

- Command: `jarsigner -verify -verbose -certs app-release.apk`
- Result: `jar verified.`

### `keytool` certificate

- Owner/Issuer: `CN=Yala Technologies, OU=Mobile, O=Yala Technologies, L=Nouakchott, ST=Nouakchott, C=MR`
- Valid until: `Sat Nov 01 14:17:46 EDT 2053`
- SHA-1: `92:B7:04:8F:ED:04:24:89:52:F5:EC:56:7D:89:6B:AE:23:AC:C6:38`
- SHA-256: `2C:24:6D:5F:F2:FC:21:A1:8D:43:9F:7F:A8:93:47:62:1F:F5:DE:0A:BE:50:46:EA:BE:62:94:24:6C:28:56:B1`
- Signature algorithm: `SHA384withRSA`

No private key or password was exposed during verification.

### Certificate Comparison

The APK certificate fingerprint matches the release keystore
(`yala-release.keystore`) configured in `driver-app/android/app/build.gradle`
and `driver-app/android/driver-signing.properties`. No mismatch was detected.

## Device Detection

- `adb` is not available in this environment.
- No Android SDK `platform-tools` installation was found in the usual locations.
- No physical device was detected.
- **Phase 6 — Device Detection: Blocked**

Because the device step is blocked, installation and physical-device smoke
testing were not performed.

## Installation

- **Phase 7 — Installation: Blocked** (no `adb`, no physical device)

## Physical-Device Smoke Test

- **Phase 8 — Physical-Device Smoke Test: Blocked** (no `adb`, no physical device)

The smoke-test matrix below reflects this blockage.

## Smoke-Test Matrix

| # | Area | Result | Device | Evidence |
|---|---|---|---|---|
| 1 | Launch and branding | Not Tested | None | Device unavailable |
| 2 | Authentication | Not Tested | None | Device unavailable |
| 3 | Driver status | Not Tested | None | Device unavailable |
| 4 | Location | Not Tested | None | Device unavailable |
| 5 | Background location | Not Tested | None | Device unavailable |
| 6 | Notifications | Not Tested | None | Device unavailable |
| 7 | Ride workflow | Not Tested | None | Device unavailable |
| 8 | Map and navigation | Not Tested | None | Device unavailable |
| 9 | Driver dashboard | Not Tested | None | Device unavailable |
| 10 | Profile and documents | Not Tested | None | Device unavailable |
| 11 | Responsiveness | Not Tested | None | Device unavailable |
| 12 | Stability | Not Tested | None | Device unavailable |

## Log Review

- No runtime logcat was captured because no device was connected.
- Gradle build log at `%TEMP%\driver-assemble-release.log` shows `BUILD SUCCESSFUL`.
- No `FATAL EXCEPTION`, `ANR`, or build errors were recorded.

## Issue Classification

- **P0:** None
- **P1:** Device smoke testing blocked by missing `adb`/physical device.
- **P2:** `apksigner` and `aapt` not available in the environment; used `jarsigner`, `keytool`, and Gradle `output-metadata.json` for verification.
- **P3:** None

## APK Readiness Verdict

The signed release APK was built and verified successfully. Package identity
and signing certificate are correct. The APK is ready for internal testing once
a physical device and `adb` are available.

## AAB Readiness Recommendation

AAB generation was not performed in this commit. AAB can be produced with
`./gradlew bundleRelease` using the same verified release configuration and
signing setup.

## RC1 Commit 3 Recommendation

Proceed to RC1 Commit 3 (AAB generation and Play Console upload preparation)
only after:

1. A physical device is connected.
2. `adb` is installed and authorized.
3. Installation and smoke-test blockers from this commit are resolved.
