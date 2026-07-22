# YALA Enterprise v1.0 — Data Protection Certification

**Document ID:** PROD-DATA-CERT-001  
**Date:** 2026-07-22  
**Scope:** Backups, restore, media storage, log retention, disaster recovery  
**Method:** Script code review + prior backup audit + DR documentation review  
**Related:** [`BACKUP_RECOVERY_REPORT.md`](./BACKUP_RECOVERY_REPORT.md) · [`BACKUP_RESTORE_GUIDE.md`](./BACKUP_RESTORE_GUIDE.md) · [`ROLLBACK_PLAN.md`](./ROLLBACK_PLAN.md)

---

## Executive summary

| Capability | Script review | Production certified |
|------------|:-------------:|:--------------------:|
| Automated backups | ✅ | ☐ |
| Encrypted backups | ✅ | ☐ |
| Restore procedure | ✅ | ☐ |
| Media storage | ✅ | ⚠ Partial |
| Log rotation | ⚠ Partial | ☐ |
| Disaster recovery | ✅ Docs | ☐ |
| Offsite replication | ✅ Script | ❌ **NOT CONFIGURED** |
| **Overall data protection** | **70%** | **NOT CERTIFIED** |

**Verdict:** **NOT CERTIFIED FOR PRODUCTION LAUNCH.** Local backup infrastructure is well-designed but **offsite encrypted backups are not configured** (RB-P0-005 / UAT-D-004). Closed beta may proceed only with documented local DR acceptance by CEO.

---

## 1. Automated backups

| Check | Status | Evidence |
|-------|:------:|----------|
| Primary backup script | ✅ | `scripts/backup-encrypted.sh` |
| Cron installer | ✅ | `scripts/setup-backup-cron.sh` — 02:00 UTC daily |
| Backup monitor | ✅ | `scripts/backup-monitor.sh` — 08:00 UTC |
| Scope: PostgreSQL | ✅ | `pg_dump` via Docker |
| Scope: Redis RDB | ✅ | Snapshot included |
| Scope: media files | ✅ | tar.gz encrypted |
| Scope: config | ✅ | `.env.production` encrypted copy |
| Tiered retention | ✅ | Daily 14d, weekly 8w, monthly 12m |
| SHA256 manifest | ✅ | Per backup set |
| Live backup age < 24h | ☐ | Requires SSH — read `/home/yala/backups/backup-status.json` |
| Last backup executed (2026-07-22) | ☐ | Not verified from dev workstation |

**Required production verification:**
```bash
bash /opt/yala/scripts/backup-encrypted.sh
cat /home/yala/backups/backup-status.json
```

---

## 2. Restore procedure

| Step | Documented | Tested live |
|------|:----------:|:-----------:|
| Locate latest encrypted backup | ✅ | ☐ |
| Verify SHA256 manifest | ✅ | ☐ |
| GPG decrypt | ✅ | ☐ |
| Non-destructive drill | ✅ | `scripts/backup-restore-drill.sh` |
| Full production restore | ✅ | `BACKUP_RESTORE_GUIDE.md`, `ROLLBACK_PLAN.md` |
| RTO target (app rollback) | ✅ | < 15 min documented |
| RTO target (DB restore) | ✅ | < 4 hours documented |

**Prior evidence:** Local restore drill script validates decrypt + gzip integrity. Full DR drill not executed in this certification cycle.

**Drill command (safe default):**
```bash
bash /opt/yala/scripts/backup-restore-drill.sh
# Full restore only with DRILL_FULL_RESTORE=1
```

---

## 3. Media storage

| Check | Status | Evidence |
|-------|:------:|----------|
| Media volume in compose | ✅ | `./backend/taxi/media:/app/media` (Django) + nginx alias |
| Media included in backup | ✅ | `backup-encrypted.sh` |
| Offsite media copy | ❌ | Depends on `BACKUP_OFFSITE_REMOTE` — not set |
| CDN / object storage | ❌ | Local disk only |
| Upload size limits | ✅ | Serializer / nginx `client_max_body_size` |

