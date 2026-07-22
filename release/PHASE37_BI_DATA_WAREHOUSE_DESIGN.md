# Phase 37 — YALA Business Intelligence & Data Warehouse Design

**Date:** 2026-07-21  
**Status:** Architecture and implementation plan documented; lightweight unified analytics layer implemented

---

## 1. Vision

Provide a centralized BI platform that consolidates Yala's operational, financial, and analytical data without replacing existing dashboards. The platform exposes a **unified analytics layer** that existing dashboards can consume and adds self-service reporting for authorized roles.

---

## 2. Data Warehouse Subject Areas

| Subject Area | Source Tables / Services | Dimensions | Facts |
|--------------|--------------------------|------------|-------|
| Rides | `Ride`, `RideStop`, `PaymentRecord` | Date, City, Rider, Driver, Vehicle Type, Service Type | completed rides, cancelled rides, revenue, driver earnings, wait time |
| Deliveries | `Delivery`, `DeliveryStop`, `MerchantOrder` | Date, City, Courier, Customer, Merchant | completed deliveries, cancelled deliveries, delivery fees, merchant sales |
| Merchants | `Merchant`, `MerchantOrder`, `MerchantPayout` | Date, City, Merchant Type | active merchants, pending approvals, sales, commissions, settlements |
| Drivers | `DriverProfile`, `DriverDocument`, `DriverReferral` | Date, City, Status, Vehicle Type | approved drivers, online drivers, retention, documents, ratings |
| Couriers | `DriverProfile` (courier user type) | Date, City, Status | approved couriers, online couriers, retention, documents |
| Customers | `User` (riders) | Date, City, Sign-up Source | active riders, new signups, retention, referrals |
| Wallets | `WalletAccount`, `WalletTransaction` | Date, User Type, City | wallet balances, credits, debits, pending withdrawals |
| Payments | `PaymentRecord`, `WithdrawalRequest`, `RefundRequest` | Date, Method, Status, City | GMV, app fee, driver earnings, courier earnings, refunds, payouts |
| Finance | Payment + Wallet + settlements | Date, Currency | net revenue, operating expenses, cash flow, liabilities |
| Support | `SupportTicket`, `RefundRequest`, `DeliveryDispute` | Date, Type, Status | tickets, response time, disputes, refunds |
| Trust & Safety | `SafetyIncident`, `FraudFlag`, `AuditLog` | Date, Severity, Status, City | incidents, fraud flags, response time, blocked accounts |
| Incentives | `IncentiveProgram`, `DriverIncentiveProgress`, `BonusPayment` | Date, Program, Driver | incentive cost, bonus paid, participation, ROI |
| Marketing | `PromoCodeUsage`, `RiderReferral`, `DriverReferral` | Date, Campaign, Channel | usage, conversions, referral growth |

### Relationships
- All subject areas link to the **Date dimension** (`date`, `week`, `month`, `quarter`, `year`).
- Geographic roll-up: City → Country.
- Driver/Courier/Rider dimensions are reused across Rides, Deliveries, Payments, and Support.
- Merchant dimension is reused across Deliveries, Payments, and Incentives.

---

## 3. ELT Architecture

### Approach
Use **ELT** (Extract → Load → Transform) because the operational PostgreSQL database is small enough for materialized views and summary tables, and this avoids a separate warehouse cluster in the initial rollout.

### Extract
- Read from existing operational models using existing ORM query patterns.
- No direct table coupling; all extraction goes through existing service functions.

### Transform
- Aggregate, pivot, and compute KPIs in Python service functions.
- Summaries are cached via existing `cached_ops_call` utility where applicable.

### Load
- APIs load transformed JSON into dashboards on demand.
- Future enhancement: nightly Celery task populating materialized PostgreSQL views or a dedicated analytics schema.

### Schedule
- API endpoints return fresh aggregations.
- Cached results expire per existing cache settings (e.g., 5 minutes for operational metrics).
- Optional nightly refresh job can be added to pre-compute heavy trends.

