# YALA Enterprise v1.0 Installation & Upgrade Certification

**Document ID:** YALA-REL-INSTALL-CERT-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0 Release Candidate  
**Golden commit:** `f6ffdcb4` — `release: YALA Enterprise v1.0.0 golden release candidate`  
**Tag:** `v1.0.0-rc-final` (local)  
**Scope:** Android installation, upgrade, first-use, and release artifact certification  
**Rule:** No feature additions; only production-blocking install/update/onboarding issues may be fixed.

---

## Certification Decision

| Scope | Result |
|-------|--------|
| **Production rollout (public GA)** | **FAIL** |
| **Closed beta / internal testing (≤25 supervised users)** | **PASS WITH CONDITIONS** |

Production rollout cannot be certified because:

1. No Android device was attached during this certification run — fresh install, upgrade, runtime permissions, maps, notifications, and first-transaction flows were not executed on the **golden 20260722 builds**.
2. Five requested Real Estate role apps do not exist as standalone installable Android applications in v1.0.
3. Historical device QA on **older builds** showed ride-offer and delivery-accept UI failures; those fixes are in source but are **not yet re-validated on golden APKs**.
4. Google Play Console Data Safety and account-deletion attestation remain incomplete.

---

## Actual Validation Performed (2026-07-22)

| Validation | Result | Evidence |
|------------|--------|----------|
| Android device availability | **FAIL** | `adb devices` → empty list (no attached device) |
| Backend migration drift | **PASS** | `python manage.py makemigrations --check --dry-run` → No changes detected |
| Core mobile API regression | **PASS** | `python manage.py test tests.operations tests.rides tests.deliveries --keepdb` → OK |
| Production API health | **PASS** | `https://api.yalataxi.live/api/health/ready/` → 200 (prior session) |
| Rider golden APK signature | **PASS** | `apksigner verify --print-certs` → V2 signer CN=Yala Technologies |
| Driver golden APK signature | **PASS** | `apksigner verify --print-certs` → V2 signer CN=Yala Technologies |
| Delivery golden APK signature | **PASS** | `apksigner verify --print-certs` → V2 signer CN=Yala Delivery |
| Rider golden AAB signature | **PASS** | `jarsigner -verify` → jar verified |
| Driver golden AAB signature | **PASS** | `jarsigner -verify` → jar verified |
| Delivery golden AAB signature | **PASS** | `jarsigner -verify` → jar verified |
| Package IDs / version codes | **PASS** | `aapt dump badging` on all three golden APKs |
| Declared permissions | **PASS** | Location, camera, notifications, internet declared in manifests |
| Privacy Policy URL | **PASS** | `https://yalataxi.live/privacy` → HTTP 200 |
| Account Deletion URL | **PASS** | `https://yalataxi.live/account-deletion` → HTTP 200 |
| App icons / splash source assets | **PASS** | `rider-app/resources/`, `driver-app/resources/`, `delivery-app/resources/` |
| Deep links (Rider) | **PASS WITH CONDITIONS** | `yala-rider://` + `https://yala.mr/rider` in manifest; live verification not executed |
| Deep links (Driver/Delivery) | **PENDING** | Launcher intent only; no app-link filters declared |
| Historical device QA (older builds) | **PASS WITH CONDITIONS** | See §Historical Device Evidence |
| Golden-build device QA | **NOT EXECUTED** | Requires physical device + `release/DEVICE_QA_CHECKLIST.md` |

---

## Golden Release Artifacts (validated)

