# Yala RC2 — Final User Acceptance Test (UAT) Plan

**Document ID:** UAT-RC2-2026-001  
**Release:** v1.0.0-rc2  
**Date:** 2026-07-21  
**Status:** Approved for execution  
**Feature freeze:** Active — documentation and defect fixes only  

**Production:** https://api.yalataxi.live · https://yalataxi.live/admin  

**Related documents:**

| Document | Path |
|----------|------|
| Known Issues Register | `release/UAT_KNOWN_ISSUES_REGISTER.md` |
| Release Readiness Checklist | `release/UAT_RELEASE_READINESS_CHECKLIST.md` |
| Executive Sign-Off | `release/UAT_EXECUTIVE_SIGNOFF.md` |
| Physical Device QA | `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` |
| RC2 Certification | `release/RC2_FINAL_LAUNCH_CERTIFICATION.md` |

---

## Document purpose

This is the **official User Acceptance Test plan** for Yala Release Candidate 2 (RC2). It defines acceptance criteria, test methods, recorded results, and the launch recommendation for:

- Rider, Driver, and Delivery mobile apps  
- Executive and operations admin platforms  
- Security, performance, disaster recovery, and operational readiness  

**Scope exclusions:** No application code changes, API changes, or UI redesign during UAT execution.

---

## UAT summary (pre-populated from RC2 certification)

| Field | Value |
|-------|-------|
| **Launch score** | **74 / 100** |
| **Risk score** | **26 / 100** |
| **Automated API ride lifecycle** | **PASS** (production) |
| **Admin / ops modules** | **PASS** (HTTP 200) |
| **Physical device UAT** | **PENDING** |
| **Offsite backup UAT** | **FAIL** (credentials pending) |
| **Interim recommendation** | **GO Closed Beta with monitoring** |
| **Commercial / public launch** | **NO-GO** |

---

## UAT roles

| Role | Responsibility |
|------|----------------|
| **QA Lead** | Execute functional UAT; sign physical device QA |
| **Operations Manager** | Business ops, incidents, withdrawals, daily ops |
| **Engineering Lead** | Security, performance, DR evidence |
| **Product / CEO** | Final launch decision |

---

<div style="page-break-after: always;"></div>

# SECTION 1 — Functional Acceptance Tests

**Test environment:** Production (`api.yalataxi.live`)  
**Mobile builds:** Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4  
**Detailed device steps:** `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`

**Legend:** ✅ Pass · ⚠️ Partial / pending device · ❌ Fail · ☐ UAT not yet executed

---

## 1.1 Rider App (`com.yala.rider.mr` v1.2.7)

| # | Acceptance criterion | Method | RC2 auto | UAT Pass ☐ | UAT Fail ☐ | Evidence / notes |
|---|-------------------|--------|:--------:|:----------:|:----------:|------------------|
| R-01 | **Registration** — new rider can register with valid data | Physical device | ⚠️ | ☐ | ☐ | Not re-tested in RC2 automation |
| R-02 | **Login** — approved rider logs in; session persists | Device + API | ✅ | ☐ | ☐ | API JWT OK; device sign-off pending |
| R-03 | **GPS** — permission, current location, pickup pin | Physical device | ⚠️ | ☐ | ☐ | Map marker; pickup coordinates on request |
| R-04 | **Ride request** — pickup, destination, terms, create ride | API + device | ✅ | ☐ | ☐ | `POST /rides/request/` → 201 |
| R-05 | **Live tracking** — driver position updates during ride | Device + WebSocket | ⚠️ | ☐ | ☐ | WS healthy; stream not device-certified |
| R-06 | **Payment** — cash / wallet / mobile money after trip | Physical device | ⚠️ | ☐ | ☐ | Payment authorized at request; post-trip UI pending |
| R-07 | **Wallet** — view balance, transaction history | API + device | ✅ | ☐ | ☐ | `GET /payments/wallet/` → 200 |
| R-08 | **Ride history** — completed rides listed with fare | API + device | ✅ | ☐ | ☐ | `GET /rides/history/` → 200 |
| R-09 | **Notifications** — push on accept, arrived, complete | Physical device | ⚠️ | ☐ | ☐ | FCM not automated |
| R-10 | **Offline recovery** — reconnect syncs active ride | Physical device | ⚠️ | ☐ | ☐ | Test IDs R-031, R-062 in device QA |

