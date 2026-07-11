# Driver Withdrawal Device QA

**Verdict: FAIL**
**Device:** R5CN80M3ZYJ
**APK:** yala-driver-1.2.22-37-20260710-121512.apk

- [PASS] ADB device connected — R5CN80M3ZYJ
- [PASS] Install release APK — yala-driver-1.2.22-37-20260710-121512.apk
- [PASS] GET /payments/withdrawals/ — status=200
- [PASS] Available balance returned — 2680.05 MRU
- [PASS] Total earnings returned — 0.0 MRU
- [PASS] Minimum withdrawal is 500 MRU — 500.0 MRU
- [FAIL] Period earnings returned — today/week/month
- [PASS] GET /payments/payout-methods/
- [PASS] Save Bankily payout method (API) — status=201
- [FAIL] POST /payments/withdrawals/send-otp/ — status=404
- [PASS] Device login
- [FAIL] Withdrawal screen visible
- [FAIL] Shows wallet stats
- [FAIL] Shows Bankily/Sedad/Masravi
- [FAIL] POST /payments/withdrawals/request/ — OTP send failed