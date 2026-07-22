# Yala Enterprise Handover — Risk Register

**Document ID:** HANDOVER-05  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Legend

| Field | Values |
|-------|--------|
| **Likelihood** | Low · Medium · High |
| **Impact** | Low · Medium · High · Critical |
| **Owner** | Role responsible for mitigation |

**Review cadence:** Weekly during closed beta · Monthly post-launch

---

## Technical risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|:----------:|:------:|------------|-------|
| T-01 | Core ride/driver/delivery unit tests fail (7 fixture-related) | Medium | High | Update test setups for current document/signature/driver-code guards; enforce green CI before public launch | Engineering Lead |
| T-02 | p95 API latency ~4s; RC3 fixes not load-tested in production | Medium | High | Run `launch-perf-smoke.py` post-deploy; caching, indexes, PgBouncer | Engineering Lead |
| T-03 | PostgreSQL `max_connections=250` saturation under launch traffic | Medium | Medium | PgBouncer; monitor `pg_stat_activity`; scale vertically | DevOps |
| T-04 | Redis DB 0 shared (broker, results, cache, Channels) | Medium | Medium | Split logical DBs or separate instances; monitor memory | DevOps |
| T-05 | WebSocket scalability on single Redis | Medium | Medium | Redis Cluster or dedicated Channels backend if concurrent tracking exceeds capacity | Engineering Lead |
| T-06 | Celery queue depth/failures not visible without Flower | Medium | Medium | Deploy Flower or queue monitoring; alert on failure rate | DevOps |
| T-07 | **Offsite backups not verified** | High | Critical | Configure S3/DO Spaces; weekly restore drill; document RTO/RPO | DevOps |
| T-08 | No staging environment | Medium | High | Provision `staging.yalataxi.live` mirroring production compose | Engineering Lead |
| T-09 | Phases 29–33 production migrations not applied | Medium | High | Run `migrate` during maintenance window; verify Trust & Safety, Merchant, Partner, Loyalty | DevOps |
| T-10 | RC3 backend/mobile fixes not deployed to production | Medium | High | Deploy RC3 tag; rebuild and distribute mobile APKs | Engineering Lead |
| T-11 | BI dashboards query primary DB under load | Low | Medium | Implement Phase 37 read replica / warehouse design | Engineering Lead |
| T-12 | Dual referral systems (`referrals` vs legacy `promotions`) | Medium | Medium | Consolidate in v1.1 per `project-management/05_VERSION_2_BACKLOG.md` | Growth / Engineering |

---

## Operational risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|:----------:|:------:|------------|-------|
| O-01 | Pilot cohort too small to validate at scale | Medium | Medium | Recruit to caps: 20 drivers, 10 couriers, 100 riders | Operations Manager |
| O-02 | Driver document review backlog | High | Medium | Pre-approve before launch; add ops staff week 1 | Operations Manager |
| O-03 | Support not trained on SOS/incident flows | Medium | High | Drill using `operations/07_TRUST_AND_SAFETY_MANUAL.md` | Support Lead |
| O-04 | Fraud / fake rides during beta | Medium | Medium | Fraud flags, Trust & Safety monitoring, account suspension | Security Lead |
| O-05 | GPS issues cause failed pickups | High | Medium | Location updates required; PIN fallback; monitor tickets | Engineering Lead |
| O-06 | Merchant order → delivery creation silent failure | Medium | Medium | Monitor Merchant Platform alerts; optional fix in backlog | Operations Manager |
| O-07 | Ops team unfamiliar with new handover/SOP docs | Low | Medium | Onboard via `operations/10_NEW_EMPLOYEE_ONBOARDING.md` | Operations Manager |

---

## Business risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|:----------:|:------:|------------|-------|
| B-01 | Apple App Store not submitted — no iOS riders | High | Medium | Submit Rider iOS after Android beta stable; or defer iOS formally | Product Lead |
| B-02 | Google Play Data Safety / account deletion incomplete | Medium | High | Complete Play Console; verify in-app deletion flow | Product Lead |
| B-03 | Competitor price pressure | Medium | Medium | Smart Pricing & Dispatch; driver incentives | CEO / Product |
| B-04 | Public launch delayed by P0 blockers | Medium | High | Maintain limited beta; weekly launch review | CEO |
| B-05 | Negative early reviews from crashes | Medium | High | Physical QA sign-off before cohort expansion | QA Lead |
| B-06 | Partner/franchise settlements untested at scale | Low | Medium | Pilot one partner territory during beta | Finance Lead |

---

## Security risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|:----------:|:------:|------------|-------|
| S-01 | Weak/default `DJANGO_SECRET_KEY` in dev | Low | Critical | Strong unique key in prod; settings validation when `DEBUG=False` | Engineering Lead |
| S-02 | Secrets committed to repository | Low | Critical | Audit git history; rotate exposed keys; vault-only secrets | Security Lead |
| S-03 | JWT not revoked on password change / device theft | Medium | High | Token blacklist on password change; device binding for sensitive actions | Security Lead |
| S-04 | Rate limits not stress-tested end-to-end | Medium | Medium | Load-test auth; tune nginx + DRF; monitor 429s | Engineering Lead |
| S-05 | Admin permissions too broad | Low | High | Review `executive_permissions.py`; least privilege; quarterly audit | Security Lead |
| S-06 | Driver/rider abuse or harassment | Medium | Critical | Trust & Safety Center, SOS, incident runbook, suspension workflow | Operations Manager |
| S-07 | API Gateway partner keys compromised | Low | High | Key rotation, IP whitelist, per-key rate limits, audit logs | Security Lead |

---

## Compliance risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|----|------|:----------:|:------:|------------|-------|
| C-01 | Privacy/terms missing FR/AR localization | Medium | Medium | Localize pages; link from stores | Product Lead |
| C-02 | Data retention policy not fully implemented | Medium | High | Document retention; implement purge jobs; Compliance module | Security Lead |
| C-03 | PCI scope for card payments | Medium | High | Stripe handles cards; no raw card storage; document PCI scope | Finance Lead |
| C-04 | Local telecom/SMS regulations | Medium | Medium | Registered sender ID; consent logging; opt-out | Operations Manager |
| C-05 | Policy documents in Compliance module not legally reviewed | Low | Medium | Legal review of `PolicyDocument` entries before public launch | Legal / CEO |
| C-06 | Open-source license attribution incomplete | Low | Low | Generate SBOM / `THIRD_PARTY_LICENSES.txt` | Engineering Lead |

---

## Risk heat map (summary)

```
Impact →
         Low    Medium    High    Critical
L  Low   C-06   C-05      S-01    —
i  Med   T-11   T-03,T-04 T-01    S-06
k  High  —      B-03      T-07    T-07 (offsite backup)
```

**Top 3 risks to address immediately:** T-07 (offsite backups), OUT-P0-03 (physical QA), T-09 (prod migrations)

---

## Cross-references

- Launch decision: `release/LAUNCH_DECISION.md`
- Known issues: `release/KNOWN_ISSUES_v1.0.0.md`
- Go-live checklist: `handover/09_GO_LIVE_READINESS.md`
- BCP: `operations/09_BUSINESS_CONTINUITY_PLAN.md`
- Security architecture: `engineering/04_SECURITY_ARCHITECTURE.md`
- Bug/debt tracker: `project-management/04_BUG_AND_TECH_DEBT.md`
