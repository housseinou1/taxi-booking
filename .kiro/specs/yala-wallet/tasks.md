# Implementation Plan: Yala Wallet

## Overview

This plan implements the `wallet` Django app as a standalone module within the taxi-booking backend. The approach is: create models and migrations first, then the service layer with atomic operations, followed by Celery tasks, API views, signals for auto-provisioning, and finally admin registration. The wallet integrates with the existing `authapp` user model and follows the same patterns as the `payments`, `referrals`, and `rides` apps.

## Tasks

- [ ] 1. Set up wallet app structure and models
  - [ ] 1.1 Create the wallet Django app and models
    - Create `backend/taxi/wallet/` directory with `__init__.py`, `apps.py`
    - In `wallet/models.py`, define the `Wallet` model:
      - `user` OneToOneField to AUTH_USER_MODEL
      - `balance` DecimalField(12,2), default=0.00, with MinValueValidator(0.00)
      - `currency` CharField(5), default="MRU"
      - `created_at` DateTimeField(auto_now_add)
      - `updated_at` DateTimeField(auto_now)
      - Add CheckConstraint `wallet_non_negative_balance` ensuring balance >= 0
    - Define the `WalletTransaction` model:
      - `wallet` ForeignKey to Wallet
      - `transaction_type` CharField(20) with choices: top_up, ride_payment, ride_earning, withdrawal
      - `amount` DecimalField(12,2)
      - `status` CharField(20) with choices: success, failed, pending, refunded; default="success"
      - `ride_id` IntegerField, nullable
      - `payment_method` CharField(30), blank
      - `payout_method_id` IntegerField, nullable
      - `gross_fare`, `app_fee_deducted`, `tip_amount` DecimalField(12,2), nullable (for ride_earning)
      - `failure_reason` TextField, blank
      - `created_at` DateTimeField(auto_now_add)
      - Meta ordering: ["-created_at"]
    - _Requirements: 1.1, 1.2, 8.4_

  - [ ] 1.2 Generate and apply migrations
    - Run `makemigrations wallet` and `migrate`
    - Add `"wallet"` to `INSTALLED_APPS` in `taxi/settings.py`
    - _Requirements: 1.1, 8.4_

- [ ] 2. Implement service layer with atomic operations
  - [ ] 2.1 Create wallet/services.py with core operations
    - Implement `InsufficientFundsError` exception class
    - Implement `get_or_create_wallet(user)` → returns existing or new Wallet with zero balance
    - Implement `credit_wallet(wallet_id, amount, **txn_kwargs)`:
      - Wrap in `@transaction.atomic`
      - Use `select_for_update()` to lock the wallet row
      - Increment balance by amount
      - Create WalletTransaction with status="success"
    - Implement `debit_wallet(wallet_id, amount, **txn_kwargs)`:
      - Wrap in `@transaction.atomic`
      - Use `select_for_update()` to lock the wallet row
      - Check balance >= amount, raise InsufficientFundsError if not
      - Decrement balance by amount
      - Create WalletTransaction with status="success"
    - Implement `refund_withdrawal(transaction_id)`:
      - Wrap in `@transaction.atomic`
      - Lock the transaction (pending, withdrawal type) and the wallet
      - Credit back the amount, set transaction status to "refunded"
    - Implement `calculate_driver_earning(fare, tip)` → fare * 0.70 + tip
    - _Requirements: 5.1, 7.6, 8.1, 8.2, 8.3_

  - [ ]* 2.2 Write property test for wallet creation idempotence
    - **Property 1: Wallet creation idempotence**
    - Use Hypothesis to verify that calling `get_or_create_wallet` multiple times for the same user always returns the same wallet with exactly one wallet per user
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 2.3 Write property test for credit/debit correctness
    - **Property 2: Successful top-up increases balance**
    - Generate random positive amounts and initial balances; verify balance == B + amount after credit
    - **Property 6: Ride payment debit correctness**
    - Generate random fares where B >= F; verify balance == B - F after debit
    - **Validates: Requirements 3.2, 3.3, 4.2, 4.3**

  - [ ]* 2.4 Write property test for balance gate
    - **Property 5: Ride payment balance gate**
    - Generate random wallet balances and fare amounts; verify debit succeeds iff B >= F and raises InsufficientFundsError otherwise
    - **Property 10: Withdrawal balance gate and debit**
    - Same pattern for withdrawal: succeeds iff B >= A
    - **Validates: Requirements 4.1, 4.4, 7.2, 7.5**

  - [ ]* 2.5 Write property test for driver earning calculation
    - **Property 7: Driver earning calculation and credit**
    - Generate random fares (>= 0) and tips (>= 0); verify earning == fare * 0.70 + tip
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 2.6 Write property test for non-negative balance invariant
    - **Property 13: Non-negative balance invariant**
    - Generate random sequences of credits and debits; verify balance never goes below zero
    - **Validates: Requirements 8.4**

  - [ ]* 2.7 Write property test for withdrawal refund
    - **Property 11: Withdrawal refund on admin rejection**
    - Generate random pending withdrawal amounts; verify refund restores balance and sets status to "refunded"
    - **Validates: Requirements 7.6**

