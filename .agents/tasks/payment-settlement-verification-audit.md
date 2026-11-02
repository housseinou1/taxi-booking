# Payment settlement verification — audit (frontend + backend)

Date: 2026-11-02 · Branch: `feat/payment-mobile-money-selector` · **Read-only for the backend.**

## The question

Does the platform treat a payment as verified merely because its status is `paid`,
and does the backend independently validate provider settlement?

## Answer, in short

- **Frontend — it did, and it is fixed.** `payments/paymentStatus.js` described a
  `paid` status as *"Your provider confirmed this payment."* That assertion is not
  always true (see below), so it has been removed. Provider verification is now a
  separate flag that defaults to `false`.
- **Backend — `paid` is not always a provider-verified settlement.** Two reachable
  code paths set `paid` with **no provider involvement at all**, and the verified
  settlement mechanism that exists is **not wired to any endpoint**. Reported here,
  **not changed** — see "Why this was not fixed on this branch".

## Evidence — every path that sets a settled state

### Rides (`Payment.status`)

| Path | Location | Provider involved? |
|---|---|---|
| Wallet payment | `payments/views.py:142` (`wallet_pay_ride`) | No — but a **real atomic wallet debit** (`apply_wallet_transaction`, `:126`) precedes it, so money genuinely moved |
| Ride completion capture | `payments/services.py:147` (`capture_ride_payment`), called from `taxi/rides/views.py:1267` | **No.** Flips `authorized` -> `paid` when the driver completes the ride |
| Driver manual confirmation | `payments/views.py:469` (`driver_confirm_payment`) | No — but **unreachable** while the cashless policy is enforced: `:460` returns `403 unverified_confirmation_blocked` |
| Verified provider webhook | `payments/webhook_views.py` | Intended — but see below |

### Delivery / merchant (`PaymentRecord.status`)

| Path | Location | Provider involved? |
|---|---|---|
| Delivery settlement | `payments/settlement_service.py:162` | No, and **not needed**: `status = "pending"` for card + mobile money. The only other `paid` branch is the wallet branch (`:175`), which `_normalize_method` (`:78-89`) makes **unreachable**. Delivery is safe. |
| Merchant order settlement | `payments/settlement_service.py:231` | **No.** `status = "paid" if payment_timing == "before_delivery" else "pending"`, then `:266` sets `order.payment_status = "paid"` and `:270` **credits the merchant wallet** |

The merchant path is reachable two ways:

- `merchants/services/order_service.py:156` — order creation, with
  `payment_timing="before_delivery"` **hardcoded**.
- `payments/wallet_views.py:100` (`pay_merchant_order`) — customer-facing, timing taken
  from the request body with a `"before_delivery"` default.

So a merchant order paid by card or mobile money is recorded as `paid` and the merchant
wallet is credited **before any provider has collected the money**.

## The verified-settlement mechanism exists but is not connected

`payments/provider_security.py` is correct and strict: `ProviderResult.is_settled`
requires `status == "succeeded"` **and** `verified` **and** `mode == "live"`, and
`apply_verified_confirmation()` raises `ProviderResponseUnverified` for anything else
(including every mock result).

However `git grep apply_verified_confirmation -- backend` matches **one line: a comment**
(`payments/views.py:452`). The webhook endpoint does not call it — it hardcodes:

```python
# payments/webhook_views.py:55-57
settled = False
if verification.mode == MODE_LIVE:
    settled = False  # live settlement is wired only after provider activation
```

So today **no endpoint settles a payment from an independently verified provider
confirmation.** The strict machinery is present but inert, which is consistent with
"real-money integrations disabled" — and it also means the only way a payment becomes
`paid` is a wallet debit, a ride-completion capture, or the merchant timing rule.

## Frontend changes made on this branch

1. `payments/ridePaymentService.js`
   - `isPaymentSettled()` now returns true **only** for `paid`. It previously also
     accepted `authorized`, which is an authorization, not a settlement.
   - Added `hasPaymentAttempt()` — deliberately **wider** (`paid | authorized |
     pending_verification`) and documented as the *only* gate for deciding whether to
     re-submit. `create_payment` returns the existing payment for exactly those three
     statuses (`payments/views.py:238-243`), so this gate is what prevents duplicate
     payment attempts. **The retry gate was not narrowed.**
2. `rider/components/PostRidePayRate.js`
   - The single `isPaid` flag (which conflated "don't retry" with "settled") is split
     into `hasAttempt` (retry gate — behaviour unchanged) and `statusNotice` (honest
     reporting). The badge now reads "Payment settled" only for `paid`, and
     "Payment pending verification" for `authorized`/`pending_verification`, with
     matching CSS variants so a pending state is not styled as success.
3. `payments/paymentStatus.js`
   - `describePaymentStatus(status, { providerVerified = false })`. A `paid` status now
     reads "YALA has recorded this payment as settled", never "your provider confirmed".
     Provider verification is reported separately and can only be `true` when a caller
     supplies explicit evidence — the API exposes no such field, so it stays `false`.
4. i18n (`en`/`fr`/`ar`): `settledTitle`/`settledMessage` reworded; `verifiedMessage`
   added for the case where verification is genuinely known.

## Why this was not fixed on this branch

The whole of `backend/taxi/payments/` is owned by **PR #21 (`devin/backend-release`)**:

```
git diff --name-only 2cda4f6c origin/devin/backend-release -- backend/taxi/payments/
-> settlement_service.py, provider_security.py, webhook_views.py, views.py, wallet_views.py, ...
```

Changing settlement logic here would (a) conflict with that active PR and (b) alter
financial behaviour — crediting a merchant wallet — which the brief explicitly reserves
for owner approval. It is therefore raised for a decision rather than changed.

## Recommended backend fix (needs your approval)

1. **Merchant settlement** — stop deriving `paid` from `payment_timing`. For `card` and
   mobile-money methods the initial status must be `pending`; only a verified provider
   confirmation may set `paid` and trigger `_credit_merchant_wallet`.
2. **Ride completion capture** — `capture_ride_payment` promotes `authorized` -> `paid`
   with no provider check. Decide whether an authorized card/mobile-money payment should
   instead move to `pending_verification` until the provider confirms.
3. **Wire the verification path** — have the webhook handler delegate to
   `apply_verified_confirmation()` once provider credentials exist and
   `PAYMENTS_LIVE_MODE` is enabled, replacing the hardcoded `settled = False`.
4. **Expose verification state** — add a provider-verified field to the payment
   serializers so the UI can distinguish "settled" from "provider-confirmed" instead of
   inferring it.

Items 1-3 are backend changes in PR #21's territory; item 4 is additive and small.
None of them should ship without a migration/rollback plan and owner approval.

## Unchanged guarantees (verified)

- `payments/views.py:309-310` — `create_payment` **always** writes
  `status = "pending_verification"` with the comment *"Payment success must come from a
  trusted provider, driver, or admin flow."* Selecting a provider or submitting a
  reference cannot settle a payment.
- Cashless policy blocks manual confirmation (`views.py:460`) and cash methods
  (`views.py:203`).
- Provider adapters default to **mock**; `PAYMENTS_LIVE_MODE` defaults off; mock results
  can never be `is_settled` (`providers/base.py:86-89`).
