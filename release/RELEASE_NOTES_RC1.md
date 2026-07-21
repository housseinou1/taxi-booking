# Yala v1.0.0-RC1 Release Notes

**Release candidate:** `v1.0.0-rc1`  
**Date:** 2026-07-21  
**Git tag:** `v1.0.0-rc1` @ `0332fd26`  
**Pilot city:** Nouakchott, Mauritania  
**API:** https://api.yalataxi.live  

---

## Summary

First release candidate for Yala soft launch. This RC freezes feature development and packages Phases 12–16 production hardening: Operations Center, AI Operations, Launch Control Hub, encrypted backups, payments migrations, and 3× ASGI scaling for launch load.

**Mobile builds (RC1 bundle):**

| App | Version | Build |
|-----|---------|-------|
| Yala Rider | 1.2.7 | 19 |
| Yala Driver | 1.2.23 | 38 |
| Yala Delivery | 1.0.x | See `release/android/` |

---

## New Features (since v1.2.7-step1)

### Platform & Admin
- **Operations Center** — live dispatch dashboard, driver pause, broadcast, emergency center
- **AI Operations** — rules-based fleet recommendations (human-in-the-loop)
- **Executive Dashboard** — CEO/finance KPIs, maintenance mode toggle
- **Launch Control Hub** — launch checklist, incidents, alerts, onboarding metrics
- **Production Status page** — `/admin/status` with DB, Redis, Celery, WebSocket health

### Rides & Dispatch
- Smart driver dispatch and matching rules
- Rider no-show system with waiting timer and driver compensation
- Driver Code screen with live QR for rider verification
- Driver performance score tiers and cancellation gates
- Driver rewards system (points, tiers, challenges)

### Payments & Wallet
- Withdrawal idempotency reference (migration 0016)
- Driver payout method verification (0017)
- Wallet pending balance tracking (0018)
- Inline driver withdrawal flow with OTP

### Security
- Admin 2FA infrastructure
- Device session binding and new-device alerts
- nginx rate limiting with HTTP 429 (not 503)
- JWT refresh rotation
- Upload validation for delivery proofs

### Infrastructure
- Encrypted nightly backups (PostgreSQL + Redis + media)
- Tiered retention: daily 30 / weekly 12 / monthly 12
- Backup monitor + non-destructive restore drill
- 3× Daphne ASGI replicas with nginx least_conn upstream
- 2× Celery workers (4 concurrency each)
- PostgreSQL max_connections raised to 250

---

## Bug Fixes

- Mark Arrived 500 errors and stale trip state cleanup
- complete_ride 503 under load — resolved via ASGI scaling
- nginx config not applying without container recreate — documented
- Driver GPS fallback for arrive geofence
- Duplicate incoming-ride sound removed
- Withdrawal OTP payout-method phone fallback
- Executive report download `export_format` query param
- Cross-subdomain admin login (same-origin API proxy)
- Docker Postgres SSL config pinned for rebuild stability
- Auth rate limit returning 503 → now returns **429**

---

## Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| Payments migrations 0016–0018 | New withdrawal/wallet fields | Run `migrate payments` before deploy |
| nginx rate limits (10/min auth) | Automated login bursts get 429 | Use internal JWT for ops scripts |
| 3 ASGI replicas | Higher DB connection usage | `max_connections=250`; replicas skip migrate |
| Operations API paths | New `/operations/*` endpoints | Admin SPA routes updated |

No breaking mobile API contract changes in RC1.

---

## Known Issues

| ID | Severity | Issue |
|----|----------|-------|
| RC1-001 | P0 | Physical Android device QA not re-certified |
| RC1-002 | P0 | Google Play Data Safety + account deletion attestation pending |
| RC1-003 | P0 | Offsite encrypted backup upload not configured |
| RC1-004 | P1 | Admin 2FA / OTP / device binding not E2E verified |
| RC1-005 | P1 | Full DR restore drill not executed |
| RC1-006 | P2 | p95 API latency ~4.8 s under 335 concurrent load |
| RC1-007 | P2 | Apple App Store metadata pending |

---

## Remaining Launch Blockers

1. Mobile physical device regression on Android hardware  
2. Play Store / App Store compliance attestation  
3. Offsite backup storage  
4. Full disaster recovery restore  
5. Security E2E for admin 2FA, OTP, device binding  

**RC1 soft launch (Nouakchott pilot) may proceed** once P0 mobile QA and P1 security items are cleared.

---

## Deploy

```bash
git fetch --tags origin
git checkout v1.0.0-rc1
docker compose -p yala up -d django django-replica django-replica-2 celery-worker celery-worker-2
docker compose -p yala exec -T django python manage.py configure_soft_launch
```
