# YALA Release History

**Document ID:** PM-03  
**Version:** 1.0.0  
**Last updated:** 2026-07-21  
**Synchronized with:** `04_BUG_AND_TECH_DEBT.md` · `06_PROJECT_DASHBOARD.md`

---

## Release timeline

| Release | Codename | Deployment date | Verdict | Launch score |
|---------|----------|:---------------:|---------|:------------:|
| RC1 | Soft Launch Candidate | 2026-07-21 | FAIL (conditional soft launch) | 82 / 100 |
| RC2 | Launch Certification | 2026-07-21 | PASS (API) | ~85 / 100 |
| RC3 | Stabilization | 2026-07-21 | GO Closed Beta · NO-GO Public | 78 / 100 |
| **Closed Beta** | v1.0.0 Limited Launch | 2026-07-21 | **GO** (supervised, Nouakchott) | 78 / 100 |
| **Production** | v1.0.0 Public Launch | *Pending* | **NO-GO** | Target 90+ |

---

## RC1 — Soft Launch Candidate

**Tag:** `v1.0.0-rc1`  
**Deployment date:** 2026-07-21  
**Git commit baseline:** `0332fd26` (+ stabilization commits)  
**API:** https://api.yalataxi.live

### Objectives

- Certify platform health, load capacity, and operations drill readiness
- Establish baseline for Nouakchott soft launch
- Validate admin SPA routes and core operations APIs

### Completed work

| Area | Deliverable |
|------|-------------|
| Health checks | `/health/`, `/api/health/live/`, `/api/health/ready/` PASS |
| Load test | 335 concurrent requests, 0 HTTP 5xx, p95 ≈ 4.2 s |
| Operations drill | Ride search, delivery list, SOS, withdrawals, launch hub PASS |
| Admin routes | Executive, operations, AI, launch, status SPA routes PASS |
| Infrastructure | Docker Compose, nginx, SSL, PostgreSQL, Redis, Celery configured |

### Known issues

| ID | Issue | Severity |
|----|-------|:--------:|
| RC1-01 | p95 latency 4223 ms (target < 8000 ms load test PASS, but > 2000 ms product target) | P1 |
| RC1-02 | Full device E2E not run — API smoke only | P0 |
| RC1-03 | Mobile physical QA unsigned | P0 |
| RC1-04 | Core unit test failures (fixture drift) | P1 |

### Lessons learned

- API certification can PASS while mobile E2E remains unproven — treat them as separate gates
- Load test PASS at 335 concurrent does not guarantee dashboard p95 under real admin polling
- Soft launch should be explicitly scoped (city, cohort caps) when RC1 score < 90

### Verdict

**FAIL** for public launch · **CONDITIONAL GO** for Nouakchott soft launch after P0 mobile QA

**Reference:** `release/RC1_CERTIFICATION.md`

---

## RC2 — Launch Certification

**Tag:** `v1.0.0-rc2`  
**Deployment date:** 2026-07-21  
**Scope:** Phases 1–28 complete · Business Operations · Finance Ops · Multi-City · Smart Pricing

### Objectives

- Certify full operations platform for commercial release candidate
- Complete finance reconciliation and launch command infrastructure
- Pass expanded operations test suite

### Completed work

| Phase / area | Deliverable |
|--------------|-------------|
| Phase 24 | Finance Operations & Reconciliation center |
| Phase 25 | Operations Command Center |
| Phase 26 | Growth & Expansion dashboard |
| Phase 27 | Multi-City Operations platform |
| Phase 28 | Smart Pricing & Dispatch engine |
| Phase 20 | Business Operations Hub (CRM, marketing, corporate, compliance) |
| QA | Operations test suite expanded; RC2 mobile device certification run |
| Security | Rate limiting, audit hardening, withdrawal OTP production flow |

### Known issues

| ID | Issue | Severity |
|----|-------|:--------:|
| RC2-01 | p95 API latency still elevated on dashboard endpoints | P1 |
| RC2-02 | Play Console manual attestation incomplete | P1 |
| RC2-03 | Apple App Store not submitted | P1 |
| RC2-04 | Pilot cohort under-recruited | P1 |

