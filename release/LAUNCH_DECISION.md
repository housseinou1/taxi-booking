# Yala v1.0.0 — Commercial Launch Decision

**Document ID:** LAUNCH-DECISION-001  
**Date:** 2026-07-21  
**Version:** v1.0.0 (release candidate)  
**Feature freeze:** Active — no new product features  
**Authority:** CEO (H. Sakho) · Engineering · Operations · Finance · QA  

---

## Executive summary

Yala v1.0.0 is **functionally complete** across Rider, Driver, Delivery, Wallet, and the full operations platform (Phases 1–28, RC2 certification, RC3 stabilization). The product is ready for **supervised limited launch** in Nouakchott under closed-beta caps.

**Public commercial launch is not approved** until two P0 blockers are closed and mandatory GO criteria in `PUBLIC_LAUNCH_GO_CHECKLIST.md` are met.

| Decision | Verdict |
|----------|---------|
| **GO Public Launch** | **NO-GO** |
| **GO Limited Launch** (closed beta, Nouakchott) | **GO** — with conditions |
| **NO-GO** (all launch activity) | **NO** — product is launch-ready for limited rollout |

---

## Launch Score

**Score: 78 / 100** (target 90+ for public launch)

| Category | Weight | Score | Max | Notes |
|----------|:------:|:-----:|:---:|-------|
| Product completeness | 20 | 20 | 20 | Rider, Driver, Delivery, Wallet, Admin ops stack complete |
| Backend & API quality | 15 | 13 | 15 | RC3 perf fixes in source; not deployed/re-measured |
| Mobile apps | 15 | 10 | 15 | AAB configs ready; physical QA unsigned; RC3 fixes need rebuild |
| Infrastructure | 15 | 11 | 15 | Docker/nginx/SSL/Redis/Celery configured; offsite backup FAIL |
| Security & compliance | 10 | 8 | 10 | JWT, OTP, 2FA, audit; Play manual attestation open |
| Operations readiness | 10 | 9 | 10 | Runbooks, CEO reports, onboarding forms exist |
| Store readiness | 10 | 4 | 10 | Privacy/terms live; Play/Apple manual steps incomplete |
| Beta validation | 5 | 3 | 5 | API certification PASS; cohort under-recruited |
| **Total** | **100** | **78** | **100** | |

### Score change from RC2

| Delta | Reason |
|-------|--------|
| +2 | RC3 stabilization (query optimization, caching, indexes) |
| +2 | Phases 24–28 ops platform complete (finance, multi-city, smart engine) |
| − | P0 blockers unchanged; p95 not re-benchmarked post-RC3 |

---

## Risk Score

**Risk Score: 68 / 100** (lower is better · target < 30 for public launch)

| Risk area | Score (0–10, higher = worse) | Status |
|-----------|:----------------------------:|--------|
| Data loss / DR | **9** | Offsite backup not configured (P0) |
| Mobile quality unknown | **8** | Physical device QA unsigned (P0) |
| Performance under load | **7** | p95 4086 ms recorded; RC3 fix unverified |
| Store / compliance | **6** | Play Data Safety + account deletion pending |
| Pilot scale | **6** | 2 drivers / ~5 riders vs beta minimums |
| Infrastructure observability | **5** | No Flower/queue monitoring; SSH audit partial |
| Security surface | **4** | Strong controls; Play Integrity off |
| Payment / finance | **3** | Reconciliation tooling ready; low transaction volume |
| API reliability | **3** | 0× 5xx under load test; health endpoints OK |
| Operations coverage | **4** | Runbooks exist; support SLA unproven at scale |

---

## Section 1 — Release Audit

### Backend ✅ PASS (code) · ⚠️ DEPLOY PENDING