**Rider functional UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

**Conditions (if any):** _______________________________________________

---

## 1.2 Driver App (`com.yala.driver.mr` v1.2.23)

| # | Acceptance criterion | Method | RC2 auto | UAT Pass ☐ | UAT Fail ☐ | Evidence / notes |
|---|-------------------|--------|:--------:|:----------:|:----------:|------------------|
| D-01 | **Login** — approved driver authenticates | API + device | ✅ | ☐ | ☐ | Internal JWT; device pending |
| D-02 | **Go online** — availability toggle; eligible for offers | API + device | ✅ | ☐ | ☐ | `POST /drivers/availability/toggle/` → 200 |
| D-03 | **Accept ride** — offer received and accepted | API + device | ✅ | ☐ | ☐ | Full lifecycle API PASS |
| D-04 | **Navigation** — route to pickup and destination | Physical device | ⚠️ | ☐ | ☐ | Backend transitions only in RC2 |
| D-05 | **Arrived** — GPS geofence at pickup | API + device | ✅ | ☐ | ☐ | Requires lat/lng at pickup |
| D-06 | **Start ride** — blocked until PIN verified | API + device | ✅ | ☐ | ☐ | verify-pin → start → 200 |
| D-07 | **Finish ride** — complete trip; status completed | API + device | ✅ | ☐ | ☐ | `POST /rides/complete/` → 200 |
| D-08 | **Earnings** — trip credit reflected | API + device | ⚠️ | ☐ | ☐ | Complete succeeds; ledger not separately asserted |
| D-09 | **Wallet** — balance and history | API + device | ✅ | ☐ | ☐ | `GET /payments/wallet/` → 200 |
| D-10 | **Cash out** — withdrawal request + OTP | Physical device | ⚠️ | ☐ | ☐ | `GET /payments/withdrawals/` → 200 |
| D-11 | **Notifications** — new offer, cancel events | Physical device | ⚠️ | ☐ | ☐ | Device QA D-020+ |

**Driver functional UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

---

## 1.3 Delivery App (`com.yala.delivery.mr` v1.0.4)

| # | Acceptance criterion | Method | RC2 auto | UAT Pass ☐ | UAT Fail ☐ | Evidence / notes |
|---|-------------------|--------|:--------:|:----------:|:----------:|------------------|
| C-01 | **Login** — courier authenticates | Physical device | ⚠️ | ☐ | ☐ | Login rate-limited in smoke only |
| C-02 | **Go online** — delivery mode enabled | Physical device | ⚠️ | ☐ | ☐ | Not in RC2 orchestrator |
| C-03 | **Accept delivery** — offer accepted | Physical device | ⚠️ | ☐ | ☐ | Requires courier QA account |
| C-04 | **Pickup** — confirm pickup at location | Physical device | ⚠️ | ☐ | ☐ | Device QA C-041 |
| C-05 | **Delivered** — confirm delivery complete | Physical device | ⚠️ | ☐ | ☐ | Device QA C-042 |
| C-06 | **Wallet** — earnings credited | Physical device | ⚠️ | ☐ | ☐ | — |
| C-07 | **Cash out** — withdrawal flow | Physical device | ⚠️ | ☐ | ☐ | — |
| C-08 | **Notifications** — offer and status pushes | Physical device | ⚠️ | ☐ | ☐ | — |

**API gate check:** `GET /deliveries/mine/` without token → 401 ✅

**Delivery functional UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

---

<div style="page-break-after: always;"></div>

# SECTION 2 — Business Operations Acceptance

**Access:** https://yalataxi.live/admin (authenticated executive/ops staff)  
**Method:** Authenticated API + admin UI route verification (2026-07-21)

