# YALA RC3 Stabilization Report

**Document ID:** RC3-STAB-001  
**Date:** 2026-07-21  
**Scope:** Quality, performance, security, and reliability only — **feature freeze active**  
**Baseline:** RC2 certified · Phases 24–28 complete  
**Verdict:** **GO Closed Beta** (supervised) · **NO-GO Public Launch**

---

## Executive summary

RC3 focused on stabilization without new modules, dashboards, or feature expansion. Backend performance optimizations, database indexes, reliability health checks, and security hardening were applied in source. Mobile P0/P1 fixes from the prior RC3 pass remain in the working tree but require APK rebuild and production deploy before sign-off.

| Area | RC3 status | Notes |
|------|:----------:|-------|
| Performance | **Improved (source)** | Hot-path query reduction + 45s ops cache; p95 re-measure pending on prod |
| Reliability | **Partial** | Readiness exposes Celery; worker healthcheck added; restart policies verified |
| Security | **Verified (code)** | JWT/OTP/rate limits/audit in place; Play Integrity still off |
| Mobile quality | **Fixed (source)** | Rider/driver P0 fixes local; device re-QA not run |
| Production deploy | **Not done** | Backend + APK deploy required to close RC3 |

---

## 1. Performance

### Baseline (RC2)

| Metric | Recorded | Target | Status |
|--------|----------|--------|--------|
| p50 | 926 ms | — | — |
| **p95** | **4086 ms** | **< 2000 ms** | ❌ FAIL |
| HTTP 5xx | 0 | 0 | ✅ PASS |

Source: `launch_perf_metrics` PlatformSetting · `release/SPRINT1_LAUNCH_READINESS.md`

### Issues identified

| Category | Finding | Impact |
|----------|---------|--------|
| Slow endpoints | AI ops, fleet, executive, finance, multi-city, smart-engine dashboards aggregate 8+ sub-builders per request | High p95 under concurrent admin load |
| N+1 queries | Surge monitor per-cell waiting queries; dispatch analytics per-ride log lookup; ride history without joins | Linear query growth |
| Missing indexes | `Payment.ride_id`, withdrawal/refund queues, driver availability, document expiry | Full scans on finance/fleet panels |
| No ops caching | Redis configured but unused for operations dashboards | Repeated cold builds every poll |
| Chart loops | Finance + executive daily charts ran 2 aggregates × N days | Up to 120 queries per dashboard |

### Fixes applied (this RC3 pass)

| Fix | File(s) | Expected impact |
|-----|---------|-----------------|
| Surge monitor N+1 removed | `operations/ai_operations_service.py` | Eliminates per-zone waiting-ride queries |
| AI dashboard side-effect removed | `operations/ai_operations_service.py` | `generate_ai_recommendations()` no longer runs on every GET |
| 45s Redis cache on AI/fleet/smart-engine dashboards | `operations/cache_utils.py`, service layers | ~90% faster on cache hits for polling UIs |
| Fleet CEO metrics deduplicated | `operations/fleet_performance_service.py` | Avoids second full driver scoring pass |
| Daily chart single-query aggregation | `operations/chart_utils.py`, finance + executive services | ~60 fewer queries per finance/executive load |
| Dispatch analytics batch prefetch | `operations/smart_pricing_dispatch_service.py` | Removes per-ride accepted-log lookup |
| Ride history pagination + joins | `taxi/rides/views.py` | Caps staff history at 500; `select_related` |
| Available rides joins | `taxi/rides/views.py` | Reduces serializer N+1 |
| Database indexes (6 new) | `payments/migrations/0020_*`, `drivers/migrations/0023_*` | Faster payment queues, fleet scans, document monitoring |

### Estimated improvement

| Scenario | Before (est.) | After (est.) |
|----------|---------------|--------------|
| AI ops dashboard (cold) | 3–8 s | 1.5–3 s |
| AI ops dashboard (cached) | 3–8 s | < 200 ms |
| Fleet dashboard (cold) | 2–5 s | 1–2.5 s |
| Finance daily chart | +120 queries | +2 queries |

**p95 target (< 2000 ms):** Not yet re-measured on production. Run `scripts/launch-perf-smoke.py` after deploy to update `launch_perf_metrics`. Remaining cold-path work (multi-city O(cities×3), executive mega-dashboard) is documented for post-beta tuning — out of RC3 scope per feature freeze.

### Deploy

```bash
python manage.py migrate payments 0020
python manage.py migrate drivers 0023
```

---

## 2. Reliability

### Verified