| Component | Status | Evidence |
|-----------|:------:|----------|
| Django REST API | ✅ | All modules tested; RC2 API certification PASS |
| WebSocket (Daphne/Channels) | ✅ | JWT auth middleware; Redis channel layer |
| Celery + Beat | ✅ | 2 workers, django_celery_beat scheduler |
| Migrations | ⚠️ | RC3 indexes (`payments 0020`, `drivers 0023`, `operations 0010`) pending prod deploy |
| Health endpoints | ✅ | `/api/health/live/`, `/api/health/ready/`, `/api/health/status/` |
| Feature freeze | ✅ | No new product features in v1.0.0 scope |

### Frontend / Admin portal ✅ PASS (code)

| Surface | Route | Status |
|---------|-------|:------:|
| Admin dashboard | `/admin` | ✅ Built |
| Executive Dashboard | `/admin/executive` | ✅ |
| Operations Center | `/admin/operations` | ✅ |
| AI Operations | `/admin/ai-operations` | ✅ |
| Business Operations Hub | `/admin/business` | ✅ |
| Fleet Performance | `/admin/fleet` | ✅ |
| Finance Operations | `/admin/finance-ops` | ✅ |
| Launch Command Center | `/admin/operations-command` | ✅ |
| Growth Dashboard | `/admin/growth` | ✅ |
| Multi-City Platform | `/admin/multi-city` | ✅ |
| Smart Pricing & Dispatch | `/admin/smart-pricing` | ✅ |
| Production Status | `/admin/status` | ✅ |

**Production note:** RC2 reported admin UI HTTP 404 on prod before deploy; verify after frontend build deploy to nginx.

### Mobile apps ⚠️ PARTIAL

| App | Package | versionCode | versionName | Status |
|-----|---------|:-----------:|:-------------:|:------:|
| Rider | `com.yala.rider.mr` | 19 | 1.2.7 | ⚠️ QA unsigned |
| Driver | `com.yala.driver.mr` | 38 | 1.2.23 | ⚠️ QA unsigned |
| Delivery | `com.yala.delivery.mr` | 6 | 1.0.4 | ⚠️ QA unsigned |

Signing: release keystores configured in `build.gradle`. RC3 mobile fixes in source require fresh AAB build.

### Database ✅ PASS (design) · ⚠️ MIGRATE ON DEPLOY

| Check | Status |
|-------|:------:|
| PostgreSQL 15 | ✅ |
| Connection pooling (`conn_max_age=600`) | ✅ |
| PgBouncer | ❌ Not configured (P2) |
| RC3 performance indexes | ⚠️ Pending migrate |
| Restore drill (local encrypted) | ✅ PASS (0.395 s) |

### Docker ✅ PASS

| Service | Healthcheck | Restart |
|---------|:-----------:|:-------:|
| django (+ 2 replicas) | ✅ HTTP readiness (RC3) | always |
| postgres | ✅ pg_isready | always |
| redis | ✅ redis-cli ping | always |
| celery-worker (×2) | ✅ inspect ping (RC3) | always |
| celery-beat | — | always |
| nginx | depends_on django healthy | always |

### nginx & SSL ✅ PASS (config)

| Check | Status | Evidence |
|-------|:------:|----------|
| SSL termination (443) | ✅ | `nginx/nginx.conf` · Let's Encrypt |
| WebSocket upgrade `/ws/` | ✅ | Infra certification |
| Static/media proxy | ✅ | docker-compose volumes |
| Rate limiting | ✅ | nginx + Django layers |
| Cert renewal | ⚠️ | Auto-renew assumed; verify on server |

### Redis ✅ PASS

| Use | Status |
|-----|:------:|
| Cache / rate limits | ✅ |
| Celery broker + results | ✅ |
| Channels (WebSocket) | ✅ |
| AOF persistence | ✅ |
| DB index separation | ⚠️ Shared DB 0 in prod (P2) |

### Celery ✅ PASS (config) · ⚠️ MONITORING