**Risk:** Media loss if single-host disk failure without offsite backup — **P0 for GA**.

---

## 4. Log rotation

| Log source | Rotation configured | Evidence |
|------------|:-------------------:|----------|
| nginx access/error | ⚠ Container default | Docker stdout / container logs — no logrotate in repo |
| Django application | ⚠ stdout only | No `LOGGING` dict in `settings.py` |
| Celery worker | ⚠ stdout only | Docker logs |
| Sentry (if active) | ✅ External | 90-day retention (Sentry default) |
| Backup monitor logs | ✅ | Script writes status JSON |

**Gap:** No centralized log retention policy or logrotate config in repository. Disk fill risk on long-running host — **P1 recommendation**.

**Mitigation documented:** Docker log driver limits should be set on production host (not in repo).

---

## 5. Disaster recovery

| DR component | Status | Evidence |
|--------------|:------:|----------|
| DR runbook | ✅ | `handover/08_DISASTER_RECOVERY_SUMMARY.md` |
| Rollback plan | ✅ | `ROLLBACK_PLAN.md` |
| Offsite bootstrap scripts | ✅ | `setup-offsite-backup.sh`, `bootstrap-do-spaces-offsite.sh` |
| Offsite certification script | ✅ | `offsite-backup-certification.sh` |
| Offsite remote configured | ❌ | `BACKUP_OFFSITE_REMOTE` unset — **P0 blocker** |
| Multi-AZ / failover | ❌ | Single DigitalOcean droplet |
| RPO (with offsite) | Target 24h | Not achievable without offsite |

### DR decision matrix (from ROLLBACK_PLAN.md)

| Scenario | Action | RTO |
|----------|--------|:---:|
| Health check fail post-deploy | App rollback | < 15 min |
| 5xx spike | App rollback | < 15 min |
| Migration failure | Stop writers; assess | < 1 h |
| Data corruption | DB restore from backup | < 4 h |

---

## 6. Encryption

| Asset | Method | Status |
|-------|--------|:------:|
| Backups at rest | GPG AES-256 symmetric | ✅ |
| Backup key storage | `/home/yala/.backup.key` mode 600 | ✅ Design |
| TLS in transit | HTTPS everywhere | ✅ Live probes |
| Database at rest | ☐ | Depends on DO volume encryption (provider default) |
| Redis at rest | ☐ | AOF on Docker volume |

---

## Critical blockers

| ID | Blocker | Owner | Required for |
|----|---------|-------|--------------|
| RB-P0-005 | Offsite encrypted backups not configured | DevOps | GA launch |
| UAT-D-004 | Offsite certification not run | DevOps | GA launch |
| DATA-001 | Live backup timestamp unverified | DevOps | Any production deploy |
| DATA-002 | Restore drill not executed on prod | DevOps | GA launch |

---

## Workaround for closed beta (CEO approval required)

| Control | Workaround | Residual risk |
|---------|------------|---------------|
| Offsite backup | Daily local encrypted backup + manual export to secure storage | Medium — single-site failure |
| DR | Documented rollback to previous tag; local backup restore | Medium |
| Media | Included in local backup | Medium |

**This workaround does NOT satisfy GA certification requirements.**

---

## Certification statement

**Data protection is NOT CERTIFIED** for full production launch.

**CONDITIONALLY ACCEPTABLE** for closed beta ≤25 users only if:
1. CEO acknowledges offsite gap in writing
2. DevOps confirms local backup cron active (SSH verification)
3. Pre-deploy backup taken before RC1 deploy

| Role | Status | Date |
|------|:------:|------|
| DevOps Lead | ❌ Offsite not configured | |
| Operations | ☐ Pending backup verification | |
| CEO | ☐ DR risk acceptance pending | |

**Related:** [`PRODUCTION_CERTIFICATE.md`](./PRODUCTION_CERTIFICATE.md) · [`OFFSITE_BACKUP_CERTIFICATION.md`](./OFFSITE_BACKUP_CERTIFICATION.md)