### Lessons learned

- Feature velocity (Phases 20–28) outpaced performance optimization — schedule dedicated stabilization sprint
- Finance and ops dashboards need caching strategy before launch-day admin load
- Store compliance is a parallel workstream, not a release-day task

### Verdict

**PASS** (API & operations certification) · Recommended public launch date deferred to **2026-08-04** pending P0 items

**Reference:** `release/RC2_LAUNCH_CERTIFICATION.md` · `release/RELEASE_NOTES_RC2.md`

---

## RC3 — Stabilization Sprint

**Tag:** `v1.0.0-rc3`  
**Deployment date:** 2026-07-21 (source); **production deploy pending**  
**Scope:** Quality, performance, security, reliability — **feature freeze active**

### Objectives

- Reduce p95 latency on hot admin dashboard paths
- Fix mobile P0/P1 bugs (rider cancel, driver online banner)
- Add database indexes and ops dashboard caching
- Harden audit IP handling and readiness probes
- **No new product features**

### Completed work (in source)

| Category | Fix |
|----------|-----|
| Performance | Surge monitor N+1 removal; AI dashboard stop auto-regenerate on GET |
| Performance | 45 s Redis cache for AI ops, fleet, smart-engine dashboards |
| Performance | Finance/executive chart single-query aggregation |
| Performance | Fleet CEO driver scoring deduplication |
| Performance | RC3 DB indexes (Payment, withdrawals, driver availability, documents) |
| Reliability | HTTP readiness probe; Celery worker healthcheck |
| Security | Audit log respects `YALA_TRUST_X_FORWARDED_FOR` |
| Mobile | Rider cancel cleanup, WS leave, state sync |
| Mobile | Driver green online toast, toggle stuck fix |

### Known issues

| ID | Issue | Severity |
|----|-------|:--------:|
| RC3-01 | **Fixes not deployed to production** | P1 |
| RC3-02 | p95 re-measure pending post-deploy | P1 |
| RC3-03 | APK/AAB rebuild required for mobile fixes | P1 |
| RC3-04 | Offsite backups still not configured | P0 |

### Lessons learned

- Stabilization fixes have zero user impact until deploy + mobile rebuild — track deploy as explicit release artifact
- Caching ops dashboards is high-ROI; should be default for all aggregation-heavy admin panels
- Feature freeze must be enforced at PR level during RC3

### Verdict

**GO Closed Beta** (supervised) · **NO-GO Public Launch**

**Reference:** `release/RC3_STABILIZATION_REPORT.md` · `release/CHANGELOG_v1.0.0.md`

---

## Closed Beta — v1.0.0 Limited Launch

**Version:** 1.0.0  
**Deployment date:** 2026-07-21 (authorized)  
**Geography:** Nouakchott, Mauritania  
**Authority:** `release/LAUNCH_DECISION.md`

### Objectives

- Validate product-market fit with supervised cohort
- Stress-test dispatch, payments, and ops workflows in production
- Collect beta feedback before public launch
- Operate under strict onboarding caps

### Completed work (product scope)

| Track | Modules delivered |
|-------|-------------------|
| Mobile | Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4 |
| Core platform | Auth, payments, wallet, WebSocket, push, fraud, audit |
| Operations | Phases 19–28 admin stack (exec, ops, AI, finance, fleet, growth, multi-city, smart pricing) |
| Post-RC3 features (built, deploy pending) | Phases 29–37: Trust & Safety, Driver Incentives, Merchant, Partner, Customer Loyalty, CEO Master, Board Reports, Compliance, BI design |
| Launch ops | Closed Beta dashboard, launch playbook, day-1 checklists, CEO report templates |
| Handover | 10-document enterprise handover package |

### Cohort caps (Closed Beta)

| Role | Cap | Actual (at launch decision) |
|------|:---:|:---------------------------:|
| Drivers | 20 | ~2 |
| Couriers | 10 | ~1 |
| Riders | 100 | ~5 |

### Known issues

See `release/KNOWN_ISSUES_v1.0.0.md` — summary:

