# YALA production backup — final certification report

**Date:** 2026-11-09 UTC  
**Production:** `142.93.99.142`  
**No DB changes · no backup deletion · no service restarts · no app deploy**

---

## 1. Root cause (retention FAIL)

| Layer | Behaviour |
|-------|-----------|
| **`backup-encrypted.sh`** | Prunes with **age**: `find … -mtime +DAILY_RETENTION_DAYS` (14), weekly ×7×8, monthly ×31×12 |
| **Old certification** | Failed when **file count** > policy number (e.g. 16 daily files > 14) |
| **Why counts exceed caps** | Multiple successful runs per day (cron + certification re-runs) — all files can be **within** 14 days |

This was a **false FAIL**; retention was enforced correctly on disk.

---

## 2. Correction (repository + production script)

**File:** `scripts/offsite-backup-certification.sh` section 9

- **Pass** when `stale_files == 0` per tier (no DB file older than tier policy).
- **Fail** only if aged-out files remain (cleanup broken or policy misconfigured).
- JSON report: `"policy": "age_days"`, reports `count`, `max_age_days`, `stale_files` (informational).

**Not changed:** `backup-encrypted.sh`, `setup-offsite-backup.sh` retention math (already correct).

**Local test:** `scripts/tests/backup-retention-policy.test.sh` (proves count-based fails, age-based passes with 16 in-window files).

---

## 3. Deployment instructions (scripts only)

From operator workstation (no app deploy):

```powershell
scp scripts/offsite-backup-certification.sh root@142.93.99.142:/opt/yala/scripts/
scp scripts/tests/backup-retention-policy.test.sh root@142.93.99.142:/tmp/
```

On server:

```bash
chmod +x /opt/yala/scripts/offsite-backup-certification.sh
bash /tmp/backup-retention-policy.test.sh
set -a; . /home/yala/.backup-offsite.env; set +a
bash /opt/yala/scripts/offsite-backup-certification.sh | tee /home/yala/backups/cert-last-run.log
bash /opt/yala/scripts/backup-monitor.sh
```

**Status:** Corrected script **already on production** (verified `age-based` at line 130); certification re-run **PASS**.

---

## 4. Final certification results (production run 2026-11-09)

| Check | Result |
|-------|--------|
| Encryption key configured | **PASS** |
| Backup run | **PASS** |
| PostgreSQL / media / config artifacts | **PASS** |
| Manifest + GPG header | **PASS** |
| Checksum integrity | **PASS** |
| Offsite remote configured | **PASS** |
| Offsite daily upload | **PASS** |
| Restore drill (local) | **PASS** |
| Restore drill (offsite) | **PASS** |
| **Retention within policy** | **PASS** (18 daily, 0 stale; weekly 8/0; monthly 4/0) |
| Daily cron | **PASS** |
| **`verdict`** | **PASS** |
| `backup-monitor.sh` | **OK** local + offsite |
| `backup-status.json` | `"offsite":"ok"` |

---

## 5. DigitalOcean Spaces credential rotation (if exposed)

**Do not paste keys in chat, tickets, or email.**

1. DigitalOcean → **API** → **Spaces access keys**.
2. **Delete / revoke** the compromised key (note name only, e.g. `yala-backup-prod-*`).
3. **Create new key** with read/write on `yala-backups-prod` (FRA1) only.
4. On server: `sudo bash /opt/yala/scripts/configure-offsite-credentials.sh` (hidden prompt).
5. `bash /opt/yala/scripts/setup-offsite-backup.sh`
6. `bash /opt/yala/scripts/run-offsite-upload-verify.sh` or full certification again.
7. Confirm `backup-monitor.sh` **OK**; old key must show **denied** if reused.

No automatic rotation from engineering without CEO authorization.

---

## 6. Production deployment gate

| Gate | Status |
|------|--------|
| **Backup / offsite certification** | **PASS** — critical backup checks satisfied |
| **Frontend `GO-COORDINATED-FRONTEND-RELEASE`** | Awaiting CEO written GO only (engineering preflight ready) |
| **G1 backend / G2 / migrations** | **NO-GO** — unchanged |

If Spaces keys were exposed, complete **rotation** before treating backup posture as fully closed.

---

## 7. Evidence paths (server)

- `/home/yala/backups/offsite-certification.json` (latest run overwrites)
- `/home/yala/backups/backup-status.json`
- `/home/yala/backups/monitor.log` (tail)
- `/opt/yala/scripts/offsite-backup-certification.sh` (age-based retention block)
