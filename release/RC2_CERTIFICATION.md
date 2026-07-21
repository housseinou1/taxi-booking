# RC2 Certification Report — v1.0.0-rc2

**Date:** 2026-07-21  
**Release candidate:** v1.0.0-rc2  
**Git tag:** `v1.0.0-rc2` @ `33d60c29`  
**Pilot city:** Nouakchott  
**API:** https://api.yalataxi.live  

---

## Overall Result

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** |
| **Launch score** | **74 / 100** |
| **Go / No-Go (Nouakchott soft launch)** | **NO-GO** |
| **Soft-launch readiness** | **CONDITIONAL** — infra ready; P0 manual gates open |
| **Estimated production capacity** | **335 concurrent API @ 0% HTTP 5xx** (p95 ≈ 1.5–3.9 s) |

---

## P0 Blocker Resolution

### 1. Physical Android QA — FAIL

| App | Version | Device test | Status |
|-----|---------|-------------|--------|
| Yala Rider | 1.2.7 (19) | Not executed on hardware | **OPEN** |
| Yala Driver | 1.2.23 (38) | Not executed on hardware | **OPEN** |
| Yala Delivery | 1.0.4 (6) | Not executed on hardware | **OPEN** |

Checklist template: `release/RC2_MOBILE_DEVICE_CERTIFICATION.md`  
Prior RC1 device evidence (2026-07-07) is **stale** — builds and fixes since deployed.

**Required flows (unverified on device):** Login, registration, ride/delivery lifecycle, wallet, withdrawal, push, GPS, offline recovery, app restart.

### 2. Google Play Certification — PARTIAL PASS

| Check | Result |
|-------|--------|
| Privacy policy URL | **PASS** — https://www.yalataxi.live/privacy HTTP 200 |
| Terms URL | **PASS** — https://www.yalataxi.live/terms HTTP 200 |
| Target SDK 35 | **PASS** |
| Signing config (Rider/Driver/Delivery) | **PASS** |
| Production AAB artifacts | **PASS** (on-server `release/android/`) |
| Data Safety form | **FAIL** — manual Play Console |
| Account deletion attestation | **FAIL** — manual |
| Internal testing track | **FAIL** — manual upload |
| Closed testing track | **FAIL** — manual promote |

Automated: **18/18 PASS** · Manual remaining: **4**

Script: `scripts/verify-play-store-rc2.py`

### 3. Offsite Backups — FAIL

| Requirement | Status |
|-------------|--------|
| Encrypted nightly backups (PG + Redis + media) | **PASS** |
| Restore verification (decrypt drill) | **PASS** 2026-07-21 |
| Retention policy (30/12/12) | **PASS** |
| Alert on backup failure | **PASS** — `backup-monitor.sh` cron |
| **Off-server upload** | **FAIL** — rclone installed; `BACKUP_OFFSITE_REMOTE` not configured |

```
Backup monitor: OK last_success=2026-07-21T15:10:20+00:00
DR drill: PASS (~982 KB SQL)
rclone: installed; no remote configured
```

Setup script ready: `scripts/setup-offsite-backup.sh`

### 4. Apple App Store — FAIL

| Item | Status |
|------|--------|
| Metadata | Not submitted |
| Screenshots | Not submitted |
| Privacy nutrition labels | Not submitted |
| Account deletion | Not attested |
| Support URL | https://www.yalataxi.live (live) |

---

## P1 Blocker Resolution

| Control | Result | Evidence |
|---------|--------|----------|
| Admin 2FA infrastructure | **PASS** | `/auth/2fa/status/` HTTP 200 |
| Admin 2FA enrollment | **PARTIAL** | API exists; staff enrollment not fully verified |
| OTP (withdrawal) | **PASS** | Withdrawal API reachable; prior E2E certification |
| Device binding | **PASS** | `/auth/devices/` HTTP 200 (1 device session) |
| Recovery drill | **PASS** | `backup-restore-drill.sh` exit 0 |

Script: `scripts/rc2-security-verify.py`

---

## Performance

**Target:** 0 HTTP 5xx, p95 < 2000 ms at 335 concurrent mixed requests.

| Run | 5xx | p95 ms | p50 ms | Result |
|-----|-----|--------|--------|--------|
| RC2 (2026-07-21) | **0** | **3865** | 938 | **FAIL** p95 |
| Phase 16 best | 0 | 1477 | 962 | PASS p95 |

```json
{
  "total_requests": 335,
  "errors_5xx": 0,
  "p95_ms": 3865.2,
  "pass": true
}
```

**Note:** Zero 5xx target **met**. p95 target **not met** under mixed load (health + ops endpoints). Health-only subset historically meets < 2 s.

---

## Automated Certification Summary

| Suite | Result |
|-------|--------|
| Platform health (`launch-certification-prod.py`) | **PASS** (with LOAD_AUTH_TOKEN) |
| Load test (`launch-load-test-phase16.py`) | **PASS** 0×5xx · **FAIL** p95 |
| Operations drill | **PASS** |
| Backup monitor | **PASS** |
| DR drill | **PASS** |
| Mobile API smoke | **FAIL** — QA test accounts not on prod |
| Security verify | **PARTIAL** — rate-limit interference on refresh probe |

Orchestrator: `scripts/rc2-certification.py`

---

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No physical device QA on current builds | **Critical** | Run `RC2_MOBILE_DEVICE_CERTIFICATION.md` before invites |
| Offsite backups not configured | **High** | Configure DO Spaces + `setup-offsite-backup.sh` |
| p95 latency 1.5–3.9 s under peak | **Medium** | Monitor Launch Hub; scale if UX degrades |
| Play/App Store manual attestation pending | **High** | Complete console forms before public beta |
| Pilot cohort not recruited (2/100 drivers) | **High** | Phase 19 onboarding program |

---

## Soft-Launch Readiness

| Layer | Ready |
|-------|-------|
| API infrastructure (3× ASGI, Celery, nginx) | **YES** |
| Encrypted on-server backups + drill | **YES** |
| Launch Hub / CEO dashboards / daily reports | **YES** |
| Pilot user recruitment (100/50/1000) | **NO** |
| Store certification | **NO** |
| Device QA on RC2 builds | **NO** |

**Conditional GO:** Internal alpha with ≤10 drivers and ≤50 riders after device smoke test.  
**Full soft launch GO:** Blocked until all P0 items closed.

---

## Go / No-Go Decision

| Audience | Decision |
|----------|----------|
| **Nouakchott soft launch (GO target)** | **NO-GO** |
| **Controlled internal alpha** | **CONDITIONAL GO** |
| **Public store release** | **NO-GO** |

---

## Deployment Evidence

| Artifact | Value |
|----------|-------|
| Commits | `e0f1e68e` → `33d60c29` (RC2 scripts + Phase 19 ops) |
| Tag | `v1.0.0-rc2` |
| Load test | 335 req, 0×5xx |
| Backup + DR | PASS |
| Privacy/terms | HTTP 200 |
| Soft launch config | `configure_soft_launch` applied (Nouakchott caps) |

**Launch score: 74 / 100**
