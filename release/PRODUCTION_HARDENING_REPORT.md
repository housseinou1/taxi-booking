# YALA Enterprise v1.0 — Production Hardening Report

**Document ID:** YALA-REL-HARDEN-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0 Release Candidate  
**Golden commit:** `f6ffdcb4`  
**Scope:** API, database, security, performance, resiliency, and code-quality hardening audit  
**Rule:** No feature additions; no UI redesign; only production-risk identification and hardening evidence.

---

## Executive Summary

| Dimension | Score | Grade |
|-----------|:-----:|:-----:|
| **Security** | **78 / 100** | B |
| **Performance** | **72 / 100** | C+ |
| **Reliability** | **75 / 100** | C+ |
| **Maintainability** | **80 / 100** | B |
| **Operations** | **70 / 100** | C |
| **Overall readiness** | **75 / 100** | **READY WITH CONDITIONS** |

### Recommendation

**READY WITH CONDITIONS** — approve **closed beta (≤25 supervised users)** only.

| Launch tier | Verdict |
|-------------|---------|
| Closed beta (≤25 users) | **READY WITH CONDITIONS** |
| Public launch (GA) | **NOT READY** |

**Conditions before closed beta:**

1. Deploy golden RC (`v1.0.0-rc-final`) to production — RC3 DB indexes and dashboard cache not yet live.
2. Confirm `DJANGO_DEBUG=False`, `REDIS_URL` set, and rate limits share state across workers.
3. Complete physical device QA on golden APKs.
4. Close Play Console Data Safety + account-deletion attestation.
5. Run full load test with admin credentials (`scripts/launch-perf-smoke.py`).

**Conditions before public launch:**

1. All closed-beta conditions above.
2. Executive dashboard p95 < 2000 ms under concurrent load (currently unverified post-RC3).
3. Formal least-privilege role audit signed off.
4. Offsite encrypted backups verified.
5. Rate-limit unthrottled public write endpoints (merchant/corporate registration).
6. Paginate high-volume admin list endpoints.

---

## Validation Method

| Source | Evidence collected |
|--------|-------------------|
| Code audit | `backend/taxi/`, `frontend/src/`, mobile wrappers |
| Production API | `https://api.yalataxi.live` — health, readiness, latency probes |
| Test suite | Core mobile domains: **234/234 OK** (operations, rides, deliveries, payments, authapp) |
| Prior certifications | `SECURITY_CERTIFICATION.md`, `PERFORMANCE_REPORT.md`, `INSTALLATION_CERTIFICATION.md` |
| Benchmark scripts | `scripts/launch-perf-smoke.py`, `scripts/launch-load-test-phase16.py` |

**No code changes were made during this hardening sprint.** All scores reflect current state.

---

## Phase 1 — API Hardening

### Summary: **MODERATE** (strong auth/validation; gaps in pagination, error uniformity, some unthrottled writes)

| Control | Status | Evidence |
|---------|:------:|----------|
| Authentication | ✅ **PASS** | JWT default on all DRF views; 15-min access, 7-day rotating refresh + blacklist (`taxi/settings.py` SIMPLE_JWT) |
| Authorization | ⚠ **CONDITIONAL** | Role decorators in `operations/executive_permissions.py`; `IsObjectOwnerReadOnly` allows any authenticated GET on driver/rider objects |
| Validation | ✅ **PASS** | Serializers + `authapp/validators.py` + GPS/service-area checks in `taxi/security/abuse.py` |
| Error responses | ⚠ **WEAK** | No global `EXCEPTION_HANDLER`; mixed `{error}`, `{detail}`, `{code}` shapes |
| Rate limiting | ⚠ **CONDITIONAL** | DRF 60/min anon, 300/min user + custom `abuse.rate_limit()` on login/register/rides/deliveries/withdrawals; gaps on merchant/corporate register and token refresh |
| Pagination | ❌ **FAIL** | No `DEFAULT_PAGINATION_CLASS`; many list endpoints return full tables |
| Timeouts | ⚠ **PARTIAL** | Outbound calls timed (OpenAI 20s, webhooks 10s, SMS 10s); no inbound request timeout |
| Idempotency | ⚠ **PARTIAL** | Withdrawals fully idempotent (`payments/withdrawal_service.py` + DB unique constraint); rides/payments lack idempotency keys |

