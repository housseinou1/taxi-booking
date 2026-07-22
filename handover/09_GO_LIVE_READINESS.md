# Yala Enterprise Handover — Go-Live Readiness

**Document ID:** HANDOVER-09  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Master launch checklist

Combines infrastructure, applications, QA, stores, operations, finance, support, security, legal, and CEO approval gates.

**Current authorization (per `release/LAUNCH_DECISION.md`):**
- **Closed Beta (Nouakchott):** GO with conditions
- **Public Launch:** NO-GO until P0 blockers closed

**Launch readiness score:** 78 / 100 (`project-management/06_PROJECT_DASHBOARD.md`)

---

## 1. Infrastructure

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 1.1 | Production server provisioned | ☐ | DO Droplet `142.93.99.142` |
| 1.2 | Docker and Docker Compose installed | ☐ | |
| 1.3 | `docker-compose.yml` deployed — 9+ services healthy | ☐ | |
| 1.4 | PostgreSQL 15 with healthchecks | ☐ | `max_connections=250` |
| 1.5 | Redis 7 with AOF persistence | ☐ | |
| 1.6 | Django/Daphne replicas (3) healthy | ☐ | `/api/health/ready/` |
| 1.7 | Celery workers (2) + beat running | ☐ | `inspect ping` |
| 1.8 | nginx reverse proxy + SSL | ☐ | `api.yalataxi.live`, `www.yalataxi.live` |
| 1.9 | SSL certificates valid > 14 days | ☐ | Let's Encrypt |
| 1.10 | Auto-renewal configured | ☐ | Certbot cron |
| 1.11 | DNS A records correct | ☐ | |
| 1.12 | Firewall (22, 80, 443 only) | ☐ | |
| 1.13 | **Offsite backups configured & verified** | ☐ | **P0 blocker** |
| 1.14 | Monitoring and alerting active | ☐ | `engineering/06_MONITORING_RUNBOOK.md` |
| 1.15 | Staging environment deployed | ☐ | Recommended before public launch |

---

## 2. Applications

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 2.1 | Backend migrations applied (all phases) | ☐ | **Phases 29–33 may be pending on prod** |
| 2.2 | Static files collected | ☐ | `collectstatic --noinput` |
| 2.3 | Admin portal built and deployed | ☐ | `npm run build` |
| 2.4 | Mobile apps built and signed | ☐ | Rider 1.2.7 / Driver 1.2.23 / Delivery 1.0.4 |
| 2.5 | Version codes bumped for release | ☐ | |
| 2.6 | FCM push configured and tested | ☐ | |
| 2.7 | Google Maps API key active and restricted | ☐ | |
| 2.8 | Payment providers configured | ☐ | Stripe + mobile money |
| 2.9 | SMS provider tested (OTP) | ☐ | |
| 2.10 | Email/SMTP configured | ☐ | |
| 2.11 | RC3 backend deployed | ☐ | Perf and stability fixes |
| 2.12 | All admin centers accessible per role | ☐ | CEO Master, Trust & Safety, Merchant, Partner, Loyalty |

---

## 3. QA

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 3.1 | Operations test suite green | ☑ | 82/82 pass |
| 3.2 | Core unit tests green | ☐ | 7 fixture failures remain |
| 3.3 | Frontend build clean | ☑ | `npm run build` succeeds |
| 3.4 | **Physical device QA sign-off** | ☐ | **P0 blocker** |
| 3.5 | E2E ride flow tested on device | ☐ | request → complete → payment |
| 3.6 | E2E delivery flow tested | ☐ | |
| 3.7 | Wallet deposit/withdrawal tested | ☐ | |
| 3.8 | SOS and Trust & Safety tested | ☐ | ack < 2 min |
| 3.9 | Incentive campaign + payout tested | ☐ | |
| 3.10 | Performance/load test (p95 < 2s) | ☐ | |
| 3.11 | Merchant order → delivery flow | ☐ | Phase 31 |
| 3.12 | Loyalty earn/redeem API tested | ☐ | Phase 33 — mobile UI pending |

---

## 4. Stores

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 4.1 | Google Play Developer account active | ☐ | |
| 4.2 | Privacy policy URL live | ☑ | `https://www.yalataxi.live/privacy` |
| 4.3 | Terms URL live | ☑ | `https://www.yalataxi.live/terms` |
| 4.4 | Google Play Data Safety form complete | ☐ | |
| 4.5 | Account deletion verified and declared | ☐ | |
| 4.6 | Store screenshots uploaded | ☐ | |
| 4.7 | Release notes prepared | ☑ | `release/RELEASE_NOTES_v1.0.0.md` |
| 4.8 | Production AAB signed and uploaded | ☐ | Closed testing track |
| 4.9 | Closed testing track promoted | ☐ | |
| 4.10 | Apple App Store prepared | ☐ | Optional v1.0; required for iOS |

---

