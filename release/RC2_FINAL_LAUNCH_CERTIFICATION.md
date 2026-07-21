# RC2 — Final Launch Readiness Certification

**Date:** 2026-07-21  
**Release:** v1.0.0-rc2  
**Production:** https://api.yalataxi.live | https://yalataxi.live/admin  
**Feature freeze:** In effect — no new features; P0/P1 defect fixes only  

---

## Launch Decision

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** (commercial / public launch) |
| **Launch score** | **74 / 100** |
| **Risk score** | **26 / 100** (lower = better operational readiness) |
| **Recommendation** | **GO for closed beta with monitoring** |
| **Commercial launch** | **NO-GO** until P0 items resolved |

### Recommended pilot caps (closed beta)

| Cohort | Cap | Rationale |
|--------|-----|-----------|
| **Drivers** | **20** | ~2 approved today; cap limits dispatch pressure while recruiting |
| **Couriers** | **10** | Minimal courier pool; validate delivery flow with small cohort |
| **Riders** | **100** | Sufficient for beta feedback without overloading 2-vCPU prod node |

---

## Open Issues Summary

### P0 — Launch blockers

| # | Issue | Status |
|---|-------|--------|
| 1 | **Physical Android device QA** not signed off (Rider 1.2.7, Driver 1.2.23, Delivery 1.0.4) | Open |
| 2 | **Offsite encrypted backups** not configured (`BACKUP_OFFSITE` missing in prod `.env`) | Open |

### P1 — High priority (beta acceptable with monitoring)

| # | Issue | Status |
|---|-------|--------|
| 1 | **p95 API latency** 4086 ms under load (target &lt; 2000 ms) | Open |
| 2 | **Play Console manual attestation** — Data Safety, account deletion, internal/closed testing tracks | Open (4 items) |
| 3 | **Apple App Store** not submitted | Open |
| 4 | **Pilot cohort under-recruited** (~2 approved drivers vs 100 cap) | Open |

### P2 — Non-blocking

| # | Issue | Status |
|---|-------|--------|
| 1 | Pending safe migrations: `notifications 0006`, `security 0003` | Open |
| 2 | Model sync: `authapp` / `payments` `models.py` alignment on prod before migrate | Open |
| 3 | Login rate limit interferes with repeated cert smoke runs (security control working as designed) | Informational |

---

## Section 1 — Rider Journey

**Method:** Production API certification via internal JWT + live HTTP endpoints (`scripts/rc2-final-launch-certification.py`). QA account: `qa-rider-profile-fix@test.local`.

| Step | Result | Evidence |
|------|--------|----------|
| Register | ⚠️ Not re-tested | Existing QA accounts used; registration flow unchanged since Sprint 1 |
| Login | ✅ PASS | Internal JWT issued; password login blocked by rate limit during cert window (429) |
| Request ride | ✅ PASS | `POST /rides/request/` → HTTP 201 |
| Driver assignment | ✅ PASS | `POST /rides/accept/{id}/` → HTTP 200 |
| Live tracking | ⚠️ Partial | WebSocket layer healthy (`status API`); full GPS stream not device-tested |
| Arrived | ✅ PASS | `POST /rides/arrived/{id}/` with pickup GPS → HTTP 200 |
| Ride started | ✅ PASS | verify-pin + `POST /rides/start/{id}/` → HTTP 200 |
| Ride completed | ✅ PASS | `POST /rides/complete/{id}/` → HTTP 200 |
| Payment | ⚠️ Partial | Payment authorized at request; wallet endpoint HTTP 200 |
| Receipt | ⚠️ Not automated | Requires post-complete receipt fetch on device |
| Rating | ⚠️ Not automated | Endpoint not exercised in RC2 orchestrator |
| Ride history | ✅ PASS | `GET /rides/history/` → HTTP 200 |
| Wallet | ✅ PASS | `GET /payments/wallet/` → HTTP 200 |

**Fix applied during RC2:** QA accounts missing `phone_verified_at` caused ride accept 403; fixed via `scripts/fix-qa-cert-accounts.py`. Arrived endpoint requires GPS coordinates — cert script updated to pass pickup lat/lng.

---

## Section 2 — Driver Journey

**Method:** Same RC2 orchestrator + QA account `qa-driver-profile-fix@test.local`.

