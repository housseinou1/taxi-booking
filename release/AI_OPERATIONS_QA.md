# Phase 13 — AI Operations & Smart Dispatch QA

## Automated tests
- `backend/taxi/tests/operations/test_ai_operations.py` (8 tests)

## QA checklist

### Explainability
- [ ] Smart dispatch shows `reasons` and `breakdown` for selected driver
- [ ] Recommendations include JSON `explanation` payload
- [ ] Financial insights show disclaimer (no auto-actions)

### Safety guards
- [ ] No automatic driver suspension from AI module
- [ ] No automatic financial decisions (withdrawals/refunds/surge applied)
- [ ] Recommendation approve/dismiss/complete requires CEO role

### Audit logging
- [ ] Recommendation actions create `AuditLog` entries
- [ ] Recommendation refresh logged

### Permissions
- [ ] Staff executive roles can view `/operations/ai/*`
- [ ] Non-staff denied (403)
- [ ] Ops Manager cannot approve recommendations (403)
- [ ] CEO/Super Admin can approve recommendations

### Modules
- [ ] Surge monitor shows zones with suggested multiplier
- [ ] Hotspot map filters: hour / today / week
- [ ] Predictive alerts surface without taking action
- [ ] Driver scores categorized: Excellent / Good / Needs Attention / At Risk
- [ ] Fleet health percentages render

## UI
- `/admin/ai-operations` — AI Operations dashboard with 8 tabs
