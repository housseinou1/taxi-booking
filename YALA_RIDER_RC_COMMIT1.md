# YALA Rider — RC Commit 1 Report

**Branch:** `ui/design-system`
**Date:** 2026-08-02

---

## 1. Clean Release Baseline

**Approach:** Working on existing branch `ui/design-system`. All Rider changes
are committed on top of the existing approved pricing work (Mission 16).

**Dirty tree status before commit:**
- Modified: driver-app/www (stale built assets — driver, not rider)
- Modified: rider-app/www (tracked previous build — now updated)
- Modified: backend pricing files (already committed in Mission 16)
- Untracked: ~100+ documentation/release reports (not blocking)

**Resolution:** Rider source changes staged specifically; build artifacts and
unrelated docs excluded from commit.

---

## 2. Java Toolchain

| Item | Status |
|------|--------|
| JAVA_HOME | `C:\Program Files\Android\Android Studio\jbr` ✅ |
| Java version | OpenJDK 21.0.10 (JetBrains) ✅ |
| `gradlew.bat --version` | Gradle 8.2.1 ✅ |
| `gradlew.bat :app:tasks` | BUILD SUCCESSFUL (assemble, bundle variants present) ✅ |

**Note:** JAVA_HOME must be quoted in CMD (`set "JAVA_HOME=..."`) due to spaces
in the path.

---

## 3. Signing Configuration

| Item | Status |
|------|--------|
| Keystore | `yala-release.keystore` at repo root ✅ |
| Alias | `yala-key` ✅ |
| SHA1 | `92:B7:04:8F:ED:04:24:89:52:F5:EC:56:7D:89:6B:AE:23:AC:C6:38` |
| SHA256 | `2C:24:6D:5F:F2:FC:21:A1:8D:43:9F:7F:A8:93:47:62:1F:F5:DE:0A:BE:50:46:EA:BE:62:94:24:6C:28:56:B1` |
| Valid until | November 1, 2053 |
| `signingReport` | Release variant uses `yala-release.keystore` ✅ |
| Debug not used for release | ✅ Confirmed |
| `rider-signing.properties` | Present (gitignored) ✅ |
| Keystore guard | `build.gradle` enforces original keystore path ✅ |

**Certificate Compatibility:**
The Rider app (`com.yala.rider.mr`) and Driver app share the same upload
keystore (`yala-release.keystore`). If Rider was previously uploaded to
Google Play with this key, it will be compatible.

**P1 CHECK REQUIRED:** Manually verify in Google Play Console that
`com.yala.rider.mr` has this SHA1 fingerprint registered as the upload
certificate. If it doesn't match, this is a **P0 blocker**.

---

## 4. Version Review

| Source | versionCode | versionName |
|--------|-------------|-------------|
| `android/app/build.gradle` | 19 | 1.2.7 |
| `rider-app/package.json` | — | 1.2.7 ✅ (synchronized) |

**Status:** package.json version is already `1.2.7` — matches native.

**Manual checkpoint required:** Before any release upload, confirm the highest
existing Rider `versionCode` in Google Play Console. If existing is ≥ 19,
increment to existing + 1.

---

## 5. Environment Configuration

| Variable | Value | Status |
|----------|-------|--------|
| `REACT_APP_TYPE` | `rider` | ✅ |
| `REACT_APP_API_URL` | `https://www.yalataxi.live` | ✅ Production |
| `REACT_APP_WS_URL` | `wss://www.yalataxi.live/ws/rides/` | ✅ Production |

**Capacitor allowNavigation:** `www.yalataxi.live`, `api.yalataxi.live`, `*.yalataxi.live`

**No localhost, no dev URLs in production build.** ✅

---

## 6. Backend-Authoritative Pricing Confirmation

| Verification | Result |
|-------------|--------|
| `POST /rides/estimate/` is authoritative | ✅ Returns backend-computed fare |
| `request_ride` recalculates fare server-side | ✅ `resolve_ride_fare()` called |
| Client fare is ignored | ✅ `fare` not read from request payload |
| `RidePricingSnapshot` created atomically | ✅ Inside `transaction.atomic()` |
| `requestRide()` in apiService.js sends NO `fare` field | ✅ Confirmed |
| `buildRideRequest()` sends `estimated_fare` for display only | ✅ Backend ignores it |

