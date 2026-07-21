# Backup & Restore Guide — Yala Production

## Objectives

| Metric | Target | Implementation |
|--------|--------|----------------|
| **RPO** (max data loss) | ≤ 24 hours | Nightly encrypted backup at 02:00 UTC |
| **RTO** (restore time) | ≤ 4 hours | Documented restore + DR drill |

## What is backed up

| Component | Method | Encrypted |
|-----------|--------|-----------|
| PostgreSQL | `pg_dump \| gzip` | GPG AES-256 |
| Redis | RDB snapshot (`BGSAVE`) | GPG AES-256 |
| Media files | `tar.gz` | GPG AES-256 |

## Retention

| Tier | Schedule | Retention |
|------|----------|-----------|
| Daily | Every night | 30 days |
| Weekly | Sundays | 12 weeks |
| Monthly | 1st of month | 12 months |

Location: `/home/yala/backups/{daily,weekly,monthly}/`

## Setup (production)

```bash
cd /opt/yala
bash scripts/setup-backup-cron.sh
bash scripts/backup-encrypted.sh   # manual test run
bash scripts/backup-restore-drill.sh
```

Optional offsite (DigitalOcean Spaces via rclone):

```bash
export BACKUP_OFFSITE_REMOTE=do-spaces:yala-backups
# configure rclone remote first
```

## Monitoring

- Status file: `/home/yala/backups/backup-status.json`
- Monitor cron: daily 08:00 via `scripts/backup-monitor.sh`
- Launch Control alerts if backup stale > 26h (manual check via phase16 cert)

## Restore procedure

```bash
# 1. Stop writers
cd /opt/yala && docker compose -p yala stop django celery-worker celery-worker-2 celery-beat

# 2. Decrypt latest daily DB backup
gpg --batch --yes --decrypt --passphrase "$(cat /home/yala/.backup.key)" \
  -o /tmp/yala_restore.sql.gz /home/yala/backups/daily/yala_db_LATEST.sql.gz.gpg
gunzip -t /tmp/yala_restore.sql.gz

# 3. Restore database (destructive)
gunzip -c /tmp/yala_restore.sql.gz | docker exec -i yala-postgres-1 psql -U yala_user -d yala_db

# 4. Restore Redis (if needed)
gpg --decrypt ... | docker cp - yala-redis-1:/data/dump.rdb
docker compose -p yala restart redis

# 5. Restore media (if needed)
gpg --decrypt ... | tar -xzf - -C /opt/yala/backend/taxi/

# 6. Start services
docker compose -p yala up -d django celery-worker celery-worker-2 celery-beat
curl -fsS https://api.yalataxi.live/health/
```

## DR drill

Non-destructive (default):

```bash
bash /opt/yala/scripts/backup-restore-drill.sh
```

Full ephemeral restore test:

```bash
DRILL_FULL_RESTORE=1 bash /opt/yala/scripts/backup-restore-drill.sh
```

Log: `/home/yala/backups/restore-drill.log`

## Verification after restore

- [ ] `/health/` returns OK
- [ ] Admin login works
- [ ] One rider + one driver smoke login
- [ ] Media URLs load