| App | Signed AAB | Signed APK | versionName / code | Package ID |
|-----|------------|------------|-------------------|------------|
| Yala Rider | `release/android/yala-rider-1.2.7-19-20260722-114230.aab` (11.9 MB) | `release/android/yala-rider-1.2.7-19-20260722-114230.apk` (13.8 MB) | **1.2.7** / 19 | `com.yala.rider.mr` |
| Yala Driver | `release/android/yala-driver-1.2.23-38-20260722-114230.aab` (12.2 MB) | `release/android/yala-driver-1.2.23-38-20260722-114230.apk` (14.1 MB) | **1.2.23** / 38 | `com.yala.driver.mr` |
| Yala Delivery | `release/android/yala-delivery-1.0.4-6-20260722-114144.aab` (12.0 MB) | `release/android/yala-delivery-1.0.4-6-20260722-114144.apk` (13.9 MB) | **1.0.4** / 6 | `com.yala.delivery.mr` |

**Version note:** Store `versionName` values retain Play Store continuity (1.2.7 / 1.2.23 / 1.0.4). They ship as part of the Enterprise **1.0.0** golden bundle.

**SDK targets (all three):** minSdk 22 · targetSdk 35 · compileSdk 35

---

## Device Test Limitation

`adb devices` output on certification workstation:

```text
List of devices attached

```

Therefore the following required checks were **not executable** in this run on golden builds:

- Clean-device install
- App launch and splash screen
- Runtime permission prompts (location, notifications, camera)
- Login / register on device
- API connection from device
- Maps rendering on device
- Push notification permission and delivery
- Upgrade from previous internal build
- Session retention after update
- Crash / logcat validation
- First completed transaction (ride or delivery)

**Procedure for closing this gap:** `release/DEVICE_QA_CHECKLIST.md`, `release/sprint1/PHYSICAL_QA_STATUS_TRACKER.md`, `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`

---

## Historical Device Evidence (older builds — not golden)

Prior physical QA on Samsung `R5CN80M3ZYJ` provides partial evidence. Builds tested were **not** the 20260722 golden APKs.

| Report | Build era | Install | Login | Session restore | Maps | Notifications | First transaction | Verdict |
|--------|-----------|---------|-------|-----------------|------|---------------|-------------------|---------|
| `release/device-qa-rc/RIDER_RC1_QA_REPORT.md` | Rider 1.2.1 | PASS | PASS | PASS | PARTIAL | PARTIAL | PARTIAL (API ride flow) | FAIL → fixes in source |
| `release/device-qa-rc/DRIVER_RC1_QA_REPORT.md` | Driver 1.2.5 debug | PASS | PASS | PASS | PASS | PARTIAL | PASS (accept/complete via API) | FAIL → fixes in source |
| `release/device-qa-rc/RC4_FINAL_DEVICE_QA_REPORT.md` | RC4 APKs | PASS (all 3) | PASS (all 3) | Not tested | Not tested | Not tested | FAIL ride offer UI; FAIL delivery Accept button | FAIL |

**Interpretation:** APK installation and login have passed on device before. Ride-offer and delivery-accept UI regressions were observed on older builds. Source fixes exist (GPS on arrive, delivery payment/coords, rider active-ride restore). **Golden-build re-certification is mandatory before production.**

---

## Application Results

| Application | Result | Certification reason |
|-------------|--------|----------------------|
| Yala Rider | **PASS WITH CONDITIONS** | Golden signed AAB/APK validated locally; historical device QA partial; golden build not device-tested today |
| Yala Driver | **PASS WITH CONDITIONS** | Golden signed AAB/APK validated locally; historical session restore PASS; golden build not device-tested today |
| Yala Delivery | **PASS WITH CONDITIONS** | Golden signed AAB/APK rebuilt 2026-07-22; historical Accept-button failure on older build; golden build not device-tested today |
| Yala Real Estate Tenant | **FAIL** | No standalone Android wrapper, package ID, signed APK, or signed AAB in v1.0 repo |
| Yala Real Estate Landlord | **FAIL** | No standalone Android wrapper in v1.0 repo |
| Yala Collector | **FAIL** | No standalone Android wrapper in v1.0 repo |
| Yala Supervisor | **FAIL** | No standalone Android wrapper in v1.0 repo |
| Yala Maintenance | **FAIL** | No standalone Android wrapper in v1.0 repo |

