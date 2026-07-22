# Yala v1.0 — Final Launch Readiness Certification (RC2)

**Date:** 2026-07-21  
**Production:** https://api.yalataxi.live / https://www.yalataxi.live  
**Server:** 142.93.99.142  
**Feature freeze:** in effect

---

## Executive Decision

| Item | Result |
|------|--------|
| **Overall Certification** | **FAIL** |
| **Launch Recommendation** | **NO-GO** |
| **Risk Score** | **62 / 100** |
| **Maximum Pilot Size** | Not recommended until P0/P1 issues are closed |

The codebase is functionally ready for closed beta, but the production environment cannot be certified because direct server access is unavailable and critical live validation is blocked.

---

## Open Issues

| Severity | Count | Issues |
|----------|-------|--------|
| **P0 — Launch Blocker** | 2 | SSH/admin access unavailable; Admin UI returns HTTP 404 |
| **P1 — High Risk** | 5 | Offsite backups not configured; no resource limits; no monitoring/alerting; no log rotation; SSL renewal not verified |
| **P2 — Medium Risk** | 3 | No DB connection pooling; WebSocket stability not verified under load; mobile device QA pending |

---

## Section 1 — Rider Journey

| Step | Production Status | Notes |
|------|-------------------|-------|
| Register | **UNVERIFIED** | Cannot run device tests or authenticated registration flow |
| Login | **UNVERIFIED** | No credentials / no device automation |
| Request ride | **UNVERIFIED** | |
| Driver assignment | **UNVERIFIED** | |
| Live tracking | **UNVERIFIED** | |
| Arrived / started / completed | **UNVERIFIED** | |
| Payment / receipt / rating | **UNVERIFIED** | |
| Ride history / wallet | **UNVERIFIED** | |

**Local evidence:** `operations` tests pass; ride request/accept/completion flows covered in unit tests. Push notifications depend on FCM tokens (`app_type` choices migration generated and safe).

---

## Section 2 — Driver Journey

| Step | Production Status | Notes |
|------|-------------------|-------|
| Login | **UNVERIFIED** | |
| Go Online | **UNVERIFIED** | |
| Receive / accept request | **UNVERIFIED** | |
| Navigation / arrived / start / finish | **UNVERIFIED** | |
| Earnings update / wallet / cash out | **UNVERIFIED** | |

**Local evidence:** Driver withdrawal and earnings tests pass. Payments model integrity preserved by restoring the conditional `UniqueConstraint` on `WithdrawalRequest`.

---

## Section 3 — Delivery Journey

| Step | Production Status | Notes |
|------|-------------------|-------|
| Courier login / go online | **UNVERIFIED** | |
| Accept / pickup / delivered | **UNVERIFIED** | |
| Earnings / wallet | **UNVERIFIED** | |

**Local evidence:** Delivery module tests pass. `FraudFlag` choices migration is safe.

---

## Section 4 — Admin & Operations

| Surface | Production Status | Notes |
|---------|-------------------|-------|
| Admin login | **UNVERIFIED** | No admin credentials; admin UI returns 404 |
| Executive Dashboard | **UNVERIFIED** | API endpoint exists, but UI not reachable |
| Operations Center | **UNVERIFIED** | |
| AI Operations | **UNVERIFIED** | |
| Business Operations Hub | **UNVERIFIED** | |
| Withdrawal approvals | **UNVERIFIED** | |
| Incident management | **UNVERIFIED** | |
| Broadcast notifications | **UNVERIFIED** | |
| Reports and exports | **UNVERIFIED** | |

**Local evidence:** All backend admin/operations modules have passing tests. Migration audit completed: only safe `AlterField` migrations for `FCMToken.app_type` and `FraudFlag.reason`; no dangerous schema changes.

---

## Section 5 — Production Health

