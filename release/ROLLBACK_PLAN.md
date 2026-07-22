# YALA Enterprise — Rollback Plan

**Document ID:** RELEASE-ROLLBACK-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active  
**Governance:** [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) · [QUALITY_GATES.md](../docs/QUALITY_GATES.md) · [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md)

---

## Purpose

This document defines **standard rollback procedures** for YALA Enterprise releases. A rollback plan must be documented and confirmed **before every production deployment** (Execution Policy Stage 9, Quality Gate 10).

**Principle:** Roll back the application first; restore the database only when schema/data corruption requires it. Database rollback is destructive and slower — prefer forward-fix when safe.

---

## Rollback Decision Matrix

| Symptom | Severity | Recommended action | Target RTO |
|---------|:--------:|-------------------|:----------:|
| Health check failing after deploy | P0 | Application rollback immediately | < 15 min |
| 5xx spike on critical APIs | P0 | Application rollback; investigate | < 15 min |
| Migration failure mid-apply | P0 | Stop writers; assess; rollback app or restore DB | < 1 hour |
| Performance regression (p95 > 2× baseline) | P1 | Rollback or hotfix; CEO notify if beta/GA | < 30 min |
| Mobile crash on launch path | P0 | Halt store rollout; distribute previous APK | < 2 hours |
| Admin UI broken (non-critical) | P2 | Forward fix preferred; rollback if widespread | < 4 hours |
| Data corruption detected | P0 | Stop writers; DB restore from backup | < 4 hours |

**Escalation:** P0 rollbacks notify CEO and Operations Manager immediately. Follow [INCIDENT_RESPONSE.md](../docs/INCIDENT_RESPONSE.md).

---

## 1. Deployment Rollback

### Prerequisites

- Previous known-good Docker image tag or git commit SHA documented in release checklist
- SSH access to production host (`engineering/05_DEPLOYMENT_GUIDE.md`)
- Rollback owner identified (DevOps Lead)

### Backend rollback (Docker Compose)

Production host: DigitalOcean · Compose project `yala`

```bash
# 1. Identify previous tag (document before every deploy)
export PREVIOUS_TAG=v1.0.0-rc2   # example — use actual previous tag
export FAILED_TAG=v1.0.0-rc3

# 2. Checkout previous tag on server
cd /opt/yala
git fetch --tags
git checkout $PREVIOUS_TAG

# 3. Rebuild and restart application containers (not database)
docker compose -p yala build django celery-worker celery-beat
docker compose -p yala up -d django celery-worker celery-beat

# 4. Verify health
curl -fsS https://api.yalataxi.live/api/health/ready/

# 5. Smoke test critical paths
#    - POST /auth/login/ (QA account)
#    - GET /operations/executive/dashboard/ (staff token)
#    - Ride lifecycle script if available
```

### Frontend rollback

Frontend is served via nginx bind mount from host build directory.

```bash
# Option A: Rebuild from previous tag (recommended)
cd /opt/yala/frontend
git checkout $PREVIOUS_TAG
npm ci && npm run build

# Recreate nginx to ensure bind mount refresh
docker compose -p yala up -d --force-recreate nginx

# Verify
curl -fsS -o /dev/null -w "%{http_code}" https://yalataxi.live/admin/
```

**Known issue:** nginx container may serve empty `/usr/share/nginx/html` if bind mount stale — always `--force-recreate nginx` after frontend rollback (see `release/SPRINT1_LAUNCH_READINESS.md`).

### Mobile rollback

| Channel | Procedure |
|---------|-----------|
| **Google Play internal/closed testing** | Halt rollout; promote previous AAB version in Play Console |
| **Direct APK distribution** | Redistribute previous APK to pilot cohort via Launch Command Center broadcast |
| **Production track** | Use Play Console "halt rollout" + promote previous release |

Document affected app versions in incident communication.

### Rollback validation (application)

