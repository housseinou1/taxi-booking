# Phase 15 — Commercial Launch Preparation QA

**Date:** 2026-07-21  
**Scope:** Launch Control Center, incidents, support, onboarding, finance, KPIs, alerts, checklist, documentation

---

## Automated tests

Run:

```bash
cd backend/taxi
python manage.py test tests.operations.test_launch_operations --verbosity=2
```

Expected: all tests PASS after migration `0004_launch_preparation`.

---

## Manual verification

| # | Check | Route / API |
|---|-------|-------------|
| 1 | Launch hub loads | `/admin/launch` |
| 2 | Traffic lights on control tab | `GET /operations/launch/control/` |
| 3 | Create incident + timeline | `POST /operations/launch/incidents/` |
| 4 | Export incident CSV | `GET /operations/launch/incidents/{id}/export/` |
| 5 | Support filters | `GET /operations/launch/support/?category=payment` |
| 6 | Onboarding metrics | `GET /operations/launch/onboarding/` |
| 7 | Finance export | `GET /operations/launch/finance/export/` |
| 8 | KPIs growth chart | `GET /operations/launch/kpis/` |
| 9 | Alerts acknowledge | `POST /operations/launch/alerts/{id}/ack/` |
| 10 | Checklist progress | `GET /operations/launch/checklist/` |

---

## Documentation deliverables

- `docs/LAUNCH_RUNBOOK.md`
- `docs/OPERATIONS_MANUAL.md`
- `docs/SUPPORT_PLAYBOOK.md`
- `docs/INCIDENT_RESPONSE.md`
- `docs/CEO_DAILY_CHECKLIST.md`
- `docs/PRODUCTION_CHECKLIST.md`

Backup guide: existing `docs/DISASTER_RECOVERY.md`
