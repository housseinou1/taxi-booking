# YALA Pricing Live Integration

## Mission 16 — Commit 2

**Branch:** `ui/design-system`  
**Last updated:** 2026-08-01  
**Status:** Integration complete, validation pending

---

## 1. Purpose

This document records the integration of the database-backed pricing foundation (Commit 1) into the live ride flows. The `taxi.market.MARKET` dictionary is no longer the runtime source of truth for newly created rides; instead, the active `CityPricing`, `GlobalFareConfig`, and policy models are resolved at ride creation time and stored in an immutable `RidePricingSnapshot`.

---

## 2. Resolution Order

Fare and policy resolution always follows this order:

1. **Active `CityPricing`** for the requested city and ride type.
2. **Active `GlobalFareConfig`** for the ride type.
3. **`taxi.market.MARKET` fallback** — unchanged and safe.

Commission, waiting, cancellation, and no-show policies resolve through the same active-database-first order, falling back to `market.py` only when no active database record exists.

---

## 3. Centralized Resolver

`taxi.app_settings.pricing_service.resolve_ride_fare(city, ride_type, distance_km)`

Returns an immutable `FareResult` namedtuple:

| Field | Meaning |
|-------|---------|
| `source` | `city` / `global_db` / `market_fallback` |
| `ride_type` | Normalized ride type |
| `city_pricing_id` | Active `CityPricing` PK, if used |
| `global_fare_config_id` | Active `GlobalFareConfig` PK, if used |
| `base_fare` | Applied base fare |
| `per_km` | Applied per-km rate |
| `minimum_fare` | Applied minimum fare |
| `billable_distance_km` | Distance used for calculation |
| `distance_charge` | `estimated_fare - base_fare` |
| `estimated_fare` | Final rounded fare |
| `commission_percent` | Platform share used for app fee |
| `commission_config_id` | Active `RideCommissionConfig` PK |
| `waiting_policy_id` | Active `WaitingFeeConfig` PK |
| `cancellation_policy_id` | Active `CancellationFeeConfig` PK |
| `no_show_policy_id` | Active `NoShowFeeConfig` PK |
| `effective_from` | Earliest effective timestamp of the resolved fare config |
| `app_fee` | Estimated platform fee |
| `driver_earning` | Estimated driver earning |

The resolver uses `Decimal` arithmetic and `ROUND_HALF_UP` rounding.

---

## 4. Snapshot Design

`RidePricingSnapshot` is a one-to-one related model on `Ride` (`related_name="pricing_snapshot"`). It is created inside the same transaction as the `Ride` for `request_ride` and `schedule_ride`.

Captured fields include the fare structure, policy references, commission percent, effective timestamp, and the initial `app_fee` / `driver_earning` estimate. After creation, the snapshot is treated as read-only except for the clearly defined lifecycle changes to the ride itself (waiting fee, final fare, etc.).

Historical rides without a snapshot continue to work using the active-policy fallback helpers:

- `get_ride_commission_percent(ride)`
- `get_ride_cancellation_policy(ride)`
- `get_ride_waiting_policy(ride)`
- `get_ride_no_show_policy(ride)`

---

## 5. Endpoint Integration

### `POST /rides/estimate/`

- Uses `resolve_ride_fare`.
- Returns `pricing_source` and `city_override` in addition to existing fields.
- Preserves the existing estimate response contract.
- Rejects unsupported ride types.

### `POST /rides/request/`

- Resolves pricing once.
- Ignores any client-submitted `fare` value.
- Creates the `Ride` and `RidePricingSnapshot` atomically.
- Authorizes payment using the snapshot commission.
- Preserves WebSocket and broadcast behavior.

### `POST /rides/schedule/`

- Same resolver and snapshot creation as `request_ride`.
- Stores the backend-authoritative fare on the scheduled ride.

### `POST /rides/{id}/start/`

- Waiting fee uses `calculate_waiting_fee(waited_seconds, ride=ride)`.
- The snapshot's `waiting_policy` is preferred; otherwise the active policy, then `market.py`.
- App fee recalculation uses the snapshot's `commission_percent`.