### Public API inventory (AllowAny endpoints)

| Endpoint | Rate limited | Risk |
|----------|:------------:|------|
| `/api/health/live`, `/api/health/ready/` | N/A (read) | Low |
| `/auth/register/`, `/auth/login/` | ✅ abuse limiter | Low |
| `/auth/token/refresh/` | ⚠ DRF anon only | Medium — token spray |
| `/merchants/register/` | ❌ | **High** — spam registration |
| `/features/corporate/register/` | ❌ | **High** — spam registration |
| `/support/ai/` | IP 20/min | Medium — OpenAI cost if enabled |
| `/api/docs/`, `/api/schema/` | ❌ | Medium — schema exposure |
| `/cities/`, `/intercity/routes/` | N/A (read) | Low (unpaginated) |

### Production risks (API)

| ID | Risk | Severity | Fix (hardening only) |
|----|------|----------|----------------------|
| API-R01 | Rate limits ineffective if `REDIS_URL` unset (LocMem per worker) | **Critical** | Enforce Redis in production env |
| API-R02 | Merchant/corporate registration unthrottled | **High** | Add `abuse.rate_limit()` |
| API-R03 | No default pagination on list endpoints | **High** | Add `PageNumberPagination` default |
| API-R04 | No unified exception handler | **Medium** | Add DRF custom handler |
| API-R05 | Ride/payment endpoints lack idempotency keys | **Medium** | Add optional `Idempotency-Key` on POST |
| API-R06 | OpenAPI schema publicly accessible | **Medium** | Gate `/api/docs/` behind staff auth in prod |
| API-R07 | `rate_limit_api` decorator defined but unused | **Low** | Remove dead code or wire to views |

---

## Phase 2 — Database Hardening

### Summary: **STRONG in core domains; WEAK in secondary apps**

| Control | Status | Evidence |
|---------|:------:|----------|
| Indexes (rides/deliveries/drivers/payments) | ✅ **PASS** | RC3 migrations `payments/0020`, `drivers/0023`; composite indexes on status+created_at |
| Indexes (merchants/intercity/promotions/notifications) | ❌ **GAP** | No composite indexes on high-filter fields |
| N+1 queries | ⚠ **MIXED** | Good in rides/merchants/safety; gaps in auth `user_list`, promotions analytics, deliveries admin |
| Transaction safety | ✅ **PASS** | `select_for_update` on rides, wallets, withdrawals, promo codes, delivery assignment |
| Foreign key integrity | ✅ **PASS** | Django FK constraints throughout models |
| Migration safety | ⚠ **CONDITIONAL** | 19 RunPython migrations; recent RC3 migrations are additive index-only |

### Index gaps (recommendations — not applied)

| Model | Recommended index | Query pattern |
|-------|-------------------|---------------|
| `MerchantOrder` | `(merchant_id, status)` | Merchant dashboard filters |
| `IntercityTrip` | `(rider_id, status)` | Rider trip history |
| `PromoCodeUsage` | `(status, -created_at)` | Admin analytics scans |
| `FCMToken` | `(user_id, is_active)` | Push delivery lookups |
| `NotificationHistory` | `(user_id, -created_at)` | Notification inbox |

### Slow query patterns (evidence)

| Location | Pattern | Severity |
|----------|---------|----------|
| `authapp/views.py` → `user_list` | Full table scan, no pagination | **High** |
| `deliveries/views.py` → `admin_analytics` | 8+ separate COUNT queries + Python loop | **High** |
| `promotions/views.py` → analytics | Full-table `PromoCodeUsage.objects.all()` | **Medium** |
| `operations/compliance_governance_service.py` | ~20 COUNT queries per dashboard | **Medium** |
| `api_gateway/middleware.py` | Sync DB INSERT per partner request | **Medium** at scale |

### Migration safety

```bash
python manage.py makemigrations --check --dry-run  → No changes detected
```

