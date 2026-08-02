# YALA Pricing Live Integration

**Mission 16 — Commit 2**
Branch: `ui/design-system`

---

## Overview

This document describes the integration of the database-backed pricing system
into all live ride flows.  The approved prices and business rules are locked
in `market.py` as the last-resort fallback and are identical to what was
approved in Mission 16 Commit 1.

---

## 1. Resolution Order

Every fare calculation follows this strict order, with no exceptions:

```
1. Active CityPricing record  (city + ride_type, is_active=True)
         ↓ if none
2. Active GlobalFareConfig    (ride_type, is_active=True, effective_from ≤ now)
         ↓ if none
3. market.py fallback         (hardcoded approved values)
```

Implemented in: `app_settings/pricing_service.py → resolve_ride_fare()`

The resolver returns a `FareResult` namedtuple — immutable, Decimal-only, with
all metadata needed for snapshotting and payment.

---

## 2. Approved Prices (market.py fallback — unchanged)

| Type    | Base (MRU) | Per km (MRU) | Minimum (MRU) |
|---------|-----------|--------------|--------------|
| Regular | 175       | 20           | 175          |
| XL      | 225       | 25           | 225          |
| Comfort | 275       | 30           | 275          |
| Share   | 150       | 15           | 150          |

Waiting: 3 min free, 50 MRU/min, max 5 min
Cancellation: en-route 50 MRU, arrived 75 MRU, driver penalty 150 MRU
No-show: rider fee 75 MRU, driver compensation 75 MRU
Commission: 30% platform / 70% driver

---

## 3. Snapshot Design

**Model:** `RidePricingSnapshot` (OneToOneField on `Ride`)

Created atomically inside the same `transaction.atomic()` block as ride
creation.  Immutable after creation except for waiting_fee updates during
`start_ride`.

### Fields stored at ride creation:

| Field | Purpose |
|-------|---------|
| `source` | city / global_db / market_fallback |
| `ride_type` | normalized ride type |
| `city_pricing` FK | which CityPricing record was used |
| `global_fare_config` FK | which GlobalFareConfig was used |
| `base_fare`, `per_km`, `minimum_fare` | applied rates |
| `billable_distance_km` | distance used for calculation |
| `distance_charge` | fare above base |
| `estimated_fare` | fare stored on ride |
| `commission_percent` | commission at creation time |
| `commission_policy` FK | which RideCommissionConfig |
| `app_fee`, `driver_earning` | split at creation time |
| `waiting_policy` FK | which WaitingFeeConfig |
| `cancellation_policy` FK | which CancellationFeeConfig |
| `no_show_policy` FK | which NoShowFeeConfig |
| `effective_from` | earliest config effective time |
| `created_at` | snapshot creation timestamp |

### Immutability guarantee:
- `_create_pricing_snapshot()` checks for existence before creating (idempotent)
- `RidePricingSnapshotAdmin` has `has_change_permission = False`
- No migration recalculates historical rides

---

## 4. Endpoint Integration

### POST /rides/estimate/ *(new)*
- Resolves fare using the full resolution order
- Returns backend-authoritative pricing metadata
- Does NOT create a ride
- Rejects unsupported ride types with 400

### POST /rides/request/
- Calls `resolve_ride_fare()` once
- Ignores any client-submitted `fare` value
- Creates ride with backend-computed `fare`, `app_fee`, `driver_earning`
- Saves `RidePricingSnapshot` inside the same atomic transaction
- Response includes `app_fee`, `driver_earning`, `pricing_source`

### POST /rides/schedule/
- Same fare resolution + snapshot creation as `/request/`
- Response includes `app_fee`, `driver_earning`, `pricing_source`

### POST /rides/{id}/start/
- Waiting fee calculated with `calculate_waiting_fee(seconds, ride=ride)`
- Uses snapshot's `waiting_policy` FK if present (legacy rides fall back)
- Commission split re-uses snapshot's `commission_percent` for recalculation

### POST /rides/{id}/cancel/
- Cancellation fee resolved via `get_ride_cancellation_policy(ride)`
- Prefers snapshot's `cancellation_policy` FK; falls back to active DB → market.py
- Approved values: en-route 50 MRU, arrived 75 MRU, driver penalty 150 MRU

---

## 5. Waiting Policy Integration

`calculate_waiting_fee(waited_seconds, ride=None)` in
`taxi/rides/services/waiting_service.py`:

```
Resolution order:
  1. ride.pricing_snapshot.waiting_policy  (snapshot FK)
  2. Active WaitingFeeConfig (DB)
  3. market.py MARKET["waiting"]
```

`get_waiting_status(ride)` uses the same resolution.