### Validation & Data Quality
- Cross-check totals against source tables using `_dec` and `Sum` aggregates.
- Reuse QA reconciliation from `executive_service.build_qa_reconciliation`.
- Failure alerts can be emitted via existing `notifications.services.send_push_notification`.

---

## 4. Executive Analytics

Historical trends computed by reusing existing services:

- **Revenue / GMV** — `executive_service.build_finance_dashboard`
- **Ride growth** — `Ride.objects.filter(status="completed")` grouped by period
- **Delivery growth** — `Delivery.objects.filter(status="delivered")` grouped by period
- **Customer retention** — `launch_service.build_business_kpis` retention metrics
- **Driver retention** — `growth_expansion_service.build_ceo_forecast`
- **Merchant growth** — `Merchant.objects.filter(status="active")` grouped by period
- **Average response time** — `executive_service.build_support_panel`
- **Average wait time** — `ai_operations_service.build_hotspot_map` / `build_surge_monitor`

---

## 5. Geographic Intelligence

Reuse existing map/heatmap services:

- Demand heatmaps — `ai_operations_service.build_hotspot_map`
- Supply heatmaps — `operations_center_service.build_ops_map` and `fleet_performance_service`
- Ride density — `Ride.objects.values("city_id").annotate(count=Count("id"))`
- Delivery density — `Delivery.objects.values("service_city").annotate(count=Count("id"))`
- Revenue by district — `PaymentRecord` aggregated by `ride__city_id`
- Expansion opportunities — `growth_expansion_service` expansion functions

---

## 6. Predictive Analytics

Prepare forecasts by reusing existing AI services:

- Demand forecasting — `ai_operations_service.build_predictive_alerts` + `build_hotspot_map`
- Driver supply forecasting — `growth_expansion_service.build_ceo_forecast` fleet requirement
- Revenue forecasting — `ai_operations_service.build_financial_insights`
- Merchant demand — `MerchantOrder` trend by city
- Peak-hour prediction — `build_surge_monitor` peak_hours and demand ratio

Models remain heuristic/statistical; machine-learning upgrades can be layered later without API changes.

---

## 7. Self-Service Reporting

Authorized users can:

- Choose a **subject area** or **report template**.
- Apply filters: date range, city, status.
- View pre-built cards/tables.
- Download **CSV, Excel, PDF** via existing `report_export` utilities.
- Save/schedule reports: future enhancement via saved `BIReportRequest` model.

---

## 8. Data Governance

- **Metric definitions** documented in service functions; no magic numbers.
- **Data ownership**: each subject area owned by the corresponding module (e.g., Finance owns PaymentRecord, Operations owns Rides/Deliveries).
- **Refresh schedules**: on-demand + cache-based; nightly refresh optional.
- **Access permissions**: role-based (CEO, Finance, Operations, Analytics) enforced by `IsAnalyticsStaff` permission class.
- **Retention policy**: governed by existing `LegalAgreement` / data-protection modules; BI layer does not store PII beyond operational system retention.
- **Audit logging**: all report exports and data access logged via `security.services.audit_service.log_from_request`.

---

## 9. Implementation Plan

1. Create design document (this file).
2. Add `operations/bi_data_warehouse_service.py` as the unified analytics layer.
3. Add `operations/bi_analytics_views.py` with role-restricted endpoints.
4. Add frontend `BIAnalyticsCenter` for self-service reporting.
5. Wire routes and navigation.
6. Verify backend checks, tests, and frontend build.
7. Produce implementation report.

---

## 10. Security & Permissions

| Role | Access |
|------|--------|
| CEO | Full read access to all subject areas and exports |
| Finance | Revenue, payments, finance, merchant settlements |
| Operations | Rides, deliveries, support, trust & safety, fleet |
| Analytics | Read access to all aggregated data and exports |

No PII is exposed in aggregated endpoints. Drill-through to individual records remains protected by existing dashboard permissions.