| # | Module | Acceptance criterion | Endpoint / route | RC2 | UAT Pass ☐ | UAT Fail ☐ |
|---|--------|---------------------|------------------|:---:|:----------:|:----------:|
| B-01 | **Executive Dashboard** | KPIs, health, maintenance controls load | `/operations/executive/dashboard/` · `/admin/executive` | ✅ | ☐ | ☐ |
| B-02 | **Operations Center** | Live ops map, dispatch, emergency panel | `/operations/center/dashboard/` · `/admin/operations` | ✅ | ☐ | ☐ |
| B-03 | **AI Operations** | AI dashboard, insights load | `/operations/ai/dashboard/` · `/admin/ai-operations` | ✅ | ☐ | ☐ |
| B-04 | **Business Operations Hub** | Finance, CRM, marketing, incentives, partners, corporate, compliance, BI | `/operations/business/hub/` · `/admin/business` | ✅ | ☐ | ☐ |
| B-05 | **Finance Dashboard** | Revenue, fees, wallet aggregates in business hub | Business hub `finance` module | ✅ | ☐ | ☐ |
| B-06 | **Withdrawal approvals** | Admin can list and action withdrawal requests | `/payments/admin/records/` | ✅ | ☐ | ☐ |
| B-07 | **CEO assignment approval** | CEO-only actions (broadcast, maintenance, assignment) enforce permission | Executive CEO group APIs | ⚠️ | ☐ | ☐ | Manual CEO login test required |
| B-08 | **Incident management** | Create, update, resolve incidents | `/operations/launch/incidents/` · Launch Hub | ✅ | ☐ | ☐ |
| B-09 | **Reports** | Executive / ops reports render | Executive + BI modules | ✅ | ☐ | ☐ |
| B-10 | **Exports** | CSV / Excel / PDF export downloads | `GET /operations/executive/export/?export_format=` | ⚠️ | ☐ | ☐ | Export not exercised in RC2 |
| B-11 | **Broadcast notifications** | Executive broadcast sends push to audience | `POST /operations/executive/broadcast/` | ⚠️ | ☐ | ☐ | Send test not run in RC2 |

**Business operations UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

---

# SECTION 3 — Security Acceptance

| # | Control | Acceptance criterion | Verification method | RC2 | UAT Pass ☐ | UAT Fail ☐ |
|---|---------|---------------------|---------------------|:---:|:----------:|:----------:|
| S-01 | **Authentication** | Login returns JWT; invalid creds rejected | API login + smoke | ✅ | ☐ | ☐ |
| S-02 | **JWT** | Protected routes require Bearer token; expired token rejected | API 401/403 checks | ✅ | ☐ | ☐ |
| S-03 | **Device binding** | Device sessions tracked; multi-account limits enforced | `DeviceSession` model; security phase 2 | ✅ | ☐ | ☐ |
| S-04 | **Logout all devices** | User can invalidate all sessions | Security API / device views | ⚠️ | ☐ | ☐ | Manual UAT |
| S-05 | **OTP** | Withdrawal OTP required; invalid OTP rejected | `rc2-security-verify.py` | ✅ | ☐ | ☐ |
| S-06 | **Rate limiting** | Auth abuse returns 429 | Security verify (429 on login burst) | ✅ | ☐ | ☐ |
| S-07 | **Fraud detection** | Fraud flags created for suspicious activity | Security module; ops review | ✅ | ☐ | ☐ |
| S-08 | **Audit logs** | Admin actions recorded | Audit API in executive security | ✅ | ☐ | ☐ |
| S-09 | **Permission matrix** | Non-CEO blocked from CEO-only endpoints | Role tests | ⚠️ | ☐ | ☐ |
| S-10 | **Role-based access** | Staff vs driver vs rider route separation | API permission classes | ✅ | ☐ | ☐ |

**Additional controls verified:** HTTPS/HSTS ✅ · CSRF on admin ✅ · Secrets not in repo ✅

**Security UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

---

# SECTION 4 — Performance Acceptance

**Load test:** `scripts/launch-load-test-phase16.py` — 335 requests, ~28 RPS (2026-07-21)