- [ ] 3. Checkpoint - Models and services
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Celery task and signals
  - [ ] 4.1 Create wallet/tasks.py with driver earning task
    - Implement `credit_driver_earning_task` as a Celery shared_task:
      - Parameters: driver_id, ride_id, fare (string), tip (string)
      - Convert fare and tip to Decimal
      - Get or create driver wallet
      - Calculate earning via `calculate_driver_earning`
      - Call `credit_wallet` with transaction_type="ride_earning", ride_id, gross_fare, app_fee_deducted, tip_amount
      - Configure retry: max_retries=3, retry_backoff=True, retry_backoff_max=300
      - On exception, call `self.retry(exc=exc)`
    - _Requirements: 5.4, 5.5_

  - [ ] 4.2 Create wallet/signals.py for auto-provisioning
    - Register `post_save` signal on AUTH_USER_MODEL
    - When `created=True`, call `Wallet.objects.get_or_create(user=instance)`
    - _Requirements: 1.1, 1.3_

  - [ ] 4.3 Register signal in wallet/apps.py ready()
    - Create `WalletConfig` AppConfig class
    - Import signals in `ready()` method
    - _Requirements: 1.1_

- [ ] 5. Implement serializers and API views
  - [ ] 5.1 Create wallet/serializers.py
    - `WalletSerializer` — ModelSerializer with read-only fields: id, balance, currency, created_at, updated_at
    - `WalletTransactionSerializer` — ModelSerializer with all transaction fields as read-only
    - `TopUpRequestSerializer`:
      - `amount` DecimalField(12,2), validated > 0
      - `payment_method` ChoiceField: bankily, masrvi, seddad, card
    - `WithdrawalRequestSerializer`:
      - `amount` DecimalField(12,2), validated > 0
      - `payout_method_id` IntegerField
    - _Requirements: 2.1, 3.6, 3.7, 6.2_

  - [ ] 5.2 Create wallet/views.py with WalletViewSet
    - `GET /api/wallet/balance/` — return current user wallet balance (WalletSerializer)
    - `POST /api/wallet/top_up/` — validate request, call external payment gateway stub, on success credit wallet and return transaction, on failure record failed transaction and return 402
    - `POST /api/wallet/withdraw/` — verify user is driver, validate request, debit wallet with status="pending", return 201 or 400 on insufficient funds
    - All endpoints require JWT IsAuthenticated permission
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.4, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 5.3 Create TransactionViewSet for transaction history
    - `GET /api/wallet/transactions/` — return paginated transactions ordered by -created_at
    - Support `?type=` query parameter to filter by transaction_type
    - Use IsAuthenticated permission, scope queryset to current user's wallet
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 5.4 Write property test for transaction ordering
    - **Property 8: Transaction history ordering**
    - Generate multiple transactions with different timestamps; verify API returns them in strictly descending created_at order
    - **Validates: Requirements 6.1**

  - [ ]* 5.5 Write property test for transaction filtering
    - **Property 9: Transaction filtering correctness**
    - Generate transactions of various types; verify filtering by type returns only matching transactions
    - **Validates: Requirements 6.3**

- [ ] 6. Checkpoint - API layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. URL configuration and admin
  - [ ] 7.1 Create wallet/urls.py and register routes
    - Create DefaultRouter, register WalletViewSet (basename="wallet") and TransactionViewSet (basename="wallet-transactions")
    - Include wallet URLs in the root `taxi/urls.py`
    - _Requirements: 2.2, 4.5_

  - [ ] 7.2 Create wallet/admin.py with admin registration
    - Register `WalletAdmin`:
      - list_display: user, balance, currency, created_at
      - search_fields: user__email
      - readonly_fields: balance, created_at, updated_at
    - Register `WalletTransactionAdmin`:
      - list_display: id, wallet, transaction_type, amount, status, created_at
      - list_filter: transaction_type, status
      - search_fields: wallet__user__email
      - All fields readonly
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 7.3 Write unit tests for top-up and withdrawal flows
    - Test successful top-up: balance increases, transaction created
    - Test failed payment: balance unchanged, failed transaction recorded
    - Test invalid amount (≤ 0): request rejected with 400
    - Test withdrawal success: balance decreases, pending transaction created
    - Test withdrawal insufficient funds: 400 error, balance unchanged
    - Test non-driver withdrawal: 403 error
    - **Property 3: Failed top-up preserves balance**
    - **Property 4: Invalid top-up amount rejection**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 7.1, 7.2, 7.3, 7.4, 7.5**

  - [ ]* 7.4 Write property test for atomicity
    - **Property 12: Atomicity of wallet operations**
    - Simulate failures mid-operation (mock save to raise); verify balance unchanged after rollback
    - **Validates: Requirements 8.2, 8.3**

- [ ] 8. Integration and final wiring
  - [ ] 8.1 Wire ride completion to driver earning credit
    - In the ride completion flow (existing rides app), dispatch `credit_driver_earning_task.delay(driver_id, ride_id, fare, tip)` when a ride is completed with wallet payment
    - Ensure the task is dispatched for ALL completed rides regardless of rider payment method (drivers always earn to wallet)
    - _Requirements: 5.2, 5.4_

  - [ ] 8.2 Add wallet as payment option in ride flow
    - Update the ride payment method choices to include "wallet"
    - Before ride confirmation, verify rider wallet balance >= estimated fare via `debit_wallet` at ride completion
    - On insufficient funds, reject wallet payment option with appropriate message
    - _Requirements: 4.1, 4.2, 4.5_

- [ ] 9. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The wallet app follows the same Django patterns as existing apps (payments, referrals, rides)
- External payment gateway integration is stubbed with `_charge_payment_method` — to be replaced with real Bankily/Masrvi/Seddad/Card APIs
- All balance operations use `select_for_update` + `transaction.atomic` for data integrity
- Celery task uses exponential backoff with max 3 retries for driver earning credits

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3"] },
    { "id": 7, "tasks": ["5.4", "5.5", "7.1", "7.2"] },
    { "id": 8, "tasks": ["7.3", "7.4"] },
    { "id": 9, "tasks": ["8.1", "8.2"] }
  ]
}
```
