# YALA Admin Pricing Dashboard

## Mission 16 — Commit 3

**Branch:** `ui/design-system`  
**Last updated:** 2026-08-01  
**Status:** Implementation complete

---

## 1. Purpose

The Pricing Administration Dashboard gives authorized YALA administrators a single place to manage global fares, city-level overrides, waiting fees, cancellation fees, no-show fees, and ride commission. It is built on top of the database-backed pricing models created in Mission 16 Commit 1 and the live integration from Commit 2.

Only staff users with `is_staff=True` can access the dashboard or the underlying admin models.

---

## 2. Dashboard URL

`/admin/pricing/`

The dashboard is mounted before the Django admin catch-all so it is reachable at a memorable URL. It is also linked from the relevant `app_settings` and `locations` admin changelists.

---

## 3. Management Sections

### Global Fares (`/admin/app_settings/globalfareconfig/`)

- List: ride type, base fare, per-km, minimum fare, status chip, effective date, last modified.
- Create, edit, activate, deactivate, view history.
- Only one active record per ride type.
- Validation: non-negative values, minimum fare >= base fare.

### City Pricing (`/admin/locations/citypricing/`)

- List: city, ride type, base fare, per-km, minimum fare, status chip, created/updated.
- Search by city name and region.
- Filter by ride type, active status, and region.
- Bulk activate / deactivate selected records.
- Validation: non-negative values, minimum fare >= base fare.

### Waiting Fees (`/admin/app_settings/waitingfeeconfig/`)

- Free minutes, per-minute fee, max wait, arrival GPS radius, no-show GPS radius.
- Only one active record globally.
- Validation: max wait >= free minutes, non-negative fee.

### Cancellation Policy (`/admin/app_settings/cancellationfeeconfig/`)

- Free window, en-route fee, arrived fee, driver penalty.
- Only one active record globally.
- Validation: non-negative fees.

### No-Show Policy (`/admin/app_settings/noshowfeeconfig/`)

- Rider fee, driver compensation, wait threshold, distance threshold.
- Only one active record globally.
- Validation: non-negative values.

### Ride Commission (`/admin/app_settings/ridecommissionconfig/`)

- Platform percent, driver percent, status chip, effective date, last modified.
- Only one active record globally.
- Validation: each percent between 0 and 1, platform + driver <= 1.

---

## 4. Validation Rules

- Negative monetary values are rejected.
- `minimum_fare` must be >= `base_fare` for global and city fares.
- `max_wait_minutes` must be >= `free_minutes` for waiting.
- `platform_percent` and `driver_percent` must be between 0 and 1.
- `platform_percent + driver_percent` must not exceed 1.
- Duplicate active records are prevented by database unique partial constraints.
- Invalid or unsupported ride types are rejected by the model choices.

---

## 5. Search, Filter and Pagination

- All changelists support search and list filters.
- City pricing supports search by city and region, plus region and ride type filters.
- Django admin pagination is enabled with the default page size.
- Status chips give a clear active/inactive visual indicator.

---

## 6. Audit and History

Every create, update, activate, and deactivate action in the pricing admin creates an entry in `PricingAuditLog`:

- Who made the change (`user`).
- Timestamp.
- Pricing model and record affected.
- Field changed.
- Old value.
- New value.
- Optional reason, supplied through a "Change reason" field on the admin form.

The audit log is read-only, searchable, and filterable from `/admin/app_settings/pricingauditlog/`. It is also rendered on the main dashboard for the 25 most recent events.

---

## 7. Safety Guarantees

- Changing a pricing configuration does **not** modify any existing `Ride`, `RidePricingSnapshot`, `Payment`, or settled commission.
- Newly activated configurations only affect future ride requests.
- Existing historical rides continue to use the values captured in their `RidePricingSnapshot`.
- Bulk actions run through the model's `save()` method so the usual validation and `clean()` logic is preserved.

---

## 8. Design

- Responsive grid layout.
- Dark-mode compatible CSS via `theme=dark` cookie.
- Cards for each pricing section with status chips and quick manage links.
- KPI boxes for active configs, city overrides, and audit events.
- Audit table with the 25 latest changes.

---

## 9. Files Changed

- `app_settings/admin.py`
- `app_settings/models.py`
- `app_settings/views.py`
- `app_settings/urls.py`
- `app_settings/tests.py`
- `app_settings/migrations/0008_pricingauditlog.py`
- `app_settings/templates/app_settings/pricing_dashboard.html`
- `locations/admin.py`
- `locations/models.py`
- `taxi/urls.py`
- `YALA_ADMIN_PRICING_DASHBOARD.md`
- `YALA_PRICING_LIVE_INTEGRATION.md`
- `YALA_DRIVER_MODERNIZATION_PLAN.md`
