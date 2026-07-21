# Phase 12 — Real-Time Operations Center QA

## Automated backend tests
- `backend/taxi/tests/operations/test_operations_center.py`
- Covers dashboard modules, fleet/map endpoints, dispatch RBAC, incident actions, analytics, incident CSV export

## Manual QA checklist

### Real-time updates
- [ ] Open `/admin/operations` as CEO or Operations Manager
- [ ] Confirm fleet counts refresh within 8 seconds
- [ ] Confirm WebSocket indicator shows "WebSocket live" when connected to `ws/rides`
- [ ] Trigger a ride status change and verify dashboard refreshes

### Map accuracy
- [ ] Verify driver markers (green), couriers (orange), waiting riders (blue)
- [ ] Verify active trips and deliveries appear on map panel
- [ ] Verify SOS incidents appear as red pulsing markers

### Dispatch actions
- [ ] Reassign ride (ops role)
- [ ] Cancel ride with reason
- [ ] Pause driver
- [ ] Reassign / cancel delivery
- [ ] Acknowledge / assign / close incident
- [ ] Export incident CSV

### WebSocket stability
- [ ] Staff ops user joins `operations_center` and `admin_safety` groups
- [ ] Ride updates on shared `rides` group trigger UI refresh
- [ ] Reconnect after network drop

### Role permissions
- [ ] CEO / Operations Manager / Super Admin: dispatch allowed
- [ ] Finance / Accountant: view only (dispatch 403)
- [ ] Regular user: 403 on all `/operations/center/*`

### Audit logging
- [ ] Force assign, reassign, cancel, pause, incident actions write `AuditLog` entries

## Result
Run tests in CI/production Docker environment (local Python 3.15 may fail on redis/kombu import).