| # | Check | Expected |
|---|-------|----------|
| R-01 | `/api/health/ready/` | HTTP 200, database=ok, redis=ok |
| R-02 | Admin SPA `/admin/` | HTTP 200 |
| R-03 | Core ride API lifecycle | PASS |
| R-04 | Error rate (Sentry/logs) | Returns to baseline within 15 min |
| R-05 | Celery workers processing | Queue depth decreasing |

---

## 2. Database Rollback Strategy

### Policy

| Scenario | Strategy |
|----------|----------|
| **Migration applied successfully, app rolled back** | **Do not reverse migration.** Old code must tolerate new schema (design migrations to be backward-compatible when possible). Forward-fix preferred. |
| **Migration failed mid-apply** | Restore from pre-migration backup (see below). |
| **Data corruption post-release** | Restore from last known-good backup; accept RPO data loss. |
| **Accidental destructive query** | Point-in-time restore if available; else encrypted backup restore. |

**Django migrations are forward-only.** There is no supported `migrate backwards` in production without explicit reverse migration scripts (avoid).

### Pre-migration backup (mandatory)

Before any production migration:

```bash
# On production host — before migrate
BACKUP_ENCRYPTION_KEY="$(cat /home/yala/.backup.key)" \
  DB_CONTAINER=yala-postgres-1 \
  MEDIA_DIR=/opt/yala/backend/taxi/media \
  BACKUP_DIR=/home/yala/backups/pre-migrate \
  /opt/yala/scripts/backup-encrypted.sh
```

Record backup filename in release checklist.

### Database restore procedure

Full procedure: [DISASTER_RECOVERY.md](../docs/DISASTER_RECOVERY.md) · `release/BACKUP_RESTORE_GUIDE.md`

**Summary:**

```bash
# 1. Stop all writers
cd /opt/yala && docker compose -p yala stop django celery-worker celery-beat

# 2. Decrypt backup
gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" \
  -o /tmp/yala_restore.sql.gz /home/yala/backups/yala_db_YYYY-MM-DD_HH-MM-SS.sql.gz.gpg

# 3. Verify archive integrity
gunzip -t /tmp/yala_restore.sql.gz

# 4. Restore (DESTRUCTIVE — confirm environment and backup timestamp)
gunzip -c /tmp/yala_restore.sql.gz | \
  docker exec -i yala-postgres-1 psql -U yala_user -d yala_db

# 5. Restart application at matching code tag
git checkout $PREVIOUS_TAG
docker compose -p yala up -d django celery-worker celery-beat celery-beat

# 6. Verify
curl -fsS https://api.yalataxi.live/api/health/ready/
```

### RPO / RTO targets

| Metric | Target | Reference |
|--------|:------:|-----------|
| **RPO** (max data loss) | ≤ 24 hours | Daily encrypted backup |
| **RTO** (restore time) | ≤ 4 hours | DISASTER_RECOVERY.md |
| **Offsite RPO** | ≤ 24 hours | OFFSITE_BACKUP_CERTIFICATION.md (Gate A) |

---

## 3. Configuration Rollback

### Environment variables (`.env`)

```bash
# 1. Backup current .env before deploy
cp /opt/yala/.env /opt/yala/.env.backup.$(date +%Y%m%d_%H%M%S)

# 2. On rollback, restore previous .env
cp /opt/yala/.env.backup.YYYYMMDD_HHMMSS /opt/yala/.env

# 3. Restart affected services
docker compose -p yala up -d django celery-worker celery-beat
```

**Never commit `.env` to git.** Document env changes in release notes migration section.

### nginx configuration

```bash
# Restore from git tag
cd /opt/yala
git checkout $PREVIOUS_TAG -- nginx/
docker compose -p yala up -d --force-recreate nginx
```

### Redis cache flush (if bad cache state)

```bash
# Use only when confirmed cache corruption — flushes all cached dashboard data
docker exec yala-redis-1 redis-cli FLUSHDB
```

