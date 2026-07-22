# Phase 25 — Operations Command Center

**Date:** 2026-07-21  
**Status:** Backend and UI complete; local tests pass

---

## Summary

Phase 25 provides a unified Operations Command Center used daily by Operations Managers and the CEO. It consolidates live operations, city heat map, operational alerts, actions, CEO daily summary, and full audit logging.

## Backend

- **`operations/launch_command_service.py`**
  - `build_live_operations()` — active rides/deliveries, online drivers/couriers, open incidents, open support tickets, pending withdrawals, failed payments, system alerts, platform/infrastructure status.
  - `build_city_heat_map()` — ride/delivery demand, driver/courier density, shortage areas, long ETA areas, surge zones, live markers.
  - `build_operations_alerts()` — merges launch alerts, live alerts, predictive alerts, plus driver/courier shortage detection. Covers: driver shortage, courier shortage, payment failures, GPS outage, high cancellation rate, surge demand, API degradation, offline services.
  - `build_ceo_daily_summary()` — revenue, completed rides/deliveries, driver/fleet utilization, customer growth, support summary, incident summary, payment summary.
  - `build_command_audit_trail()` — operational audit log with before/after.
  - `build_launch_command_dashboard()` — aggregates everything.
  - `build_ceo_summary_export_rows()` — CSV/XLSX/PDF export payload.
  - `get_onboarding_pause_state()` / `set_onboarding_pause()` — PlatformSetting-backed onboarding pause.

- **`operations/launch_command_views.py`**
  - `command_dashboard` (GET)
  - `command_ceo_export` (GET, CSV/XLSX/PDF)
  - `command_broadcast` (POST)
  - `command_notify` (POST)
  - `command_onboarding_pause` (GET/POST)
  - `command_incidents` (GET/POST create incident)
  - `command_incident_action` (POST escalate/resolve)
  - `command_alert_action` (POST ack/resolve)
  - Permissions: `IsLaunchCommandStaff` (CEO, Super Admin, Operations Manager, Supervisor)

- **`operations/urls.py`** — registered under `/operations/command/`.

## Frontend

- **`frontend/src/admin/command/LaunchCommandCenter.js`**
  - Tabs: Live Operations, City Heat Map, Operations Alerts, Operations Actions, CEO Daily Summary, Audit.
  - Auto-refresh every 20 seconds.
  - Live metrics cards, interactive heat map, alert list with ack/resolve, broadcast/notify forms, onboarding pause toggle, incident create/escalate/resolve.
  - CEO Daily Summary export (CSV, Excel, PDF).

- **`frontend/src/admin/command/launchCommandApi.js`** — API client for command endpoints.

- **Routing:**
  - `/admin/operations-command` canonical route
  - `/admin/command` legacy alias
  - Registered in `App.js` and `roleRouting.js` (`admin-command`).

- **Admin sidebar:** `Operations Command Center` link points to `/admin/operations-command`.
  - Updated from previous `Launch Command Center` label in `AdminDashboard.js`.

## Security / Permissions

- Command endpoints require `CEO`, `Super Admin`, `Operations Manager`, or `Supervisor` group membership (or staff/superuser fallback).
- All actions log via `log_from_request` (actor, IP, entity type, before/after, summary).

## Tests

- `tests/operations/test_launch_command.py`
  - Dashboard requires ops role
  - Ops manager can load dashboard with expected keys
  - CEO summary CSV export
  - Create ops incident
  - Onboarding pause toggle

```bash
cd backend/taxi
python manage.py test tests.operations.test_launch_command -v 1
```

**Result:** 5 tests pass.

## Build

```bash
cd frontend
npm run build
```

**Result:** Build succeeded.

## Notes

- No redesign of Rider/Driver/Delivery apps.
- Reuses existing Operations Center service, AI hotspot map, surge monitor, launch alerts, incident system, and audit log.
- Migrations for Phase 24 were generated in the previous step; Phase 25 did not require new schema changes.