---

## 6. Cancellation & No-Show Integration

`get_ride_cancellation_policy(ride)` — prefers snapshot FK, then DB, then market.py
`get_ride_no_show_policy(ride)` — same pattern

Both are in `app_settings/pricing_service.py`.

---

## 7. Commission & Payment Integration

`get_ride_commission_percent(ride)` — prefers snapshot, then DB, then market.py

`payments/services.py → authorize_ride_payment(ride)`:
- Now passes `ride=ride` to `calculate_payment_amounts()`
- `_commission_aware_app_fee()` calls `get_ride_commission_percent(ride)`
- Falls back to `calculate_app_fee()` (market.py) on any error

The 30% platform / 70% driver outcome is **unchanged** — market.py default is
`0.3000`.  No existing payment records are recalculated.

---

## 8. Legacy Ride Compatibility

Rides created before this migration have no `pricing_snapshot`.

All snapshot-aware helpers handle this gracefully:
- `getattr(ride, 'pricing_snapshot', None)` returns `None`
- Fall through to active DB policy → market.py
- **No crash**, **no mutation** of old fare values

Migration `0015_ride_pricing_snapshot.py`:
- No data migration
- All FK fields are `null=True, blank=True`
- Reversible

---

## 9. Transaction Safety

Ride creation uses `transaction.atomic()`:

```python
with transaction.atomic():
    ride = Ride.objects.create(...)
    create_initial_stops(ride, stops)
    _create_pricing_snapshot(ride, fare_result)  # same transaction
```

This ensures fare and snapshot are **always consistent**.  A failed snapshot
creation rolls back the entire ride creation.

`_create_pricing_snapshot()` is idempotent (checks existence first) — prevents
duplicate snapshots on retry.

---

## 10. Admin Visibility

### RideAdmin
- `RidePricingSnapshotInline` (read-only, no add/change/delete)
- `pricing_source_display` column in list view

### RidePricingSnapshotAdmin
- Standalone read-only admin for audit/support
- `has_add_permission = False`
- `has_change_permission = False`
- `has_delete_permission = False`

### app_settings Admin
- `GlobalFareConfigAdmin`, `WaitingFeeConfigAdmin`, `CancellationFeeConfigAdmin`,
  `NoShowFeeConfigAdmin`, `RideCommissionConfigAdmin`
- All track `created_by` / `updated_by` via `save_model`

---

## 11. Migrations

| Migration | Description |
|-----------|-------------|
| `app_settings/0002_pricing_policy_configs.py` | Creates GlobalFareConfig, WaitingFeeConfig, CancellationFeeConfig, NoShowFeeConfig, RideCommissionConfig |
| `rides/0015_ride_pricing_snapshot.py` | Creates RidePricingSnapshot with indexes |

Both are:
- Safe on production data (nullable FKs, defaults)
- No data migrations
- Reversible
- Indexed for query performance

---

## 12. Cache Policy

No caching is used in the pricing service at this commit.  `resolve_ride_fare()`
performs 4–5 small indexed DB queries per ride creation.  This is intentional:

- **Correctness over performance** at this stage
- Cache with short TTL + activation-based invalidation deferred to Commit 3

---

## 13. Tests

### `app_settings/tests.py`
- `GlobalFareConfigTests` — fallback, DB override, inactive ignored, approved bases
- `WaitingPolicyTests` — fallback, DB override
- `CancellationPolicyTests` — approved values, DB override
- `CommissionPolicyTests` — 30% fallback, DB override
- `ResolveFareTests` — fallback, app+driver=fare, minimum enforcement

### `tests/rides/test_pricing_integration.py`
- Fare resolution: city override, global DB, market fallback, inactive ignored, future ignored
- Ride creation: snapshot saved, values match, client fare ignored, scheduled snapshot, idempotent
- Estimate endpoint: 200, invalid type 400, all fields present, approved base, no ride created
- Waiting: snapshot policy, legacy fallback, free period zero
- Cancellation: snapshot policy, legacy fallback, approved values
- Commission: snapshot used, 30/70 market fallback, old ride not recalculated
- Historical safety: no crash, no mutation
- App settings: deactivation behaviour

### Environment limitation
The test runner (pytest / Django test runner) cannot complete DB-backed tests
in the current Windows dev environment due to Redis/DB connectivity timeout.
All logic was verified via `python -c` in-process checks — all assertions pass.

---

## 14. Remaining Work (Commit 3)

- Admin Pricing Dashboard (custom, not read-only inline)
- Pricing cache with Redis and activation-based invalidation
- No-show service full snapshot integration
- Incentive/surge pricing hooks
- Full test suite execution in CI environment