| Priority | Open count | Top blockers |
|:--------:|:----------:|--------------|
| P0 | 2 | Physical device QA unsigned; offsite backups not configured |
| P1 | 6 | p95 latency; Play attestation; iOS not submitted; cohort size; delivery E2E; RC3 not deployed |
| P2 | 4 | PgBouncer; Redis DB split; Celery Flower; Play Integrity off |

### Lessons learned

- Functional completeness (100%) ≠ launch readiness (78/100) — weight infra, QA, and store compliance equally
- Cohort recruitment must start before launch authorization
- Phases 29–37 delivered significant admin value but increase deploy/migration surface — batch migrations before next prod push

### Deployment status

| Component | Status |
|-----------|--------|
| API (api.yalataxi.live) | Live |
| Admin (www.yalataxi.live/admin) | Live |
| RC3 backend optimizations | **Not deployed** |
| RC3 mobile builds | **Not rebuilt** |
| Phases 31–33 migrations | **Run in dev/test; prod migrate pending** |

### Verdict

**GO Limited Launch** · **NO-GO Public Launch** until P0 closed and launch score ≥ 90

---

## Production — v1.0.0 Public Launch

**Target version:** 1.0.0  
**Deployment date:** *Not scheduled*  
**Target launch score:** 90+ / 100

### Objectives (planned)

- Open Nouakchott (and expansion cities) to unrestricted rider/driver/courier onboarding
- Complete Google Play public release and Apple App Store submission
- Achieve p95 API latency < 2000 ms under production load
- Verified disaster recovery with offsite encrypted backups

### Prerequisites (from `release/LAUNCH_DECISION.md`)

| # | Gate | Status |
|---|------|:------:|
| 1 | Physical device QA signed off | ❌ Open |
| 2 | Offsite backups configured & restore drill | ❌ Open |
| 3 | RC3 backend + mobile deployed | ❌ Open |
| 4 | p95 latency re-measured < 2000 ms | ❌ Open |
| 5 | Play Console attestation complete | ❌ Open |
| 6 | Core backend tests green | ❌ Partial |
| 7 | Pilot cohort at target size | ❌ Open |
| 8 | Delivery production E2E certified | ❌ Open |

### Planned completed work (at public launch)

- All Closed Beta scope deployed including RC3 fixes
- Migrations: merchants Phase 31, partners Phase 32, loyalty Phase 33
- Store listings live (Android minimum; iOS if submitted)
- Public launch marketing & support staffing

### Known issues (expected to resolve before production)

All items in `04_BUG_AND_TECH_DEBT.md` with Target release = **Production**

### Lessons learned

*To be populated after public launch.*

### Target deployment date

**TBD** — earliest recommended after P0 closure: **2026-08-04** (per RC1/RC2 certification)

---

## Post-beta engineering releases (built during Closed Beta)

These were implemented after RC3 feature freeze but are tracked as **v1.0.x admin/platform** deliverables:

| Phase | Module | Build status | Prod deploy |
|:-----:|--------|:------------:|:-----------:|
| 29 | Trust & Safety Center | Complete | Pending |
| 30 | Driver Incentive Engine | Complete | Pending |
| 31 | Merchant Platform | Complete | Pending |
| 32 | Partner & Franchise Platform | Complete | Pending |
| 33 | Customer Growth & Loyalty | Complete | Pending |
| 34 | CEO Master Command Center | Complete | Pending |
| 35 | Board & Investor Reporting | Complete | Pending |
| 36 | Compliance & Governance | Complete | Pending |
| 37 | BI Data Warehouse (design + partial) | Partial | N/A |

---

## Cross-references

| Document | Link |
|----------|------|
| Changelog | `release/CHANGELOG_v1.0.0.md` |
| Release notes | `release/RELEASE_NOTES_v1.0.0.md` |
| Launch decision | `release/LAUNCH_DECISION.md` |
| Bug register | [04_BUG_AND_TECH_DEBT.md](./04_BUG_AND_TECH_DEBT.md) |
| Dashboard KPIs | [06_PROJECT_DASHBOARD.md](./06_PROJECT_DASHBOARD.md) |

---

*Update this document at each release tag and launch decision gate*