| Component | Status | Evidence |
|-----------|:------:|----------|
| Celery workers | ✅ Configured | 2 workers + beat in `docker-compose.yml`; JSON serialization |
| Redis | ✅ Configured | AOF persistence; ping healthcheck |
| PostgreSQL | ✅ Configured | Postgres 15; `conn_max_age=600`; `pg_isready` healthcheck |
| WebSockets | ✅ Implemented | Daphne ASGI; JWT auth middleware; Redis channel layer |
| Push (FCM) | ✅ Implemented | Token registration; invalid token cleanup; history persisted |
| Auto-restart | ✅ Configured | `restart: always` on all compose services |
| Health API | ✅ | `/api/health/live/`, `/api/health/ready/`, `/api/health/status/` |

### RC3 reliability improvements

| Change | Detail |
|--------|--------|
| Readiness probe | Django Docker healthcheck now hits `/api/health/ready/` (DB + Redis) instead of TCP-only |
| Celery visibility | Readiness response includes `celery` status + worker count (informational; does not fail readiness) |
| Celery worker healthcheck | `celery inspect ping` added to `celery-worker` service |

### Remaining gaps

| Gap | Severity | Action |
|-----|----------|--------|
| Celery queue depth monitoring | Medium | Add Flower or Redis queue metrics before scale |
| Redis DB separation | Medium | Cache, Channels, and Celery share DB 0 in prod — split before high load |
| PgBouncer | Medium | No connection pooler; risk under 3× Daphne + workers |
| WebSocket load test | P1 | Not verified under concurrent connections |
| FCM async retry | Medium | Push sends inline; transient failures not queued |
| Offsite backups | **P0** | Not configured — see blockers |

---

## 3. Security

### Verified controls

| Control | Status | Location |
|---------|:------:|----------|
| JWT access 15 min / refresh 7d rotate + blacklist | ✅ | `taxi/settings.py`, `token_blacklist` |
| Logout-all device revocation | ✅ | `authapp/views.py` |
| Phone OTP (hashed, 10 min, 5 attempts) | ✅ | `authapp/models.py`, `phone_views.py` |
| Password reset OTP | ✅ | `authapp/password_reset_views.py` |
| Rate limiting (DRF + abuse cache) | ✅ | `middleware/ratelimit.py`, `security/abuse.py` |
| Device binding + session cap (5) | ✅ | `DeviceSession` model; login flow |
| Admin 2FA (TOTP) | ✅ | `admin_2fa/` |
| Audit logging | ✅ | `security/services/audit_service.py`; ops write paths |
| Admin permissions (group-based) | ✅ | `executive_permissions.py`, multi-city scoping |
| HTTPS / HSTS | ✅ | nginx production config |

### RC3 security fix

| Fix | Detail |
|-----|--------|
| Audit IP trust | `audit_service._client_ip()` now uses `YALA_TRUST_X_FORWARDED_FOR`-aware `client_ip()` from abuse module |

### Remaining gaps

| Gap | Severity | Notes |
|-----|----------|-------|
| Play Integrity enforcement | High | `PLAY_INTEGRITY_ENFORCE` defaults false; native SDK incomplete |
| Device binding optional | Medium | Login succeeds without `device_id` if client omits it |
| WS token in query string | Medium | Visible in proxy logs; no short-lived WS ticket |
| Executive staff = any `is_staff` | Medium | Broader than group-based ops roles |
| Audit coverage partial | Low | Not all ride/payment views log actions |

---

## 4. Mobile quality (P0 / P1 only)

No new UI redesign. Review covered Rider, Driver, and Delivery against RC2/RC3 QA registers.

### P0 / P1 fixes in source (prior RC3 pass — uncommitted)

| App | Fix | File |
|-----|-----|------|
| Rider | Cancel cleanup: WS leave, polling stop, idle home, toast | `RiderHome.js`, `RideTracker.js` |
| Rider | "Other" cancel reason 10-char minimum | `RideTracker.js` |
| Driver | Green online toast (not error banner) | `DriverDashboardNew.js` |
| Driver | Toggle stuck on prep-error fixed | `DriverDashboardNew.js` |
| Driver | Terminal ride state clears immediately | `DriverDashboardNew.js` |
| Driver | Document dot only for missing/rejected/expired | `documentReview.js` |

Detail: `release/device-qa-rc/YALA_RC3_STABILIZATION_REPORT.md`

### Open mobile / QA blockers

| ID | Priority | Issue | Status |
|----|:--------:|-------|:------:|
| BLK-P0-001 | P0 | Physical Android device QA not signed off | Open |
| BLK-P1-005 | P1 | Delivery E2E not production-certified | Open |
| — | P1 | Prod delivery 403 (phone not verified) | Open |
| — | P1 | Fresh APK not installed on test device | Open |

### Delivery

No P0 code defects identified in source review. Production QA blocked by phone verification and deploy state.

---

## 5. Issues fixed (RC3 stabilization sprint)

### Backend performance & reliability

