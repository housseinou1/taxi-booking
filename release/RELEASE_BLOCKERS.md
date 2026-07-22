# YALA Enterprise v1.0 — Release Blockers

**Document ID:** RELEASE-BLOCKERS-001  
**Date:** 2026-07-22  
**Status:** Active  
**Verdict:** **NOT READY FOR RELEASE CANDIDATE**  
**Source audit:** [FINAL_RELEASE_READINESS_AUDIT.md](./FINAL_RELEASE_READINESS_AUDIT.md) · [EXECUTIVE_SCORECARD.md](./EXECUTIVE_SCORECARD.md)

---

## Summary

| Priority | Count | RC gate |
|:--------:|:-----:|---------|
| **P0 — Must fix before RC** | 8 | Blocks RC tag |
| **P1 — Before Closed Beta** | 12 | Does not block RC if P0 cleared |
| **P2 — After launch / v1.1** | 14 | Backlog |

---

## P0 — Must fix before Release Candidate

| ID | Description | Module | Impact | Recommendation | Effort |
|----|-------------|--------|--------|----------------|:------:|
| RB-P0-001 | Operations test suite **8 errors** in 146 tests | **Operations / API Gateway** | RC-E3 fails; Quality Gate 4 blocked; regression undetected | Fix `api_gateway/signals.py` line 137: use `instance.business_name` not `instance.name`; re-run full `tests.operations` | S |
| RB-P0-002 | RC3 backend performance fixes **not deployed** | **Platform** (AI Ops, Finance, Fleet, Operations) | p95 remains ~4086 ms; RC-E1 fails; perf fixes inactive | Deploy RC3 tag; apply migrations `payments 0020`, `drivers 0023`; verify health | S |
| RB-P0-003 | Phases **29–39 production migrations** not applied | **Trust & Safety, Incentives, Merchant, Partner, Loyalty, CEO, Board, Compliance, BI, API Gateway, Academy** | Enterprise modules unavailable or schema drift in prod | Maintenance window `migrate`; smoke-test each admin route | M |
| RB-P0-004 | **No staging environment** | **Infrastructure** | RC-E5 fails; unsafe to validate RC; high deploy risk | Provision `staging.yalataxi.live` mirroring production compose | L |
| RB-P0-005 | **Offsite encrypted backups** not configured | **Infrastructure** | Critical data loss risk; Gate A blocked; SEC-001 | Configure S3/DO Spaces; run restore drill; document RTO/RPO | M |
| RB-P0-006 | **6 open P0 bugs** in register (QA, backup, deploy chain) | **Cross-cutting** | RC-E2 fails (0 P0 required) | Close BUG-P0-001, BUG-P0-002; track RB-P0-001–005 | — |
| RB-P0-007 | **RELEASE_CHECKLIST** not completed for RC3 | **Release process** | RC governance incomplete | Instantiate `RELEASE_CHECKLIST_v1.0.0-rc3.md`; complete all mandatory items | S |
| RB-P0-008 | **p95 latency not re-measured** post-RC3 | **Platform / API** | RC-E1 unverified; cannot certify perf | Run `scripts/launch-perf-smoke.py` after RB-P0-002 deploy | S |

---

## P1 — Should fix before Closed Beta

| ID | Description | Module | Impact | Recommendation | Effort |
|----|-------------|--------|--------|----------------|:------:|
| RB-P1-001 | Physical device QA **not signed** | **Rider, Driver, Delivery** | Gate A blocked; no mobile evidence | Execute `physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` | M |
| RB-P1-002 | RC3 **mobile APKs not rebuilt** | **Rider, Driver** | Cancel/state-sync fixes not in user hands | Rebuild AAB/APK; distribute to testers | S |
| RB-P1-003 | Delivery **prod E2E not certified** (403 phone verify) | **Delivery** | Courier onboarding blocked in prod | Debug prod phone verification; re-run E2E | S |
| RB-P1-004 | **7 core ride/driver/delivery unit tests** failing (fixture drift) | **Rider, Driver, Delivery** | CI not fully green (KNOWN-006) | Update test fixtures for document/signature guards | M |
| RB-P1-005 | Google Play **manual attestation** incomplete | **Mobile / Store** | Closed testing blocked | Data Safety, account deletion, closed track | M |
| RB-P1-006 | **Pilot cohort under-recruited** (~2/0/5 vs 20/10/100) | **Launch Command Center** | Beta validation insufficient | Operations outreach | M |
| RB-P1-007 | Admin **least-privilege audit** incomplete | **All admin modules** | Over-broad staff access (SEC-004) | Review `executive_permissions.py`; document matrix | M |
| RB-P1-008 | **Dual referral systems** active | **Customer Growth & Loyalty** | Wrong/inconsistent payouts (KNOWN-001) | Consolidate to `referrals` app; disable legacy | M |
| RB-P1-009 | Merchant **hardcoded lat/lng** in checkout | **Merchant Platform** | Wrong delivery dispatch (TD-006) | Use merchant geocoded address | S |
| RB-P1-010 | **Silent delivery creation failure** on merchant ready | **Merchant, Delivery** | Orders stuck (TD-007) | Surface error; explicit delivery create | S |
| RB-P1-011 | **Executive sign-off** not completed | **CEO Dashboard** | Gate A/B blocked | `UAT_EXECUTIVE_SIGNOFF.md` | S |
| RB-P1-012 | Security UAT **partial** (S-01–S-10) | **Security & Audit** | Launch confidence gap | Complete security UAT checklist | M |

