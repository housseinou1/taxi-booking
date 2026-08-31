# YALA Enterprise v1.0 — Google Play Internal Testing Readiness

**Document ID:** YALA-GP-READY-001  
**Date:** 2026-07-22  
**Enterprise release:** YALA Enterprise **1.0.0**  
**Golden commit:** `f6ffdcb4`  
**Validation:** Gradle build inspection · signed artifact verification · live URL checks · release builds executed 2026-07-22

---

## Decision

# ⚠️ READY WITH CONDITIONS

**Rider, Driver, and Delivery** are ready to upload to Google Play **Internal Testing** with signed AABs produced today. **Real Estate Android apps do not exist** and are excluded. Public production launch remains blocked until Play Console attestations, device QA, and ops conditions close.

---

## Phase summary

| Phase | Result |
|-------|--------|
| 1 — Versioning | ⚠ **PARTIAL** — signing OK; `versionName` ≠ literal 1.0.0 by design |
| 2 — Build releases | ✅ **PASS** — AAB + APK for Rider, Driver, Delivery |
| 3 — Play compliance | ⚠ **PARTIAL** — assets/URLs OK; Data Safety forms pending |
| 4 — Release notes | ✅ **READY** — [GOOGLE_PLAY_RELEASE_NOTES.md](./GOOGLE_PLAY_RELEASE_NOTES.md) |
| 5 — Internal checklist | ✅ **READY** — [INTERNAL_TESTING_CHECKLIST.md](./INTERNAL_TESTING_CHECKLIST.md) |
| 6 — Final status | ⚠ **READY WITH CONDITIONS** |

---

## Phase 1 — Versioning

| App | Package ID | versionName | versionCode | Target SDK | Min SDK | Release signing | Release buildType |
|-----|------------|-------------|:-----------:|:----------:|:-------:|:---------------:|:-----------------:|
| Yala Rider | `com.yala.rider.mr` | **1.2.7** ⚠ | **19** ✅ | **35** ✅ | **22** ✅ | ✅ Enabled | ✅ `release` |
| Yala Driver | `com.yala.driver.mr` | **1.2.23** ⚠ | **38** ✅ | **35** ✅ | **22** ✅ | ✅ Enabled | ✅ `release` |
| Yala Delivery | `com.yala.delivery.mr` | **1.0.4** ⚠ | **6** ✅ | **35** ✅ | **22** ✅ | ✅ Enabled | ✅ `release` |
| Real Estate (×5) | — | — | — | — | — | **N/A** | **N/A** |

### versionName = 1.0.0 verification

| Finding | Detail |
|---------|--------|
| **Result** | ❌ **Does not match literal `1.0.0`** on any publishable app |
| **Policy** | Mobile apps retain Play Store `versionName` for upgrade continuity; they ship as part of **Enterprise 1.0.0** |
| **Impact** | Internal Testing **allowed** — Play uses `versionCode` for updates |
| **Action** | Document in release notes OR bump `versionName` to `1.0.0` on next build if branding required |

Signing configuration verified in `*/android/app/build.gradle` — release keystore applied when `*-signing.properties` present (verified on workstation).

---

## Phase 2 — Build releases

### Build results (2026-07-22)

| App | Gradle result | Signed AAB | Internal APK | Signature |
|-----|:-------------:|------------|--------------|-----------|
| Yala Rider | ✅ BUILD SUCCESSFUL | ✅ 11.9 MB | ✅ 13.8 MB | ✅ Yala Technologies |
| Yala Driver | ✅ BUILD SUCCESSFUL | ✅ 12.2 MB | ✅ 14.1 MB | ✅ Yala Technologies |
| Yala Delivery | ✅ BUILD SUCCESSFUL | ✅ 12.0 MB | ✅ 13.9 MB | ✅ Yala Delivery cert |
| Real Estate | **N/A** | **N/A** | **N/A** | **N/A** |

### Artifact paths

```
release/android/yala-rider-1.2.7-19-20260722-114230.aab
release/android/yala-rider-1.2.7-19-20260722-114230.apk
release/android/yala-driver-1.2.23-38-20260722-114230.aab
release/android/yala-driver-1.2.23-38-20260722-114230.apk
release/android/yala-delivery-1.0.4-6-20260722-114144.aab
release/android/yala-delivery-1.0.4-6-20260722-114144.apk
```

### Installation verification

| Check | Result |
|-------|--------|
| `adb` on build workstation | ❌ Not available |
| Physical device install | **PENDING** — QA must verify via Play internal link or sideload APK |
| jarsigner verify on AAB/APK | ✅ Signed (self-signed upload cert; chain warning expected locally) |

---

