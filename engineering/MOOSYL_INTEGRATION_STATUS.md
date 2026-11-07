# Moosyl integration — honest status (coordinated release)

**Last updated:** 2026-11-07  
**Production / live settlement:** **OFF** (requires CEO G2)

---

## Complete (verified in repo + automated tests)

| Area | Evidence |
|------|----------|
| Aggregator adapter (Bankily, Masravi/Masrvi, Sedad) | `payments/providers/moosyl.py`, `MOOSYL_BANK_APPS` |
| Payment options API | `GET /payments/options/` — commission + method lists |
| Taxi **70/30** split on settlement & cash | `tests_moosyl_webhook`, `tests_moosyl_options` |
| Delivery **80/20** (`CommissionConfig:delivery`) | `delivery_commission_policy()`, delivery tests |
| Moosyl **1%** as YALA platform cost (not driver deduction) | `MOOSYL_FEE_PERCENT`, webhook fee tests |
| Webhook HMAC `sha256=` + fail-closed | `tests_moosyl_webhook` signature suite |
| Idempotency (`delivery_id`, 7 retries) | `ProviderWebhookEvent`, webhook tests |
| Only `completed` settles; failed/pending ignored | validation tests |
| Amount/currency MRU enforcement | validation tests |
| Sandbox vs live gates (`may_settle`, `PAYMENTS_LIVE_MODE`) | `MoosylProvider.mode` |
| Wallet tx duplicate reference dedupe (migration) | `0022` RunPython + constraint (no deletes) |
| Admin finance panel UI | `MoosylPaymentPanel.js` + Jest |
| Checkout spellings (masrvi/seddad legacy) | `paymentApi.js`, `moosyl_views.py` |

**Automated:** `payments.tests_moosyl_options` + `tests_moosyl_webhook` + `tests_provider_security` (+ wallet inventory) → **194+ tests OK** in coordinated slice (local 2026-11-07).

**Local verification script:** `scripts/run-coordinated-verification.ps1` (Django Moosyl + Jest + `build:web`).

---

## Incomplete (must finish before G2)

| Item | Notes |
|------|------|
| **Live sandbox E2E** on staging | payment-request → simulate-transfer → webhook replay → wallet readback |
| **Production webhook URL** registration | Ops + Moosyl dashboard; secrets in vault only |
| **Finance reconciliation report** sign-off | Compare Moosyl dashboard vs `Payment` / `ProviderWebhookEvent` rows |
| **Refund via Moosyl API** | Documented as **unavailable** from provider; YALA internal refund flows only |
| **Direct bank adapters** (non-Moosyl) | `PAYMENT_PROVIDER_MODE=live` bankily/masravi sedad still `unconfigured` without separate credentials |
| **Staging `$PAYMENTS_LIVE_MODE`** drill | Prove settlement stays off until explicit enable |

---

## Blocked / policy

| Blocker | Owner action |
|---------|----------------|
| **G2** live payment activation | Written CEO approval |
| **Prod wallet 0022** | Finance inventory on backup before prod `migrate` |
| **Ride #91** / prod financial rows | No change without CEO authorization |
| **Wallet migration on prod duplicates** | Run SQL inventory per `WALLET_MIGRATION_0022_RESOLUTION.md` |

---

## Not in scope of Moosyl adapter

- Driver/courier **payout** through Moosyl (adapter `payouts=False`; Yala withdrawal flow only).
- Moosyl paying drivers directly (settles to **Yala IBAN** only).

---

## Sandbox verification checklist (staging — not marked pass until executed)

- [ ] Configure `MOOSYL_*` sandbox keys in env (never git).
- [ ] Rider checkout shows Bankily / Masravi / Sedad when configured.
- [ ] Create `YALA-RIDE-*` payment-request; simulate-transfer; receive signed webhook.
- [ ] Confirm single wallet/credit movement; replay webhook → duplicate outcome.
- [ ] Delivery `YALA-DELIVERY-*` path with **80/20** split on `Payment` row.
- [ ] Failed/cancelled webhook → no settlement.
- [ ] Admin Moosyl panel shows readiness without exposing secrets.