---

## P2 — Can be addressed after launch

| ID | Description | Module | Impact | Recommendation | Effort |
|----|-------------|--------|--------|----------------|:------:|
| RB-P2-001 | No **PgBouncer** connection pooler | Infrastructure | Connection saturation under load | Install in compose | M |
| RB-P2-002 | **Redis shared DB index 0** | Infrastructure | Broker/cache/channels contention | Split logical DBs | S |
| RB-P2-003 | No **Celery Flower** / queue alerting | Infrastructure | Hidden task failures | Deploy monitor | S |
| RB-P2-004 | **Play Integrity** enforcement disabled | Rider, Driver | Device fraud risk | Enable after beta stable | S |
| RB-P2-005 | **Rider loyalty UI** missing in mobile | Rider, Customer Growth | Loyalty invisible (KNOWN-003) | v1.1 mobile screen | M |
| RB-P2-006 | **Partner self-service portal** API only | Partner Platform | Ops overhead (KNOWN-004) | v1.1 portal UI | L |
| RB-P2-007 | **Merchant portal** partial UI | Merchant Portal | Admin-assisted catalog | Complete portal | M |
| RB-P2-008 | **BI ETL warehouse** not built | Business Intelligence | Primary DB query load (TD-010) | v2 backlog | L |
| RB-P2-009 | **Apple App Store** not submitted | Rider iOS | 50% market excluded | Submit or defer formally | XL |
| RB-P2-010 | Privacy/terms **FR/AR** localization | Legal | Store/regulatory gap (C-01) | Localize pages | M |
| RB-P2-011 | **JWT not revoked** on password change | Authentication | Token theft window (SEC-003) | Token blacklist on password change | M |
| RB-P2-012 | **Marketing campaign** push/email not automated | Business Ops, Growth | Manual ops (KNOWN-005) | v1.1+ automation | L |
| RB-P2-013 | No **SBOM / THIRD_PARTY_LICENSES.txt** | Platform | Compliance minor (C-06) | Generate license file | S |
| RB-P2-014 | **Unpinned** DRF/Celery in requirements.txt | Platform | Reproducible build risk | Pin versions for RC tag | S |

---

## Blocker dependency graph

```
RB-P0-001 (test suite) ──► RB-P0-007 (RELEASE_CHECKLIST)
RB-P0-002 (RC3 deploy) ──► RB-P0-008 (p95 remeasure)
RB-P0-004 (staging) ─────► RB-P0-003 (migrations validation)
RB-P0-005 (offsite backup) ► Gate A (not RC, but parallel P0)
RB-P0-006 (P0 register) ──► RC-E2
```

---

## Mapping to existing registers

| Blocker ID | Existing ID |
|------------|-------------|
| RB-P0-001 | FIX-P0-005 (execution) |
| RB-P0-002 | BUG-P1-006, PERF-001, PERF-002 |
| RB-P0-003 | T-09 |
| RB-P0-004 | TD-008, FIX-P0-006 |
| RB-P0-005 | BUG-P0-002, SEC-001 |
| RB-P1-001 | BUG-P0-001 |
| RB-P1-002 | RC3 mobile |
| RB-P1-003 | BUG-P1-005 |
| RB-P1-004 | KNOWN-006 |
| RB-P1-005 | BUG-P1-002 |

Full registers: `project-management/04_BUG_AND_TECH_DEBT.md` · `execution/02_PRIORITY_FIX_LIST.md`

---

## RC clearance checklist

RC may be tagged when **all P0 blockers** are closed:

| ID | Status |
|----|:------:|
| RB-P0-001 | ☐ |
| RB-P0-002 | ☐ |
| RB-P0-003 | ☐ |
| RB-P0-004 | ☐ |
| RB-P0-005 | ☐ |
| RB-P0-006 | ☐ |
| RB-P0-007 | ☐ |
| RB-P0-008 | ☐ |

---

*Updated 2026-07-22 · Review after each blocker closure · YALA Enterprise Program Office*