## 5. Operations

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 5.1 | Operations Manager assigned | ☐ | |
| 5.2 | Launch war room established | ☐ | WhatsApp channel |
| 5.3 | Driver pipeline ready (cap 20) | ☐ | `operations/05_DRIVER_OPERATIONS_MANUAL.md` |
| 5.4 | Courier pipeline ready (cap 10) | ☐ | `operations/06_DELIVERY_OPERATIONS_MANUAL.md` |
| 5.5 | Rider invitations prepared (cap 100) | ☐ | |
| 5.6 | Operations Command Center tested | ☐ | `/admin/operations-command` |
| 5.7 | Incident runbook reviewed | ☐ | `operations/02_*` §6 |
| 5.8 | Escalation contacts documented | ☐ | `handover/06_SUPPORT_MATRIX.md` |
| 5.9 | SOPs distributed to team | ☐ | `operations/` folder |
| 5.10 | Beta runbook activated | ☐ | `release/BETA_OPERATIONS_RUNBOOK.md` |

---

## 6. Finance

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 6.1 | Reconciliation process documented | ☑ | `operations/03_FINANCE_OPERATIONS_MANUAL.md` |
| 6.2 | Withdrawal approval workflow tested | ☐ | Finance Ops Center |
| 6.3 | Incentive payout workflow tested | ☐ | Incentive Engine |
| 6.4 | Merchant settlement workflow tested | ☐ | Phase 31 |
| 6.5 | Partner settlement workflow tested | ☐ | Phase 32 |
| 6.6 | Payout float/capital allocated | ☐ | |
| 6.7 | Stripe/mobile money accounts active | ☐ | |

---

## 7. Support

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 7.1 | Support team trained | ☐ | `operations/04_CUSTOMER_SUPPORT_MANUAL.md` |
| 7.2 | Support Center access verified | ☐ | `/admin/support` |
| 7.3 | WhatsApp support line active | ☐ | |
| 7.4 | FAQ / quick-reply templates loaded | ☐ | |
| 7.5 | Support roster for launch week | ☐ | |
| 7.6 | SOS escalation drill completed | ☐ | `operations/07_TRUST_AND_SAFETY_MANUAL.md` |

---

## 8. Security

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 8.1 | Strong unique `DJANGO_SECRET_KEY` | ☐ | |
| 8.2 | `DEBUG=False` in production | ☐ | |
| 8.3 | `ALLOWED_HOSTS` restricted | ☐ | |
| 8.4 | SSL/TLS hardening (HSTS) | ☐ | |
| 8.5 | DRF + nginx rate limiting | ☐ | `engineering/04_SECURITY_ARCHITECTURE.md` |
| 8.6 | JWT refresh rotation + blacklist | ☐ | |
| 8.7 | Audit logging on admin mutations | ☐ | |
| 8.8 | No secrets in repository | ☐ | |
| 8.9 | Firebase/Stripe keys restricted | ☐ | |
| 8.10 | Role permissions reviewed | ☐ | `executive_permissions.py` |
| 8.11 | Admin 2FA policy defined | ☐ | `admin_2fa` app |

---

## 9. Legal

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 9.1 | Privacy policy final (EN/FR/AR) | ☐ | |
| 9.2 | Terms of service final (EN/FR/AR) | ☐ | |
| 9.3 | Driver agreement current version | ☐ | E-sign flow tested |
| 9.4 | Data retention policy documented | ☐ | Compliance module |
| 9.5 | OSS license attribution (SBOM) | ☐ | |
| 9.6 | SMS compliance verified | ☐ | |
| 9.7 | Compliance & Governance policies reviewed | ☐ | Phase 36 |

---

## 10. CEO approval

| # | Item | Status | Notes |
|---|------|:------:|-------|
| 10.1 | Launch decision reviewed | ☐ | `release/LAUNCH_DECISION.md` |
| 10.2 | Risk register reviewed | ☐ | `handover/05_RISK_REGISTER.md` |
| 10.3 | Go-live checklist approved | ☐ | This document |
| 10.4 | Beta caps approved | ☐ | 20 / 10 / 100 · 14 days |
| 10.5 | Handover package acknowledged | ☐ | `handover/README.md` |
| 10.6 | Final GO/NO-GO declared | ☐ | CEO sign-off |

---

## Launch gate summary

| Gate | Requirement | Status |
|------|-------------|--------|
| **Closed Beta** | §1.1–1.12, 2.1–2.10, 3.5–3.8, 4.1–4.9, 5.1–5.10, 6.1–6.4, 7.1–7.6, 8.1–8.10, 9.1–9.3, 10.1–10.6 | **GO with conditions** |
| **Public Launch** | All above + 1.13–1.15, 3.1–3.2, 3.10, 4.10, 9.4–9.7 | **NO-GO** |

### P0 blockers for public launch

1. Physical device QA unsigned
2. Offsite backups not configured

---

## Cross-references

- Launch decision: `release/LAUNCH_DECISION.md`
- Day 1 checklist: `release/DAY1_OPERATIONS_CHECKLIST.md`
- Beta runbook: `release/BETA_OPERATIONS_RUNBOOK.md`
- Exit criteria: `release/CLOSED_BETA_EXIT_CRITERIA.md`
- Risk register: `handover/05_RISK_REGISTER.md`
- Support matrix: `handover/06_SUPPORT_MATRIX.md`
- Project dashboard: `project-management/06_PROJECT_DASHBOARD.md`
