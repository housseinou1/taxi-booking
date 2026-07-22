# Phase 37 — YALA Business Intelligence & Data Warehouse

**Date:** 2026-07-21  
**Status:** Architecture documented; unified analytics layer, API, and self-service frontend implemented; backend and frontend tests pass

---

## Summary

Phase 37 introduces a centralized Business Intelligence platform that consolidates Yala's operational, financial, and analytical data into a single, reusable analytics layer. Existing dashboards are not replaced; instead, the BI layer exposes clean endpoints and a self-service reporting UI that they can consume.

---

## Design Document

`release/PHASE37_BI_DATA_WAREHOUSE_DESIGN.md` covers:

- 13 data warehouse subject areas (Rides, Deliveries, Merchants, Drivers, Couriers, Customers, Wallets, Payments, Finance, Support, Trust & Safety, Incentives, Marketing)
- Dimensions and facts for each subject area
- ELT architecture using existing operational PostgreSQL database and service functions
- Refresh schedule, validation, and data quality monitoring approach
- Executive analytics, geographic intelligence, and predictive analytics strategy
- Self-service reporting and data governance plan

---

## Backend

### New Service (`operations/bi_data_warehouse_service.py`)

Reuses existing services and ORM queries to provide:

- `get_subject_area(name, city_id, period)` — on-demand metrics for any of the 13 subject areas
- `build_subject_area_summary(...)` — all subject areas combined
- `build_executive_analytics(...)` — revenue, GMV, ride/delivery growth, retention, wait time, response time
- `build_geographic_intelligence(...)` — demand/supply heatmaps, ride/delivery density, revenue by district, expansion opportunities
- `build_predictive_analytics(...)` — demand, driver supply, revenue, merchant demand, and peak-hour forecasting
- `build_bi_data_warehouse_overview(...)` — combined overview
- `build_bi_export_rows(...)` — flat rows for CSV/Excel/PDF exports

### New Views (`operations/bi_analytics_views.py`)

| Endpoint | Method | Purpose | Permission |
|----------|--------|---------|------------|
| `/operations/bi/` | GET | Full BI overview | CEO/Finance/Operations/Analytics |
| `/operations/bi/subject-areas/` | GET | All subject areas | CEO/Finance/Operations/Analytics |
| `/operations/bi/subject-areas/<area>/` | GET | Single subject area | CEO/Finance/Operations/Analytics |
| `/operations/bi/executive-analytics/` | GET | Executive trends | CEO/Finance/Operations/Analytics |
| `/operations/bi/geographic-intelligence/` | GET | Maps & density | CEO/Finance/Operations/Analytics |
| `/operations/bi/predictive-analytics/` | GET | Forecasts & alerts | CEO/Finance/Operations/Analytics |
| `/operations/bi/reports/<type>/export/?export_format=csv\|excel\|pdf` | GET | Self-service export | CEO/Finance/Operations/Analytics |

Permission class `IsAnalyticsStaff` (in `executive_permissions.py`) allows CEO, Super Admin, Finance, Accountant, Operations Manager, Supervisor, Analytics, and Data Analyst groups.

All exports are logged via `log_from_request`.

### URLs

Registered in `operations/urls.py` under `/operations/bi/`.

---

## Frontend

- `frontend/src/admin/bi/BIAnalyticsCenter.js`
  - Tabs: Data Warehouse Overview, Subject Areas, Executive Analytics, Geographic Intelligence, Predictive Analytics, Self-Service Reports
  - Period selector (daily/weekly/monthly/quarterly/annual)
  - City ID filter
  - One-click CSV/Excel/PDF exports
- `frontend/src/admin/bi/biAnalyticsApi.js` — API client
- `frontend/src/admin/bi/BIAnalyticsCenter.css`

### Navigation

- Route `/admin/bi` registered in `App.js`
- Sidebar link added to `AdminDashboard.js`
- Role routing updated in `auth/roleRouting.js`

---

## Verification

```bash
cd backend/taxi
python manage.py check
# System check identified no issues (0 silenced)

python manage.py test tests.operations.test_bi_analytics -v 1
# Ran 8 tests — OK

cd frontend
npm run build
# Build succeeded
```

**Enhancements in this pass:**

- Partner/delivery city filter by city name; merchant metrics scoped to period
- Executive avg wait time scoped to selected period/city
- Data quality (`build_qa_reconciliation`) and governance metadata on overview
- Overview cached via `cached_ops_call`
- Export uses `export_format` query param (DRF reserves `format`)
- Authenticated blob download in frontend
- Predictive revenue forecast field names fixed in UI
- `IsAnalyticsStaff` centralized in `executive_permissions.py` (includes Accountant)
- Dedicated test suite `test_bi_analytics.py`

---

## Files Added / Modified

- `release/PHASE37_BI_DATA_WAREHOUSE_DESIGN.md`
- `backend/taxi/operations/bi_data_warehouse_service.py`
- `backend/taxi/operations/bi_analytics_views.py`
- `backend/taxi/operations/executive_permissions.py`
- `backend/taxi/operations/urls.py`
- `backend/taxi/tests/operations/test_bi_analytics.py`
- `frontend/src/admin/bi/BIAnalyticsCenter.js`
- `frontend/src/admin/bi/biAnalyticsApi.js`
- `frontend/src/admin/bi/BIAnalyticsCenter.css`
- `frontend/src/App.js`
- `frontend/src/admin/AdminDashboard.js`
- `frontend/src/auth/roleRouting.js`

---

## Notes

- No operational business logic is duplicated; the BI layer delegates to existing analytics services.
- The current implementation is an on-demand ELT layer using existing APIs and ORM queries. A dedicated analytics database and scheduled ETL jobs can be added later without changing the public endpoints.
- Access is role-based and all report exports are audited.
- Legacy Phase 20 dashboard remains at `/operations/business/bi/`; Phase 37 unified layer is at `/operations/bi/`.
- Full architecture, ETL documentation, and metric definitions are in `release/PHASE37_BI_DATA_WAREHOUSE_DESIGN.md`.
