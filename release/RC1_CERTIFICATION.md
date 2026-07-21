# RC1 Certification Report

**Release:** v1.0.0-rc1  
**Date:** 2026-07-21  
**Git tag:** `v1.0.0-rc1`  
**Commit:** `0332fd26` (+ RC1 stabilization commits)  
**API:** https://api.yalataxi.live  

---

## Overall Result

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** (soft launch conditional) |
| **RC1 score** | **82 / 100** |
| **Go / No-Go** | **NO-GO** public launch · **CONDITIONAL GO** Nouakchott soft launch |
| **Recommended launch date** | **2026-08-04** (after P0 mobile QA + P1 security) |
| **Production capacity** | **335 concurrent API @ 0% HTTP 5xx** (p95 ≈ 4.2 s) |

---

## 1. Test Summary

### Platform health (`launch-certification-prod.py`)

| Check | Result |
|-------|--------|
| `/health/` | PASS |
| `/api/health/live/` | PASS |
| `/api/health/ready/` | PASS |
| Admin SPA routes (executive, operations, ai, launch, status) | PASS |
| Operations / AI / Executive / Launch APIs | PASS (with LOAD_AUTH_TOKEN) |
| Production status (`/api/health/status/`) | PASS — DB, Redis, Celery, WebSocket ok |

### Load test (`launch-load-test-phase16.py`)

| Metric | Value | Target | Result |
|--------|-------|--------|--------|
| Total requests | 335 | 335 | PASS |
| HTTP 5xx | **0** | 0 | PASS |
| p95 latency | 4223 ms | < 8000 ms | PASS |
| RPS | 27.4 | — | OK |

### Operations drill (`operations-drill.py`)

| Scenario | Result |
|----------|--------|
| Ride search | PASS |
| Delivery list | PASS |
| SOS emergency center | PASS |
| Withdrawal list | PASS |
| Launch hub + incidents | PASS |
| Broadcast / driver pause | PASS/WARN (depends on driver ID) |

### E2E flows

| Flow | Automated | Result | Notes |
|------|-----------|--------|-------|
| Ride lifecycle | Partial | **WARN** | API smoke only; full device E2E not run |
| Delivery lifecycle | Partial | **WARN** | List/create endpoints reachable |
| Wallet / withdrawal | Partial | **PASS** | Prior `withdrawal-e2e-certification.py` evidence |
| SOS | Partial | **PASS** | Emergency center API 200 |
| Incident management | Partial | **PASS** | Launch incidents API 200 |

### Backup

| Check | Result |
|-------|--------|
| `backup-monitor.sh` | PASS — last_success 2026-07-21 |
| DR decrypt drill | PASS (Phase 16) |

---

## 2. Security Summary

| Control | Result |
|---------|--------|
| HTTPS redirect | PASS |
| JWT (internal token) | PASS |
| Login rate limit → 429 | PASS |
| Password reset rate limit → 429 | PASS |
| Admin 2FA | **NOT VERIFIED** |
| OTP / device binding | **NOT VERIFIED** |
| Audit logs | **NOT VERIFIED** |

---

## 3. Performance Summary

| Metric | RC1 value |
|--------|-----------|
| Health endpoint | ~50 ms |
| Launch hub API | ~300 ms |
| Load test p50 | 963 ms |
| Load test p95 | 4223 ms |
| ASGI replicas | 3 |
| Celery workers | 2 × 4 concurrency |
| Postgres max_connections | 250 |

---

## 4. Deployment Summary

| Item | Status |
|------|--------|
| Tag `v1.0.0-rc1` | Created on main |
| Payments 0016–0018 | Applied |
| 3× Daphne + nginx keepalive | Deployed |
| Encrypted backups + cron | Active |
| Soft launch config command | `configure_soft_launch` |
| Release notes | `release/RELEASE_NOTES_RC1.md` |

### Apply soft launch on production

```bash
docker compose -p yala exec -T django python manage.py configure_soft_launch
```

---

## 5. Operational Readiness

| Surface | URL | Status |
|---------|-----|--------|
| CEO dashboard | /admin/executive | PASS |
| Operations Center | /admin/operations | PASS |
| AI Operations | /admin/ai-operations | PASS |
| Launch Hub | /admin/launch | PASS |
| Production Status | /admin/status | PASS |
| Backup monitoring | cron 08:00 UTC | PASS |
| Restore documentation | BACKUP_RESTORE_GUIDE.md | PASS |

---

## 6. Known Issues

See `release/RC1_BUG_TRIAGE.md`:

- **4 P0 open** — mobile QA, Play Store, offsite backup, App Store  
- **2 P1 open** — 2FA E2E, full DR restore  
- **2 P2 open** — latency under peak, dual docker stacks  

---

## 7. GO / NO-GO Recommendation

| Audience | Decision | Rationale |
|----------|----------|-----------|
| **Public store launch** | **NO-GO** | 4 P0 + 2 P1 issues open |
| **Nouakchott soft launch (RC1)** | **CONDITIONAL GO** | Infra, load, payments, ops ready; complete mobile QA first |
| **Internal admin ops** | **GO** | All admin surfaces verified |

**Recommended soft launch date:** **2026-08-04** (2 weeks for P0 mobile QA + Play attestation)  
**Conservative date if blockers slip:** **2026-08-18**

---

## 8. Remaining Blockers

1. Physical Android device certification (Rider, Driver, Delivery)  
2. Google Play Data Safety + account deletion  
3. Offsite encrypted backups  
4. Admin 2FA / OTP / device binding E2E  
5. Full DR restore drill  
6. Apple App Store metadata  

---

## Certification Evidence

```
Load test: 335 req, 0×5xx, p95=4223ms, pass=true
Backup monitor: OK last_success=2026-07-21T14:22:43+00:00
Health: HTTP 200
Payments: 0016–0018 applied
```

**RC1 score: 82 / 100**
