# RC4 Final Device QA Report

**Verdict: FAIL**
**Device:** R5CN80M3ZYJ
**API:** https://api.yalataxi.live

## Results

### SETUP
- [PASS] ADB device connected — R5CN80M3ZYJ
- [PASS] rider APK installed — package:/data/app/~~XanIUmh0HxGKfrDEmqO7-A==/com.yala.rider.mr-LnsG8Gwbg3eDt0B_JNvNxA==/base.apk
- [PASS] driver APK installed — package:/data/app/~~Xrg-nJ_vviC605Txe14KkQ==/com.yala.driver.mr-8hQcxzPIZq8Ev6XCFduNiQ==/base.apk
- [PASS] delivery APK installed — package:/data/app/~~ESNM-GpCVnNGpcdWnkkDQg==/com.yala.delivery.mr-3W2zl8FmzkOS179UHEwLZg==/base.apk
- [PASS] driver debug APK built — 16642 KB
- [PASS] rider debug APK built — 15083 KB
- [PASS] delivery debug APK built — 15533 KB
- [PASS] Production API health — ok
### TEST1-RIDE
- [PASS] Rider app login (device)
- [PASS] Driver app login (device)
- [FAIL] Driver go online (device)
- [PASS] Rider request ride — ride_id=49
- [FAIL] Driver receive offer (device) — ride_id=49
- [FAIL] Driver accept
- [FAIL] Driver arrive + PIN issued — **
- [FAIL] Verify PIN (device)
- [FAIL] Start ride (device)
- [FAIL] Complete ride
### TEST2-DELIVERY
- [PASS] Courier app login (device)
- [PASS] Courier delivery mode enabled — True
- [PASS] Rider request delivery — id=14 
- [FAIL] Courier accept (device) — no Accept button
- [PASS] Courier accept (API fallback) — accepted
- [PASS] Pickup PIN verified — picked_up
- [PASS] Dropoff PIN + photo + complete — delivered
### TEST3-ADMIN
- [PASS] Admin login
- [PASS] Ride in admin history — ride 49
- [PASS] Delivery in admin list — delivery 14
- [PASS] Payment dashboard updated — revenue=67.06
- [PASS] Ride payment status — authorized
- [PASS] Payment records API — HTTP 200