| Check | Status |
|-------|:------:|
| 2 workers × concurrency 4 | ✅ |
| Beat schedule (referrals, docs, delivery) | ✅ |
| Queue depth monitoring | ❌ No Flower (P2) |
| Readiness exposes worker count | ✅ RC3 |

---

## Section 2 — Launch Checklist

Reference: `release/sprint1/PUBLIC_LAUNCH_GO_CHECKLIST.md` (31 mandatory criteria)

| Area | Status | Detail |
|------|:------:|--------|
| Production healthy | ⚠️ | API health PASS (RC2); full re-check after RC3 deploy |
| Unresolved P0 issues | ❌ | **2 open** — see blockers below |
| P1 issues documented | ✅ | `UAT_KNOWN_ISSUES_REGISTER.md` · `LAUNCH_BLOCKER_TRACKER.md` |
| Offsite backups verified | ❌ | Local PASS · offsite upload **FAIL** |
| Monitoring active | ⚠️ | Health API + cron scripts; no external APM |
| Alerting active | ⚠️ | `backup-monitor.sh` · Launch Hub alerts; no PagerDuty |

**Mandatory GO pass rate:** 0 / 31 (public launch requires 31/31)

---

## Section 3 — Store Readiness

### Google Play

| Item | Status | Notes |
|------|:------:|-------|
| Production AAB signed | ⚠️ | Gradle configs ready; rebuild after RC3 |
| Version codes | ✅ | Rider 19 · Driver 38 · Delivery 6 |
| Privacy Policy URL | ✅ | https://www.yalataxi.live/privacy |
| Terms URL | ✅ | https://www.yalataxi.live/terms |
| Data Safety form | ❌ | Manual Play Console — P1 |
| Account deletion | ❌ | In-app flow exists; Play attestation pending |
| Screenshots | ⚠️ | Listing copy in `release/play-store/`; assets TBD |
| Release notes | ✅ | `RELEASE_NOTES_v1.0.0.md` |
| Closed testing track | ❌ | Not promoted — P1 |
| Automated checks | ✅ | 18/18 PASS (`verify-play-store-rc2.py`) |

### Apple App Store

| Item | Status |
|------|:------:|
| App metadata | ❌ Not submitted |
| Screenshots | ❌ |
| Privacy nutrition labels | ❌ |
| Review information | ❌ |
| Account deletion | ❌ |

**Mitigation:** Android-only limited launch for v1.0.0.

---

## Section 4 — Operations Readiness

| Capability | Status | Reference |
|------------|:------:|-----------|
| Driver onboarding | ✅ | `DRIVER_ONBOARDING_FORM.md` · admin approval workflow |
| Courier onboarding | ✅ | `COURIER_ONBOARDING_FORM.md` |
| Rider onboarding | ✅ | In-app registration + phone verify |
| Customer support | ✅ | Support Center · Beta Feedback · SLA runbook |
| Finance reconciliation | ✅ | Finance Operations Center · daily reconciliation |
| Incident response | ✅ | Launch Hub · OpsIncident · `INCIDENT_LOG.md` |
| CEO daily reports | ✅ | `CEO_DAILY_REPORT.md` · `/admin/command` · `/admin/growth` |
| Closed beta runbook | ✅ | `CLOSED_BETA_RUNBOOK.md` |
| Morning system check | ✅ | `MORNING_SYSTEM_CHECK.md` |

---

## Remaining Blockers

### P0 — Must close before public launch

| ID | Blocker | Owner | Exit criteria |
|----|---------|-------|---------------|
| BLK-P0-001 | Physical Android device QA not signed off | QA Lead | Signed `PHYSICAL_QA_STATUS_TRACKER.md` · zero P0 device bugs |
| BLK-P0-002 | Offsite encrypted backups not configured | DevOps | `offsite-backup-certification.sh` → PASS |

### P1 — Documented · acceptable for limited launch with monitoring