**Out of requested scope but noted:** Admin Portal is **web-only for v1.0** per `release/ADMIN_v1_WEB_ONLY.md`. Not part of this install certification list.

---

## Phase 1 — Fresh Install

| Application | Install | Launch | Splash | Permissions | Login/Register | API | Maps | Notifications | Result |
|-------------|---------|--------|--------|-------------|----------------|-----|------|---------------|--------|
| Yala Rider | Not executed (golden) | Not executed | Not executed | Declared in manifest; runtime not validated | Historical PASS (1.2.1) | Not executed (golden) | Historical PARTIAL | Historical PARTIAL | **PASS WITH CONDITIONS** |
| Yala Driver | Not executed (golden) | Not executed | Not executed | Declared in manifest; runtime not validated | Historical PASS | Not executed (golden) | Historical PASS | Historical PARTIAL | **PASS WITH CONDITIONS** |
| Yala Delivery | Not executed (golden) | Not executed | Not executed | Declared in manifest; runtime not validated | Historical PASS | Not executed (golden) | Not validated | Not validated | **PASS WITH CONDITIONS** |
| Yala Real Estate Tenant | No artifact | — | — | — | — | — | — | — | **FAIL** |
| Yala Real Estate Landlord | No artifact | — | — | — | — | — | — | — | **FAIL** |
| Yala Collector | No artifact | — | — | — | — | — | — | — | **FAIL** |
| Yala Supervisor | No artifact | — | — | — | — | — | — | — | **FAIL** |
| Yala Maintenance | No artifact | — | — | — | — | — | — | — | **FAIL** |

---

## Phase 2 — Upgrade Test

Capacitor/WebView apps persist JWT tokens in WebView `localStorage` (`access`, `refresh`). No native SQLite migrations exist in the mobile wrappers. Same-package, same-signing-key upgrades are **expected** to retain session and cached preferences.

| Application | Previous build | Current build | Session retained | Migration/cache | Crash after update | Result |
|-------------|----------------|---------------|------------------|-----------------|-------------------|--------|
| Yala Rider | Yes — older APKs in `release/android/` | Golden `1.2.7` / 19 (20260722) | Not executed | Expected: localStorage persists | Not executed | **PASS WITH CONDITIONS** |
| Yala Driver | Yes — older APKs in `release/android/` | Golden `1.2.23` / 38 (20260722) | Historical PASS (1.2.5); golden not tested | Expected: localStorage persists | Not executed | **PASS WITH CONDITIONS** |
| Yala Delivery | Yes — older AABs/APKs | Golden `1.0.4` / 6 (20260722) | Not executed | Expected: localStorage persists | Not executed | **PASS WITH CONDITIONS** |
| Real Estate role apps | No | No | — | — | — | **FAIL** |

**Upgrade test procedure (not yet executed):**

1. Install previous internal signed build (e.g. Rider 1.2.6, Driver 1.2.22, Delivery 1.0.4 pre-20260722).
2. Sign in; confirm home screen loads.
3. Install golden APK over existing install (same signing key).
4. Launch app — confirm no crash, session restored without re-login.
5. Capture logcat during upgrade.

---

## Phase 3 — First-Time User Experience

| Step | Rider | Driver | Delivery | Real Estate role apps |
|------|-------|--------|----------|----------------------|
| Registration | Not device-validated (golden) | Not device-validated | Not device-validated | No app artifact |
| OTP (if enabled) | Not device-validated | Not device-validated | Not device-validated | No app artifact |
| Login | Historical PASS | Historical PASS | Historical PASS | No app artifact |
| Profile creation | Not device-validated | Not device-validated | Not device-validated | No app artifact |
| Location permissions | Manifest OK; runtime not validated | Manifest OK (+ background); runtime not validated | Manifest OK (+ background); runtime not validated | No app artifact |
| Notification permissions | Manifest OK; runtime not validated | Manifest OK; runtime not validated | Manifest OK; runtime not validated | No app artifact |
| First completed transaction | Historical PARTIAL (API); golden not validated | Historical PASS (API); golden not validated | Historical FAIL Accept button (older build) | No app artifact |

