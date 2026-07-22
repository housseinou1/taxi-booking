# Phase 27 — Multi-City Operations Platform

**Date:** 2026-07-21  
**Status:** Backend and UI complete; local tests pass

---

## Summary

Phase 27 prepares Yala to operate in multiple cities across Mauritania from a single platform. It adds city administration, per-city fleet/financial/performance dashboards, and a CEO national overview with role-based scoping.

## Backend

### Models

- `operations/models.py:OpsCityProfile`
  - One-to-one with `locations.City`
  - Status: `pilot` / `active` / `suspended`
  - Operations Manager, Finance Manager, Support Manager (FK to users)
  - Service zones (JSON), timezone, currency (default `MRU`)

### Service layer

- `operations/multi_city_service.py`
  - `list_city_profiles()` / `get_city_profile()` — city administration data
  - `build_city_fleet_metrics()` — drivers, couriers, riders, online fleet, active rides/deliveries
  - `build_city_financial_metrics()` — revenue, commission, withdrawals, wallet balances, failed payments
  - `build_city_performance_metrics()` — average ETA, ride/delivery completion rates, acceptance rate, cancellation rate
  - `build_city_detail()` — admin + fleet + financial + performance per city
  - `build_ceo_national_overview()` — national revenue, revenue by city, growth by city, fleet utilization, best performing city, cities requiring attention
  - `build_multi_city_dashboard()` — aggregated payload with CEO overview when no city is selected
  - `build_multi_city_export_rows()` — CSV/PDF export rows

### Permissions

- `operations/multi_city_permissions.py`
  - `IsMultiCityStaff` — CEO/Super Admin, Operations Manager, Supervisor, or finance users assigned to a city
  - `has_national_access()` — CEO/Super Admin only
  - `get_user_city_ids()` — scoped by operations/finance/support manager assignments
  - `user_permissions_payload()` — returns national/operations/finance/city_admin flags
  - City Operations Manager: sees only assigned cities
  - Finance Manager: sees finance data for assigned cities only
  - CEO: national view

### Views

- `operations/multi_city_views.py`
  - `multi_city_dashboard` (GET)
  - `multi_city_cities` (GET)
  - `multi_city_city_detail` (GET/PATCH — CEO-only updates)
  - `multi_city_export` (GET — CEO-only CSV/PDF)
  - All endpoints audit-logged

### URLs

- `/operations/multi-city/`
- `/operations/multi-city/cities/`
- `/operations/multi-city/cities/<id>/`
- `/operations/multi-city/export/`

## Frontend

- **`frontend/src/admin/multicity/MultiCityOperationsCenter.js`**
  - Tabs: City Management, Fleet by City, Financial, Performance, CEO Overview
  - City picker scoped to accessible cities
  - Status update for CEOs
  - CEO-only national overview
  - CSV/PDF export

- **`frontend/src/admin/multicity/multiCityApi.js`**

- **Routing & navigation**
  - `/admin/multi-city` registered in `App.js` and `roleRouting.js`
  - Sidebar link in `AdminDashboard.js`

## Tests

- `tests/operations/test_multi_city.py`
  - CEO national access
  - City manager restricted access
  - Finance manager access
  - Dashboard payload keys
  - CEO export CSV

```bash
cd backend/taxi
python manage.py test tests.operations.test_multi_city -v 1
```

**Result:** 5 tests pass.

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

- Fixed a backend bug where `_serialize_city_profile` referenced a non-existent `city.slug` field; slug is now derived from city name.
- No changes to Rider, Driver, or Delivery flows.
- Reuses existing `locations.City`, fleet snapshot, hourly analytics, business KPIs, and payment/withdrawal data.
- Target cities seeded via migration `operations/migrations/0010_multicity_operations.py`: Nouakchott, Nouadhibou, Rosso, Kaédi, Kiffa, Atar, Zouerat.
