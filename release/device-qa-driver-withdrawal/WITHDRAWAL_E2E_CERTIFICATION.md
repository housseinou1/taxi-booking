# Withdrawal E2E Certification

**Verdict: FAIL** (API paid + rejection flows PASS; driver app UI + backend deploy gaps remain)

**When:** 2026-07-21T05:06:00Z  
**API:** https://www.yalataxi.live  
**Driver:** amadou.diallo@yala.mr (4880.20 MRU available at start)

## Certification IDs

| Item | Value |
|---|---|
| Paid withdrawal request ID | **4** |
| Rejection test request ID | **5** |
| Payment reference submitted | `BNK-E2E-4-CERT` (not persisted — migration 0016 not deployed) |
| Balance before | **4880.20 MRU** |
| Balance after paid withdrawal | **4380.20 MRU** |
| Balance after rejection returned | **4380.20 MRU** (500 MRU restored from 3880.20) |

## Results

### 1. Driver app (API — real production account)

- [PASS] Wallet loads real balance — 4880.20 MRU available
- [PASS] Payout method Bankily on file — id=5, display `BANKILY - +22248111111`
- [PASS] Cash-out amount 500 MRU submitted — POST `/payments/withdrawals/request/`
- [PASS] Single pending request created — withdrawal **#4**, status `pending`
- [PASS] Available balance reduced — 4880.20 → 4380.20 MRU
- [FAIL] Driver app UI walkthrough — no device connected (`adb` empty)

### 2. Admin dashboard (API)

- [PASS] Withdrawal appears in admin list — ids 4 (paid), 5 (rejected)
- [PASS] Driver, amount, method, timestamp visible
- [PARTIAL] Account masking — `payout_method_display` shows full phone on prod API (UI masks client-side)
- [PASS] Admin approved withdrawal #4
- [PASS] Admin marked withdrawal #4 paid
- [FAIL] Payment reference persisted — field missing on prod DB (migration 0016)

### 3. Driver verification after paid

- [PASS] Status `paid` visible on refresh
- [PASS] Available balance remains deducted (4380.20 MRU)
- [PARTIAL] Pending balance — API returns 0 (migration 0018 not deployed; reserved-balance math works via available)
- [PASS] Withdrawal appears in history/ledger (23 ledger entries)
- [PARTIAL] Reference number — withdrawal id `4` visible; `payment_reference` column not on prod
- [PASS] Driver session intact — GET `/drivers/me/` 200

### 4. Rejection test (withdrawal #5)

- [PASS] Second request created — 500 MRU, status `pending`
- [PASS] Admin rejected with reason — `E2E rejection test - invalid details`
- [PASS] Status `rejected` visible to driver
- [PASS] 500 MRU returned to available balance — 3880.20 → 4380.20 MRU
- [PASS] No duplicate ledger row for rejected withdrawal #5 (only withdrawal:4 ledger entry exists)

### 5. Security checks

- [PASS] Below 500 MRU rejected — `below_minimum`
- [PASS] Over available balance rejected — `insufficient_balance`
- [PASS] Driver cannot approve/mark paid — HTTP 403
- [PASS] OTP required for withdrawal — `send-otp` 200, invalid code rejected
- [PARTIAL] Duplicate tap/idempotency — not enforced on prod (migration 0016 + route not deployed)
- [FAIL] POST `/payments/wallet/withdrawals/` — 404 on production

## Remaining blocker

1. **Deploy backend** migrations `0016–0018` and `wallet/withdrawals/` route to production.
2. **Physical driver app QA** — install `yala-driver-1.2.23-38-20260721-000235.apk`, verify Wallet UI, Cash Out, no logout, map preserved.
3. **Payment reference field** — requires migration 0016 on production before reference survives mark-paid.