### Potentially confusing or broken steps (from evidence)

1. **Real Estate apps listed in certification scope do not exist** as installable Android apps — remove from v1.0 install scope or defer to post-freeze project (`release/APPLICATION_INVENTORY.md`).
2. **Delivery Accept button** failed on device during RC4 on an older build — must re-test on golden `20260722-114144` APK before beta sign-off.
3. **Ride offer UI** failed on RC4 (driver go online / receive offer) — smoke harness fixes applied in source; golden-build device re-test required.
4. **Rider PIN screen** showed home map during `driver_arrived` on RC1 — fixed in source (`/rides/active/`); golden-build re-verify required.
5. **Driver/Delivery lack deep links** — only Rider declares custom scheme and HTTPS app links. Not a fresh-install blocker unless marketing requires them for v1.0.

---

## Phase 4 — Release Artifact Validation

### Yala Rider

| Item | Status | Evidence |
|------|--------|----------|
| Signed AAB | **PASS** | `yala-rider-1.2.7-19-20260722-114230.aab`; jarsigner verified |
| Signed APK | **PASS** | `yala-rider-1.2.7-19-20260722-114230.apk`; apksigner verified |
| Version name/code | **PASS** | `1.2.7` / `19` |
| Package ID | **PASS** | `com.yala.rider.mr` |
| App icon | **PASS** | `rider-app/resources/icon.png` |
| Splash | **PASS** | `rider-app/resources/splash.png` |
| Deep links | **PASS WITH CONDITIONS** | `yala-rider://` + `https://yala.mr/rider`; assetlinks verification not executed |
| Privacy Policy URL | **PASS** | `https://yalataxi.live/privacy` → HTTP 200 |
| Account Deletion URL | **PASS WITH CONDITIONS** | `https://yalataxi.live/account-deletion` → HTTP 200; Play Console attestation pending |

### Yala Driver

| Item | Status | Evidence |
|------|--------|----------|
| Signed AAB | **PASS** | `yala-driver-1.2.23-38-20260722-114230.aab`; jarsigner verified |
| Signed APK | **PASS** | `yala-driver-1.2.23-38-20260722-114230.apk`; apksigner verified |
| Version name/code | **PASS** | `1.2.23` / `38` |
| Package ID | **PASS** | `com.yala.driver.mr` |
| App icon | **PASS** | `driver-app/resources/icon.png` |
| Splash | **PASS** | `driver-app/resources/splash.png` |
| Deep links | **PENDING** | Launcher intent only |
| Privacy Policy URL | **PASS** | `https://yalataxi.live/privacy` → HTTP 200 |
| Account Deletion URL | **PASS WITH CONDITIONS** | `https://yalataxi.live/account-deletion` → HTTP 200; Play attestation pending |

### Yala Delivery

| Item | Status | Evidence |
|------|--------|----------|
| Signed AAB | **PASS** | `yala-delivery-1.0.4-6-20260722-114144.aab`; jarsigner verified |
| Signed APK | **PASS** | `yala-delivery-1.0.4-6-20260722-114144.apk`; apksigner verified |
| Version name/code | **PASS** | `1.0.4` / 6 |
| Package ID | **PASS** | `com.yala.delivery.mr` |
| App icon | **PASS** | `delivery-app/resources/icon.png` |
| Splash | **PASS** | `delivery-app/resources/splash.png` |
| Deep links | **PENDING** | Launcher intent only |
| Privacy Policy URL | **PASS** | `https://yalataxi.live/privacy` → HTTP 200 |
| Account Deletion URL | **PASS WITH CONDITIONS** | `https://yalataxi.live/account-deletion` → HTTP 200; Play attestation pending |

### Real Estate Tenant / Landlord / Collector / Supervisor / Maintenance

