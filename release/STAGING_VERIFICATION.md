# YALA Enterprise v1.0 — RC3 Staging Verification

**Document ID:** RC3-STAGING-001  
**Date:** 2026-07-22  
**Target:** `staging.yalataxi.live` (planned)  
**RC build:** v1.0.0-rc3 (post core-dev finalization)  
**Status:** **BLOCKED — staging environment not provisioned**

---

## Executive summary

| Item | Status |
|------|:------:|
| Staging environment exists | ❌ **NO** |
| RC3 deployed to staging | ❌ **NO** |
| Workflow verification on staging | ❌ **NOT RUN** |
| Production health (reference) | ✅ OK |

**Release Blocker:** RB-P0-004 — No staging environment. Staging deploy and workflow verification cannot proceed until infrastructure is provisioned.

---

## 1. Staging environment probe

| Endpoint | Result |
|----------|--------|
| `https://staging.yalataxi.live/api/health/ready/` | **Connection failed** — host not provisioned |
| `https://api.yalataxi.live/api/health/ready/` | **200 OK** — production reference baseline |

---

## 2. Deployment status

| Step | Staging | Production |
|------|:-------:|:----------:|
| Latest RC3 backend image built | ☐ | ☐ |
| Migrations applied (incl. 0020, 0023, merchants/0005, incentives/0005, safety/0004) | ☐ | ☐ |
| Frontend static deployed | ☐ | ☐ |
| Celery workers healthy | ☐ | ☐ |
| Redis / Channels operational | ☐ | ☐ |

**Note:** RC3 stabilization fixes (caching, indexes, merchant coords, webhook fix) are in source but **not confirmed deployed** to production.

---

## 3. Workflow verification matrix

Verification requires staging deploy. Status reflects current inability to execute on staging.

| Workflow | Auth | API | UI | E2E on staging | Notes |
|----------|:----:|:---:|:--:|:--------------:|-------|
| **Authentication** | — | — | — | ☐ | Login, OTP, JWT refresh |
| **Rider** | — | — | — | ☐ | Request, track, pay, rate |
| **Driver** | — | — | — | ☐ | Online, accept, arrive, complete |
| **Delivery** | — | — | — | ☐ | Create, assign courier, deliver |
| **Merchant** | — | — | — | ☐ | Checkout, mark ready, delivery link |
| **Admin** | — | — | — | ☐ | Operations, finance, trust & safety dashboards |
| **Real Estate** | N/A | N/A | N/A | N/A | **Not in v1.0 scope** — no Real Estate module in platform inventory |

---

## 4. Production reference checks (limited)

These checks were run against production API only — **not a substitute for staging verification**.

| Check | Result |
|-------|--------|
| Health readiness | ✅ `database: ok`, `redis: ok` |
| HTTPS certificate | ✅ Valid |
| CORS preflight (browser apps) | ☐ Not re-run this session |

---

## 5. Staging provisioning checklist (required before re-run)

1. Provision droplet or namespace mirroring production Docker Compose stack
2. DNS: `staging.yalataxi.live` → staging server
3. Copy `.env.production` → `.env.staging` with `SENTRY_ENVIRONMENT=staging`, staging DB, staging Stripe test keys
4. Deploy RC3 tag; run `python manage.py migrate`
5. Deploy frontend build to staging nginx
6. Execute workflow matrix above; attach screenshots to `release/staging-verification/<date>/`
7. Run perf smoke against staging before production promote

---

## 6. Release blockers

| ID | Severity | Description | Resolution |
|----|:--------:|-------------|------------|
| RB-P0-004 | **P0** | No staging environment | Provision `staging.yalataxi.live` |
| RB-P0-002 | **P0** | RC3 not deployed | Deploy after staging validation |
| RB-P0-003 | **P0** | Prod migrations pending | Maintenance window migrate |

---

## Sign-off

| Role | Staging verified | Date |
|------|:----------------:|------|
| DevOps | ☐ Blocked | |
| QA | ☐ Blocked | |
| Release Manager | ☐ Blocked | |
