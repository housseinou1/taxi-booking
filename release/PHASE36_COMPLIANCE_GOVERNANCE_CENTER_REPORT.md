# Phase 36 — YALA Compliance & Governance Center

**Date:** 2026-07-21  
**Status:** Backend, frontend, and tests complete; build passes

---

## Summary

Phase 36 creates a centralized Compliance & Governance Center that combines existing regulatory data (driver documents, merchant records, partner contracts, vehicle reminders) with governance models for audits, policies, risk register entries, and compliance deadlines. It reuses authentication, audit logging, and existing platform data — no duplicate business logic.

---

## Data Models (`operations/models.py`)

- `ComplianceAudit` — internal, financial, security, operational, IT, and compliance audits with status, owner, due date, findings, corrective actions, and evidence attachments.
- `PolicyDocument` — company, security, privacy, operational, and handbooks with version, approval/review dates, status, and acknowledgement requirements.
- `PolicyAcknowledgement` — records that a user acknowledged a specific policy version.
- `ComplianceRisk` — strategic, operational, financial, cybersecurity, legal, reputation, and compliance risks with likelihood, impact, mitigation, owner, review schedule, and auto-computed score.
- `ComplianceCalendarEvent` — upcoming deadlines for insurance, licenses, tax filings, financial reporting, policy/security reviews, annual audits, and generic compliance deadlines.

Django migration created: `operations/migrations/0011_policydocument_complianceaudit_and_more.py`

---

## Backend

### Aggregation Service (`operations/compliance_governance_service.py`)

- `build_compliance_dashboard` — overall compliance score, open issues, expiring licenses/insurance/driver documents, merchant/partner compliance, vehicle maintenance due, outstanding policy acknowledgements
- `build_audit_center` — audit list with findings/corrective actions and status/type summaries
- `build_policy_management` — policies by category, review counts, acknowledgement counts
- `build_risk_register` — risk list with computed scores and critical-open counts
- `build_compliance_calendar` — upcoming events with computed due_soon/overdue status
- `build_ceo_governance_dashboard` — compliance score, critical risks, audit progress, outstanding approvals, policy review status, legal action items, upcoming deadlines
- `build_compliance_governance_suite` — combines all sections

**Reused data sources:** `DriverDocument`, `DriverProfile`, `Merchant`, `Partner` (Phase 32), `VehicleMaintenanceReminder`, governance models.

### Views (`operations/compliance_governance_views.py`)

| Endpoint | Method | Purpose | Permission |
|----------|--------|---------|------------|
| `/operations/compliance-governance/` | GET | Full suite | CEO / Compliance |
| `/operations/compliance-governance/dashboard/` | GET | Compliance dashboard | CEO / Compliance |
| `/operations/compliance-governance/audits/` | GET | Audit center | CEO / Compliance |
| `/operations/compliance-governance/audits/<id>/action/` | POST | Update audit status/add corrective action note | CEO / Compliance |
| `/operations/compliance-governance/policies/` | GET | Policy management | CEO / Compliance |
| `/operations/compliance-governance/policies/<id>/action/` | POST | Update policy status/review date | CEO / Compliance |
| `/operations/compliance-governance/risks/` | GET | Risk register | CEO / Compliance |
| `/operations/compliance-governance/risks/<id>/action/` | POST | Update risk status/mitigation | CEO / Compliance |
| `/operations/compliance-governance/calendar/` | GET | Compliance calendar | CEO / Compliance |
| `/operations/compliance-governance/calendar/<id>/action/` | POST | Update event status | CEO / Compliance |
| `/operations/compliance-governance/ceo-governance/` | GET | CEO governance dashboard | CEO / Compliance |
| `/operations/compliance-governance/reports/<type>/export/?export_format=csv\|excel\|pdf` | GET | Export governance report | CEO / Compliance |

All mutating endpoints call `log_from_request` for audit logging.

Permission class `IsComplianceOrCeoStaff` (in `executive_permissions.py`) allows CEO, Super Admin, Compliance, and Compliance Manager groups.

### URLs

Registered in `operations/urls.py` under `/operations/compliance-governance/`.

---

## Frontend

- `frontend/src/admin/compliance/ComplianceGovernanceCenter.js`
  - Tabs: Compliance Dashboard, Audit Center, Policy Management, Risk Register, Compliance Calendar, CEO Governance, Reports
  - Tables with inline status actions for audits, policies, risks, and calendar events
  - Metric cards with critical highlighting
- `frontend/src/admin/compliance/complianceGovernanceApi.js` — API client
- `frontend/src/admin/compliance/ComplianceGovernanceCenter.css`

### Navigation

- Route `/admin/compliance-governance` registered in `App.js`
- Sidebar link added to `AdminDashboard.js`
- Role routing updated in `auth/roleRouting.js`

---

## Verification

```bash
cd backend/taxi
python manage.py check
# System check identified no issues (0 silenced)

python manage.py test tests.operations.test_compliance_governance -v 1
# Ran 8 tests — OK

cd frontend
npm run build
# Build succeeded
```

**Enhancements in this pass:**

- Partner compliance rollup from Phase 32 `Partner` model
- Vehicle maintenance due counts from `VehicleMaintenanceReminder`
- Calendar due_soon/overdue computed on read
- Export uses `export_format` query param (DRF reserves `format`)
- Authenticated blob download in frontend (JWT-safe)
- CEO governance tab shows audit progress, upcoming deadlines, policy review status
- Dedicated test suite `test_compliance_governance.py`
- `IsComplianceOrCeoStaff` centralized in `executive_permissions.py`

---

## Files Added / Modified

- `backend/taxi/operations/models.py` (new governance models)
- `backend/taxi/operations/migrations/0011_policydocument_complianceaudit_and_more.py`
- `backend/taxi/operations/compliance_governance_service.py`
- `backend/taxi/operations/compliance_governance_views.py`
- `backend/taxi/operations/executive_permissions.py`
- `backend/taxi/operations/urls.py`
- `backend/taxi/tests/operations/test_compliance_governance.py`
- `frontend/src/admin/compliance/ComplianceGovernanceCenter.js`
- `frontend/src/admin/compliance/complianceGovernanceApi.js`
- `frontend/src/admin/compliance/ComplianceGovernanceCenter.css`
- `frontend/src/App.js`
- `frontend/src/admin/AdminDashboard.js`
- `frontend/src/auth/roleRouting.js`

---

## Notes

- Existing user and audit infrastructure are reused via `log_from_request`.
- No business logic duplicated; scores and counts derive from governance models and existing platform data.
- Governance records are managed via Django admin or API actions; seed data can be added via admin for demos.
- Export query param is `export_format` (not `format`) to avoid DRF content-negotiation conflicts.
- `/operations/business/compliance/` remains the Phase 20 driver-document view; Phase 36 is the executive governance suite.
- CEO and Compliance roles have full access; other users are denied.
- Full audit logging covers all report exports and governance status changes.
