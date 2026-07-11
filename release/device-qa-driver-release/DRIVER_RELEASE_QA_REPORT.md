# Driver STEP 1 Release QA Report

**Verdict: PASS**
**Device:** R5CN80M3ZYJ
**APK:** yala-driver-1.2.18-33-20260709-225323.apk

- [PASS] ADB device connected — R5CN80M3ZYJ
- [PASS] Production QA prep — offlined_other_drivers count=0 | qa_driver_ready profile_id=2 user_id=4 online=False (device must tap Go Online) | cancelled_open_rides count=1
- [PASS] 1. Install release APK — yala-driver-1.2.18-33-20260709-225323.apk
- [PASS] 2. Login
- [PASS] 3. Go Online
- [PASS] Server online after toggle — True
- [PASS] 4. Receive request (API) — ride_id=86
- [PASS] 4. Receive offer (device) — ride_id=86
- [PASS] 5. Accept request — driver_arriving
- [PASS] 6. Tap Arrived (device slide)
- [PASS] 6. Arrived status + PIN — 46**
- [PASS] 7. Verify PIN
- [PASS] 8. Start Ride — in_progress
- [PASS] 9. Complete Ride — completed
- [PASS] 10. Earnings update — 481.87 -> 733.87
- [PASS] 11. History update
- [PASS] 12. Go Offline
- [PASS] 13. Logout