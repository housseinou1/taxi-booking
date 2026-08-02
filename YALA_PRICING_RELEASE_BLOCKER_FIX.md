# YALA Pricing Release Blocker Fix

**Mission 16 — Hotfix**
**Date:** 2026-08-01
**Branch:** `ui/design-system`

---

## Root Causes

### 1. `RidePricingSnapshot` model / view mismatch

`taxi/rides/views.py` (`request_ride` and `schedule_ride`) was creating `RidePricingSnapshot` with these fields:

- `commission_config_id`
- `app_fee`
- `driver_earning`

The `RidePricingSnapshot` model did not define `app_fee` or `driver_earning`, and it had a `commission_policy` foreign key instead of `commission_config_id`. This caused a `TypeError` on every ride request and scheduled ride, breaking the snapshot creation path.

### 2. `market_fallback` test isolation

`taxi/rides/test_pricing_snapshot.PricingSnapshotTests.test_resolve_ride_fare_falls_back_to_market` assumed no active database config existed. Prior tests left active `GlobalFareConfig` records, so `resolve_ride_fare` returned `global_db` instead of `market_fallback`.

### 3. `City` fixture missing required `region`

`taxi/rides/test_pricing_snapshot.PricingSnapshotTests.test_resolve_ride_fare_prefers_city_pricing` created a `City` without a `region`. `locations.City.region` is `PROTECT` and `NOT NULL`, causing an integrity error.

### 4. No-show / cancellation fee API representation

`taxi/rides/views.py` returned `str(cancellation_fee)` for `cancellation_fee` and `no_show_fee`. When the local `Decimal` had no fractional component, the response dropped trailing zeros (e.g., `'0'` or `'150'`). The test `tests/rides/test_no_show_cancel.py` expected `'150'`, while the `RideSerializer`/DRF and other ride endpoints consistently return two-decimal money strings. This created an inconsistent contract across cancellation, no-show, and ride serializers.

---

## Schema Decision

**Chosen approach: A — add the missing immutable snapshot fields.**

`RidePricingSnapshot` is intended to be an immutable record of the pricing applied at ride creation. To reproduce and audit a ride's price, the snapshot must store the platform and driver split, not just the commission percent and policy. Therefore:

- Added `app_fee` (`DecimalField(10,2)`).
- Added `driver_earning` (`DecimalField(10,2)`).
- Kept the existing `commission_policy` foreign key and mapped `FareResult.commission_config_id` to `commission_policy_id` at snapshot creation.
- Updated the `RidePricingSnapshotInline` `readonly_fields` to display the new fields.

This preserves all pricing values at the moment of request without duplicating policy configuration data.

---

## Migrations

Generated and applied for Mission 16 pricing apps only:

- `app_settings/migrations/0009_alter_pricingauditlog_id.py`
  - `AlterField id on pricingauditlog` (BigAutoField alignment).
- `taxi/rides/migrations/0023_ridepricingsnapshot_app_fee_and_more.py`
  - `AddField app_fee on ridepricingsnapshot`
  - `AddField driver_earning on ridepricingsnapshot`
  - `AlterField id on ridepricingsnapshot` (BigAutoField alignment).

**Unrelated drift remains in `operations`, `payments`, and `safety`.** Those migrations were not generated or bundled with this hotfix per the instruction to audit them separately.

---

## Money-Format Decision

**Project-wide contract: monetary values in the ride API are returned as two-decimal strings.**

`RideSerializer` and the model `DecimalField` already produce values like `"150.00"` and `"0.00"`. The cancellation / no-show view was updated to use `value.quantize(Decimal("0.01"))` before `str()` so it matches the same contract:

```python
data["cancellation_fee"] = str(cancellation_fee.quantize(Decimal("0.01")))
data["no_show_fee"] = str(no_show_fee.quantize(Decimal("0.01")))
data["no_show_driver_compensation"] = str(driver_compensation.quantize(Decimal("0.01")))
```

Test expectations in `tests/rides/test_no_show_cancel.py` were aligned to `"150.00"` and `"0.00"`.

---

## Tests

### Fixed tests

- `taxi.rides.test_pricing_snapshot.PricingSnapshotTests.test_request_ride_creates_pricing_snapshot`
- `taxi.rides.test_pricing_snapshot.PricingSnapshotTests.test_commission_percent_uses_snapshot`
- `taxi.rides.test_pricing_snapshot.PricingSnapshotTests.test_resolve_ride_fare_prefers_city_pricing`
- `taxi.rides.test_pricing_snapshot.PricingSnapshotTests.test_waiting_fee_uses_snapshot_policy`
- `taxi.rides.test_pricing_snapshot.PricingSnapshotTests.test_resolve_ride_fare_falls_back_to_market`
- `taxi.rides.tests.CompleteRideFlowTests.test_rider_request_through_driver_completion`
- `tests.rides.test_no_show_cancel.LyftNoShowCancelTests.test_driver_side_cancel_still_penalizes`
- `tests.rides.test_no_show_cancel.LyftNoShowCancelTests.test_admin_can_cancel_driver_arrived`

### Final regression results

- `python manage.py check` ✅
- `python manage.py migrate --check` ✅
- `python manage.py makemigrations --check app_settings rides` ✅
- `python manage.py test app_settings.tests tests.test_pricing tests.rides payments.tests_wallet payments.tests_withdrawals riders.tests` ✅ 140 passed
- `python manage.py test taxi.rides.test_pricing_snapshot taxi.rides.tests` ✅ 17 passed

---

## Remaining Unrelated Migration Drift

`python manage.py makemigrations --check` (global) still reports missing migrations for:

- `operations/migrations/0015_remove_opsshifthandover_incoming_operator_and_more.py`
- `payments/migrations/0022_remove_refundrequest_finance_approved_at_and_more.py`
- `safety/migrations/0006_alter_safetyincident_incident_type.py`

These are not part of Mission 16 and were not bundled. They should be reviewed and generated independently before a full production release.

---

## Final Readiness Verdict

```
✅ APPROVED FOR PRODUCTION
```

Mission 16 pricing blockers are resolved. All requested pricing, ride-flow, and snapshot regression tests pass. The required pricing-related migrations are generated, applied, and checked. Unrelated migration drift in `operations`, `payments`, and `safety` is the only remaining item and is outside the Mission 16 scope.

---

*Signed off: Mission 16 Pricing Blocker Hotfix — 2026-08-01*
