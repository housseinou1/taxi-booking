# YALA Bug & Technical Debt Register

**Document ID:** PM-04  
**Version:** 1.0.0  
**Last updated:** 2026-07-21  
**Synchronized with:** `release/KNOWN_ISSUES_v1.0.0.md` · `03_RELEASE_HISTORY.md` · `06_PROJECT_DASHBOARD.md`

---

## Summary

| Category | Open | Closed (v1.0.0) |
|----------|:----:|:---------------:|
| Open bugs (P0–P2) | 12 | 7 (RC3 resolved) |
| Known issues / ops | 6 | — |
| Performance improvements | 5 | 6 (RC3 source) |
| Security improvements | 4 | 1 (RC3) |
| Technical debt items | 11 | — |

---

## Open bugs

| ID | Title | Module | Priority | Owner | Target release | Status |
|----|-------|--------|:--------:|-------|:--------------:|--------|
| BUG-P0-001 | Physical device QA not signed off | Rider / Driver / Delivery | P0 | QA Lead | Production | Open |
| BUG-P0-002 | Offsite encrypted backups not configured | Infrastructure | P0 | DevOps | Production | Open |
| BUG-P1-001 | API p95 latency 4086 ms (target < 2000 ms) | Platform / API | P1 | Engineering Lead | Production | Open — RC3 fix not deployed |
| BUG-P1-002 | Google Play manual attestation incomplete | Store | P1 | Product Lead | Production | Open |
| BUG-P1-003 | Apple App Store not submitted | Store | P1 | Product Lead | v1.1 | Open |
| BUG-P1-004 | Pilot cohort under-recruited | Operations | P1 | Operations Manager | Closed Beta | Open |
| BUG-P1-005 | Delivery production E2E not certified (403 phone verify) | Delivery | P1 | QA Lead | Closed Beta | Open |
| BUG-P1-006 | RC3 backend + mobile fixes not deployed | Platform | P1 | DevOps / Mobile | Closed Beta | Open |
| BUG-P2-001 | No PgBouncer / connection pooler | Infrastructure | P2 | DevOps | v1.1 | Open |
| BUG-P2-002 | Redis shared DB index 0 (broker/cache/channels) | Infrastructure | P2 | DevOps | v1.1 | Open |
| BUG-P2-003 | No Celery Flower / queue depth alerting | Infrastructure | P2 | DevOps | v1.1 | Open |
| BUG-P2-004 | Play Integrity enforcement disabled | Security | P2 | Security Lead | v1.1 | Open |

---

## Known issues (operational / product)

| ID | Issue | Impact | Workaround | Owner | Target release |
|----|-------|--------|------------|-------|:--------------:|
| KNOWN-001 | Dual referral systems (`referrals` + `promotions` legacy) | Inconsistent referral rewards | Legacy path active on ride complete | Engineering | v1.1 |
| KNOWN-002 | Referral signup not wired to auth registration | Missed referral attribution | Manual admin correction | Engineering | v1.1 |
| KNOWN-003 | Rider loyalty UI not in mobile app | Loyalty invisible to riders | API `/loyalty/me/` only | Product | v1.1 |
| KNOWN-004 | Partner self-service portal has API only | Partners need admin assist | Ops creates partners | Regional Ops | v1.1 |
| KNOWN-005 | Marketing campaign execution (push/email) not automated | Campaigns are CRUD-only | Manual ops outreach | Growth | v2.0 |
| KNOWN-006 | 7 core ride/driver/delivery unit tests failing (fixture drift) | CI not fully green | Operations tests pass (82/82) | Engineering Lead | Production |

---

## Performance improvements

| ID | Improvement | Current state | Expected gain | Owner | Target release | Status |
|----|-------------|---------------|---------------|-------|:--------------:|--------|
| PERF-001 | Deploy RC3 ops dashboard caching (45 s Redis) | In source | −40–60% admin p95 | Engineering | Closed Beta | **Ready — not deployed** |
| PERF-002 | Deploy RC3 database indexes | In source | Faster finance/fleet queries | Engineering | Closed Beta | **Ready — not deployed** |
| PERF-003 | Re-measure p95 after RC3 deploy | Not run | Validate < 2000 ms | Engineering | Production | Open |
| PERF-004 | Implement PgBouncer connection pooling | Not started | Higher concurrent capacity | DevOps | v1.1 | Open |
| PERF-005 | Split Redis logical databases | Not started | Isolation & stability | DevOps | v1.1 | Open |
| PERF-006 | Add staging environment for load tests | Not started | Safer perf validation | DevOps | Production | Open |