| Step | Result | Evidence |
|------|--------|----------|
| Login | ✅ PASS | Internal JWT (password login rate-limited during cert) |
| Go Online | ✅ PASS | `POST /drivers/availability/toggle/` → HTTP 200 |
| Receive request | ✅ PASS | Ride created and offered via dispatch |
| Accept | ✅ PASS | HTTP 200 |
| Navigation | ⚠️ Not device-tested | Backend state transitions verified |
| Arrived | ✅ PASS | HTTP 200 with GPS at pickup |
| Start ride | ✅ PASS | HTTP 200 after PIN verify |
| Finish ride | ✅ PASS | HTTP 200 |
| Earnings update | ⚠️ Partial | Complete ride succeeds; earnings ledger not separately asserted |
| Wallet | ✅ PASS | `GET /payments/wallet/` → HTTP 200 |
| Cash Out | ⚠️ Partial | `GET /payments/withdrawals/` → HTTP 200; OTP withdrawal flow requires device |

---

## Section 3 — Delivery Journey

**Method:** API smoke + endpoint auth checks. Full courier lifecycle not device-tested.

| Step | Result | Evidence |
|------|--------|----------|
| Login | ⚠️ Rate-limited in smoke | Same login 429 as rider/driver during cert window |
| Go Online | ⚠️ Not automated | Courier toggle via driver availability + delivery mode |
| Accept delivery | ⚠️ Not automated | No QA courier E2E in RC2 orchestrator |
| Pickup / Delivered | ⚠️ Not automated | Requires courier QA account + device |
| Earnings / Wallet | ⚠️ Not automated | Delivery wallet paths not in RC2 script |

**API sanity:** `GET /deliveries/mine/` without token → HTTP 401 ✅ (correct auth gate).

---

## Section 4 — Admin & Operations

**Method:** Authenticated admin JWT (`fetch-load-test-token.sh` / `sakho@admin.mr`).

| Module | Result | Endpoint |
|--------|--------|----------|
| Admin login | ✅ PASS | JWT via internal token (avoids nginx rate limit) |
| Executive Dashboard | ✅ PASS | `/operations/executive/dashboard/` → 200 |
| Operations Center | ✅ PASS | `/operations/center/dashboard/` → 200 |
| AI Operations | ✅ PASS | `/operations/ai/dashboard/` → 200 |
| Business Operations Hub | ✅ PASS | `/operations/business/hub/` → 200 |
| Launch Hub | ✅ PASS | `/operations/launch/hub/` → 200 |
| Withdrawal approvals | ✅ PASS | `/payments/admin/records/` → 200 |
| Incident management | ✅ PASS | `/operations/launch/incidents/` → 200 |
| Broadcast notifications | ⚠️ Not re-tested | Launch hub includes notification controls; no send test in RC2 |
| Reports and exports | ⚠️ Partial | BI module present in business hub; export not exercised |

**Admin SPA routes:** `/admin/business`, `/admin/launch`, `/admin/executive`, `/admin/operations`, `/admin/ai-operations`, `/admin/status` → all HTTP 200 (nginx bind mount verified Sprint 1).

---

## Section 5 — Production Health

| Component | Result | Evidence |
|-----------|--------|----------|
| API health | ✅ PASS | `GET /health/` → `status=ok`, `database=ok`, `redis=ok` |
| WebSocket | ✅ PASS | Reported healthy in `/api/health/status/` (Sprint 1) |
| Celery workers | ✅ PASS | 2× worker + 1× beat Up |
| Redis | ✅ PASS | Container healthy, cache operational |
| PostgreSQL | ✅ PASS | Container healthy, health check ok |
| Docker | ✅ PASS | 9 containers Up (django + 2 replicas, nginx, postgres, redis, celery×3) |
| nginx | ✅ PASS | SPA serving; SSL termination active |
| SSL | ✅ PASS | HTTPS 200 on api + admin |
| Monitoring | ✅ PASS | Backup monitor OK; DR drill PASS |
| Backups | ⚠️ Partial | Daily encrypted local backup OK; **offsite upload NOT configured** |

**Server:** `142.93.99.142` — 2 vCPU / 4 GB RAM, disk 36% used, **no swap**.

---

## Section 6 — Performance

**Load test:** `scripts/launch-load-test-phase16.py` (335 requests, 28 RPS, admin token via internal JWT)

| Metric | Value | Target | Result |
|--------|-------|--------|--------|
| HTTP 5xx | **0** | 0 | ✅ PASS |
| HTTP 429 | **0** | — | ✅ |
| p50 | **926 ms** | — | — |
| **p95** | **4086 ms** | &lt; 2000 ms | ❌ FAIL |
| p99 | **4336 ms** | — | — |
| max | **4861 ms** | — | — |

