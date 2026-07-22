# YALA Enterprise v1.0 — RC3 Backup & Recovery Report

**Document ID:** RC3-BACKUP-001  
**Date:** 2026-07-22  
**Environment:** Production (scripts verified; live drill not executed from dev workstation)  
**Status:** **NOT CERTIFIED — offsite backup P0 blocker open**

---

## Executive summary

| Capability | Local script review | Production certified |
|------------|:-------------------:|:--------------------:|
| Database backup | ✅ Scripts exist | ☐ Not verified |
| Encrypted backup | ✅ Script ready | ☐ Not verified |
| Restore procedure | ✅ Script ready | ☐ Not verified |
| Media backup | ✅ In script | ☐ Not verified |
| Offsite replication | ✅ Script ready | ❌ **Not configured** |
| DR drill | ✅ Script ready | ☐ Not executed |

**Release Blocker:** RB-P0-005 — Offsite encrypted backups not configured/certified.

---

## 1. Backup infrastructure (code review)

### 1.1 Scripts inventory

| Script | Purpose | Status |
|--------|---------|:------:|
| `scripts/backup-encrypted.sh` | PostgreSQL + Redis + media + config; AES-256; tiered retention | ✅ Reviewed |
| `scripts/backup-restore-drill.sh` | Decrypt, checksum verify, optional restore | ✅ Reviewed |
| `scripts/offsite-backup-certification.sh` | End-to-end backup certification orchestrator | ✅ Reviewed |
| `scripts/setup-offsite-backup.sh` | rclone / DO Spaces bootstrap | ✅ Reviewed |
| `scripts/bootstrap-do-spaces-offsite.sh` | DigitalOcean Spaces setup | ✅ Reviewed |
| `scripts/backup-monitor.sh` | Status file monitoring | ✅ Reviewed |
| `scripts/setup-backup-cron.sh` | Cron scheduling | ✅ Reviewed |

### 1.2 Backup scope (`backup-encrypted.sh`)

| Asset | Method | Retention default |
|-------|--------|-------------------|
| PostgreSQL | `pg_dump` via Docker → gzip → GPG | Daily 14d, weekly 8w, monthly 12m |
| Redis | RDB snapshot | Same tiers |
| Media files | tar.gz → GPG | Same tiers |
| Config | `.env.production` copy (encrypted) | Same tiers |
| Offsite | rclone to `BACKUP_OFFSITE_REMOTE` | Optional — **not confirmed active** |

### 1.3 Encryption

- Algorithm: GPG symmetric (`BACKUP_ENCRYPTION_KEY`)
- Key storage: `/home/yala/.backup.key` (mode 600) or env var
- Manifest: SHA256 per backup set

---

## 2. Database backup validation

| Check | Result | Evidence |
|-------|:------:|----------|
| Backup script syntax valid | ✅ | Code review |
| Docker pg_dump integration | ✅ | Uses `$DB_CONTAINER` |
| Live backup run (2026-07-22) | ☐ | Requires production SSH |
| Latest backup age < 24h | ☐ | Requires `$BACKUP_DIR/backup-status.json` |
| Checksum manifest present | ☐ | Requires server access |

**Required production command:**
```bash
bash /opt/yala/scripts/backup-encrypted.sh
cat /home/yala/backups/backup-status.json
```

---

## 3. Restore procedure validation

| Step | Documented | Tested |
|------|:----------:|:------:|
| Locate latest encrypted backup | ✅ | ☐ |
| Verify SHA256 manifest | ✅ | ☐ |
| GPG decrypt | ✅ | ☐ |
| Restore to isolated DB (drill mode) | ✅ | ☐ |
| Full production restore (emergency) | ✅ `ROLLBACK_PLAN.md` | ☐ |

**Drill command (non-destructive default):**
```bash
bash /opt/yala/scripts/backup-restore-drill.sh
# Full restore only with DRILL_FULL_RESTORE=1
```

---

## 4. Media backup validation

| Check | Result |
|-------|:------:|
| Media path configured (`MEDIA_DIR`) | ✅ |
| Included in encrypted tar | ✅ |
| Offsite copy of media | ☐ Pending |
| Restore tested | ☐ Pending |

---

## 5. Disaster recovery checklist

| # | Item | Status |
|---|------|:------:|
| 1 | RTO documented | ⚠ Partial — in launch certification docs |
| 2 | RPO documented | ⚠ Partial |
| 3 | Offsite backup configured (S3/DO Spaces) | ❌ **OPEN** |
| 4 | Restore drill within last 90 days | ❌ **OPEN** |
| 5 | Encryption key escrow / recovery | ☐ |
| 6 | Runbook: `release/ROLLBACK_PLAN.md` | ✅ Exists |
| 7 | Incident contact list | ✅ In launch docs |
| 8 | Post-restore smoke test defined | ✅ Health + admin login |

---

## 6. Offsite certification (pending)

**Script:** `scripts/offsite-backup-certification.sh`

Checks performed when run on production:
1. Encryption key configured
2. Backup run succeeds
3. Offsite upload via rclone
4. Offsite download + decrypt
5. Restore drill to temp DB
6. Report JSON written to `$BACKUP_DIR/offsite-certification.json`

**Status:** Not executed — requires production host with rclone + `BACKUP_OFFSITE_REMOTE` configured.

---

## 7. Release blockers

| ID | Severity | Issue | Resolution |
|----|:--------:|-------|------------|
| RB-P0-005 | **P0** | Offsite backups not configured | Run `bootstrap-do-spaces-offsite.sh`; certify |
| RB-P0-002 | **P0** | RC3 deploy pending | Deploy before backup scope includes new schemas |

---

## 8. Required actions before RC3 promote

1. Configure `BACKUP_OFFSITE_REMOTE` (DigitalOcean Spaces or S3)
2. Run `offsite-backup-certification.sh` — all checks PASS
3. Schedule daily cron via `setup-backup-cron.sh`
4. Document RTO/RPO in `release/ROLLBACK_PLAN.md` instance
5. Store certification report JSON with release artifacts

---

## Sign-off

| Role | Status | Date |
|------|:------:|------|
| DevOps / SRE | ☐ Not certified | |
| Release Manager | ☐ Blocked on RB-P0-005 | |