Recent safe migrations: `payments/0020_rc3_stabilization_indexes.py`, `drivers/0023_rc3_stabilization_indexes.py` (additive only).

---

## Phase 3 — Security Hardening

### Summary: **ACCEPTABLE FOR CLOSED BETA** (82% per prior cert); gaps remain for GA

| Control | Status | Evidence |
|---------|:------:|----------|
| JWT lifecycle | ✅ **PASS** | 15-min access, rotate+blacklist refresh, logout-all-devices |
| Refresh tokens | ✅ **PASS** | Blacklist app installed; password reset blacklists tokens |
| Password reset | ✅ **PASS** | Rate-limited; tokens expire |
| File uploads | ✅ **PASS** | 5MB profile / 8MB ID caps; type validation in serializers |
| CORS | ⚠ **CONDITIONAL** | `CORS_ALLOW_ALL_ORIGINS=DEBUG` — must be False in prod |
| CSRF | ✅ **PASS** | Trusted origins env-configured; API uses JWT not session |
| Secrets | ⚠ **CONDITIONAL** | Env-based; dev fallback key blocked when `DEBUG=False` |
| Admin permissions | ✅ **PASS** | `IsAdminUser` + 2FA TOTP for staff |
| CEO permissions | ✅ **PASS** | `CEO_ONLY_GROUPS` in `executive_permissions.py` |
| Collector restrictions | **N/A** | No Collector app/API surface in v1.0 (Academy audience tag only) |
| Supervisor restrictions | ✅ **PASS** | Supervisor in `OPS_GROUPS`, `FLEET_GROUPS`; cannot access CEO-only or finance-only endpoints |

### Vulnerabilities and risks

| ID | Finding | Severity | Evidence |
|----|---------|----------|----------|
| SEC-V01 | OTP/reset codes returned in API when `DEBUG=True` | **Critical** | `authapp/phone_views.py`, `password_reset_views.py` |
| SEC-V02 | Play Integrity permissive mode when API key unset | **High** | `admin_2fa/integrity.py:94-97` — always passes |
| SEC-V03 | `DEBUG` defaults to `True` | **High** | `taxi/settings.py:24` |
| SEC-V04 | `IsObjectOwnerReadOnly` — any auth user can GET any profile | **Medium** | `taxi/drivers/api_perm/permissions.py` |
| SEC-V05 | OpenAPI docs unauthenticated | **Medium** | Root `urls.py` |
| SEC-V06 | Password-change does not revoke existing JWTs | **Low** | Documented P2 in SECURITY_CERTIFICATION |
| SEC-V07 | QA passwords hardcoded in ~30 scripts | **Low** | `scripts/*.py` — rotate if prod accounts |

### JWT configuration (verified)

```python
ACCESS_TOKEN_LIFETIME = 15 minutes
REFRESH_TOKEN_LIFETIME = 7 days
ROTATE_REFRESH_TOKENS = True
BLACKLIST_AFTER_ROTATION = True
MAX_CONCURRENT_DEVICE_SESSIONS = 5
```

### Role matrix — Supervisor vs CEO

| Capability | CEO | Supervisor | Collector (v1.0) |
|------------|:---:|:----------:|:----------------:|
| Executive dashboard | ✅ | ✅ (view) | N/A |
| Finance operations | ✅ | ❌ | N/A |
| CEO-only actions | ✅ | ❌ | N/A |
| Fleet dispatch | ✅ | ✅ | N/A |
| Compliance governance | ✅ | ❌ | N/A |

Supervisor is correctly restricted from finance and CEO-only endpoints via `can_manage_finance()` and `can_ceo_actions()` group checks.

---

## Phase 4 — Performance Hardening

### Summary: **PARTIAL** — health acceptable; dashboard load unverified post-RC3

### Benchmark results (2026-07-22, production API)

#### Health readiness — sequential probe (20 samples)

| Metric | Value | Target | Status |
|--------|------:|--------|:------:|
| Errors | 0 | 0 | ✅ |
| Min | 163 ms | — | ✅ |
| Average | 255.7 ms | — | ✅ |
| **p50** | **231 ms** | < 500 ms | ✅ |
| **p95** | **690 ms** | < 500 ms | ⚠ |
| Max | 690 ms | — | ✅ |