- Removed surge monitor per-zone N+1 queries
- Removed AI recommendation generation from dashboard GET
- Added 45-second Redis cache for AI ops, fleet, and smart-engine dashboards
- Consolidated finance/executive daily charts to single grouped SQL
- Deduplicated fleet CEO driver scoring
- Batched dispatch analytics accepted-log lookup
- Added `select_related` + pagination caps on ride history
- Added 6 database indexes (payments + drivers)
- Improved Docker readiness probe (HTTP not TCP)
- Added Celery worker healthcheck
- Exposed Celery status on readiness endpoint
- Fixed audit log client IP to respect forwarded-for trust setting

### Mobile (prior pass — requires rebuild)

- Rider cancel lifecycle cleanup
- Driver online UX and state sync fixes

### Not in scope (feature freeze)

- No new modules, dashboards, or APIs
- No UI redesign
- No Play Store / App Store submission work
- No cohort recruitment automation

---

## 6. Remaining risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| RC3 backend not deployed to production | **Critical** | Deploy + migrate before any beta expansion |
| p95 not re-benchmarked post-fix | High | Run perf smoke after deploy |
| Physical device QA unsigned | **P0** | Rebuild APKs; execute `PHYSICAL_QA_STATUS_TRACKER.md` |
| Offsite backups not configured | **P0** | Run `scripts/setup-offsite-backup.sh` |
| Pilot cohort under-recruited (2/1/5 vs caps) | P1 | Ops recruitment during closed beta |
| Play Integrity / store attestation incomplete | P1 | Complete before public launch |
| Multi-city + executive cold dashboards still heavy | P2 | Cache + split endpoints in post-beta perf sprint |
| Redis/Celery/Channels on same DB index | P2 | Split before scale |

---

## 7. Test results

| Suite | Result |
|-------|--------|
| `tests.operations.test_smart_pricing_dispatch` | 9/9 PASS |
| `tests.operations.test_finance_operations` | 6/6 PASS |
| `health.tests.test_health` | 3/3 PASS |
| Prior RC3 mobile unit tests | PASS (RideTracker, RideContext) |
| API smoke (prod, pre-deploy) | 32/34 PASS |
| Device E2E RC3 | **Not re-run** |

---

## 8. Final recommendation

### GO Closed Beta — **YES** (supervised)

Proceed with a **limited, supervised closed beta** under existing caps (20 drivers / 10 couriers / 100 riders) **after**:

1. Deploy RC3 backend (including migrations `payments 0020`, `drivers 0023`)
2. Rebuild and install rider + driver APKs with RC3 JS bundles
3. Re-run physical device QA for P0 ride flows (cancel, online, state sync)
4. Maintain daily CEO/ops monitoring via existing dashboards

P0 blockers (device QA sign-off, offsite backups) are **mitigated** for closed beta by supervised cohort + local backup drill, per Sprint 1 launch policy — but must close before public launch.

### GO Public Launch — **NO**

Public launch remains **NO-GO** until:

| Requirement | Status |
|-------------|:------:|
| P0 physical device QA signed off | ❌ |
| P0 offsite encrypted backups | ❌ |
| p95 API latency < 2000 ms (measured) | ❌ |
| Play Console + App Store readiness | ❌ |
| Delivery production E2E certified | ❌ |
| Pilot cohort at minimum viable scale | ❌ |

### Overall RC3 verdict

**CONDITIONAL GO** — Stabilization work is complete in source. **Production deploy + device QA re-run required** to close RC3. Do not expand beta geography or remove capacity caps until p95 is re-measured and P0 blockers are closed.

---

## 9. Next actions (ordered)

1. **Deploy backend** to `api.yalataxi.live` — migrate, verify `/api/health/ready/`
2. **Run perf smoke** — update `launch_perf_metrics` with new p50/p95
3. **Build APKs** — rider 1.2.3+, driver 1.2.5+ with RC3 bundles
4. **Physical device QA** — sign `PHYSICAL_QA_STATUS_TRACKER.md`
5. **Configure offsite backups** — close BLK-P0-002
6. **Commit RC3 changes** — backend perf + mobile fixes in one stabilization commit

---

## References

- `release/device-qa-rc/YALA_RC3_STABILIZATION_REPORT.md` — mobile fix detail
- `release/sprint1/LAUNCH_BLOCKER_TRACKER.md` — active blockers
- `release/SPRINT1_LAUNCH_READINESS.md` — RC2 perf baseline
- `release/RC2_LAUNCH_CERTIFICATION.md` — RC2 certification
- `release/SECURITY_HARDENING_REPORT.md` — security controls
- `release/INFRASTRUCTURE_CERTIFICATION_REPORT.md` — infra gaps

---

*RC3 stabilization sprint · Feature freeze active · No new modules*