Approved values remain unchanged:
- Regular: 175 + 20/km
- XL: 225 + 25/km
- Comfort: 275 + 30/km
- Share: 150 + 15/km

---

## 7. Test Results

### Rider test suite (`--testPathPattern=rider`)

| Metric | Result |
|--------|--------|
| Total suites | 41 |
| Passed suites | 37 |
| Failed suites | 4 |
| Total tests | 395 |
| Passed tests | 385 |
| Failed tests | 10 |
| Pass rate | **97.5%** |

### Fixed in this commit (3 suites, 54 tests):
- `apiService.test.js` — Updated to mock `riderApi` instead of `axios`; removed stale `getToken` import; removed `fare` from expected payload
- `RideContext.test.js` — Updated `RIDE_COMPLETED` assertion to expect `bookingStep: 'completed'`
- `utils.property.test.js` — Updated distance assertion to expect enforced minimum

### Remaining failures (4 suites, 10 tests — UI component regressions):

| Suite | Failing tests | Root cause |
|-------|---------------|------------|
| `LocationInput.test.js` | 1 | `onSelect` callback not fired (DOM event binding changed) |
| `RideHistory.test.js` | 1 | Title render condition changed |
| `BookingConfirmation.test.js` | 4 | Component prop interface changed during UI refresh |
| `RiderHome.test.js` | 4 | Integration flow depends on above components |

**Classification:** P3 — pre-existing UI component test regressions from the
design system refresh. Not pricing-related, not release-blocking for internal
testing track.

---

## 8. Production Build

| Check | Status |
|-------|--------|
| `www/index.html` contains `__YALA_APP_TYPE__="rider"` | ✅ |
| Title: "Yala Rider" | ✅ |
| Description: Rider-specific | ✅ |
| No localhost / dev API in build | ✅ |
| No Driver or Delivery branding | ✅ |
| File count in www/ | 88 files |
| `GENERATE_SOURCEMAP=false` | ✅ (per build script) |

---

## 9. Capacitor Sync & Doctor

| Command | Result |
|---------|--------|
| `npx cap sync android` | ✅ Sync finished in 3.798s |
| `npx cap doctor android` | ✅ "Android looking great! 👌" |
| Capacitor plugins | 10 plugins synced |
| Native assets contain current build | ✅ |

---

## 10. Android Configuration

| Setting | Value | Status |
|---------|-------|--------|
| appId | `com.yala.rider.mr` | ✅ |
| appName | `Yala Rider` | ✅ |
| minSdk | 22 | ✅ |
| targetSdk | 35 | ✅ |
| compileSdk | 35 | ✅ |
| Release signing | `yala-release.keystore` / `yala-key` | ✅ |
| versionCode | 19 | ✅ |
| versionName | 1.2.7 | ✅ |
| `google-services.json` | Present (Firebase) | ✅ |
| Keystore guard in build.gradle | Enforces original keystore | ✅ |

---

## 11. Remaining Issues

### P1 (Manual verification required)
- [ ] Confirm `com.yala.rider.mr` upload certificate SHA1 matches `92:B7:04:8F:...` in Google Play Console
- [ ] Confirm highest existing Rider versionCode in Play Console

### P2 (Before release upload)
- [ ] Fix 4 remaining UI component test suites (10 tests)
- [ ] Run `assembleRelease` or `bundleRelease` once approved

### P3 (Non-blocking)
- [ ] Update Capacitor from 6.2.1 to 8.5.0 (latest)
- [ ] Address Gradle deprecation warnings for Gradle 9.0 compat
- [ ] Deep link / intent filter verification on physical device

---

## 12. APK/AAB Readiness

| Item | Status |
|------|--------|
| Java toolchain | ✅ Ready |
| Gradle build | ✅ Ready |
| Signing configuration | ✅ Ready |
| Web bundle | ✅ Built and synced |
| Native plugins | ✅ 10 synced |
| Release variant available | ✅ `assembleRelease` / `bundleRelease` tasks present |
| **APK generation** | ⏸ Awaiting approval |
| **AAB generation** | ⏸ Awaiting approval |
| **Google Play upload** | ⏸ Pending P1 certificate verification |