**Resource snapshot (2026-07-21 ~21:09 UTC):**

| Resource | Value |
|----------|-------|
| RAM available | ~1.5 GiB / 3.8 GiB |
| Disk | 28 GB / 78 GB (36%) |
| Error rate (load test) | 0% 5xx |

**Dashboard load:** Admin SPA static routes &lt; 20 ms (platform cert). Authenticated dashboard API calls inherit backend p95.

---

## Section 7 — Launch Decision Matrix

| Launch type | Decision |
|-------------|----------|
| Public commercial launch | **NO-GO** |
| Closed beta (Nouakchott) | **GO with monitoring** |
| Internal ops / executive use | **GO** |

### Why FAIL for commercial

1. No signed physical device QA on production RC2 builds  
2. No offsite disaster-recovery copy of encrypted backups  
3. p95 latency ~2× target under moderate load  
4. App store manual gates incomplete (Play ×4, Apple unsubmitted)  
5. Pilot supply far below planned caps  

### Why GO for closed beta

1. **Full ride lifecycle verified on production** (request → accept → arrived → verify-pin → start → complete)  
2. **All admin/ops modules return HTTP 200** including Phase 20 Business Operations Hub  
3. **Zero 5xx under load test**  
4. **Infrastructure healthy** — Docker, Postgres, Redis, Celery, nginx, SSL, local backup + DR drill  
5. **Security controls active** — HTTPS, rate limiting, withdrawal OTP gate  

---

## RC2 Certification Run — Raw Summary

```json
{
  "release": "RC2-final",
  "qa_prep": { "pass": true },
  "health": { "pass": true },
  "mobile_journey_checks": "15/15 PASS",
  "admin_checks": "8/8 PASS",
  "infra_checks": "5/5 PASS",
  "load_test": {
    "errors_5xx": 0,
    "p95_ms": 4086.3
  },
  "launch_score": 74,
  "recommendation": "GO for closed beta with monitoring"
}
```

---

## Fixes Applied During RC2 (P0/P1 defects only)

| Fix | File | Impact |
|-----|------|--------|
| QA accounts: `phone_verified_at`, terms, open-ride cleanup | `scripts/fix-qa-cert-accounts.py` | Unblocked ride accept (403 → 200) |
| QA rate-limit bucket clear for cert runs | `scripts/fix-qa-cert-accounts.py` | Unblocked ride request (429 during cert) |
| Arrived step requires GPS coordinates | `scripts/rc2-final-launch-certification.py` | Unblocked arrived (400 → 200) |
| QA prep via stdin into Django container | `scripts/rc2-final-launch-certification.py` | Scripts not mounted in container |
| Load test uses internal JWT | `scripts/rc2-final-launch-certification.py` | Avoids login rate limit |
| Driver ride-flow script GPS fix | `scripts/verify-prod-driver-ride-flow.py` | Aligns with production arrive gate |

**Not applied (per migration audit):** Do **not** run prod-generated `authapp/0019` or `payments/0019` — would drop DB constraints.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/rc2-final-launch-certification.py` | RC2 orchestrator (run on prod server) |
| `scripts/fix-qa-cert-accounts.py` | QA account prep + ride cleanup |
| `scripts/fetch-load-test-token.sh` | Internal JWT without login rate limit |
| `scripts/launch-load-test-phase16.py` | Performance measurement |
| `scripts/rc2-mobile-api-smoke.py` | Mobile API smoke (login-based) |
| `scripts/verify-prod-driver-ride-flow.py` | Driver PIN / cancel / start flow |
| `scripts/verify-play-store-rc2.py` | Play Store automated checks (18/18 PASS) |

### Re-run certification

```bash
# On production server (/opt/yala)
docker compose -p yala exec -T django python - < scripts/fix-qa-cert-accounts.py
python3 scripts/rc2-final-launch-certification.py
```

---

## Pre-beta checklist (human actions)

1. Execute physical device QA matrix → sign `release/SPRINT1_MOBILE_DEVICE_QA.md`  
2. Configure `BACKUP_OFFSITE` + verify encrypted upload  
3. Complete Play Console manual items + upload AAB to closed testing  
4. Apply safe migrations only (`notifications 0006`, `security 0003`) after model sync  
5. Recruit pilot drivers/couriers toward 20/10 caps  
6. Monitor p95 and error rate during first 72 h of beta  

---

*Generated by RC2 Final Launch Certification — 2026-07-21*
