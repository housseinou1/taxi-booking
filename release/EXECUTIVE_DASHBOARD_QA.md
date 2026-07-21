# Executive Dashboard QA

**Verdict: PASS** (automated backend QA)

## Automated checks

| Check | Result |
|---|---|
| Executive dashboard API (staff only) | PASS |
| Live metrics + finance + operations payload | PASS |
| QA reconciliation endpoint | PASS |
| CSV export | PASS |
| Maintenance mode restricted to CEO/superuser | PASS |

## Notes

- Frontend route: `/admin/executive`
- Dashboard auto-refreshes every 30 seconds
- Map uses normalized marker positions from live GPS data
- Excel/PDF export uses openpyxl/reportlab when installed; falls back to CSV-compatible output otherwise

## Manual follow-up

- Verify Google Maps overlay on production if finer map control is required
- Seed Django groups: CEO, Accountant, Operations Manager, Finance, Super Admin
- Run migration: `operations.0002_platformsetting`