| Metric | Recorded value | Target | Result |
|--------|---------------|--------|--------|
| **p50 latency** | **926 ms** | — | — |
| **p95 latency** | **4086 ms** | < 2000 ms | ❌ FAIL |
| **p99 latency** | **4336 ms** | — | — |
| **max latency** | **4861 ms** | — | — |
| **HTTP 5xx count** | **0** | 0 | ✅ PASS |
| **HTTP 429 (load test)** | **0** | — | ✅ |

**Infrastructure snapshot (2026-07-21):**

| Resource | Value | UAT Pass ☐ | UAT Fail ☐ |
|----------|-------|:----------:|:----------:|
| **CPU** | 2 vCPU (DigitalOcean droplet) | ☐ | ☐ |
| **Memory available** | ~1.5 GiB / 3.8 GiB | ☐ | ☐ |
| **Disk used** | 36% (28 GB / 78 GB) | ☐ | ☐ |
| **Redis** | Healthy | ✅ | ☐ | ☐ |
| **Celery** | 2 workers + beat Up | ✅ | ☐ | ☐ |
| **PostgreSQL** | Healthy | ✅ | ☐ | ☐ |
| **Docker** | 9 containers Up | ✅ | ☐ | ☐ |
| **nginx** | SPA + API proxy OK | ✅ | ☐ | ☐ |
| **SSL** | HTTPS 200 api + admin | ✅ | ☐ | ☐ |
| **Backup monitor** | Daily check OK | ✅ | ☐ | ☐ |
| **Dashboard load (SPA static)** | < 20 ms | ✅ | ☐ | ☐ |
| **Dashboard API (authenticated)** | Inherits p95 ~4 s | ⚠️ | ☐ | ☐ |

**Performance UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

**Condition:** Monitor p95 during closed beta; target < 2000 ms before public launch.

---

# SECTION 5 — Disaster Recovery Acceptance

| # | Criterion | Acceptance standard | RC2 result | UAT Pass ☐ | UAT Fail ☐ |
|---|-----------|--------------------|:----------:|:----------:|:----------:|
| DR-01 | **Local backup** | Daily encrypted PG + media + config | ✅ PASS | ☐ | ☐ |
| DR-02 | **Offsite backup** | Encrypted copy to DO Spaces | ❌ FAIL | ☐ | ☐ |
| DR-03 | **Restore procedure** | Documented in `BACKUP_RESTORE_GUIDE.md` | ✅ | ☐ | ☐ |
| DR-04 | **Restore timing** | Decrypt + validate < 4 h RTO target | **0.395 s** (decrypt drill) | ✅ | ☐ | ☐ |
| DR-05 | **Backup integrity** | SHA-256 manifest + gpg decrypt test | ✅ PASS | ☐ | ☐ |
| DR-06 | **Monitoring alerts** | Stale backup fails monitor script | ✅ PASS | ☐ | ☐ |

**Retention:** Daily × 14 · Weekly × 8 · Monthly × 12  
**Backup size:** ~10.3 MB total (DB + media + config)

**DR UAT verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

**Blocker:** Offsite upload pending Spaces credentials (`/home/yala/.backup-offsite.env`).

---

# SECTION 6 — Operational Readiness

| # | Process | Ready criterion | Owner | UAT Pass ☐ | UAT Fail ☐ |
|---|---------|----------------|-------|:----------:|:----------:|
| O-01 | **Driver onboarding** | Registration → document review → approval workflow documented | Ops | ⚠️ | ☐ | ☐ |
| O-02 | **Courier onboarding** | Delivery profile + approval path defined | Ops | ⚠️ | ☐ | ☐ |
| O-03 | **Rider onboarding** | Registration + approval in app/admin | Ops | ⚠️ | ☐ | ☐ |
| O-04 | **Customer support workflow** | Launch Hub support queue + CRM notes | Ops Mgr | ✅ | ☐ | ☐ |
| O-05 | **Incident escalation** | SEV1–3 procedures in `POST_LAUNCH_SUPPORT_PROCEDURES.md` | Ops Mgr | ✅ | ☐ | ☐ |
| O-06 | **Withdrawal workflow** | Request → OTP → admin approve → mark paid | Finance | ✅ | ☐ | ☐ |
| O-07 | **Finance reconciliation** | Payment records + wallet ledger in admin | Finance | ✅ | ☐ | ☐ |
| O-08 | **Daily operations checklist** | See `UAT_RELEASE_READINESS_CHECKLIST.md` § Daily Ops | Ops Mgr | ⚠️ | ☐ | ☐ |

