# YALA Enterprise v1.0 — UAT Defect Log

**Document ID:** UAT-V1-DEFECTS-001  
**Date opened:** 2026-07-22  
**Status:** Active  
**Parent:** [UAT_TEST_PLAN.md](./UAT_TEST_PLAN.md)

**Severity:** P0 = blocks Closed Beta · P1 = fix before scale · P2 = backlog · P3 = cosmetic

---

## Summary

| Severity | Open | Fixed | Deferred |
|:--------:|:----:|:-----:|:--------:|
| P0 | 5 | 2 | 0 |
| P1 | 8 | 2 | 1 |
| P2 | 6 | 0 | 6 |
| P3 | 4 | 1 | 3 |
| **Total** | **23** | **5** | **10** |

---

## Defect register

| ID | Module | Severity | Description | Status | Owner | Resolution |
|----|--------|:--------:|-------------|:------:|-------|------------|
| UAT-D-001 | Operations / API Gateway | P0 | `Merchant.name` AttributeError in webhook signal (8 test errors) | **Fixed** | Engineering | Changed to `business_name` — `api_gateway/signals.py` |
| UAT-D-002 | Migrations | P0 | `makemigrations --check` failed — index/choice drift | **Fixed** | Engineering | Model Meta sync + `incentives/0005`, `safety/0004` |
| UAT-D-003 | Infrastructure | P0 | No staging environment | Open | DevOps | Provision `staging.yalataxi.live` |
| UAT-D-004 | Infrastructure | P0 | Offsite encrypted backups not certified | Open | DevOps | Run `offsite-backup-certification.sh` |
| UAT-D-005 | Mobile QA | P0 | Physical device QA not signed for RC3 builds | Open | QA Lead | Execute `DEVICE_QA_CHECKLIST.md` |
| UAT-D-006 | Platform | P0 | RC3 backend not deployed to production | Open | DevOps | Deploy + migrate Phases 29–39 |
| UAT-D-007 | Rider UI | P1 | Cancellation fee UI said 0 MRU; backend charges 100 MRU | **Fixed** | Engineering | EN/FR/AR translations updated 2026-07-22 |
| UAT-D-008 | Merchant | P1 | Hardcoded delivery coordinates in checkout | **Fixed** | Engineering | `destination_lat/lng` on order + frontend wiring |
| UAT-D-009 | Merchant | P1 | Silent delivery failure on mark-ready | **Fixed** | Engineering | Raises `MerchantOrderError`; delivery before status change |
| UAT-D-010 | Delivery | P1 | Prod courier phone verification returns 403 | Open | Engineering | Debug prod E2E; RB-P1-003 |
| UAT-D-011 | Mobile | P1 | RC4 driver go-online / offer failure on device | Open | Mobile QA | Retest after RC3 APK rebuild |
| UAT-D-012 | Mobile | P1 | RC4 courier accept button missing; API fallback only | Open | Mobile QA | Retest RC3 delivery app |
| UAT-D-013 | Performance | P1 | p95 API latency 4086 ms (target < 2000 ms) pre-RC3 deploy | Open | Engineering | Deploy RC3; re-run perf smoke |
| UAT-D-014 | Customer Growth | P1 | Dual referral systems (`promotions` + `referrals`) | Deferred | Product | v1.1 — exclude from beta messaging |
| UAT-D-015 | Security | P1 | Admin least-privilege audit incomplete | Open | Security | Review `executive_permissions.py` |
| UAT-D-016 | Security | P1 | Security UAT S-01–S-10 partial | Open | QA | Complete checklist |
| UAT-D-017 | CEO / Process | P1 | Executive sign-off not completed | Open | CEO | `UAT_SIGNOFF.md` |
| UAT-D-018 | Deliveries | P2 | Scheduled delivery WebSocket broadcast not wired | Open | Engineering | Exclude scheduled delivery from beta |
| UAT-D-019 | Promotions | P2 | Referral share URL uses placeholder domain `yala.app` | Open | Engineering | Update to production domain |
| UAT-D-020 | Merchants | P2 | Order push notification errors swallowed | Open | Engineering | Log + surface failure |
| UAT-D-021 | Referrals | P2 | Referral push notifications log-only | Deferred | Product | v1.1 |
| UAT-D-022 | Security | P2 | JWT not revoked on password change | Open | Engineering | v1.1 / RB-P2-011 |
| UAT-D-023 | Security | P2 | Play Integrity fail-open when unreachable | Open | Mobile | Post-beta RB-P2-004 |
| UAT-D-024 | Merchant Portal | P2 | Portal catalog UI partial | Open | Product | Admin-assisted for beta |
| UAT-D-025 | Rider | P2 | Loyalty mobile UI not in app | Deferred | Product | v1.1 KNOWN-003 |
| UAT-D-026 | Real Estate | P3 | Landlord/Tenant/Rent modules not in v1.0 | **N/A** | Product | Out of scope — Academy audience only |
| UAT-D-027 | Merchants | P3 | VAT rate hardcoded 5% | Accepted | Finance | Documented v1.0 placeholder |
| UAT-D-028 | Drivers | P3 | Earnings incentive breakdown placeholder | Accepted | Product | Totals correct |
| UAT-D-029 | Frontend | P3 | Console.log in production mobile bundles | Open | Mobile | Cleanup post-beta |

---

## Defect intake (manual UAT)

_Add rows during UAT-3 execution._

| ID | Module | Severity | Description | Status | Owner | Resolution |
|----|--------|:--------:|-------------|:------:|-------|------------|
| | | | | | | |

---

## Triage rules

1. **P0** — Stop UAT; fix before next scenario batch.
2. **P1** — Log; may proceed with CEO-approved mitigation for Closed Beta ≤25 users.
3. **P2/P3** — Log; do not block beta start unless user-facing on critical path.

---

## Change log

| Date | Change |
|------|--------|
| 2026-07-22 | Initial log from RC3 validation + closed beta prep |
| 2026-07-22 | UAT-D-007, D-008, D-009 marked Fixed |
