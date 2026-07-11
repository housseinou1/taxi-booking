# Yala Security Phase 2 — Device QA Report

**Time:** 2026-07-08 13:36:07 UTC
**Device:** SM-N986U1 / Android 13 / `R5CN80M3ZYJ`
**API:** https://api.yalataxi.live
**Artifacts:** `C:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa-security-phase2`

## Results

- [PASS] API health — {'status': 'ok', 'service': 'yala-api', 'database': 'ok', 'redis': 'ok'}
- [PASS] Rider login + device_id — HTTP 200 is_new=None
- [FAIL] New-device flag present — None
- [FAIL] Repeat same device not new — is_new=None
- [FAIL] List devices — HTTP 404 count={'raw': '\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Not Found</title>\n</head>\n<body>\n  <h1>Not Found</h1><p>The requested resource was not found on this server.</p>\n</body>\n</html>\n'}
- [FAIL] Integrity verify endpoint reachable — HTTP 404 body={'raw': '\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Not Found</title>\n</head>\n<body>\n  <h1>Not Found</h1><p>The requested resource was not found o
- [PASS] Junk JWT rejected — HTTP 401
- [PASS] Valid JWT /auth/me/ — HTTP 200
- [FAIL] Logout all devices — HTTP 404 {'raw': '\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Not Found</title>
- [FAIL] Post logout-all session invalidated or restricted — HTTP 404
- [PASS] Driver login — HTTP 200
- [PASS] Rider debug APK present — yala-rider-1.2.5-17-debug-registration-fix.apk
- [PASS] Install rider debug APK — 1.2.3 (15) -> 1.2.5 (17); Performing Streamed Install
Success

- [PASS] Launch rider — pid=3943 ver=1.2.5 (17)
- [PASS] Launch driver — pid=4432 ver=1.2.5 (20)
- [PASS] Launch delivery — pid=4701 ver=1.0.4 (6)
- [PASS] Launch admin — pid=4947 ver=1.0.0 (1)
- [PASS] Rider login UI dump — xml_bytes=3156
- [PASS] Device info dump — SM-N986U1 Android 13
- [PASS] Physical device (not emulator fingerprint) — samsung/c2quew/c2q:13/TP1A.220624.014/N986U1UESEHYH1:user/release-keys
- [PASS] Yala packages present — rider: com.yala.rider.mr 1.2.5 (17) | driver: com.yala.driver.mr 1.2.5 (20) | delivery: com.yala.delivery.mr 1.0.4 (6) | admin: com.yala.admin.mr 1.0.0 (1)
- [PASS] Logcat captured after rider launch — bytes=31048 trust_marker=False

**Summary:** 16 PASS / 6 FAIL / 22 total

## Notes

- Rider app data was cleared to capture a clean login screenshot.
- Re-login on device is required after this QA run for the rider app.
- Play Integrity native SDK is still soft; trust markers may be absent from logcat.
