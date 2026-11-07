# YALA Technologies — Employee ID Card Management (implementation report)

**Branch:** `release/coordinated-admin-moosyl-rc1`  
**Status:** Integrated for local/staging QA — **not production-deployed** (see `RELEASE_A_EMPLOYEE_ID_CARDS.md`)  
**Production migrations:** `employees.0010_idcardofficialsettings` — apply only after CEO approval

## Summary

The Employee ID Card module builds on the existing `employees` app (profiles, signatures, photos, card lifecycle, QR verification, ReportLab CR80 PDFs). This iteration adds:

- Official **YALA-EMP-######** numbering for **new** allocations (legacy `YAM11…LAR` rows remain valid and unchanged).
- **HR ID Card Dashboard** API + admin UI with Mauritanian green/gold/red KPI styling.
- **CEO electronic signature** storage, audit, admin upload, and rendering on the **back** of generated PDFs.
- **Employees & HR** top-nav group with submenu routes into existing screens (no duplicate pages).

## Files created

| Path |
|------|
| `backend/taxi/employees/services/id_card_dashboard.py` |
| `backend/taxi/employees/services/ceo_signature_storage.py` |
| `backend/taxi/employees/views_id_cards.py` |
| `backend/taxi/employees/migrations/0010_idcardofficialsettings.py` |
| `backend/taxi/employees/tests/test_id_card_dashboard.py` |
| `frontend/src/admin/employees/EmployeeIdCardDashboard.js` |
| `frontend/src/admin/employees/EmployeeIdCardDashboard.css` |
| `frontend/src/admin/employees/CeoIdCardSignaturePanel.js` |
| `engineering/EMPLOYEE_ID_CARD_IMPLEMENTATION_REPORT.md` |

## Files modified (high level)

- `backend/taxi/employees/models.py` — YALA-EMP format, `IdCardOfficialSettings`, `is_legacy_employee_number()`
- `backend/taxi/employees/urls.py` — dashboard + CEO signature routes
- `backend/taxi/employees/views.py` — PDF loads CEO signature bytes
- `backend/taxi/employees/services/card_pdf.py` — CEO signature on card back
- `backend/taxi/employees/services/number_service.py`, `tests/test_number_generation.py`
- `frontend/src/admin/employees/EmployeeManagementCenter.js`, `employeesApi.js`
- `frontend/src/admin/layouts/permissions/topNavConfig.js`

## Database migration plan (proposal)

1. **Staging/dev:** `python manage.py migrate employees` (includes `0010_idcardofficialsettings`).
2. **Production:** Run only after approval; creates singleton `IdCardOfficialSettings` table (no data backfill required).
3. **Legacy employee numbers:** No automatic rewrite. Optional future management command (CEO-approved) could map `YAM11…LAR` → display aliases without reusing sequence slots.

## Security

- Dashboard + CEO signature: **HR Staff** / **Administrator** tiers (DRF permissions).
- CEO signature files: protected media, same validation as employee signatures, audited on upload.
- QR public verification unchanged (gated by `PUBLIC_QR_VERIFICATION_ENABLED`).

## Automated tests

- `employees.tests.test_number_generation` — **pass** (35 tests including allocation).
- `employees.tests.test_id_card_dashboard` — **pass** (with auth expectation 401/403).

Run locally:

```bash
cd backend/taxi
python manage.py test employees.tests.test_number_generation employees.tests.test_id_card_dashboard
```

## Production build

- `npm run build:admin` — **pass** (warnings: source maps, bundle size — pre-existing).

## Screenshots (CEO inspection)

I cannot capture Cursor’s browser from this environment. After login, capture and save under `frontend/docs/screenshots/runtime/`:

1. `/admin/employees?view=dashboard` — ID Card Dashboard
2. `/admin/employees?view=register` — Registration
3. Employee profile → Cards — front/back preview
4. CEO signature panel on dashboard (administrator user)
5. `/admin/verification` — verification UI
6. Public QR verify page (when enabled in settings)

## Remaining gaps / honest limitations

| Item | Notes |
|------|--------|
| Card workflow status labels (Draft, Pending CEO, …) | Backend uses `CardStatus` (valid/expired/…); UI maps display; full workflow enum not added |
| Split first/last name on registration | Still `full_name` in HR model |
| Dedicated “print queue” page | Print via per-employee card panel + PDF download |
| Legacy → YALA-EMP re-label migration | Not run; manual/CEO-approved command TBD |
| Browser screenshots | User must capture locally |
| Full `npm test` suite | Not all tests run in this pass |

## Git

Commit when you approve — current work may be uncommitted on `feature/admin-enterprise-top-nav`.
