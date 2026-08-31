# YALA Enterprise v1.0 — Google Play Internal Testing Checklist

**Document ID:** YALA-GP-INTERNAL-CHECKLIST-001  
**Date:** 2026-07-22  
**Channel:** Google Play Internal Testing  
**Enterprise release:** 1.0.0  
**Golden commit:** `f6ffdcb4`

Status: **READY** · **PENDING** · **BLOCKED** · **N/A**

---

## Pre-upload — Artifacts

| Item | Rider | Driver | Delivery | Real Estate |
|------|:-----:|:------:|:--------:|:-----------:|
| Signed AAB present | **READY** | **READY** | **READY** | **N/A** |
| Internal APK present | **READY** | **READY** | **READY** | **N/A** |
| jarsigner verify (release cert) | **READY** | **READY** | **READY** | **N/A** |
| Gradle `bundleRelease` PASS | **READY** | **READY** | **READY** (2026-07-22) | **N/A** |
| Fresh build from golden commit | **PENDING** | **READY** (2026-07-22) | **READY** (2026-07-22) | **N/A** |

**Recommended upload artifacts (2026-07-22):**

- `release/android/yala-rider-1.2.7-19-20260722-114230.aab`
- `release/android/yala-driver-1.2.23-38-20260722-114230.aab`
- `release/android/yala-delivery-1.0.4-6-20260722-114144.aab`

---

## Play Console — Upload AAB

| Step | Rider | Driver | Delivery | Status |
|------|:-----:|:------:|:--------:|--------|
| Create/select app in Play Console | ☐ | ☐ | ☐ | **PENDING** |
| Upload AAB to **Internal testing** track | ☐ | ☐ | ☐ | **PENDING** |
| Release name set (e.g. `v1.0.0-internal-1`) | ☐ | ☐ | ☐ | **PENDING** |
| Release notes pasted (see GOOGLE_PLAY_RELEASE_NOTES.md) | ☐ | ☐ | ☐ | **PENDING** |
| Review pre-launch report | ☐ | ☐ | ☐ | **PENDING** |

---

## Play Console — Forms & compliance

| Item | Rider | Driver | Delivery | Status |
|------|:-----:|:------:|:--------:|--------|
| App name matches listing | **READY** | **READY** | **READY** | |
| Package ID correct | **READY** | **READY** | **READY** | |
| App icon (all densities) | **READY** | **READY** | **READY** | |
| Splash screen (Capacitor) | **READY** | **READY** | **READY** | |
| Privacy Policy URL | **READY** | **READY** | **READY** | Live 200 |
| Terms of Service URL | **READY** | **READY** | **READY** | Live 200 |
| Account Deletion URL | **READY** | **READY** | **READY** | Live 200 |
| Support email on listing | **READY** | **READY** | **PENDING** | Delivery uses `couriers@yala.mr` |
| Target SDK 35 | **READY** | **READY** | **READY** | |
| Min SDK 22 | **READY** | **READY** | **READY** | |
| Content rating questionnaire | ☐ | ☐ | ☐ | **PENDING** |
| Data Safety form | ☐ | ☐ | ☐ | **PENDING** |
| Account deletion declaration | ☐ | ☐ | ☐ | **PENDING** |
| Ads declaration (No ads) | ☐ | ☐ | ☐ | **PENDING** |
| Target audience / News app | ☐ | ☐ | ☐ | **PENDING** |
| Store screenshots uploaded | ☐ | ☐ | ☐ | **PENDING** |
| Feature graphic uploaded | ☐ | ☐ | ☐ | **PENDING** |

---

## Internal testers

| Step | Status | Owner |
|------|--------|-------|
| Create Internal Testing release | **PENDING** | Release Manager |
| Add tester email list (≤100) | **PENDING** | QA Lead |
| Share opt-in URL with engineering | **PENDING** | Release Manager |
| Share opt-in URL with pilot drivers (≤5) | **PENDING** | Ops |
| Share opt-in URL with pilot riders (≤10) | **PENDING** | Ops |
| Document tester roster in pilot docs | **READY** | See `PILOT_USERS.md` |

---

## Publish Internal Track

| Step | Status | Notes |
|------|--------|-------|
| Save release | **PENDING** | |
| Start rollout to Internal testing | **PENDING** | |
| Confirm “Available to internal testers” | **PENDING** | |
| Verify versionCode visible in Play Console | **PENDING** | 19 / 38 / 6 |

---

## Post-publish verification

| Step | Rider | Driver | Delivery | Status |
|------|:-----:|:------:|:--------:|--------|
| Install from Play internal link | ☐ | ☐ | ☐ | **PENDING** — no adb on build workstation |
| Cold start / splash | ☐ | ☐ | ☐ | **PENDING** |
| Login with pilot account | ☐ | ☐ | ☐ | **PENDING** |
| Core workflow smoke | ☐ | ☐ | ☐ | **PENDING** |
| Verify update from prior internal build | ☐ | ☐ | ☐ | **PENDING** |
| Play Console crash report (24h) | ☐ | ☐ | ☐ | **PENDING** |
| Firebase Crashlytics (if enabled) | ☐ | ☐ | ☐ | **PENDING** — not instrumented |

**API smoke reference:** Production 34/40 PASS — ride geofence + delivery QA account issues documented.

---

## Real Estate apps

| App | Status |
|-----|--------|
| Yala Real Estate Tenant | **BLOCKED** — not in v1.0 repo |
| Yala Real Estate Landlord | **BLOCKED** |
| Yala Real Estate Collector | **BLOCKED** |
| Yala Real Estate Supervisor | **BLOCKED** |
| Yala Real Estate Maintenance | **BLOCKED** |

Do **not** create Play Console entries until native wrappers exist.

---

## Sign-off

| Role | Internal track ready | Date |
|------|:--------------------:|------|
| Mobile Lead | ☐ | |
| QA Lead | ☐ | |
| Release Manager | ☐ | |
| Product / Legal (Data Safety) | ☐ | |

**Checklist decision:** Upload **Rider + Driver + Delivery** AABs to Internal Testing after Play Console forms are completed. Real Estate excluded.