### Celery — purge failed tasks (post-rollback)

```bash
docker exec yala-celery-worker-1 celery -A taxi purge -f
# Restart workers
docker compose -p yala restart celery-worker celery-beat
```

---

## 4. Incident Communication

### Notification timeline

| When | Audience | Channel | Owner |
|------|----------|---------|-------|
| **T+0** (decision) | Engineering + DevOps + CEO | Slack / phone | DevOps Lead |
| **T+15 min** | Operations + Support | Ops channel | Operations Manager |
| **T+30 min** | Pilot users (if beta) | In-app / SMS broadcast | Operations Manager |
| **T+1 hour** | Status update | Internal incident doc | Engineering Lead |
| **T+4 hours** | Post-incident summary | `docs/INCIDENT_RESPONSE.md` template | Engineering Lead |

### Communication template

```
INCIDENT: Production rollback — YALA [version]
STATUS: [Investigating / Rolling back / Resolved]
IMPACT: [Rider/Driver/Delivery/Admin — describe user impact]
ACTION: Rolled back to [previous version/tag]
ETA: [Recovery validation by HH:MM UTC]
NEXT UPDATE: [time]
CONTACT: [DevOps on-call]
```

### External communication (Closed Beta / GA)

- **Do not** post publicly until CEO approves messaging.
- Support team uses `operations/07_TRUST_AND_SAFETY_MANUAL.md` for user-facing scripts.
- Update Launch Command Center incident log.

---

## 5. Recovery Validation

After any rollback, complete this checklist before declaring **Resolved**:

| # | Validation | Owner | Status |
|---|------------|-------|:------:|
| V-01 | Health endpoint PASS | DevOps | ☐ |
| V-02 | Core API lifecycle PASS | Engineering | ☐ |
| V-03 | Admin routes HTTP 200 | Engineering | ☐ |
| V-04 | Error rate normal (15 min observation) | DevOps | ☐ |
| V-05 | Celery queue draining | DevOps | ☐ |
| V-06 | Mobile apps functional (if mobile release) | QA | ☐ |
| V-07 | No active SOS/incidents caused by rollback | Operations | ☐ |
| V-08 | [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) updated | Program Office | ☐ |
| V-09 | Post-incident review scheduled (within 48 h) | Engineering Lead | ☐ |
| V-10 | Root cause documented; fix tracked in backlog | Engineering Lead | ☐ |

---

## Rollback Preparation Checklist (Pre-Deploy)

*Complete before every production deployment — part of [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md).*

| # | Item | Status |
|---|------|:------:|
| P-01 | Previous good tag/SHA documented | ☐ |
| P-02 | Pre-migration backup taken (if migrations) | ☐ |
| P-03 | `.env` backup taken (if env changes) | ☐ |
| P-04 | Rollback owner assigned | ☐ |
| P-05 | Maintenance window communicated (if downtime) | ☐ |
| P-06 | Mobile previous AAB/APK identified | ☐ |
| P-07 | Incident communication template ready | ☐ |

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [RELEASE_LIFECYCLE.md](./RELEASE_LIFECYCLE.md) | Release stages |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Pre-release checks |
| [EXECUTION_POLICY.md](../docs/EXECUTION_POLICY.md) | Stage 9 rollback requirement |
| [DISASTER_RECOVERY.md](../docs/DISASTER_RECOVERY.md) | Full DR procedures |
| [INCIDENT_RESPONSE.md](../docs/INCIDENT_RESPONSE.md) | Incident handling |
| `release/BACKUP_RESTORE_GUIDE.md` | Backup scripts |
| `engineering/05_DEPLOYMENT_GUIDE.md` | Deploy procedures |
| `operations/09_BUSINESS_CONTINUITY_PLAN.md` | BCP |

---

*Effective 2026-07-22 · Review after every P0 rollback · YALA Enterprise Program Office*
