# YALA Enterprise v1.0 — Closed Beta Checklist

**Document ID:** BETA-CHECKLIST-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-rc3 → Closed Beta  
**Duration:** 14 days (per `BETA_SUCCESS_METRICS.md`)  
**Governance:** [CLOSED_BETA_RUNBOOK.md](./CLOSED_BETA_RUNBOOK.md) · [CLOSED_BETA_EXIT_CRITERIA.md](./CLOSED_BETA_EXIT_CRITERIA.md)

---

## How to use

Mark ☐ → ✅ only with verification evidence (date, initials, link to report). All **mandatory** items must be ✅ before first beta invite.

---

## Release information

| Field | Value |
|-------|-------|
| Version | v1.0.0-rc3 |
| API | https://api.yalataxi.live |
| Admin | https://yalataxi.live/admin |
| Pilot city | Nouakchott |
| Recommended cohort | **25 users** (see CLOSED_BETA_READINESS.md) |

---

## 1. Infrastructure

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| I-01 | Production API health green | ✅ | ✅ | Health probe 2026-07-22 |
| I-02 | Staging environment provisioned | ✅ | ❌ | RB-P0-004 |
| I-03 | RC3 backend deployed to production | ✅ | ❌ | RB-P0-002 |
| I-04 | All migrations applied (Phases 29–39 + RC3) | ✅ | ❌ | RB-P0-003 |
| I-05 | Docker compose 9 services Up | ✅ | ☐ | `docker compose ps` on server |
| I-06 | SSL certificates valid | ✅ | ☐ | Let's Encrypt |
| I-07 | Celery workers + beat healthy | ✅ | ☐ | Health/readiness + worker ping |
| I-08 | Redis + PostgreSQL healthy | ✅ | ✅ | Health endpoint |
| I-09 | Frontend static deployed | ✅ | ☐ | Post `npm run build` deploy |
| I-10 | Soft launch caps configured | ✅ | ☐ | `configure_soft_launch` |

---

## 2. Monitoring

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| M-01 | API health monitoring (cron or external) | ✅ | ☐ | `PRODUCTION_MONITORING_RC1.md` |
| M-02 | Launch Hub dashboards accessible | ✅ | ☐ | `/admin/launch` |
| M-03 | Operations Center live metrics | ✅ | ☐ | Post-migration smoke |
| M-04 | Beta KPI dashboard wired | ✅ | ☐ | `BETA_METRICS_DASHBOARD.md` |
| M-05 | Alert routing configured | ✅ | ☐ | Launch alerts |
| M-06 | Perf baseline recorded post-RC3 | ✅ | ❌ | RB-P0-008 |

---

## 3. Logging

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| L-01 | Django application logs aggregated | ✅ | ☐ | Docker logs / server |
| L-02 | Celery task failure visibility | ✅ | ☐ | Worker logs |
| L-03 | Audit log API functional | ✅ | ✅ | `/security/admin/audit-logs/` |
| L-04 | Security event logging active | ✅ | ✅ | `audit_service.py` |
| L-05 | Daily CEO report cron | ✅ | ☐ | `soft-launch-daily-reports.sh` |

---

## 4. Crash reporting

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| C-01 | Sentry DSN configured (backend) | Recommended | ☐ | `.env.production` |
| C-02 | Mobile crash reporting (Play Console vitals) | ✅ | ☐ | Play Console |
| C-03 | Device QA crash section executed | ✅ | ❌ | `DEVICE_QA_CHECKLIST.md` |
| C-04 | Support ticket tag `crash` defined | ✅ | ☐ | Runbook |

---

## 5. Backups

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| B-01 | Daily encrypted DB backup running | ✅ | ☐ | `backup-encrypted.sh` |
| B-02 | Offsite backup replication | ✅ | ❌ | RB-P0-005 |
| B-03 | Restore drill within 90 days | ✅ | ❌ | `backup-restore-drill.sh` |
| B-04 | Media backup included | ✅ | ☐ | Script review |
| B-05 | Backup monitor cron active | ✅ | ☐ | `backup-monitor.sh` |

---

## 6. Support process

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| S-01 | Support channel live (WhatsApp/email) | ✅ | ☐ | Runbook |
| S-02 | P0 response SLA < 30 min documented | ✅ | ☐ | `POST_LAUNCH_SUPPORT_PROCEDURES.md` |
| S-03 | P1 response SLA < 4 h documented | ✅ | ☐ | Same |
| S-04 | Known issues register current | ✅ | ☐ | `UAT_KNOWN_ISSUES_REGISTER.md` |
| S-05 | Bug report template available | ✅ | ✅ | `physical-device-qa/BUG_REPORT_TEMPLATE.md` |
| S-06 | On-call rotation assigned | ✅ | ☐ | Ops manager |

---

## 7. Rollback plan

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| R-01 | Rollback plan reviewed | ✅ | ✅ | `ROLLBACK_PLAN.md` |
| R-02 | Previous stable tag identified | ✅ | ☐ | Git tag |
| R-03 | DB rollback strategy documented | ✅ | ✅ | Rollback plan |
| R-04 | Rollback owner assigned | ✅ | ☐ | Release owner field |
| R-05 | Rollback drill discussed | Recommended | ☐ | Tabletop |

---

## 8. Release notes

| # | Item | Mandatory | Status | Evidence |
|---|------|:---------:|:------:|----------|
| N-01 | Release notes drafted | ✅ | ✅ | `RELEASE_NOTES_v1.0.0.md` |
| N-02 | RC3 changelog updated | ✅ | ☐ | `CHANGELOG_v1.0.0.md` |
| N-03 | Known limitations documented | ✅ | ✅ | `KNOWN_ISSUES_v1.0.0.md` |
| N-04 | Beta participant comms template | ✅ | ☐ | Runbook § onboarding |
| N-05 | App store release notes (Android) | ✅ | ☐ | Play Console |

---

## 9. Pre-invite gates (mandatory summary)

| Gate | Status |
|------|:------:|
| 235/235 core tests pass | ✅ |
| RC3 validation report complete | ✅ |
| Device QA checklist executed | ❌ |
| Executive sign-off | ❌ |
| Offsite backup certified | ❌ |
| Staging verified | ❌ |
| Cancellation fee copy fixed | ✅ |

**Mandatory items complete:** **4 / 18 infrastructure+ops sections** (partial — code gates only)

---

## Sign-off

| Role | Ready to invite beta users | Date | Signature |
|------|:------------------------:|------|-----------|
| Engineering Lead | ☐ | | |
| DevOps Lead | ☐ | | |
| QA Lead | ☐ | | |
| Operations Manager | ☐ | | |
| CEO / Program Office | ☐ | | |

**Do not send beta invites until all mandatory ☐ items above are ✅.**
