# Phase 29 — Trust & Safety Center

**Date:** 2026-07-21  
**Status:** Backend and UI complete; tests pass; frontend build succeeds

---

## Summary

Phase 29 adds a complete Trust & Safety Center to Yala v1.0, covering emergency SOS for riders, drivers, and couriers; automated safety monitoring; incident queue management; driver and rider safety profiles; a CEO safety dashboard; and daily/weekly/monthly safety reporting. Existing Rider, Driver, and Delivery UX is unchanged.

## Backend

### Models (`safety/models.py`)

- `SafetyIncident` — SOS, driver/rider/courier/merchant reports, delivery problems, safety incidents
  - Status: `open`, `acknowledged`, `investigating`, `resolved`, `dismissed`
  - Severity: `low`, `medium`, `high`, `critical`
  - Captures GPS, ride/delivery reference, trip snapshot, assigned investigator, timestamps
- `EmergencyAlert` — One-to-one alert dispatched for an SOS incident
- `TripShare` — Secure trip-share link for riders
- `TripLocationPing` — Encrypted-in-transit GPS samples for replay and monitoring
- `TripSafetyEvent` — Generated safety events (`long_stop`, `route_deviation`, `long_trip`, `driver_offline`, `safety_check`)
- `SafetyResponseLog` — Audit trail of every incident action
- `EmergencyContact` — Trusted contacts per user

### SOS flow (`safety/views.py`)

- `POST /safety/sos/`
  - Accepts `ride_id` or `delivery_id`, latitude/longitude, accuracy
  - Creates `SafetyIncident` with severity `critical`
  - Captures current GPS, ride/delivery snapshot, emergency contacts
  - Dispatches `EmergencyAlert`
  - Notifies Operations Center via `LaunchAlert`
  - CEO dashboard cache invalidated
  - Full audit record written

### Safety monitoring service (`safety/monitoring_service.py` + `operations/trust_safety_service.py`)

Detects:

- Excessive route deviation
- Long unexpected stops
- Trip taking unusually long
- Driver offline during trip
- Multiple emergency reports for same user/ride

`POST /operations/trust-safety/monitoring/` runs the scan and returns alerts.

### Incident management (`operations/trust_safety_service.py` + views)

- `GET /operations/trust-safety/incidents/` — queue with status/priority filters and summary counts
- `GET/PATCH /operations/trust-safety/incidents/<id>/` — view/acknowledge/assign/investigate/resolve/dismiss
- Every status change writes a `SafetyResponseLog` and audit entry

### Driver / Rider safety profiles

- `GET /operations/trust-safety/drivers/<user_id>/`
  - Rating, completed trips, accidents, reports, suspensions, document violations, SOS history
- `GET /operations/trust-safety/riders/<user_id>/`
  - Cancellations, abuse/fraud/payment-dispute reports, blacklist status, SOS history

### CEO dashboard (`/operations/trust-safety/ceo/`)

Returns:

- Safety score
- Open incidents and critical open count
- Emergency alerts
- Average resolution time
- High-risk areas
- Repeat offenders

### Reporting (`/operations/trust-safety/reports/`)

- `type=daily` — Daily Safety Report
- `type=weekly` — Weekly Incident Report
- `type=monthly` — Monthly Trust Report
- `type=kpi` — Safety KPI Dashboard

### Permissions & audit

- `IsLaunchCommandStaff` for operations staff
- `IsCeoStaff` for CEO dashboard
- `log_from_request` called on every mutating action
- Cache invalidation for dashboards after incident/monitoring updates

## Frontend

- `frontend/src/admin/trust/TrustSafetyCenter.js`
  - Tabs: Overview, Emergency, Monitoring, Incidents, Driver Profiles, Rider Profiles, CEO Dashboard, Reports, Audit
  - Real-time safety score display
  - Incident queue with status/priority filters
  - SOS and monitoring alert panels
  - Driver/rider safety profile lookup
  - CEO safety metrics
  - Report viewer
  - Audit trail

- `frontend/src/admin/trust/trustSafetyApi.js`
- `frontend/src/admin/trust/TrustSafetyCenter.css`

### Routing & navigation

- Route `/admin/trust-safety` registered in `App.js` and `roleRouting.js`
- Sidebar link in `AdminDashboard.js`

## Tests

- `tests/operations/test_trust_safety.py`
- `tests/safety/test_safety_center.py`

```bash
cd backend/taxi
python manage.py test tests.operations.test_trust_safety tests.safety -v 1
```

**Result:** 14 tests pass.

## Verification

```bash
cd backend/taxi
python manage.py check
# no issues

cd frontend
npm run build
# succeeded
```

## Notes

- No redesign of Rider, Driver, or Delivery apps; SOS button already integrated in those apps triggers the new backend endpoints.
- Existing authentication and admin UI reused.
- Full audit logging implemented on all Trust & Safety mutations.
