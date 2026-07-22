# YALA Enterprise v1.0 — Release Blocker Audit

**Document ID:** BETA-BLOCKER-AUDIT-001  
**Date:** 2026-07-22  
**Scope:** Production code (`backend/taxi/`, `frontend/src/`, Capacitor apps)  
**Method:** Full-repo pattern scan + cross-reference with release docs  
**Excludes:** Test mocks, HTML `placeholder` attributes, `node_modules`, build artifacts

---

## Executive summary

| Category | Critical | High | Medium | Low |
|----------|:--------:|:----:|:------:|:---:|
| Code markers (TODO/FIXME/HACK) | 0 | 0 | 0 | 0 |
| Business-logic placeholders | 0 | 4 | 8 | 11 |
| Operational / release gates | 6 P0 | 6 P1 | 14 P2 | — |
| **Fixed during this audit** | — | 1 | — | — |

**Critical code blockers:** **0**  
**Closed Beta code blockers (if features in cohort):** **3 High** (referrals, merchant coords fallback, scheduled delivery broadcast)  
**Primary Closed Beta blockers:** **Operational** (device QA, deploy, backups, staging)

---

## 1. Pattern scan results

| Pattern | Production hits | Blocks beta? |
|---------|:-----------------:|:------------:|
| `TODO` | 0 | No |
| `FIXME` | 0 | No |
| `XXX` / `HACK` | 0 | No |
| Mock data in prod paths | 0 | No |
| Placeholder business logic | 24 items | See classification |
| Disabled feature flags | 7 | Mostly intentional |
| Temporary guards (`TEMP-PLATE`) | 5 | Intentional onboarding |

---

## 2. Critical (0)

No critical code findings. Core ride, payment, and auth paths contain no TODO/FIXME markers or mock APIs.

---

## 3. High (4 code + 6 ops)

### Code — High

| ID | Finding | Location | Impact | Status |
|----|---------|----------|--------|:------:|
| **H-1** | Dual referral systems (`promotions` + `referrals`) | `promotions/views.py`, `referrals/api/` | Inconsistent referral codes/credits (KNOWN-001) | Open — defer v1.1 if referrals excluded from beta |
| **H-2** | Merchant checkout defaults to Nouakchott coords when lat/lng omitted | `merchants/services/order_service.py` | Wrong dispatch if address not geocoded | **Mitigated** — coords wired; fallback remains if client omits |
| **H-3** | Rider cancel UI said "0 MRU" while backend charges 100 MRU | `frontend/src/locales/*/translation.json` | UX/legal mismatch | **FIXED** 2026-07-22 |
| **H-4** | Scheduled delivery WebSocket broadcast not wired | `deliveries/services/scheduling.py:91` | Due scheduled deliveries may not notify couriers | Open — exclude scheduled delivery from beta |

### Operational — High (P0/P1 release gates)

| ID | Finding | Blocks Closed Beta |
|----|---------|:------------------:|
| RB-P0-004 | No staging environment | **Yes** |
| RB-P0-002 | RC3 not deployed to production | **Yes** |
| RB-P0-003 | Phases 29–39 prod migrations pending | **Yes** |
| RB-P0-005 | Offsite backups not certified | **Yes** |
| RB-P1-001 | Physical device QA unsigned | **Yes** |
| RB-P1-003 | Delivery prod E2E 403 phone verify | **Yes** (if delivery in cohort) |

---

## 4. Medium (8)

| ID | Finding | Location | Beta impact |
|----|---------|----------|-------------|
| M-1 | Referral share URL uses placeholder domain `yala.app` | `promotions/serializers.py:177` | Broken share links |
| M-2 | Merchant order push failures swallowed | `merchants/services/notifications.py:63` | Silent notification miss |
| M-3 | Referral push notifications log-only | `referrals/services/*` | Documented acceptable v1.0 |
| M-4 | Driver earnings incentive breakdown placeholder | `drivers/services/earnings_service.py:371` | Totals correct |
| M-5 | Merchant VAT 5% hardcoded | `merchants/services/order_service.py:20` | Documented acceptable |
| M-6 | Play Integrity fail-open when verify unreachable | `frontend/src/native/playIntegrity.js:62` | Fraud risk; post-beta |
| M-7 | Firebase push disabled if package missing | `notifications/push.py:16` | Verify prod env |
| M-8 | API p95 ~4086 ms (pre-RC3 deploy) | Prod metrics | Gate B blocked |

---

## 5. Low (11 — acceptable for v1.0 beta)

| Item | Location | Notes |
|------|----------|-------|
| Smart pricing engine off by default | `smart_pricing_dispatch_service.py` | Falls back to MARKET pricing |
| API Gateway OAuth2 disabled | `settings.py` | API key auth used |
| TEMP vehicle at registration | `authapp/views.py` | Blocked from going online |
| Intercity `is_enabled` default false | `intercity/models.py` | Scoped feature |
| Location services default false | `locations/models.py` | Geo rollout control |
| Stripe guard when unconfigured | `payments/webhooks.py` | Fail-closed 503 |
| BI ETL warehouse | Phase 37 | v2 backlog |
| Partner portal UI | Phase 33 | API only |
| Rider loyalty mobile UI | Phase 32 | Admin/API only |
| Console logging in mobile bundles | Various frontend | Debug noise only |
| Play Integrity enforcement off | `settings.py` | RB-P2-004 |

---

## 6. Disabled code / feature flags

| Flag | Default | Intentional? |
|------|---------|:------------:|
| `PLAY_INTEGRITY_ENFORCE` | `false` | Yes — enable post-beta |
| `API_GATEWAY_OAUTH2_ENABLED` | `false` | Yes — Phase 38 |
| Smart engine toggles | `false` | Yes |
| Surge config `enabled` | `false` | Yes |
| Intercity module | `false` | Yes |

None block Closed Beta for core ride/delivery flows.

---

## 7. Classification vs Closed Beta

| Severity | Blocks Closed Beta? | Action |
|:--------:|:---------------------:|--------|
| Critical | Yes | None open in code |
| High (code) | Conditional | Exclude referrals/scheduled delivery OR fix H-1/H-4 |
| High (ops) | **Yes** | Close P0/P1 ops gates before invite |
| Medium | No (monitor) | Track in beta; fix if user-facing |
| Low | No | Backlog |

---

## 8. Fixes applied this audit

| Item | Change |
|------|--------|
| H-3 Cancellation fee copy | Updated EN/FR/AR translations to reflect 100 MRU fee when driver en route |

---

## Sign-off

| Reviewer | Status | Date |
|----------|:------:|------|
| Release Engineering | Complete | 2026-07-22 |
| QA Lead | ☐ Pending device execution | |