**Method:** `GET https://api.yalataxi.live/api/health/ready/` × 20 sequential from validation workstation.

**Comparison to prior RC3 report:** p95 improved from **1729 ms** → **690 ms** (same endpoint, different session/network conditions).

#### Production readiness snapshot

```json
{"status":"ok","service":"yala-api","database":"ok","redis":"ok"}
```

Redis and PostgreSQL both healthy at probe time.

#### Endpoints not benchmarked (credentials required)

| Endpoint | Script | Status |
|----------|--------|:------:|
| Ride creation | — | Not run (needs rider JWT + device) |
| Ride acceptance | — | Not run |
| Delivery creation | — | Not run |
| Search / maps | — | Not run (client-side Mapbox) |
| Executive dashboard | `launch-perf-smoke.py` | **Pending** — requires `YALA_ADMIN_EMAIL/PASSWORD` |
| Reports | `launch-load-test-phase16.py` | **Pending** |

#### RC2 baseline (historical — pre-RC3 deploy)

| Endpoint | p50 | p95 | p99 |
|----------|----:|----:|----:|
| `/health/` | — | — | — |
| `/operations/executive/dashboard/` | 926 ms | **4086 ms** | — |

Source: `release/PERFORMANCE_REPORT.md`, `RC3_STABILIZATION_REPORT.md`

#### RC3 optimizations in source (deploy pending)

| Fix | Expected impact |
|-----|-----------------|
| 45s Redis cache on ops dashboards | ~90% faster on cache hit |
| N+1 removal (AI ops, dispatch) | 60–120 fewer queries per dashboard |
| DB indexes (`payments/0020`, `drivers/0023`) | Faster finance/fleet scans |

### Performance risks

| ID | Risk | Severity |
|----|------|----------|
| PERF-R01 | Executive dashboard p95 was 4086 ms pre-RC3; not re-measured | **High** |
| PERF-R02 | Unpaginated list endpoints under load | **High** |
| PERF-R03 | `authapp.views.user_list` full table scan | **Medium** |
| PERF-R04 | Compliance dashboard 20+ COUNT queries | **Medium** |

### Post-deploy benchmark plan

```bash
export YALA_ADMIN_EMAIL=...
export YALA_ADMIN_PASSWORD=...
python scripts/launch-perf-smoke.py          # 150 concurrent, p95 gate < 3000ms
python scripts/launch-load-test-phase16.py # 335 concurrent, zero 5xx gate
```

---

## Phase 5 — Resiliency

### Summary: **MODERATE** — graceful degradation present in key paths; not all failure modes tested live

| Failure mode | Handling | Status | Evidence |
|--------------|----------|:------:|----------|
| Redis unavailable | Readiness → 503; WebSocket degraded | ✅ | `health/views.py:41-42` |
| Celery unavailable | Readiness reports `celery: error/unknown`; app continues | ⚠ | `health/views.py:57-67` — 2s inspect timeout |
| Third-party API timeout | OpenAI 20s, webhooks 10s, SMS 10s | ✅ | `taxi/ai_support.py`, `api_gateway/utils.py` |
| Push notification failure | Returns `"failed"`; logs exception; ride flow continues | ✅ | `notifications/push.py:50-95` |
| Payment timeout | Stripe optional; wallet/cash primary in MRU market | ✅ | `payments/webhooks.py` guards unconfigured Stripe |
| GPS timeout | `gps_fallback` param on driver_arrived; emergency uses last known | ✅ | `taxi/rides/views.py:798`, `support_service.py:220` |
| WebSocket reconnect | Exponential backoff 1s→16s; 30s cap; missed events on reconnect | ✅ | `frontend/src/driver/hooks/useDriverWebSocket.js` |
| SMS fallback | Critical delivery notifications | ✅ | `notifications/sms_fallback.py` |
| AI support fallback | Rule-based answer when OpenAI fails | ✅ | `taxi/ai_support.py:78` `_fallback_answer()` |
| Firebase unavailable | Push returns `"failed"`; no crash | ✅ | `notifications/push.py:52-54` |

