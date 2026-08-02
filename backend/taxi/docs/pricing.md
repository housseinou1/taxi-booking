# Ride Pricing Snapshot

## Overview

The `RidePricingSnapshot` records every pricing configuration that was active when a ride was created.  It makes ride prices auditable and immutable: even if global market settings, city pricing, commission rates, or waiting/cancellation/no-show policies are changed later, the original values used for the ride are preserved.

## Model

`taxi.rides.models.RidePricingSnapshot`

- One-to-one with `Ride` (`related_name="pricing_snapshot"`).
- Stores the resolved `ride_type`, `source` (`city`, `global_db`, `market_fallback`), fare parameters, distance charge, estimated fare, commission percent and the foreign keys to the actual configuration records that were active at creation time.
- Foreign keys: `city_pricing`, `global_fare_config`, `waiting_policy`, `cancellation_policy`, `no_show_policy`, `commission_policy`.

## Fare Resolution

`taxi.app_settings.pricing_service.resolve_ride_fare(city, ride_type, distance_km)`

Resolution order:

1. Active `CityPricing` for the ride type in the requested city.
2. Active `GlobalFareConfig` for the ride type.
3. `market.py` fallback.

The resolver also reads the active `WaitingFeeConfig`, `CancellationFeeConfig`, `NoShowFeeConfig` and `RideCommissionConfig` to produce a `FareResult` namedtuple.

## Integration Points

- `rides/views.estimate_fare` now returns `pricing_source` and `city_override` in addition to the estimate.
- `rides/views.request_ride` and `rides/views.schedule_ride` create a `RidePricingSnapshot` inside the same transaction that creates the ride.
- `rides/services/waiting_service.calculate_waiting_fee` and `no_show_service` helpers accept an optional `ride` argument and use the snapshot's policies when available.
- `rides/views.cancel_ride` uses `get_ride_cancellation_policy(ride)`, `get_ride_waiting_policy(ride)` and the ride's no-show policy.
- `payments/services.calculate_payment_amounts` and `authorize_ride_payment` use the ride's snapshot commission percent via `get_ride_commission_percent(ride)`.
- `rides/views.calculate_money` uses `calculate_ride_app_fee` with the ride's commission.
- `locations/services.calculate_city_fare` delegates to the centralized resolver.

## Admin

A read-only `RidePricingSnapshotInline` is included on the `RideAdmin` page.

## Tests

See `taxi.rides.test_pricing_snapshot` for integration tests covering:

- Snapshot creation on `request_ride`.
- City pricing override.
- Market fallback.
- Snapshot-aware waiting fees.
- Snapshot-aware commission percent.
