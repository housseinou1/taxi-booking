# Offsite Backup Certification

**Date:** 2026-07-21  
**Server:** `142.93.99.142` (`/opt/yala`)  
**Certification script:** `scripts/offsite-backup-certification.sh`  

---

## Result

| Field | Value |
|-------|-------|
| **Verdict** | **FAIL** (offsite upload pending credentials) |
| **Local encrypted backup** | **PASS** |
| **Restore drill** | **PASS** |
| **Retention policy** | **PASS** (configured) |
| **Daily automation** | **PASS** (cron 02:00 UTC) |

---

## What is backed up (encrypted GPG AES-256)

| Component | File pattern | Latest size |
|-----------|--------------|-------------|
| PostgreSQL | `yala_db_*.sql.gz.gpg` | 197 KB |
| Media uploads | `yala_media_*.tar.gz.gpg` | 10.1 MB |
| Redis RDB | `yala_redis_*.rdb.gpg` | 471 KB |
| **Config bundle** | `yala_config_*.tar.gz.gpg` | 4 KB |

Config bundle includes:
- `/opt/yala/docker-compose.yml`
- `/opt/yala/.env`
- `/opt/yala/backend/taxi/.env.production`
- `/opt/yala/nginx/` (nginx.conf)

---

## Encryption verification

| Check | Result |
|-------|--------|
| GPG AES-256 symmetric header | **PASS** |
| SHA-256 manifest (`manifest_*.sha256`) | **PASS** |
| Inline decrypt test (backup script) | **PASS** |
| Restore drill decrypt + `gunzip -t` | **PASS** |

---

## Restore drill

| Metric | Value |
|--------|-------|
| **Restore duration (decrypt + validate)** | **0.395 s** |
| **Backup run duration** | **6.6 s** |
| **Total backup size (DB + media + config)** | **~10.3 MB** |
| **Uncompressed PostgreSQL** | ~1,022,944 bytes |

Log: `/home/yala/backups/restore-drill.log`  
JSON: `/home/yala/backups/restore-drill-2026-07-21_21-39-06.json`

---

## Retention verification

| Tier | Policy | Current count | Status |
|------|--------|---------------|--------|
| Daily | 14 days | 8 | **PASS** (within max) |
| Weekly | 8 weeks | 0 | **PASS** (Sunday publish) |
| Monthly | 12 months | 0 | **PASS** (1st-of-month publish) |

Location: `/home/yala/backups/{daily,weekly,monthly}/`

---

## Offsite storage

| Check | Result |
|-------|--------|
| Remote configured (`do-spaces:yala-backups-prod`) | Template created |
| rclone remote active | **FAIL** — needs Spaces keys |
| Offsite daily upload | **FAIL** — pending credentials |

**Template:** `/home/yala/.backup-offsite.env`  
**Endpoint:** `fra1.digitaloceanspaces.com`  
**Bucket:** `yala-backups-prod`

### Complete offsite (one-time)

Paste DO Spaces access key + secret, then on the server:

```bash
# Add to /home/yala/.backup-offsite.env:
SPACES_ACCESS_KEY_ID=your_key
SPACES_SECRET_ACCESS_KEY=your_secret

bash /opt/yala/scripts/setup-offsite-backup.sh
bash /opt/yala/scripts/backup-encrypted.sh
bash /opt/yala/scripts/offsite-backup-certification.sh
```

Or with DO API token:

```bash
DO_API_TOKEN=your_token bash /opt/yala/scripts/bootstrap-do-spaces-offsite.sh
```

---

## Automation

```cron
0 2 * * *  backup-encrypted.sh   # daily encrypted backup + optional offsite upload
0 8 * * *  backup-monitor.sh    # stale/failure alert
```

Encryption key: `/home/yala/.backup.key` (mode 600, newline trimmed in cron)

---

## Remaining risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **No offsite copy yet** | **P0** | Add Spaces keys + run `setup-offsite-backup.sh` |
| Single-server disk failure | High | Offsite upload unblocks DR |
| Encryption key only on server | Medium | Store key copy in secure password manager / HSM |
| No weekly/monthly tier files yet | Low | First Sunday / 1st-of-month will populate |
| Legacy backups (pre-key-fix) | Low | Old `21-30-53` backup invalid; use `21-39-00+` |

---

## Fixes applied (ops scripts only)

1. Config bundle added (env, docker-compose, nginx)
2. Retention updated to **daily × 14, weekly × 8, monthly × 12**
3. SHA-256 checksum manifests per backup set
4. Encryption key newline trimming (cron + scripts)
5. Restore drill timing + JSON report
6. Offsite certification orchestrator

---

## Re-run certification

```bash
ssh root@142.93.99.142
bash /opt/yala/scripts/offsite-backup-certification.sh
cat /home/yala/backups/offsite-certification.json
```

**Expected after Spaces keys:** `verdict: PASS`
