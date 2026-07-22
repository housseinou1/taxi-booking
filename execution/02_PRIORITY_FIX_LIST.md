# Sprint 1 — Priority Fix List

**Document ID:** EXEC-SPRINT1-FIXLIST-001  
**Sprint:** Execution Sprint 1  
**Date:** 2026-07-22  
**Status:** Active  
**Governance:** [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [01_SPRINT1_AUDIT.md](./01_SPRINT1_AUDIT.md)

---

## Summary

| Priority | Count | Launch impact |
|:--------:|:-----:|---------------|
| **P0 — Critical** | 6 | Must fix before closed beta |
| **P1 — High** | 14 | Must fix before general availability |
| **P2 — Medium** | 12 | Post-launch or v1.1 |
| **P3 — Low** | 6 | Backlog |
| **Total** | **38** | |

Every issue references an **affected module** per audit requirement.

---

## P0 — Critical (must fix before launch)

| ID | Issue | Affected module | Impact | Recommended fix | Effort |
|----|-------|-----------------|--------|-----------------|:------:|
| FIX-P0-001 | Physical device QA not signed off | **Yala Rider**, **Yala Driver**, **Yala Delivery** | Gate A blocked; no evidence for registration, booking, wallet, GPS, push on real devices | Execute `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`; sign certification report | M |
| FIX-P0-002 | Offsite encrypted backups not configured | **Infrastructure** (Docker Compose Stack) | Critical data loss risk; Gate A blocked | Configure S3/DO Spaces; run `offsite-backup-certification.sh`; document RTO/RPO | M |
| FIX-P0-003 | RC3 backend fixes not deployed to production | **Platform** (AI Operations, Finance Ops, Fleet, Operations Center) | Performance fixes and bug patches inactive in prod | Deploy RC3 tag; verify health; re-run prod spot-checks | S |
| FIX-P0-004 | Phases 29–39 production migrations not applied | **Trust & Safety**, **Driver Incentive Engine**, **Merchant Platform**, **Partner Platform**, **Customer Growth**, **CEO Master**, **Board Reports**, **Compliance**, **BI**, **API Gateway**, **YALA Academy** | New modules unavailable or schema drift in production | Maintenance window `migrate`; smoke-test each admin route | M |
| FIX-P0-005 | Operations test suite — 8 errors (146 tests) | **Operations test suite** (cross-module) | Quality Gate 4 failing; regression undetected | Triage errors (e.g. `Merchant.name` AttributeError); fix fixtures/models; restore green suite | M |
| FIX-P0-006 | No staging environment | **Infrastructure** | High deploy risk; cannot safely validate RC3/migrations | Provision `staging.yalataxi.live` mirroring production compose | L |

**Quality gates blocked:** 4 (Unit tests), 6 (Mobile QA), 10 (Production deploy), 11 (CEO — Gate A).

---

## P1 — High

| ID | Issue | Affected module | Impact | Recommended fix | Effort |
|----|-------|-----------------|--------|-----------------|:------:|
| FIX-P1-001 | API p95 latency 4086 ms (target < 2000 ms) | **Platform** / **Operations Center** / **Finance Operations Center** | Gate B blocked; poor UX under load | Deploy RC3 caching + indexes; re-run `launch-perf-smoke.py`; tune nginx/DRF | M |
| FIX-P1-002 | RC3 mobile APKs not rebuilt/distributed | **Yala Rider**, **Yala Driver** | Cancel/state sync and online-toggle fixes not in user hands | Rebuild APK/AAB from RC3 source; distribute to pilot cohort | S |
| FIX-P1-003 | Delivery production E2E not certified (403 phone verify) | **Yala Delivery** | Courier onboarding blocked in prod | Debug phone verification on prod; re-run delivery E2E script | S |
| FIX-P1-004 | Google Play manual attestation incomplete | **Yala Rider**, **Yala Driver**, **Yala Delivery** | Store closed testing blocked | Complete Data Safety, account deletion attestation, internal/closed tracks | M |
| FIX-P1-005 | Pilot cohort under-recruited (~2/0/5 vs 20/10/100) | **Launch Command Center** | Insufficient beta validation | Operations outreach; track in launch hub | M |
| FIX-P1-006 | 7 core ride/driver/delivery unit tests failing | **Yala Rider**, **Yala Driver**, **Yala Delivery** (backend) | CI not green; fixture drift | Update test setups for document/signature/driver-code guards | M |
| FIX-P1-007 | Apple App Store not submitted | **Yala Rider** (iOS) | 50% market excluded at GA | Submit after Android beta stable, or formally defer iOS | XL |
| FIX-P1-008 | Dual referral systems (`referrals` + legacy `promotions`) | **Customer Growth & Loyalty** | Wrong/inconsistent referral payouts | Consolidate to `referrals` app; disable legacy path (v1.1 scope — track now) | M |
| FIX-P1-009 | Merchant hardcoded destination lat/lng in checkout | **Merchant Platform** | Wrong delivery dispatch coordinates | Use merchant geocoded address or order delivery address | S |
| FIX-P1-010 | Silent delivery creation failure on merchant ready | **Merchant Platform**, **Yala Delivery** | Orders stuck without courier | Surface error to merchant admin; retry/create delivery explicitly | S |
| FIX-P1-011 | Executive sign-off not completed | **CEO Master Command Center**, **Executive Dashboard** | Gate A/B blocked | Complete `release/UAT_EXECUTIVE_SIGNOFF.md` after P0 fixes | S |
| FIX-P1-012 | Security UAT partial (S-01–S-10) | **Security & Audit**, **Authentication** | Launch security confidence gap | Complete remaining security UAT checklist items | M |
| FIX-P1-013 | AI Operations dashboard cache not active in prod | **AI Operations** | Regenerates recommendations every GET; latency | Deploy RC3 `cached_ops_call` (45 s Redis) | S |
| FIX-P1-014 | Admin least-privilege role audit not done | **All admin modules** | Over-broad staff access | Review `executive_permissions.py`; document role matrix | M |

**Quality gates impacted:** 5, 7, 8, 11.

---

## P2 — Medium

| ID | Issue | Affected module | Impact | Recommended fix | Effort |
|----|-------|-----------------|--------|-----------------|:------:|
| FIX-P2-001 | No PgBouncer connection pooler | **Infrastructure**, **PostgreSQL** | Connection saturation under launch traffic | Install PgBouncer in compose; tune pool size | M |
| FIX-P2-002 | Redis shared DB index 0 | **Infrastructure**, **Redis** | Broker/cache/channels contention | Split logical DBs or separate instances | S |
| FIX-P2-003 | No Celery Flower / queue depth alerting | **Infrastructure**, **Celery** | Hidden task backlog/failures | Deploy Flower or alternative queue monitor | S |
| FIX-P2-004 | Play Integrity enforcement disabled | **Yala Rider**, **Yala Driver** | Device fraud risk | Enable `PLAY_INTEGRITY_ENFORCE=true` after beta | S |
| FIX-P2-005 | Rider loyalty UI not in mobile app | **Yala Rider**, **Customer Growth & Loyalty** | Loyalty invisible to riders | Add loyalty screen to rider app (v1.1 — document scope) | M |
| FIX-P2-006 | Partner self-service portal API only | **Partner & Franchise Platform** | Ops must create/manage partners | Build partner portal UI (v1.1) | L |
| FIX-P2-007 | Merchant portal partial (menu/variants UI) | **Merchant Portal** | Merchants rely on admin for catalog | Complete portal product management UI | M |
| FIX-P2-008 | BI queries hit primary DB | **Business Intelligence Center** | Load on production DB | Accept for v1.0; plan read replica per v2 backlog | L |
| FIX-P2-009 | Fraud flags partial UI integration | **Trust & Safety Center** | Manual fraud review overhead | Wire fraud queue fully in Trust & Safety UI | M |
| FIX-P2-010 | Privacy/terms missing FR/AR localization | **Legal & Compliance Logs** | Store/regulatory gap | Localize pages; link from stores | M |
| FIX-P2-011 | JWT not revoked on password change | **Authentication & Identity** | Token theft window | Implement token blacklist on password change | M |
| FIX-P2-012 | Marketing campaign push/email not automated | **Business Operations Hub**, **Customer Growth** | Campaigns CRUD-only | Manual ops for v1.0; automate in v1.1+ | L |

---

## P3 — Low

| ID | Issue | Affected module | Impact | Recommended fix | Effort |
|----|-------|-----------------|--------|-----------------|:------:|
| FIX-P3-001 | Referral push notifications are logger placeholders | **Customer Growth & Loyalty** | Poor referrer UX | Wire FCM on referral events | S |
| FIX-P3-002 | Merchant `city` is CharField not FK | **Merchant Platform** | Weak geo analytics | Migrate to City FK (v1.1) | M |
| FIX-P3-003 | Fleet maintenance reminders partial UI | **Fleet & Performance Center** | Manual fleet maintenance tracking | Complete reminders panel | S |
| FIX-P3-004 | Open-source license attribution incomplete | **Platform** | Compliance minor gap | Generate SBOM / `THIRD_PARTY_LICENSES.txt` | S |
| FIX-P3-005 | RAM headroom ~1.5 GiB; no swap | **Infrastructure** | OOM risk under spike | Add swap or upgrade droplet | S |
| FIX-P3-006 | Compliance policy documents not legally reviewed | **Compliance & Governance Center** | Legal exposure on policy text | Legal review of `PolicyDocument` entries | M |

---

## Mapping to existing bug register

| Fix ID | Existing ID |
|--------|-------------|
| FIX-P0-001 | BUG-P0-001 |
| FIX-P0-002 | BUG-P0-002, SEC-001 |
| FIX-P0-003 | BUG-P1-006, PERF-001, PERF-002 |
| FIX-P0-004 | T-09 |
| FIX-P0-005 | New (Sprint 1 verification) |
| FIX-P0-006 | TD-008, PERF-006 |
| FIX-P1-001 | BUG-P1-001, PERF-003 |
| FIX-P1-002 | RC3 mobile (feature matrix) |
| FIX-P1-003 | BUG-P1-005 |
| FIX-P1-004 | BUG-P1-002 |
| FIX-P1-005 | BUG-P1-004 |
| FIX-P1-006 | KNOWN-006 |
| FIX-P1-007 | BUG-P1-003, TD-011 |
| FIX-P1-008 | KNOWN-001, TD-001 |
| FIX-P1-009 | TD-006 |
| FIX-P1-010 | TD-007 |
| FIX-P2-001 | BUG-P2-001, PERF-004 |
| FIX-P2-002 | BUG-P2-002, PERF-005 |
| FIX-P2-003 | BUG-P2-003 |
| FIX-P2-004 | BUG-P2-004, SEC-002 |
| FIX-P2-005 | KNOWN-003 |

Full register: `project-management/04_BUG_AND_TECH_DEBT.md`

---

## Recommended Sprint 2 execution order

1. FIX-P0-003 → FIX-P0-004 → FIX-P1-001 → FIX-P1-013 (deploy path)
2. FIX-P0-002 → FIX-P0-006 (infrastructure)
3. FIX-P0-005 → FIX-P1-006 (test suite green)
4. FIX-P0-001 → FIX-P1-002 → FIX-P1-003 (mobile)
5. FIX-P1-004 → FIX-P1-005 → FIX-P1-011 (beta gates)

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [01_SPRINT1_AUDIT.md](./01_SPRINT1_AUDIT.md) | Module-level findings |
| [03_PRODUCTION_READINESS_SCORE.md](./03_PRODUCTION_READINESS_SCORE.md) | Readiness scores |
| [04_EXECUTION_BOARD.md](./04_EXECUTION_BOARD.md) | Ownership and status |
| [05_RELEASE_PLAN.md](./05_RELEASE_PLAN.md) | Stage exit criteria |
| [QUALITY_GATES.md](../docs/QUALITY_GATES.md) | Gate definitions |

---

*No code changes in Sprint 1 · Fixes tracked for Sprint 2+ execution · YALA Enterprise Program Office*