| Component | Status | Evidence |
|-----------|--------|----------|
| API health | **PASS** | `GET https://api.yalataxi.live/health/` → HTTP 200, DB + Redis OK |
| WebSocket stability | **UNVERIFIED** | Cannot test `wss://` handshake without auth/admin access |
| Celery workers | **UNVERIFIED** | Configured in `docker-compose.yml` but not inspectable |
| Redis | **PASS** (via API) | Health endpoint reports `redis: ok` |
| PostgreSQL | **PASS** (via API) | Health endpoint reports `database: ok` |
| Docker | **UNVERIFIED** | Cannot run `docker compose ps` |
| nginx | **PARTIAL** | Serves API; admin frontend routes return 404 |
| SSL | **PARTIAL** | HTTPS works; expiry/auto-renewal not verified |
| Monitoring | **MISSING** | No live monitoring/alerting evidence |
| Backups | **PARTIAL** | Scripts ready; offsite upload not configured |

---

## Section 6 — Performance

| Metric | Status | Evidence |
|--------|--------|----------|
| API response times | **PARTIAL** | Health endpoint ~1.4 s from this environment (high latency path) |
| Dashboard load times | **UNVERIFIED** | Admin UI not reachable |
| Memory usage | **UNVERIFIED** | No `docker stats` access |
| CPU usage | **UNVERIFIED** | No server access |
| Error rate | **UNVERIFIED** | No monitoring dashboard |

**Prior RC1 data:** 335 requests, 0 HTTP 5xx, p95 = 4,223 ms (passed RC1 threshold < 8,000 ms but not the launch target < 2,000 ms).

**Launch performance target:** p95 < 2,000 ms and zero 5xx errors. Not currently demonstrable from this environment.

---

## Section 7 — Launch Decision

### PASS / FAIL

**FAIL** for public / closed-beta launch.

### P0 Blockers (must fix before any launch)

1. **Restore SSH/admin access to `142.93.99.142`** — required for deployment, incident response, and live verification.
2. **Fix admin UI HTTP 404** — `/admin` routes on `www.yalataxi.live` and `yalataxi.live` return 404; frontend build or nginx configuration must be redeployed.

### P1 Issues (must fix before scaling)

3. Configure offsite backups (`BACKUP_OFFSITE_REMOTE`).
4. Add Docker CPU/memory resource limits.
5. Deploy monitoring/alerting (uptime, 5xx, latency, disk, memory, SSL expiry, Celery queue depth).
6. Configure host-level log rotation.
7. Verify SSL certificate auto-renewal (`certbot renew --dry-run`).

### P2 Issues (should fix before general availability)

8. Add database connection pooling (PgBouncer) or tune `max_connections`.
9. Run physical device QA for rider/driver/delivery journeys.
10. Conduct WebSocket load/stability test.

### Risk Score

**62 / 100**

- Codebase readiness: 85 / 100
- Production environment readiness: 40 / 100
- Operational readiness (monitoring, backups, incident response): 50 / 100

### Launch Recommendation

**NO-GO.**

Do not launch the closed beta until:
1. SSH/admin access is restored.
2. The admin UI 404 is resolved and authenticated admin flows are verified on production.
3. Offsite backups and basic monitoring/alerting are in place.

Once the P0 and P1 items above are closed, a conservative pilot can be reconsidered:
- Drivers: 25
- Couriers: 15
- Riders: 100

Scaling beyond this requires resolution of P2 issues and a successful load test meeting p95 < 2,000 ms with zero 5xx errors.

---

## Local Test Evidence

```bash
cd backend/taxi
python manage.py test operations tests.operations.test_business_operations authapp notifications payments security -v 1
```

**Result:** 60 of 62 tests pass; 2 failures are import errors for `hypothesis` (not installed locally), unrelated to launch blockers.

**Migration audit:** `python manage.py makemigrations --check --dry-run` → `No changes detected`.

---

## Files Referenced

- `release/MIGRATION_AUDIT_SPRINT1.md`
- `release/INFRASTRUCTURE_CERTIFICATION_REPORT.md`
- `release/SPRINT1_LAUNCH_READINESS_REPORT.md`
- `docker-compose.yml`
- `nginx_clean.conf`
- `scripts/backup-encrypted.sh`
- `scripts/setup-backup-cron.sh`

---

## Final Note

No new features were built. This report focuses exclusively on launch readiness and identifies the production-access blocker that prevents final certification.
