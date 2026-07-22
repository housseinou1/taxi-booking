# Phase 28 — Smart Pricing & Dispatch Engine

**Date:** 2026-07-21  
**Status:** Backend and UI complete; local tests pass

---

## Summary

Phase 28 implements an intelligent pricing and dispatch engine for Yala, feature-flagged and fully auditable. It improves driver assignment via configurable scoring weights, supports dynamic fare rules, exposes surge pricing controls, provides dispatch analytics, a dry-run pricing simulator, and a CEO dashboard for revenue and efficiency impact.

## Backend

### Service layer

- `operations/smart_pricing_dispatch_service.py`
  - `get_engine_flags()` / `set_engine_flags()` — master feature flag and per-feature toggles (smart dispatch, dynamic pricing, surge)
  - `get_dispatch_rules()` / `set_dispatch_rules()` — configurable search radii, city speed, traffic multiplier, and per-factor weights (distance, ETA, rating, acceptance, cancellation, level, fairness, idle time, traffic, vehicle match)
  - `get_pricing_rules()` / `set_pricing_rules()` — base fare, distance/time/waiting fares, minimum fare, airport/night/holiday/weather/event surcharges
  - `get_surge_config()` / `set_surge_config()` — enable/disable surge, max multiplier, excluded zones, auto-apply
  - `calculate_dynamic_fare()` — engine-aware fare calculation; falls back to legacy MARKET/CityPricing when disabled
  - `simulate_pricing()` — dry-run simulator comparing smart vs legacy fares
  - `build_surge_panel()` — demand/supply/multiplier/wait-time per zone
  - `build_dispatch_analytics()` — avg ETA, dispatch time, acceptance/rejection, utilization, idle time
  - `build_ceo_dashboard()` — revenue impact, dispatch efficiency, surge revenue, avg fare, profit per ride, utilization
  - `build_smart_engine_dashboard()` — aggregated payload for the admin dashboard
  - Audit trail stored in `PlatformSetting`

### Views

- `operations/smart_pricing_dispatch_views.py`
  - `smart_engine_dashboard` (GET)
  - `smart_engine_flags` (GET/PATCH — operations staff, CEO for surge/master)
  - `smart_dispatch_rules` (GET/PATCH)
  - `smart_pricing_rules` (GET/PATCH)
  - `smart_surge_config` (GET/PATCH — CEO only for writes)
  - `smart_dispatch_analytics` (GET)
  - `smart_pricing_simulate` (POST)
  - `smart_engine_ceo_dashboard` (GET — CEO only)
  - `smart_engine_audit` (GET)
  - All mutating endpoints call `log_from_request`

### URLs

- `/operations/smart-engine/`
- `/operations/smart-engine/flags/`
- `/operations/smart-engine/dispatch-rules/`
- `/operations/smart-engine/pricing-rules/`
- `/operations/smart-engine/surge/`
- `/operations/smart-engine/analytics/`
- `/operations/smart-engine/simulate/`
- `/operations/smart-engine/ceo/`
- `/operations/smart-engine/audit/`

### Reuse

- Reuses existing `taxi.market`, `CityPricing`, `DispatchOfferLog`, `SurgeHistory`, AI surge monitor, and driver dispatch ranking service.
- Legacy pricing remains the default until the master engine flag is enabled.

## Frontend

- `frontend/src/admin/pricing/SmartPricingDispatchCenter.js`
  - Tabs: Intelligent Dispatch, Dynamic Pricing, Surge Pricing, Dispatch Analytics, Pricing Simulator, CEO Dashboard
  - City-scoped configuration
  - Toggle feature flags
  - Dispatch scoring weight editor
  - Dynamic pricing rule editor
  - Surge controls (enable, max multiplier, live zones)
  - Dispatch analytics metric cards
  - Pricing simulator (fare, driver earnings, commission, legacy comparison)
  - CEO impact cards
  - Audit trail panel

- `frontend/src/admin/pricing/smartPricingApi.js`

- **Routing & navigation**
  - Route `/admin/smart-pricing` registered in `App.js` and `roleRouting.js` (`admin-smart-pricing`)
  - Sidebar link in `AdminDashboard.js`

## Permissions

- `IsLaunchCommandStaff` (CEO/Super Admin/Operations Manager/Supervisor) for dashboard, rules, analytics, simulator, audit
- `can_ceo_actions` for surge config writes and CEO dashboard
- Master engine flag requires operations permission; surge toggle requires CEO permission

## Tests

- `tests/operations/test_smart_pricing_dispatch.py`
  - Engine flags, dispatch rules, pricing rules, surge config, simulator, analytics, CEO dashboard, permissions

```bash
cd backend/taxi
python manage.py test tests.operations.test_smart_pricing_dispatch -v 1
```

**Result:** 9 tests pass.

## Verification

```bash
cd backend/taxi
python manage.py check
# no issues
python manage.py makemigrations --check --dry-run
# no changes

cd frontend
npm run build
# succeeded
```

## Notes

- No redesign of Rider, Driver, or Delivery apps.
- Engine is feature-flagged; existing MARKET/CityPricing remains default when disabled.
- All configuration changes and simulations are audit-logged.