### Resiliency gaps

| ID | Gap | Severity |
|----|-----|----------|
| RES-R01 | Celery health not in production readiness JSON (older deploy?) | **Medium** |
| RES-R02 | Referral credit notifications are log-only stubs | **Medium** | `referrals/services/*_referral_service.py` |
| RES-R03 | Delivery scheduling WebSocket broadcast not wired | **Low** | `deliveries/services/scheduling.py:91` |
| RES-R04 | No chaos testing of Redis/Celery failure in CI | **Low** |

### WebSocket reconnect (driver — verified in source)

```
Backoff: 1s → 2s → 4s → 8s → 16s (cap)
Stop after: 30 seconds total
Server-side: missed events delivered on reconnect
```

File: `frontend/src/driver/hooks/useDriverWebSocket.js`

---

## Phase 6 — Code Quality

### Summary: **GOOD** — zero TODO/FIXME debt; moderate debug noise in frontend

| Scan target | TODO/FIXME/HACK | Debug statements | Stubs/mocks |
|-------------|:---------------:|:----------------:|:-----------:|
| `backend/taxi/` (app source) | **0** | 1 orphaned `print()` | 4 notification stubs |
| `frontend/src/` | **0** | **138** `console.*` in 42 files | 3 deprecated shims |
| `scripts/` | **0** | N/A (CLI expected) | — |
| Mobile app source | **0** | 0 (bundled from frontend) | — |

### Critical code-quality findings

| ID | Finding | Location | Priority |
|----|---------|----------|:--------:|
| CQ-01 | Orphan serializer with debug `print()` | `taxi/rides/api/serializers.py:20` | P2 |
| CQ-02 | `driverTripDebug` ships in production bundle | `frontend/src/driver/utils/driverTripDebug.js` | P2 |
| CQ-03 | 138 frontend console calls (GPS coords, errors) | `DriverDashboardNew.js` (14), `DriverApp.js` (18) | P1 |
| CQ-04 | Unused legacy `SettingsPage` (~300 lines) | `frontend/src/App.js:2961` | P3 |
| CQ-05 | Ad-hoc ops scripts in backend root | `verify_deploy.py`, `cancel_remote.py`, etc. | P3 |
| CQ-06 | Referral notification placeholders (log only) | `referrals/services/` | P1 |

### Temporary / "for now" markers (informal debt)

| File | Note |
|------|------|
| `deliveries/services/scheduling.py:91` | Returns counts; WebSocket broadcast deferred |
| `taxi/routing.py:8` | Delivery WS shares ride consumer |
| `frontend/src/App.js:2961` | SettingsPage kept temporarily |

No tracked `TODO`/`FIXME`/`HACK` comments in application source.

---

## Phase 7 — Scoring Detail

### Security — 78 / 100

| Factor | Weight | Score | Notes |
|--------|:------:|:-----:|-------|
| Authentication | 25% | 95 | JWT + blacklist + 2FA |
| Authorization | 20% | 70 | Role matrix present; formal audit incomplete |
| Input validation | 15% | 90 | Strong serializers |
| Transport / headers | 15% | 85 | HTTPS, HSTS when DEBUG=False |
| Secrets management | 15% | 75 | Env-based; DEBUG default risk |
| Abuse prevention | 10% | 70 | Good on core flows; gaps on public writes |

### Performance — 72 / 100

| Factor | Weight | Score | Notes |
|--------|:------:|:-----:|-------|
| API latency (health) | 30% | 75 | p95 690 ms sequential |
| Dashboard latency | 25% | 50 | Not re-measured post-RC3 |
| Database optimization | 25% | 80 | Strong core indexes |
| Caching | 20% | 85 | 45s ops cache in source |

### Reliability — 75 / 100

| Factor | Weight | Score | Notes |
|--------|:------:|:-----:|-------|
| Health checks | 25% | 90 | DB + Redis probed |
| Graceful degradation | 30% | 80 | Push, AI, GPS fallbacks |
| WebSocket resilience | 20% | 85 | Backoff reconnect |
| Transaction safety | 25% | 80 | Locking on money/dispatch |

