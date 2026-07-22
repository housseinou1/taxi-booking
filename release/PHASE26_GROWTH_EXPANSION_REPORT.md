# Phase 26 — Growth & Expansion Dashboard

**Date:** 2026-07-21  
**Status:** Backend and UI complete; local tests pass

---

## Summary

Phase 26 delivers a CEO-only Growth & Expansion Dashboard covering user growth, revenue growth, marketing performance, geographic expansion, and forward-looking CEO forecasts. It reuses existing analytics and marketing services and exports to CSV, Excel, and PDF.

## Backend

- **`operations/growth_expansion_service.py`**
  - `build_growth_metrics()` — total/monthly/daily active riders, new registrations, referral growth, driver growth, courier growth, 14-day registration chart.
  - `build_revenue_growth()` — daily/weekly/monthly revenue, 30-day revenue trend, average revenue per ride and per delivery.
  - `build_marketing_performance()` — referral campaigns, promo usage, CAC estimate, retention rate, repeat riders, reactivated users.
  - `build_geographic_expansion()` — active cities, demand/supply/ratio by city, recommended expansion areas from surge zones and latent inactive-city demand.
  - `build_ceo_forecast()` — monthly growth %, revenue forecast, driver demand estimate, fleet requirements.
  - `build_growth_expansion_dashboard()` — aggregates all sections.
  - `build_growth_export_rows()` — flattened export payload.

- **`operations/growth_expansion_views.py`**
  - `growth_dashboard` (GET)
  - `growth_export` (GET, CSV/XLSX/PDF)
  - `IsCeoStaff` permission (CEO/Super Admin only)
  - Audit logging on every export

- **`operations/urls.py`** — registered under `/operations/growth/`.

## Frontend

- **`frontend/src/admin/growth/GrowthExpansionDashboard.js`**
  - Tabs: Growth Metrics, Revenue Growth, Marketing Performance, Geographic Expansion, CEO Forecast.
  - Auto-refresh every 60 seconds.
  - Metric cards, registration/revenue trend charts, city performance table, expansion recommendations.
  - Export buttons: CSV, Excel, PDF.

- **`frontend/src/admin/growth/growthApi.js`** — API client for dashboard and export.

- **Routing & navigation:**
  - `/admin/growth` registered in `App.js` and `roleRouting.js` (`admin-growth`).
  - Sidebar link in `AdminDashboard.js`.

## Security / Permissions

- Endpoints require `CEO` or `Super Admin` group membership.
- Exports log actor, format, and row count via `log_from_request`.

## Tests

- `tests/operations/test_growth_expansion.py`
  - CEO-only access
  - Dashboard payload keys
  - CSV export
  - PDF export

```bash
cd backend/taxi
python manage.py test tests.operations.test_growth_expansion -v 1
```

**Result:** 4 tests pass.

## Build

```bash
cd frontend
npm run build
```

**Result:** Build succeeded.

## Notes

- No changes to Rider, Driver, or Delivery flows.
- Reuses `build_business_kpis`, `build_finance_dashboard`, marketing analytics, fleet CEO metrics, AI financial insights, and surge monitor.
- Added Excel export button and extension mapping in `GrowthExpansionDashboard.js` to align with backend `xlsx` support.