### `POST /rides/{id}/cancel/`

- Cancellation and no-show fees use the snapshot's `cancellation_policy` and `no_show_policy`.
- Waiting rules use the snapshot's `waiting_policy`.
- Legacy rides fall back to active database policies or `market.py`.

---

## 6. Commission and Payments

- `taxi.payments.services.calculate_payment_amounts` accepts a `commission_percent` override.
- `authorize_ride_payment` and `authorize_corporate_ride_payment` use `get_ride_commission_percent(ride)`.
- `calculate_ride_app_fee` computes the platform fee from the original fare using the correct commission percent.
- `taxi.rides.views.calculate_money` uses `get_ride_commission_percent(ride)`.

The default 30% platform / 70% driver split is preserved through `RideCommissionConfig` seeding and the `market.py` fallback.

---

## 7. Legacy Ride Compatibility

- Rides created before this migration have no `pricing_snapshot`.
- All helpers safely fall back to active database configs, then `market.py`.
- No migration recalculates existing `Ride.fare` values.
- No settled payment records are mutated.
- No retroactive fee changes are applied.

---

## 8. Transaction Safety

`request_ride` and `schedule_ride` create the `Ride` and `RidePricingSnapshot` inside `transaction.atomic()`. This prevents:

- mismatched fare/snapshot creation,
- partial ride creation without a snapshot,
- duplicate snapshots for a single ride via the one-to-one constraint.

No `select_for_update` is used; concurrent activation changes race with the resolver, but the resolved values are captured in the snapshot at the same moment as the ride is created.

---

## 9. Admin Visibility

A read-only `RidePricingSnapshotInline` is registered on `RideAdmin`. Admins can inspect the applied source, base/per-km/minimum, distance charge, policy references, and effective timestamp, but cannot edit a snapshot.

---

## 10. Tests

Tests live in `taxi/rides/test_pricing_snapshot.py` and cover:

- Snapshot creation on `request_ride`.
- City pricing override.
- Market fallback.
- Snapshot-aware waiting fees.
- Snapshot-aware commission percent.

---

## 11. Migration

`taxi/rides/migrations/0022_ride_pricing_snapshot.py`

- Creates `RidePricingSnapshot`.
- Uses safe defaults (`Decimal` defaults, nullable policy references).
- Adds indexes on `ride` and `source`.
- Is reversible.

---

## 12. Files Changed

- `taxi/app_settings/pricing_service.py`
- `taxi/taxi/rides/models/ride.py`
- `taxi/taxi/rides/models/__init__.py`
- `taxi/taxi/rides/admin.py`
- `taxi/taxi/rides/views.py`
- `taxi/taxi/rides/services/waiting_service.py`
- `taxi/taxi/rides/services/no_show_service.py`
- `taxi/payments/services.py`
- `taxi/locations/services.py`
- `taxi/taxi/rides/migrations/0022_ride_pricing_snapshot.py`
- `taxi/taxi/rides/test_pricing_snapshot.py`
- `docs/pricing.md`
- `YALA_PRICING_LIVE_INTEGRATION.md`

---

## 13. Commit 3 — Admin Pricing Dashboard

Implemented in Mission 16 Commit 3 and documented in [YALA_ADMIN_PRICING_DASHBOARD.md](./YALA_ADMIN_PRICING_DASHBOARD.md).

## 14. Commit 4 — Final Pricing Platform

Implemented in Mission 16 Commit 4 (final) and documented in [YALA_PRICING_PLATFORM_FINAL.md](./YALA_PRICING_PLATFORM_FINAL.md):

- CEO dashboard with active/scheduled/inactive cards for every ride type and policy.
- Safe activation flow with old/new comparison and required reason.
- Pricing preview tool.
- City comparison for Nouakchott, Nouadhibou, Rosso, Kaédi, and Kiffa.
- CSV and JSON export.
- Role-based permissions (CEO, Super Admin, Pricing Administrator).
- Enhanced audit for preview, export, activation, scheduling, and effective date changes.
- No ride lifecycle, approved pricing, snapshots, payments, or historical rides changed.

Mission 16 is complete.
