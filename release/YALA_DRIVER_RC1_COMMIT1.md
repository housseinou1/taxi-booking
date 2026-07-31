# YALA Driver — RC1 Commit 1 Report

## Summary

RC1 Commit 1 finalizes the Android release configuration for `com.yala.driver.mr`.
No APK or AAB was generated. All changes are limited to release configuration,
store-listing metadata, and documentation.

## Resolved Blockers

- **P2 — Unnecessary cleartext traffic:** Removed `android:usesCleartextTraffic="true"` from `driver-app/android/app/src/main/AndroidManifest.xml`. The `network_security_config.xml` remains the single source of truth for allowed cleartext domains.
- **P2 — Inconsistent Privacy Policy URL:** Canonicalized the Driver, Rider, and Delivery store listings to `https://www.yalataxi.live/privacy`.
- **P1 — JAVA_HOME/Gradle toolchain:** Verified OpenJDK 21.0.10 from Android Studio JBR. Gradle 8.2.1 and AGP 8.2.1 are configured and the project loads successfully with `JAVA_HOME` set to `C:\Program Files\Android\Android Studio\jbr`.
- **P1 — Capacitor sync:** Fresh `npx cap sync android` completed and regenerated `capacitor.config.json` with `appId: com.yala.driver.mr` and `appName: Yala Driver`.
- **P1 — Production build:** `npm run build` in `driver-app/` succeeded with no new warnings; `driver-app/www` refreshed and stamped with `driver` app type.
- **P1 — Signing configuration:** `driver-signing.properties` is present with required keys; Gradle resolves `signingReport`, `installRelease`, and `bundleRelease` tasks without error.

## Files Modified

- `driver-app/android/app/build.gradle` — `versionCode` 46 / `versionName` 1.2.24 (was 38 / 1.2.23 in HEAD).
- `driver-app/android/app/src/main/AndroidManifest.xml` — removed `android:usesCleartextTraffic="true"`.
- `store-listing.md` — canonicalized Privacy Policy URL for Yala Rider and Yala Driver.
- `store-listings/driver/play-store-priority4-en.md` — canonicalized Privacy Policy URL.
- `store-listings/rider/play-store-priority4-en.md` — canonicalized Privacy Policy URL.
- `store-listings/delivery/play-store-priority4-en.md` — canonicalized Privacy Policy URL.
- `release/YALA_DRIVER_RC1_COMMIT1.md` — this report.

## Validation Performed

| Check | Result |
|---|---|
| OpenJDK version | 21.0.10 (Android Studio JBR) |
| Gradle version | 8.2.1 |
| `npx cap doctor android` | Android looking great |
| `npm run build` (driver-app) | Succeeded, `driver-app/www` refreshed |
| `npx cap sync android` | Succeeded, 12 plugins synchronized |
| `gradlew :app:tasks` | Succeeded, release and signing tasks available |
| `driver-app/android/app/src/main/assets/capacitor.config.json` | `appId: com.yala.driver.mr`, `appName: Yala Driver` |

## Signing Verification Summary

- Keystore: `yala-release.keystore` present in repository root.
- Signing properties file: `driver-app/android/driver-signing.properties` exists and contains the four required keys.
- `driver-app/android/app/build.gradle` enforces the original keystore path and resolves the `release` signing config.
- Gradle `signingReport` and `installRelease` tasks are listed, confirming the signing configuration loads.
- Credentials were not exposed during verification.

## Remaining Blockers

- **P1 — Signing build-time validation:** the actual keystore password/alias validity is only confirmed when a release build is run.
- **P2 — `ACCESS_BACKGROUND_LOCATION` Play declaration:** the manifest declares the permission; the Play Console data safety/permissions declaration must be completed manually.
- **P2 — Account deletion attestation:** in-app flow exists; Play Console attestation still pending.
- **P3 — Capacitor 6.x vs latest 8.x:** no functional impact for RC1.

## Release Build Readiness

- **Release APK:** Ready to attempt after RC1 Commit 1 approval. Use `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"` and `gradlew assembleRelease`.
- **Release AAB:** Ready to attempt after RC1 Commit 1 approval. Use `gradlew bundleRelease`.
- **Google Play upload:** Not yet ready; physical-device smoke test, AAB validation, and Play Console declarations are still required.