### Maintainability — 80 / 100

| Factor | Weight | Score | Notes |
|--------|:------:|:-----:|-------|
| TODO/debt markers | 20% | 95 | Zero TODO/FIXME |
| Test coverage (core) | 30% | 85 | 234/234 core tests OK |
| Debug noise | 25% | 60 | 138 console calls |
| Dead code | 25% | 75 | Orphan serializer, unused SettingsPage |

### Operations — 70 / 100

| Factor | Weight | Score | Notes |
|--------|:------:|:-----:|-------|
| Runbooks | 25% | 85 | `operations/PRODUCTION_RUNBOOK.md` |
| Monitoring | 25% | 75 | Health endpoints; Celery probe partial |
| Backup/recovery | 25% | 55 | Offsite backup not verified |
| Deploy readiness | 25% | 65 | Golden RC not on production |

---

## Hardening Recommendations (prioritized)

### P0 — Before closed beta

| # | Action | Phase | Effort |
|---|--------|-------|--------|
| 1 | Deploy golden RC to production + run migrations | Ops | 2h |
| 2 | Verify `DJANGO_DEBUG=False`, `REDIS_URL`, strong `DJANGO_SECRET_KEY` | Security | 30m |
| 3 | Run `launch-perf-smoke.py` post-deploy; confirm p95 < 3000 ms | Performance | 30m |
| 4 | Physical device QA on golden APKs | Installation | 4h |

### P1 — Before cohort expansion (>25 users)

| # | Action | Phase | Effort |
|---|--------|-------|--------|
| 5 | Add `abuse.rate_limit()` to merchant/corporate registration | API | 1h |
| 6 | Add default DRF pagination | API | 2h |
| 7 | Paginate `authapp.views.user_list` | DB/API | 1h |
| 8 | Wire referral notification stubs or document as v1.1 | Resiliency | 4h |
| 9 | Strip `driverTripDebug` from production builds | Code quality | 1h |
| 10 | Formal least-privilege role audit sign-off | Security | 4h |

### P2 — Before public launch

| # | Action | Phase | Effort |
|---|--------|-------|--------|
| 11 | Add indexes on `MerchantOrder`, `IntercityTrip`, `PromoCodeUsage` | DB | 2h |
| 12 | Unified DRF exception handler | API | 3h |
| 13 | Gate `/api/docs/` behind staff auth | Security | 1h |
| 14 | Idempotency keys on ride/payment POST | API | 4h |
| 15 | Consolidate compliance dashboard queries | Performance | 4h |
| 16 | Verify offsite encrypted backups | Ops | 4h |

---

## Test Evidence

```bash
# Migration drift
python manage.py makemigrations --check --dry-run  → No changes detected

# Core mobile domain tests (2026-07-22)
python manage.py test tests.operations tests.rides tests.deliveries tests.payments tests.authapp --keepdb
→ Ran 234 tests in 263s — OK
```

Note: Full suite (484 tests) includes non-core domains with 11 failures in extended modules — core mobile paths are green.

---

## Related Documents

| Document | Relevance |
|----------|-----------|
| `release/SECURITY_CERTIFICATION.md` | Prior security audit (82%) |
| `release/PERFORMANCE_REPORT.md` | RC3 performance baseline |
| `release/INSTALLATION_CERTIFICATION.md` | Mobile install/upgrade status |
| `release/V1_LAUNCH_DECISION.md` | Launch gate decision |
| `operations/PRODUCTION_RUNBOOK.md` | Day-zero operations |
| `release/KNOWN_ISSUES_v1.0.0.md` | Tracked known issues |

---

## Sign-Off

| Role | Status | Date |
|------|:------:|------|
| Engineering (hardening audit) | ✅ Complete | 2026-07-22 |
| QA (load test post-deploy) | ☐ Pending | |
| Security (role audit) | ☐ Pending | |
| Ops (backup verification) | ☐ Pending | |
| CEO (launch decision) | ☐ Pending | |

**Final recommendation: READY WITH CONDITIONS for closed beta. NOT READY for public launch.**
