# Requirements Document

## Introduction

This feature provides a comprehensive release build preparation system for the Yala Rider and Yala Driver mobile apps. The system verifies production readiness by validating environment variables, API endpoints, SSL configuration, push notifications, app icons, splash screens, version numbers, and signing configurations. It then generates Android release builds (AAB and APK) and release notes. A pre-build checklist ensures all critical items are validated before build generation proceeds.

The apps are Capacitor-based (React frontend wrapped in native Android shells):
- **Yala Rider** (com.yala.rider.mr) — currently v1.0.6, versionCode 7
- **Yala Driver** (com.yala.driver.mr) — currently v1.0.4, versionCode 5

## Glossary

- **Build_System**: The automated release build preparation tooling (scripts and checklist logic) that validates configuration and generates release artifacts
- **Verifier**: The component of the Build_System responsible for checking production readiness of configuration, assets, and signing
- **Generator**: The component of the Build_System responsible for producing release build artifacts (AAB, APK) and release notes
- **Checklist**: The pre-build validation report that aggregates all verification results and gates build generation
- **AAB**: Android App Bundle — the upload format required by Google Play Store
- **APK**: Android Package — the installable file format for sideloading or direct distribution
- **Keystore**: The Java Key Store file (yala-rider.jks) used to sign release builds
- **Capacitor**: The native runtime bridge (v6) that wraps the React web app into a native Android shell
- **Frontend_Build**: The React production build output (www/ directory) that gets bundled into the native app

## Requirements

### Requirement 1: Verify Production Environment Variables

**User Story:** As a release engineer, I want to verify that all production environment variables are correctly configured, so that the released apps connect to the correct backend services.

#### Acceptance Criteria

1. WHEN a release build is initiated, THE Verifier SHALL check that the file `frontend/.env.rider` exists and contains `REACT_APP_API_URL` set to a full URL with `https://` protocol pointing to a production domain (api.yala.mr or api.yalataxi.live)
2. WHEN a release build is initiated, THE Verifier SHALL check that the file `frontend/.env.driver` exists and contains `REACT_APP_API_URL` set to a full URL with `https://` protocol pointing to a production domain (api.yala.mr or api.yalataxi.live)
3. WHEN a release build is initiated, THE Verifier SHALL check that `REACT_APP_WS_URL` uses the `wss://` protocol prefix and points to a production domain (api.yala.mr or api.yalataxi.live) in both rider and driver environment files
4. WHEN a release build is initiated, THE Verifier SHALL check that `REACT_APP_TYPE` is set to `rider` in `frontend/.env.rider` and to `driver` in `frontend/.env.driver`
5. IF any of the required environment variables (`REACT_APP_API_URL`, `REACT_APP_WS_URL`, `REACT_APP_TYPE`) is missing, empty, or set to a non-production value, THEN THE Verifier SHALL report the specific variable name, file path, and the reason for failure in the validation output
6. IF `frontend/.env.rider` or `frontend/.env.driver` does not exist, THEN THE Verifier SHALL report the missing file path as a blocking issue and skip further variable checks for that file

### Requirement 2: Verify API Endpoint Connectivity

**User Story:** As a release engineer, I want to confirm that the production API endpoints are reachable, so that the released apps will function correctly after installation.

#### Acceptance Criteria

1. WHEN environment verification passes, THE Verifier SHALL attempt an HTTPS GET connection to the configured `REACT_APP_API_URL` endpoint for both rider and driver apps, with a connection timeout of 10 seconds, and SHALL consider the check successful if a 2xx HTTP status is returned
2. WHEN environment verification passes, THE Verifier SHALL attempt a WebSocket connection to the configured `REACT_APP_WS_URL` endpoint for both rider and driver apps, with a connection timeout of 10 seconds, and SHALL consider the check successful if the WebSocket handshake completes
3. IF the API endpoint is unreachable or returns a non-2xx status within the timeout period, THEN THE Verifier SHALL report the endpoint URL, the connection error, and the affected app name as a blocking issue
4. IF the WebSocket endpoint is unreachable or the handshake fails within the timeout period, THEN THE Verifier SHALL report the WebSocket URL, the connection error, and the affected app name as a blocking issue

### Requirement 3: Verify SSL Configuration

**User Story:** As a release engineer, I want to verify that SSL is correctly configured for production, so that all app communications are encrypted.

#### Acceptance Criteria

1. WHEN endpoint verification is performed, THE Verifier SHALL validate that the production API certificate is not expired and is issued by a trusted Certificate Authority, and that the certificate's Common Name or Subject Alternative Name matches the configured production domain
2. WHEN endpoint verification is performed, THE Verifier SHALL validate that the certificate chain is complete by confirming all intermediate certificates are present up to a trusted root CA
3. IF the SSL certificate expires within 30 days, THEN THE Verifier SHALL report a warning with the expiration date
4. IF the SSL certificate is expired, self-signed, has a domain name mismatch with the configured production URL, or has an incomplete chain, THEN THE Verifier SHALL report the specific certificate error as a blocking issue
5. WHEN endpoint verification is performed, THE Verifier SHALL verify that the server supports TLS 1.2 or higher and SHALL report a blocking issue if only TLS 1.1 or lower is available

### Requirement 4: Verify Push Notification Configuration

**User Story:** As a release engineer, I want to verify that push notifications are configured for both apps, so that users receive real-time ride updates.

#### Acceptance Criteria

