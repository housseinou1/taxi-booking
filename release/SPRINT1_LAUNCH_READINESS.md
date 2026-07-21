# Sprint 1 — Launch Readiness Report

**Date:** 2026-07-21  
**Objective:** Move launch score from 71/100 → 90+/100  
**Production:** https://api.yalataxi.live | https://yalataxi.live/admin  

---

## Overall Result

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** (target 90+ not reached) |
| **Launch score** | **79 / 100** (+8 from Sprint 0 baseline 71) |
| **GO / NO-GO (commercial launch)** | **NO-GO** |
| **GO / NO-GO (controlled beta)** | **CONDITIONAL GO** |

---

## Task 1 — Production Deployment ✅ PASS

### SSH
- Intermittent timeouts from local network; **stable via SSH port 22 with retries**
- Server: `marketplace-s-1vcpu-2gb-fra1` @ `142.93.99.142`

### Deployed artifacts
| Component | Status | Evidence |
|-----------|--------|----------|
| `business_ops_service.py` | ✅ | On prod 2026-07-21 |
| `business_views.py` | ✅ | On prod |
| Migration `0005_phase20_business_ops` | ✅ | Applied (no pending) |
| Frontend build + Business Hub | ✅ | `index.html` 2026-07-21 18:09 UTC |
| nginx SPA mount | ✅ | Fixed via `--force-recreate nginx` |

### Verification

```
GET /operations/business/hub/  (Bearer token)  → HTTP 200
GET https://yalataxi.live/admin/business       → HTTP 200
```

Business hub payload includes: `finance`, `crm`, `marketing`, `incentives`, `partners`, `corporate`, `compliance`, `bi`.

---

## Task 2 — Production Validation ✅ PASS

### API endpoints (authenticated, all HTTP 200)

| Endpoint | Status |
|----------|--------|
| `/operations/business/hub/` | ✅ 200 |
| `/operations/executive/dashboard/` | ✅ 200 |
| `/operations/center/dashboard/` | ✅ 200 |
| `/operations/ai/dashboard/` | ✅ 200 |
| `/operations/launch/hub/` | ✅ 200 |
| `/api/health/status/` | ✅ 200 |

Health check: `database=ok`, `redis=ok`, `celery=2 workers`, `websocket=ok`

### Admin UI routes (all HTTP 200 after nginx recreate)

| Route | Status |
|-------|--------|
| `/admin/business` | ✅ 200 |
| `/admin/launch` | ✅ 200 |
| `/admin/executive` | ✅ 200 |
| `/admin/operations` | ✅ 200 |
| `/admin/ai-operations` | ✅ 200 |
| `/admin/status` | ✅ 200 |

**Root cause fixed:** nginx container had empty `/usr/share/nginx/html` despite host build present. `docker compose -p yala up -d --force-recreate nginx` restored bind mount.

---

## Task 3 — Mobile Certification ❌ FAIL

Physical Android device testing **not executed** in this sprint (requires human tester + hardware).

| App | Version | Device QA | Signed report |
|-----|---------|-----------|---------------|
| Yala Rider | 1.2.7 (19) | ❌ Not run | Template: `release/RC2_MOBILE_DEVICE_CERTIFICATION.md` |
| Yala Driver | 1.2.23 (38) | ❌ Not run | — |
| Yala Delivery | 1.0.4 (6) | ❌ Not run | — |

**Flows unverified on device:** Registration, login, booking, ride/delivery lifecycle, wallet, withdrawal, GPS, push, offline recovery.

**Prior RC1 device evidence (2026-07-07) is stale.**

---

## Task 4 — Google Play ⚠️ PARTIAL PASS

| Check | Status |
|-------|--------|
| Privacy policy URL | ✅ 200 (fixed with nginx) |
| Terms URL | ✅ 200 (fixed with nginx) |
| Target SDK 35 | ✅ |
| Production AAB (Rider/Driver/Delivery) | ✅ |
| Signing config | ✅ |
| Data Safety form | ❌ Manual — Play Console |
| Account deletion attestation | ❌ Manual |
| Internal testing track | ❌ Manual |
| Closed testing track | ❌ Manual |

**Automated:** 18/18 PASS (after nginx fix)  
**Manual remaining:** 4

---

## Task 5 — Apple Store ❌ FAIL

| Item | Status |
|------|--------|
| Metadata | ❌ Not submitted |
| Privacy nutrition labels | ❌ |
| Support URL | ⚠️ https://yalataxi.live/support (verify in App Store Connect) |
| Account deletion | ❌ |
| Screenshots | ❌ |

---

## Task 6 — Infrastructure ⚠️ PARTIAL PASS