---

## Security improvements

| ID | Improvement | Risk if deferred | Owner | Target release | Status |
|----|-------------|------------------|-------|:--------------:|--------|
| SEC-001 | Configure offsite encrypted backups | Critical data loss | DevOps | Production | Open |
| SEC-002 | Enable Play Integrity (`PLAY_INTEGRITY_ENFORCE=true`) | Device fraud | Security Lead | v1.1 | Open |
| SEC-003 | JWT revocation on password change | Token theft | Engineering | v1.1 | Open |
| SEC-004 | Least-privilege admin role audit | Over-broad access | Security Lead | Production | Open |
| SEC-005 | Consolidate referral fraud to single system | Duplicate reward paths | Engineering | v1.1 | Open |

---

## Technical debt

| ID | Debt item | Module | Business impact | Effort | Owner | Target release | Priority |
|----|-----------|--------|-----------------|:------:|-------|:--------------:|:--------:|
| TD-001 | Legacy `promotions.ReferralCode` vs modern `referrals` app | Growth | Wrong referral payouts | M | Engineering | v1.1 | P1 |
| TD-002 | `record_referral_signup()` never called from auth | Referrals | Lost referral conversions | S | Engineering | v1.1 | P1 |
| TD-003 | `apply_credit_to_fare()` not wired to payment flow | Referrals | Credits not applied | M | Engineering | v1.1 | P1 |
| TD-004 | Referral push notifications are logger placeholders | Referrals | Poor referrer UX | S | Engineering | v1.1 | P2 |
| TD-005 | Merchant `city` is CharField not FK | Merchants | Weak geo analytics | M | Engineering | v1.1 | P2 |
| TD-006 | Hardcoded destination lat/lng in merchant order checkout | Merchants | Wrong delivery dispatch | S | Engineering | v1.1 | P1 |
| TD-007 | Silent delivery creation failure on merchant ready | Merchants | Orders stuck | S | Engineering | v1.1 | P1 |
| TD-008 | No staging environment | Platform | High deploy risk | L | DevOps | Production | P0 |
| TD-009 | Core unit test fixtures outdated | QA | CI false negatives | M | Engineering | Production | P1 |
| TD-010 | BI data warehouse — design only, ETL not built | BI | Manual reporting | L | Engineering | v2.0 | P2 |
| TD-011 | Apple iOS apps not in release train | Mobile | 50% market excluded | XL | Mobile | v1.1 | P1 |

**Effort key:** S = days · M = 1–2 weeks · L = 3–4 weeks · XL = 1+ months

---

## Resolved in v1.0.0 / RC3

| ID | Issue | Resolution | Release |
|----|-------|------------|---------|
| RES-001 | Surge monitor N+1 queries | Fixed in RC3 source | RC3 |
| RES-002 | AI dashboard regenerates recommendations on every GET | Fixed in RC3 source | RC3 |
| RES-003 | Finance chart 120-query loop | Single aggregation in RC3 | RC3 |
| RES-004 | Fleet dashboard double driver scoring | Deduplicated in RC3 | RC3 |
| RES-005 | Rider cancel leaves stale WS/polling state | Fixed in RC3 mobile source | RC3 |
| RES-006 | Driver online shows red error banner | Fixed in RC3 mobile source | RC3 |
| RES-007 | Audit IP ignores forwarded-for trust | Fixed in RC3 source | RC3 |

---

## Cross-references

| Document | Link |
|----------|------|
| Known issues (release) | `release/KNOWN_ISSUES_v1.0.0.md` |
| Risk register | `handover/05_RISK_REGISTER.md` |
| Launch blockers | `release/sprint1/LAUNCH_BLOCKER_TRACKER.md` |
| Feature matrix | [02_MASTER_FEATURE_MATRIX.md](./02_MASTER_FEATURE_MATRIX.md) |
| v2 backlog | [05_VERSION_2_BACKLOG.md](./05_VERSION_2_BACKLOG.md) |

---

*Review weekly during Closed Beta · Escalate P0 items to CEO daily standup*