1. WHEN a release build is initiated, THE Verifier SHALL check that `google-services.json` exists in `rider-app/android/app/`
2. WHEN a release build is initiated, THE Verifier SHALL check that `google-services.json` exists in `driver-app/android/app/`
3. WHEN a release build is initiated, THE Verifier SHALL validate that the `package_name` field in each `google-services.json` matches the corresponding `applicationId` in `build.gradle` (com.yala.rider.mr and com.yala.driver.mr)
4. IF `google-services.json` is missing for either app, THEN THE Verifier SHALL report the missing file path as a blocking issue

### Requirement 5: Verify App Icons and Splash Screens

**User Story:** As a release engineer, I want to verify that app icons and splash screens are present in the correct formats, so that the apps display correctly on user devices.

#### Acceptance Criteria

1. WHEN a release build is initiated, THE Verifier SHALL check that `resources/icon.png` exists in both `rider-app/` and `driver-app/` directories
2. WHEN a release build is initiated, THE Verifier SHALL check that `resources/splash.png` exists in both `rider-app/` and `driver-app/` directories
3. WHEN a release build is initiated, THE Verifier SHALL check that Android mipmap icon resources exist in the `android/app/src/main/res/` directories for both apps
4. IF any required icon or splash screen file is missing, THEN THE Verifier SHALL report the missing file path and expected location

### Requirement 6: Verify Version Numbers

**User Story:** As a release engineer, I want to verify that version numbers are incremented and consistent, so that the Google Play Store accepts the upload.

#### Acceptance Criteria

1. WHEN a release build is initiated, THE Verifier SHALL read `versionCode` and `versionName` from each app's `android/app/build.gradle`
2. WHEN a release build is initiated, THE Verifier SHALL check that `versionCode` is a positive integer greater than the previously released versionCode
3. WHEN a release build is initiated, THE Verifier SHALL check that `versionName` follows semantic versioning format (MAJOR.MINOR.PATCH)
4. THE Verifier SHALL display the current version numbers for both apps in the checklist output (Yala Rider and Yala Driver)

### Requirement 7: Verify Build Signing Configuration

**User Story:** As a release engineer, I want to verify that the keystore and signing configuration are correct, so that the builds are properly signed for store distribution.

#### Acceptance Criteria

1. WHEN a release build is initiated, THE Verifier SHALL check that the keystore file referenced in `build.gradle` exists at the specified path
2. WHEN a release build is initiated, THE Verifier SHALL validate that `storePassword`, `keyAlias`, and `keyPassword` are defined in the signing configuration
3. IF the keystore file does not exist at the configured path, THEN THE Verifier SHALL report the missing keystore path as a blocking issue
4. IF signing configuration properties are missing or empty, THEN THE Verifier SHALL report the missing properties as a blocking issue

### Requirement 8: Generate Pre-Build Release Checklist

**User Story:** As a release engineer, I want a comprehensive checklist summarizing all verification results, so that I can confirm readiness before generating builds.

#### Acceptance Criteria

1. WHEN all verifications complete, THE Checklist SHALL display a summary with pass/fail/warning status for each verification category (environment, endpoints, SSL, push notifications, icons, versions, signing)
2. WHEN all verifications pass, THE Checklist SHALL display a "Ready for Build" confirmation
3. IF any verification has a blocking failure, THEN THE Checklist SHALL display "Not Ready for Build" with a list of blocking issues
4. THE Checklist SHALL allow the release engineer to proceed with build generation only when all blocking checks pass

### Requirement 9: Generate Android AAB Files

**User Story:** As a release engineer, I want to generate signed Android App Bundle files, so that I can upload them to the Google Play Store.

#### Acceptance Criteria

1. WHEN the Checklist confirms "Ready for Build" and the release engineer chooses to proceed, THE Generator SHALL execute the frontend build with the correct environment file for each app (.env.rider or .env.driver)
2. WHEN the frontend build completes, THE Generator SHALL run `npx cap sync` to synchronize web assets into the native Android project
3. WHEN sync completes, THE Generator SHALL execute `./gradlew bundleRelease` in the Android project directory to produce a signed AAB file
4. WHEN the AAB build completes, THE Generator SHALL verify that the output file exists at `android/app/build/outputs/bundle/release/app-release.aab`
5. IF the build process fails at any step, THEN THE Generator SHALL report the error output and the failed step

### Requirement 10: Generate Android APK Files

**User Story:** As a release engineer, I want to generate signed APK files, so that I can distribute the apps for testing or direct installation.

#### Acceptance Criteria

1. WHEN the Checklist confirms "Ready for Build" and the release engineer chooses to proceed, THE Generator SHALL execute `./gradlew assembleRelease` in the Android project directory to produce a signed APK file
2. WHEN the APK build completes, THE Generator SHALL verify that the output file exists at `android/app/build/outputs/apk/release/app-release.apk`
3. IF the APK build process fails, THEN THE Generator SHALL report the error output and the failed step

### Requirement 11: Generate Release Notes

**User Story:** As a release engineer, I want release notes generated for each build, so that I can include them in the Play Store listing and communicate changes to users.

#### Acceptance Criteria

1. WHEN build generation completes successfully, THE Generator SHALL create a release notes file containing the app name, version number, version code, and build date
2. WHEN build generation completes successfully, THE Generator SHALL include a summary of changes since the last release (derived from git log or a manual changelog)
3. THE Generator SHALL format release notes in a structure compatible with Google Play Store console (plain text, max 500 characters for the "What's new" section)
4. THE Generator SHALL save release notes to a `release-notes/` directory with a filename including the app name and version (e.g., `yala-rider-v1.0.6-release-notes.txt`)