| Item | Status | Evidence |
|------|--------|----------|
| Nightly encrypted backups | ✅ | `backup-monitor.sh` OK, last success 2026-07-21T15:10:20Z |
| Restore drill | ✅ | PASS ~982 KB SQL decrypted |
| Alerting on backup failure | ✅ | Cron + monitor script |
| Offsite encrypted upload | ❌ | No `BACKUP_OFFSITE` in `.env` |
| Postgres / Redis / Celery | ✅ | All containers healthy |
| WebSockets | ✅ | health status `websocket=ok` |
| Disk | ✅ | 36% used (28G/78G) |
| Memory | ⚠️ | 3.8G total, no swap |

---

## Task 7 — Performance ⚠️ PARTIAL PASS

Load test (`launch-load-test-phase16.py`, 335 requests):

| Metric | Result | Target | Status |
|--------|--------|--------|--------|
| HTTP 5xx | **0** | 0 | ✅ PASS |
| HTTP 429 | 0 | — | ✅ |
| p50 | 973 ms | — | — |
| **p95** | **3709 ms** | **< 2000 ms** | ❌ FAIL |
| p99 | 3996 ms | — | — |
| RPS | 26.6 | — | — |
| Script pass flag | true | — | ⚠️ (5xx pass only) |

**Action:** Scale replicas, optimize hot paths, or reduce concurrent mix to hit p95 < 2s.

---

## Task 8 — Pilot Readiness ❌ FAIL

| Cohort | Target | Actual | Gap |
|--------|--------|--------|-----|
| Approved drivers | 100 | **2** | 98 |
| Couriers | 50 | **1** | 49 |
| Riders | 1000 | **5** | 995 |

Onboarding tooling ready (`configure_soft_launch`, daily reports cron). **Recruitment not started.**

---

## Security Summary

| Control | Status |
|---------|--------|
| HTTPS / HSTS | ✅ |
| Admin 2FA panel | ✅ (executive security) |
| JWT + token blacklist | ✅ |
| Rate limiting (nginx 429) | ✅ |
| Audit logs API | ✅ |
| Device binding | ✅ |
| Secrets not in repo | ✅ |

---

## Launch Score Breakdown

| Category | Points | Notes |
|----------|--------|-------|
| Base (post Sprint 0) | 71 | Phase 21 baseline |
| + Deployment (Task 1) | +5 | Business hub live |
| + Validation (Task 2) | +3 | All ops APIs + admin UI |
| − Mobile certification | −8 | No physical QA |
| − Play manual gates | −4 | 4 items open |
| − Apple Store | −6 | Not submitted |
| − Offsite backup | −5 | Not configured |
| − Performance p95 | −5 | 3709 ms > 2000 ms |
| − Pilot recruitment | −5 | 2/100 drivers |
| **Final** | **79** | Target 90+ **not met** |

---

## Remaining Blockers (P0)

1. **Physical Android QA** — Rider, Driver, Delivery on RC2 builds
2. **Offsite backup upload** — configure `BACKUP_OFFSITE_REMOTE` + credentials
3. **Play Console manual** — Data Safety, account deletion, closed testing
4. **Apple App Store** — full submission
5. **p95 latency** — reduce from ~3.7s to < 2s under load
6. **Pilot cohort** — recruit toward 100/50/1000 caps

---

## GO / NO-GO Recommendation

| Launch type | Decision |
|-------------|----------|
| **Public commercial launch** | **NO-GO** |
| **Nouakchott controlled beta** | **CONDITIONAL GO** — ops stack ready; recruit pilots + device QA first |
| **Internal executive/ops use** | **GO** — all admin modules functional |

---

## Deployment Evidence (copy-paste)

```bash
# On production server
export TOKEN=$(bash /opt/yala/scripts/fetch-load-test-token.sh)
curl -s -o /dev/null -w "business_hub:%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  https://api.yalataxi.live/operations/business/hub/

curl -s -o /dev/null -w "admin_business:%{http_code}\n" \
  https://yalataxi.live/admin/business
# Expected: business_hub:200 admin_business:200
```

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/deploy-phase21-business-ops.sh` | Deploy Phase 20/21 |
| `scripts/sprint1-launch-readiness.py` | Automated sprint checks |
| `scripts/launch-load-test-phase16.py` | Performance test |
| `scripts/verify-play-store-rc2.py` | Play Store automated checks |

---

## Next sprint priorities (to reach 90+)

1. Execute physical device QA matrix → signed report
2. Configure offsite backups → verify upload
3. Complete Play closed testing + promote AAB
4. Profile and fix p95 (DB queries, replica load, nginx keepalive)
5. Launch pilot driver/courier/rider recruitment campaign
