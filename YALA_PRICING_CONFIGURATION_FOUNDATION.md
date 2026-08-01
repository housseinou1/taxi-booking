# YALA Pricing Configuration Foundation

## Mission 16 — Commit 1

**Branch:** `ui/design-system`  
**Last updated:** 2026-08-01  
**Status:** Phase 1 foundation complete, Commit 2 integration deferred

---

## 1. Purpose

This document records the database-backed pricing configuration foundation created in Mission 16 Commit 1. The goal is to move YALA pricing data from the hard-coded `taxi.market.MARKET` dictionary into auditable, admin-editable database models while keeping all currently charged fares identical to the approved market values.

---

## 2. Fallback Order (future resolution)

Pricing values are resolved in the following order:

1. **Active `CityPricing` override** (per city + ride type) — existing behavior preserved.
2. **Active database-backed global configuration** (`app_settings` models) — new in Commit 1.
3. **Existing `taxi.market.MARKET` values** — safe, unchanged fallback.

No live endpoint was switched to the new models in Commit 1. `market.py` remains the current runtime source of truth.

---

## 3. New Models

All new models live in `app_settings.models` and are registered in `app_settings.admin`.

### `GlobalFareConfig`

| Field | Type | Purpose |
|-------|------|---------|
| `ride_type` | `CharField(choices)` | `Regular`, `XL`, `Comfort`, `Share` |
| `base_fare` | `DecimalField` | Starting fare (also minimum) |
| `per_km` | `DecimalField` | Distance rate |
| `minimum_fare` | `DecimalField` | Minimum payable fare |
| `is_active` | `BooleanField` | Whether this record is live |
| `effective_from` | `DateTimeField` | Activation timestamp |
| `created_at` / `updated_at` | `DateTimeField` | Audit timestamps |
| `created_by` / `updated_by` | `ForeignKey(User)` | Change tracking |

**Constraint:** at most one active record per `ride_type`.

### `WaitingFeeConfig`

| Field | Type | Purpose |
|-------|------|---------|
| `free_minutes` | `PositiveSmallIntegerField` | Free wait period |
| `per_minute_fee` | `DecimalField` | Fee after free minutes |
| `max_wait_minutes` | `PositiveSmallIntegerField` | Wait ceiling for no-show unlock |
| `arrive_max_distance_m` | `PositiveSmallIntegerField` | GPS radius for "arrived" validation |
| `no_show_max_distance_m` | `PositiveSmallIntegerField` | GPS radius for no-show validation |

**Constraint:** only one active record globally.

### `CancellationFeeConfig`

| Field | Type | Purpose |
|-------|------|---------|
| `free_window_minutes` | `PositiveSmallIntegerField` | Free cancellation window |
| `en_route_fee` | `DecimalField` | Fee after driver accepts/en route |
| `arrived_fee` | `DecimalField` | Fee after driver arrives and free wait expires |
| `driver_penalty` | `DecimalField` | Driver-side cancellation penalty |

**Constraint:** only one active record globally.

### `NoShowFeeConfig`

| Field | Type | Purpose |
|-------|------|---------|
| `rider_fee` | `DecimalField` | Fee charged to the rider |
| `driver_compensation` | `DecimalField` | Compensation credited to the driver |
| `wait_minutes_threshold` | `PositiveSmallIntegerField` | Minimum wait for valid no-show |
| `max_distance_m` | `PositiveSmallIntegerField` | No-show GPS radius |

**Constraint:** only one active record globally.

### `RideCommissionConfig`

| Field | Type | Purpose |
|-------|------|---------|
| `platform_percent` | `DecimalField` | Platform share (e.g., `0.3000`) |
| `driver_percent` | `DecimalField` | Driver share (e.g., `0.7000`) |

**Constraint:** only one active record globally; `platform_percent + driver_percent <= 1`.

---

## 4. Seeded Values (migration `0003_seed_pricing_configs`)

These match the approved `market.py` values exactly.