## Phase 3 — Google Play compliance

| Item | Rider | Driver | Delivery | Evidence |
|------|:-----:|:------:|:--------:|----------|
| App name | ✅ | ✅ | ✅ | `strings.xml` / Capacitor config |
| Package ID | ✅ | ✅ | ✅ | `build.gradle` |
| App icon | ✅ | ✅ | ✅ | `mipmap/ic_launcher*` present |
| Splash screen | ✅ | ✅ | ✅ | Capacitor `SplashScreen` plugin |
| Permissions declared | ✅ | ✅ | ✅ | AndroidManifest.xml |
| Privacy Policy URL | ✅ | ✅ | ✅ | HTTP 200 |
| Terms URL | ✅ | ✅ | ✅ | HTTP 200 |
| Account Deletion URL | ✅ | ✅ | ✅ | HTTP 200 + in-app Settings |
| Support email | ✅ | ⚠ | ⚠ | Rider `support@yalataxi.live`; Driver `drivers@yala.mr`; Delivery `couriers@yala.mr` |
| Target SDK 35 | ✅ | ✅ | ✅ | `variables.gradle` |
| Min SDK 22 | ✅ | ✅ | ✅ | `variables.gradle` |
| Data Safety answers | ☐ | ☐ | ☐ | **Manual Play Console — PENDING** |

### Permissions summary

| App | Key permissions |
|-----|-----------------|
| Rider | INTERNET, FINE/COARSE LOCATION, POST_NOTIFICATIONS, CAMERA |
| Driver | + BACKGROUND LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION |
| Delivery | Same as Driver |

---

## Remaining blockers

| ID | Blocker | Severity | Owner | Required action |
|----|---------|:--------:|-------|-----------------|
| GP-B-001 | Real Estate Android apps not in v1.0 | High | Product | Exclude from Play upload plan |
| GP-B-002 | Play Console Data Safety forms incomplete | **Critical** | Product / Legal | Complete for each app before publish |
| GP-B-003 | Account deletion Play attestation not submitted | **Critical** | Product / Legal | Verify in-app flow; submit declaration |
| GP-B-004 | Physical device install QA unsigned | High | QA Lead | Install from internal track; sign DEVICE_QA |
| GP-B-005 | `versionName` ≠ literal 1.0.0 | Medium | Release Mgr | Document enterprise mapping or bump on next build |
| GP-B-006 | Store screenshots / feature graphics not uploaded | High | Marketing | Upload per `store-listings/*/screenshot-order.md` |
| GP-B-007 | Content rating questionnaire incomplete | High | Product | Complete Play questionnaire |
| GP-B-008 | Delivery prod E2E failure (QA account) | High | Engineering | Fix UAT-D-010 before expanding couriers |
| GP-B-009 | Crash reporting not instrumented | Medium | Mobile | Monitor Play pre-launch + manual logcat for internal track |
| GP-B-010 | Rider bundle may use cached web assets (July 20) | Medium | Mobile | Run `npx cap sync` + full rebuild before final upload if frontend changed |

---

## What is ready now

| Item | Status |
|------|--------|
| Signed AAB for Rider, Driver, Delivery | ✅ |
| Signed APK for internal sideload / QA | ✅ |
| Release signing configuration | ✅ |
| Target SDK 35 compliance | ✅ |
| Legal URLs live | ✅ |
| Store listing copy (EN/FR/AR) | ✅ |
| Release notes document | ✅ |
| Internal testing checklist | ✅ |

---

## What is not ready now

| Item | Status |
|------|--------|
| Real Estate Play uploads | ❌ |
| Play Console form submission | ❌ |
| Public / Open testing | ❌ |
| Production track promotion | ❌ |
| Literal versionName 1.0.0 on all apps | ❌ (by policy) |

---

## Recommended upload sequence

1. **Yala Rider** — lowest risk; AAB ready  
2. **Yala Driver** — fresh build 2026-07-22  
3. **Yala Delivery** — fresh build 2026-07-22; verify QA courier account first  

Complete Data Safety + account deletion for each app **before** clicking **Start rollout to Internal testing**.

---

## Final statement

**⚠️ READY WITH CONDITIONS** for Google Play Internal Testing for **Yala Rider**, **Yala Driver**, and **Yala Delivery**. Upload signed AABs, complete Play Console compliance forms, add internal testers, and verify installation on physical devices. **Do not upload Real Estate apps** — they are not in v1.0.

**Next command to rebuild all apps:**

```powershell
powershell -File scripts/build-release-aabs.ps1
```

**Per-app rebuild:**

```powershell
cd delivery-app/android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat bundleRelease assembleRelease
```