| Item | Status | Evidence |
|------|--------|----------|
| Signed AAB | **FAIL** | No app wrapper or artifact |
| Signed APK | **FAIL** | No app wrapper or artifact |
| Version name/code | **FAIL** | No Android config |
| Package ID | **FAIL** | None found |
| App icon / Splash | **FAIL** | No app-specific assets |
| Deep links | **FAIL** | No manifest |
| Privacy / Account Deletion URLs | **FAIL** | No app metadata |

---

## Issues Preventing Production Rollout

| ID | Issue | Severity | Affected app(s) | Required action |
|----|-------|----------|-----------------|-----------------|
| IC-001 | No Android device attached; golden-build fresh install and upgrade not executed | **Critical** | Rider, Driver, Delivery | Attach clean device; run full `DEVICE_QA_CHECKLIST` on 20260722 APKs |
| IC-002 | Real Estate apps do not exist as standalone installable Android apps | **Critical** | Tenant, Landlord, Collector, Supervisor, Maintenance | Remove from v1.0 install scope (documented N/A) or defer to post-freeze |
| IC-003 | Golden-build device QA not completed | **Critical** | Rider, Driver, Delivery | Physical QA session on golden APKs with zero P0 failures |
| IC-004 | RC4 delivery Accept-button failure on older build | **High** | Yala Delivery | Re-test Accept flow on golden APK; file bug if reproduced |
| IC-005 | RC4 ride offer / driver online UI failure on older build | **High** | Rider, Driver | Re-test full ride lifecycle on golden APKs (paired devices) |
| IC-006 | Upgrade session/cache behavior not tested on golden builds | **High** | Rider, Driver, Delivery | Install previous build → sign in → upgrade → verify session |
| IC-007 | Runtime permissions not device-tested on golden builds | **High** | Rider, Driver, Delivery | Verify location, background location, camera, notification prompts |
| IC-008 | Push notifications not device-tested on golden builds | **Medium** | Rider, Driver, Delivery | Verify FCM permission grant and receipt |
| IC-009 | Golden code not deployed to production API | **Critical** | All mobile apps | Deploy `v1.0.0-rc-final`; re-run `scripts/platform-rc1-smoke.py` |
| IC-010 | Google Play Data Safety + account deletion forms incomplete | **Critical** | All publishable apps | Complete Play Console declarations |
| IC-011 | Offsite encrypted backups not verified | **Critical** | Platform | Complete backup validation per ops runbook |
| IC-012 | Driver/Delivery deep links not declared | **Medium** | Driver, Delivery | Add only if release-blocking for marketing/deeplink campaigns |

---

## Final Certification

| Application | Certification |
|-------------|---------------|
| Yala Rider | **PASS WITH CONDITIONS** |
| Yala Driver | **PASS WITH CONDITIONS** |
| Yala Delivery | **PASS WITH CONDITIONS** |
| Yala Real Estate Tenant | **FAIL** |
| Yala Real Estate Landlord | **FAIL** |
| Yala Collector | **FAIL** |
| Yala Supervisor | **FAIL** |
| Yala Maintenance | **FAIL** |

---

## Recommendation

**Do not approve public production rollout** from this certification run.

**Approve closed beta continuation** for Rider, Driver, and Delivery under these conditions:

1. Run physical QA on golden 20260722 APKs using `release/sprint1/PHYSICAL_QA_STATUS_TRACKER.md` (target: zero P0 failures).
2. Execute upgrade tests from previous internal signed builds.
3. Deploy golden backend to production; confirm API smoke PASS.
4. Complete Google Play Console Data Safety and account-deletion attestation.
5. Document Real Estate standalone apps as **N/A for v1.0** — do not publish or certify apps that do not exist.

**Certification owner sign-off:** Pending physical QA session completion.

**Related documents:** `release/APPLICATION_INVENTORY.md` · `release/V1_LAUNCH_DECISION.md` · `release/GOOGLE_PLAY_READY.md` · `release/DEVICE_QA_CHECKLIST.md`