| Ride type | Base fare | Per km | Minimum fare |
|-----------|-----------|--------|--------------|
| Regular   | 175 MRU   | 20 MRU | 175 MRU      |
| XL        | 225 MRU   | 25 MRU | 225 MRU      |
| Comfort   | 275 MRU   | 30 MRU | 275 MRU      |
| Share     | 150 MRU   | 15 MRU | 150 MRU      |

| Policy | Value |
|--------|-------|
| Waiting `free_minutes` | 3 |
| Waiting `per_minute_fee` | 50 MRU |
| Waiting `max_wait_minutes` | 5 |
| Waiting `arrive_max_distance_m` | 350 |
| Waiting `no_show_max_distance_m` | 150 |
| Cancellation `free_window_minutes` | 2 |
| Cancellation `en_route_fee` | 50 MRU |
| Cancellation `arrived_fee` | 75 MRU |
| Cancellation `driver_penalty` | 150 MRU |
| No-show `rider_fee` | 75 MRU |
| No-show `driver_compensation` | 75 MRU |
| No-show `wait_minutes_threshold` | 5 |
| No-show `max_distance_m` | 150 |
| Commission `platform_percent` | 0.3000 (30%) |
| Commission `driver_percent` | 0.7000 (70%) |

The migration is idempotent: it only creates an active record if one does not already exist, so it will not overwrite administrator-created records.

---

## 5. Validation Rules

Implemented in each model's `clean()` and enforced before `save()`:

- Financial fields are `DecimalField`; no floating-point money types.
- All fares and fees must be non-negative.
- `per_km >= 0` and `minimum_fare >= 0`.
- `max_wait_minutes >= free_minutes`.
- `platform_percent` and `driver_percent` are between 0 and 1.
- `platform_percent + driver_percent <= 1`.

Database `UniqueConstraint`s with partial conditions enforce:

- One active `GlobalFareConfig` per `ride_type`.
- One active global record for each of `WaitingFeeConfig`, `CancellationFeeConfig`, `NoShowFeeConfig`, `RideCommissionConfig`.

---

## 6. Pricing Service Layer

`app_settings.pricing_service` exposes read-only helpers:

- `get_global_fare_config(ride_type)`
- `get_waiting_policy()`
- `get_cancellation_policy()`
- `get_no_show_policy()`
- `get_ride_commission_policy()`

Each function resolves from the active database record, falling back to `taxi.market.MARKET` when no active record exists. They are not yet wired into ride endpoints.

---

## 7. Admin Registration

The following admin pages are added in `app_settings.admin`:

- `GlobalFareConfig` — list by ride type, base/per-km/minimum, active status.
- `WaitingFeeConfig` — single active policy editor.
- `CancellationFeeConfig` — single active policy editor.
- `NoShowFeeConfig` — single active policy editor.
- `RideCommissionConfig` — single active commission editor.

All pages show `created_at`, `updated_at`, `created_by`, `updated_by` as read-only fields. The `effective_from` date is used for scheduling.

---

## 8. Tests

Tests are in `app_settings.tests`. They cover:

- Approved seeded values.
- Case-insensitive and unknown ride-type lookup.
- `ValidationError` for negative fares and invalid percentages.
- Only-one-active-record behavior.
- Service fallback to `market.py` when the database is empty.
- Inactive and future-effective records are ignored.
- CityPricing is not modified (verified by the absence of `CityPricing` changes in this commit).

---

## 9. Deferred to Commit 2

The following items are intentionally left for Mission 16 Commit 2:

- Switch `request_ride`, `schedule_ride`, and `estimate_fare` to `pricing_service`.
- Switch waiting, cancellation, no-show, and payment calculations to `pricing_service`.
- Add an Admin Pricing Dashboard (custom admin views).
- Add audit logging for pricing configuration changes if a project-wide audit framework exists.
- Wire `SiteSettings` or remove its unused legacy pricing fields.

---

## 10. What Was Not Changed

- `market.py` values and functions.
- `CityPricing` model, admin, and `calculate_city_fare` logic.
- `Ride.RIDE_TYPES` and ride type choices.
- `request_ride`, `schedule_ride`, `estimate_fare`, `start_ride`, `cancel_ride`, payment endpoints.
- Rider and driver frontends.
- All backend API contracts.