**Pilot cohort (production):** ~2 drivers · ~0 couriers · ~5 riders (target caps: 20 / 10 / 100)

**Operational readiness verdict:** ☐ **ACCEPT** · ☐ **ACCEPT WITH CONDITIONS** · ☐ **REJECT**

---

# SECTION 7 — Known Issues

Full register: **`release/UAT_KNOWN_ISSUES_REGISTER.md`**

| Priority | Count | Launch impact |
|----------|:-----:|---------------|
| **P0** | 2 | Block commercial launch |
| **P1** | 4+ | Acceptable for closed beta with monitoring |
| **P2** | 3+ | Backlog |

**Top P0:**

1. Physical Android device QA not signed off (Rider 1.2.7, Driver 1.2.23, Delivery 1.0.4)  
2. Offsite encrypted backups not configured  

---

# SECTION 8 — Launch Recommendation

| Metric | Value |
|--------|-------|
| **Launch score** | **74 / 100** |
| **Risk score** | **26 / 100** |

### Recommendation matrix

| Launch type | Decision | Rationale |
|-------------|----------|-----------|
| **GO Closed Beta** | **✅ RECOMMENDED** | Core ride API lifecycle PASS; admin/ops PASS; 0× 5xx; infra healthy; pilot caps limit blast radius |
| **GO Public Launch** | **❌ NO-GO** | P0 device QA + offsite DR open; p95 > 2× target; app stores incomplete; pilot under-recruited |
| **NO-GO (all)** | **❌ Not recommended** | Platform is operational for controlled beta |

### Decision explanation

Yala RC2 has achieved **production-verified core platform functionality**: the full ride lifecycle runs on production APIs, all executive and operations dashboards respond correctly, security controls are active, and local encrypted backups with restore drills pass. These outcomes support a **controlled closed beta in Nouakchott** with strict pilot caps (20 drivers, 10 couriers, 100 riders) and 24/7 monitoring per `POST_LAUNCH_SUPPORT_PROCEDURES.md`.

Commercial public launch remains **NO-GO** because two P0 items are open (physical device certification and offsite backups), performance p95 exceeds the 2000 ms target under load, mobile store attestation is incomplete, and the live pilot cohort is far below operational targets. Closed beta proceeds **with explicit acceptance of P1 risks** and a requirement to re-run UAT after P0 closure.

**Recommended pilot caps:** Drivers **20** · Couriers **10** · Riders **100**

---

# SECTION 9 — Executive Sign-Off

Printable sign-off page: **`release/UAT_EXECUTIVE_SIGNOFF.md`**

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Operations Manager | | | |
| Engineering Lead | | | |
| CTO | | | |
| CEO (H. Sakho) | | | |

**Final decision:**

☐ **GO Closed Beta**  
☐ **GO Public Launch**  
☐ **NO-GO**

---

## UAT execution log

| Date | Tester | Sections executed | Result | Notes |
|------|--------|-------------------|--------|-------|
| 2026-07-21 | RC2 automation | S1 API, S2 admin API, S4 load, S5 local DR | Partial PASS | See RC2_FINAL_LAUNCH_CERTIFICATION.md |
| | | | | |
| | | | | |

---

## Document control

| Version | Date | Author | Change |
|---------|------|--------|--------|
| 1.0 | 2026-07-21 | Yala Release Engineering | Initial RC2 UAT plan |

---

*Official release documentation — Yala Technologies · RC2 · Feature freeze active*