| ID | Blocker | Owner |
|----|---------|-------|
| BLK-P1-001 | p95 API latency > 2000 ms (4086 ms recorded) | Eng Lead |
| BLK-P1-002 | Play Console manual attestation incomplete | Product / CEO |
| BLK-P1-003 | Apple App Store not submitted | Product / CEO |
| BLK-P1-004 | Pilot cohort under-recruited | Ops Manager |
| BLK-P1-005 | Delivery E2E not production-certified | QA Lead |
| BLK-P1-006 | RC3 backend + mobile fixes not deployed | Eng Lead |

---

## Recommendation

### GO Public Launch — **NO-GO**

Public launch fails mandatory criteria:
- 2 open P0 blockers
- 0/31 public GO checklist items verified
- Launch score 78 < 90 target
- Risk score 68 > 30 target
- Store manual attestation incomplete
- Beta validation insufficient (cohort, 14-day metrics)

### GO Limited Launch — **GO** (conditional)

Approve **Nouakchott closed beta** under existing caps:

| Cohort | Cap |
|--------|-----|
| Drivers | 20 |
| Couriers | 10 |
| Riders | 100 |

**Conditions before first beta ride:**
1. Deploy RC3 backend + run migrations
2. Build and distribute Rider 1.2.7+ / Driver 1.2.23+ AABs with RC3 bundles
3. Execute physical device QA for P0 flows (cancel, online, ride complete)
4. Confirm prod health via `/api/health/ready/`
5. CEO daily monitoring via Launch Command Center

**Conditions before expanding beyond caps:**
- Close P0-002 (offsite backups)
- Re-measure p95 after RC3 deploy
- 14+ beta operating days per exit criteria

### NO-GO (all activity) — **Not recommended**

Product and ops stack are sufficiently mature for supervised limited launch. A full NO-GO would delay validated learning without reducing technical risk.

---

## Pre-launch action list (ordered)

| # | Action | Owner | Blocks |
|---|--------|-------|--------|
| 1 | Deploy RC3 backend to production | Eng | Limited launch |
| 2 | `migrate payments 0020` · `drivers 0023` · `operations 0010` | Eng | Limited launch |
| 3 | Rebuild Rider/Driver/Delivery AABs | Eng | Device QA |
| 4 | Physical device QA sign-off | QA | Public launch |
| 5 | Configure DO Spaces offsite backup | DevOps | Public launch |
| 6 | Run `launch-perf-smoke.py` post-deploy | Eng | Public launch |
| 7 | Complete Play Data Safety + account deletion | Product | Public launch |
| 8 | Recruit pilot cohort toward caps | Ops | Scale |
| 9 | 14-day beta metrics review | CEO | Public launch |
| 10 | Tag `v1.0.0` after limited launch validation | Eng | Release |

---

## Version tag preparation

```bash
# After limited launch validation (recommended)
git tag -a v1.0.0 -m "Yala v1.0.0 — Nouakchott commercial limited launch"
git push origin v1.0.0
```

**Tag now (pre-launch):** Not recommended — tag after first successful limited-launch week.

---

## Sign-off

| Role | Name | Decision | Date |
|------|------|----------|------|
| CEO | H. Sakho | ☐ GO Limited · ☐ NO-GO | |
| Engineering Lead | | ☐ | |
| Operations Manager | | ☐ | |
| Finance | | ☐ | |
| QA Lead | | ☐ | |

---

## References

| Document | Purpose |
|----------|---------|
| `RELEASE_NOTES_v1.0.0.md` | User-facing release notes |
| `CHANGELOG_v1.0.0.md` | Technical changelog |
| `KNOWN_ISSUES_v1.0.0.md` | Known issues register |
| `RC3_STABILIZATION_REPORT.md` | RC3 fixes and verdict |
| `PUBLIC_LAUNCH_GO_CHECKLIST.md` | 31 mandatory public launch criteria |
| `UAT_KNOWN_ISSUES_REGISTER.md` | Full issue register |

---

*v1.0.0 Commercial Launch Preparation · Feature freeze active*
