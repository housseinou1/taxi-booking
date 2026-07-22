# Yala Enterprise Handover — Disaster Recovery Summary

**Document ID:** HANDOVER-08  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Overview

This document summarizes backup strategy, recovery objectives, procedures, and escalation for the Yala production platform. Detailed runbooks: `operations/09_BUSINESS_CONTINUITY_PLAN.md`, `engineering/06_MONITORING_RUNBOOK.md`, `release/BACKUP_RESTORE_GUIDE.md`.

**Production:** `142.93.99.142` · `/opt/yala` · `api.yalataxi.live`

---

## Backup strategy

### PostgreSQL

| Item | Detail |
|------|--------|
| Method | `pg_dump` compressed with gzip |
| Frequency | Daily (02:00 UTC via `scripts/backup-encrypted.sh`) |
| Local path | `/var/backups/yala/postgres/` |
| Offsite | S3 / DO Spaces — **P0: not configured** |
| Retention | 7 days local · 30 days offsite (target) |
| Monitor | `scripts/backup-monitor.sh` (08:00 UTC) |

### Redis

| Item | Detail |
|------|--------|
| Persistence | AOF (`appendonly yes`) |
| RDB snapshots | Recommended every 15 min |
| Volume | `redis_data` Docker volume |
| Offsite | Sync volume snapshots (target) |

### Media files

| Item | Detail |
|------|--------|
| Path | `backend/taxi/media/` |
| Content | Documents, signatures, profile photos, proof-of-delivery |
| Backup | Daily rsync to offsite (target) |
| Retention | 30 days |

### Source code & configuration

| Item | Detail |
|------|--------|
| Repository | Git — branches `main`, `release/v1.0.0` |
| Secrets | `.env.production` in secure vault — **not in git** |
| nginx / compose | In repository |

---

## Recovery objectives

| Objective | Target | Current status |
|-----------|--------|----------------|
| **RTO** (full API restoration) | 4 hours | Not verified by drill |
| **RPO** (maximum data loss) | 24 hours | Local backups meet target; offsite unverified |
| **RTO** (database only) | 1 hour | Not verified |
| **RTO** (full stack rebuild) | 4 hours | Not verified |
| **RTO** (SOS / safety endpoints) | 1 hour | Critical path — prioritize in recovery |

---

## Recovery procedures

### Scenario 1: Database failure

```
Stop Django + Celery (prevent writes)
         │
Identify last good backup (local or offsite)
         │
Restore:
  gunzip < yala_YYYYMMDD.sql.gz | psql -U yala_user -d yala_db
         │
python manage.py migrate --check
         │
Restart services → health checks → Finance reconciliation
```

### Scenario 2: Host / VM failure

1. Provision new host (Docker + Compose)
2. Clone repo; checkout release tag
3. Restore `.env.production` from vault
4. Restore PostgreSQL backup
5. Restore `media/` from offsite
6. `cd frontend && npm ci && npm run build`
7. `docker compose -p yala up --build -d`
8. Verify SSL and health endpoints

**Reference:** `engineering/05_DEPLOYMENT_GUIDE.md` §10 (rollback)

### Scenario 3: Redis failure

1. Restart Redis container — AOF replay
2. If volume corrupted — restore from snapshot
3. Restart Celery workers after broker healthy

### Scenario 4: Corruption / ransomware

1. Isolate affected systems; enable maintenance mode
2. Restore from offsite **immutable** backup
3. Rotate ALL secrets (Django, DB, JWT, API keys, Stripe, Firebase)
4. Audit logs for unauthorized access
5. Rebuild from verified clean image

**Reference:** `operations/09_BUSINESS_CONTINUITY_PLAN.md` §6

---

## Incident escalation

| Severity | Definition | Response time | Escalation path |
|----------|------------|---------------|-----------------|
| **P0** | Production down, data loss, safety incident | 5 min | Eng on-call → Eng Lead → CEO |
| **P1** | Major feature degraded, payment failures | 30 min | Ops Manager → Eng Lead |
| **P2** | Minor degradation | Same business day | Support / Product Lead |

### P0 response checklist

- [ ] Acknowledge within 15 min
- [ ] Create OpsIncident in Launch Hub (`/admin/launch`)
- [ ] Check `/admin/status` + `/api/health/ready/`
- [ ] SSH → logs → mitigate (restart / maintenance mode)
- [ ] CEO notify if unresolved > 30 min or safety-related
- [ ] Post-mortem within 72 h

**Reference:** `operations/02_OPERATIONS_TEAM_MANUAL.md` §7, `engineering/06_MONITORING_RUNBOOK.md` §7

---

## Recovery validation drills

| Drill | Frequency | Owner | Status |
|-------|-----------|-------|--------|
| Restore from latest backup | Monthly | DevOps | Not scheduled |
| Offsite backup verification | Weekly | DevOps | **Pending — P0 blocker** |
| Full stack rebuild | Quarterly | DevOps | Blocked — no staging |
| SOS endpoint test post-recovery | After each drill | Operations | — |
| Finance reconciliation post-restore | After DB restore | Finance Lead | — |

---

## Tools & commands

```bash
# Backup
scripts/backup-local.sh
scripts/backup-encrypted.sh

# Verify backups
ls -la /var/backups/yala/postgres/
scripts/backup-monitor.sh

# Health
curl -f https://api.yalataxi.live/api/health/ready/

# Container status
ssh root@142.93.99.142
cd /opt/yala && docker compose -p yala ps

# PostgreSQL ready
docker compose -p yala exec postgres pg_isready -U yala_user -d yala_db

# Redis
docker compose -p yala exec redis redis-cli ping
```

---

## Open items (P0 / P1)

| # | Item | Priority | Owner |
|---|------|----------|-------|
| 1 | Configure offsite encrypted backups | P0 | DevOps |
| 2 | Provision staging for DR drills | P1 | DevOps |
| 3 | Document secret rotation runbook | P1 | Security Lead |
| 4 | Immutable backup storage (object lock) | P1 | DevOps |
| 5 | Execute first restore drill and sign off | P1 | DevOps + Eng Lead |

---

## Cross-references

- BCP (full scenarios): `operations/09_BUSINESS_CONTINUITY_PLAN.md`
- Environment register: `handover/04_ENVIRONMENT_REGISTER.md`
- System maintenance: `operations/08_SYSTEM_MAINTENANCE_MANUAL.md`
- Monitoring runbook: `engineering/06_MONITORING_RUNBOOK.md`
- Backup guide: `release/BACKUP_RESTORE_GUIDE.md`
- Launch decision (blockers): `release/LAUNCH_DECISION.md`
- Risk register: `handover/05_RISK_REGISTER.md` (T-07)
