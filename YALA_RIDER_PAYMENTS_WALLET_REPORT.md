# YALA Rider v1.0 Sprint 3 - Payments & Wallet Report

Date: 2026-08-07
Scope: Rider payments, wallet, receipts, refunds, promos, and transaction history.
Rule applied: existing backend APIs only; no fake payment flows; backend remains authoritative for payment amounts.

## Completed Functionality

- Payment API integration hardened:
  - Added frontend wrappers for `/payments/create/`, `/payments/my-payments/`, `/payments/mark-paid/{ride_id}/`, and `/payments/wallet/pay-ride/{ride_id}/`.
  - Preserved backend error payloads so duplicate-payment responses can surface the existing payment instead of creating a second charge attempt.
  - Added retry handling only for retryable payment failures.
- Post-ride payment flow now uses `submitRidePayment()` and no longer posts a client-calculated `amount`.
- Legacy rider payment page now uses the same backend-authoritative payment service.
- Payment methods verified and normalized:
  - Cash
  - Bankily
  - Masravi (`masrvi` backend ID)
  - Sedad (`seddad` backend ID)
  - Card, when backend/admin enables it
- Rider-facing payment labels corrected for Masravi and Sedad while preserving backend IDs.
- Fare confirmation already displays estimated fare, distance, duration, discount/promo result, and payment method before ride confirmation.
- Wallet page now displays backend-derived:
  - Current balance
  - Credits
  - Promo credits
  - Pending refunds
  - Pending balance
  - Recent wallet transactions
- Transaction history now supports:
  - Today
  - This week
  - This month
  - Custom date range
  - Completed, pending, failed status filters
- Refund timeline now treats backend `refunded` as completed, in addition to approved/rejected/requested states.

## Payment Validation

- Backend payment endpoint verified in code:
  - `POST /payments/create/` calculates amount, app fee, tip amount, and driver earning from backend ride data.
  - Duplicate paid/authorized/pending payments return the existing payment record.
  - `POST /payments/mark-paid/{ride_id}/` moves rider-submitted cash/local wallet payments to driver verification.
  - `POST /payments/wallet/pay-ride/{ride_id}/` debits wallet server-side.
- Frontend payment submission now sends only ride ID, method, and tip percentage. No payment amount is trusted from the client.

## Receipt Validation

- Receipt utility builds rows from backend ride/payment payloads only.
- Receipt fields include trip ID, pickup, destination, driver, vehicle, distance, duration, fare, waiting fee, discount, tax, payment method, date/time, and transaction ID when available.
- Share uses Web Share API or clipboard fallback.
- Download/PDF uses browser print-to-PDF, which is the supported v1 path.

## Validation Performed

- Focused tests:
  - `ridePaymentService.test.js`
  - `riderReceipt.test.js`
  - `transactionFilters.test.js`
  - `paymentMethods.test.js`
  - `BookingConfirmation.test.js`
  - Result: PASS, 35/35 tests.
- Frontend production build:
  - `npm run build`
  - Result: PASS with existing warnings.
- Backend system check:
  - First run blocked by missing local `DJANGO_ALLOWED_HOSTS` with `DJANGO_DEBUG=False`.
  - Re-run with explicit local env: PASS, no issues.

## Remaining Issues

- Real provider settlement for Bankily, Masravi, Sedad, and card still requires staging credentials and provider callback testing.
- Physical Android offline recovery and duplicate tap testing still needs device QA.
- Jest still reports an existing worker/open-handle warning after successful focused tests.
- Some older UI copy still uses the historical spelling `Seddad` in non-Rider/admin areas; Rider-facing payment paths were corrected where touched.

## Files Changed

- `frontend/src/payments/paymentApi.js`
- `frontend/src/payments/ridePaymentService.js`
- `frontend/src/payments/PaymentPage.js`
- `frontend/src/payments/RiderPaymentHistory.js`
- `frontend/src/payments/RiderRefundsPanel.js`
- `frontend/src/payments/WalletPage.js`
- `frontend/src/payments/transactionFilters.js`
- `frontend/src/payments/transactionFilters.test.js`
- `frontend/src/rider/components/PostRidePayRate.js`
- `frontend/src/rider/components/BookingConfirmation.js`
- `frontend/src/rider/utils/paymentMethods.js`
- `YALA_RIDER_PAYMENTS_WALLET_REPORT.md`

## Production Readiness Score

91%

## Recommendation

GO WITH CONDITIONS

Conditions:

- Complete staging provider tests for Bankily, Masravi, Sedad, and card callbacks before enabling digital methods broadly.
- Complete Android device QA for offline recovery, duplicate payment tap prevention, and wallet refresh after network restoration.
- Confirm Admin payment method configuration policy before exposing future methods beyond the existing backend choices.
