# YALA — System Maintenance Manual

**Document ID:** YALA-OPS-SYS-008  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** DevOps, Engineering Lead, SRE  
**Related:** `handover/08_DISASTER_RECOVERY_SUMMARY.md` · `release/BACKUP_RESTORE_GUIDE.md` · `DEPLOYMENT.md`

---

## 1. Overview

System Maintenance ensures production availability for https://api.yalataxi.live and https://www.yalataxi.live/admin.

| Tool | URL / location | Purpose |
|------|----------------|---------|
| Production Status | `/admin/status` | Component health dashboard |
| Launch Control | `/admin/launch` | Incidents, maintenance coordination |
| Executive Dashboard | `/admin/executive` | Maintenance mode toggle |
| Health API | `/api/health/ready/` | Automated readiness probe |
| Host | `142.93.99.142` `/opt/yala` | Docker Compose production stack |

**Stack:** Django · PostgreSQL · Redis · Celery · nginx · Daphne (Channels)

---

## 2. Daily server checks

**When:** 06:00 UTC and 18:00 UTC · **Owner:** DevOps / Engineering on-call · **~15 min**

### Daily checklist

| # | Check | Command / URL | Expected | ☐ |
|---|-------|---------------|----------|:-:|
| DS-01 | API readiness | `curl -fsS https://api.yalataxi.live/api/health/ready/` | HTTP 200 | ☐ |
| DS-02 | API health | `curl -fsS https://api.yalataxi.live/health/` | database + redis OK | ☐ |
| DS-03 | Admin status page | https://www.yalataxi.live/admin/status | All green | ☐ |
| DS-04 | Docker containers | `docker compose -p yala ps` | 9+ Up (healthy) | ☐ |
| DS-05 | Django logs | `docker compose -p yala logs django --tail 50` | No critical errors | ☐ |
| DS-06 | nginx logs | `docker compose -p yala logs nginx --tail 30` | No 5xx spike | ☐ |
| DS-07 | Celery workers | Celery ping (§7) | ≥ 2 workers | ☐ |
| DS-08 | Redis | `PING` → PONG (§6) | OK | ☐ |
| DS-09 | PostgreSQL connections | < 180 active | OK | ☐ |
| DS-10 | Disk usage | < 80% (§8) | OK | ☐ |
| DS-11 | SSL validity | > 30 days remaining (§5) | OK | ☐ |
| DS-12 | Backup age | < 24 h (§3) | OK | ☐ |
| DS-13 | Maintenance mode | OFF unless scheduled | OK | ☐ |
| DS-14 | Open P0 incidents | Launch Hub = 0 | OK | ☐ |

### SSH quick reference

```bash
ssh root@142.93.99.142
cd /opt/yala
docker compose -p yala ps
docker compose -p yala logs django --tail 200
docker compose -p yala logs celery-worker --tail 100
docker compose -p yala logs nginx --tail 100
```

---

## 3. Database backups

### Backup configuration

| Item | Detail |
|------|--------|
| Method | `pg_dump` compressed with gzip |
| Frequency | Daily |
| Local path | `/var/backups/yala/postgres/` |
| Script | `scripts/backup-local.sh` |
| Offsite | S3/DO Spaces — **configure if not verified** |
| Retention | 7 days local · 30 days offsite |
| RPO target | 24 hours maximum data loss |

### Daily backup checklist

| # | Task | ☐ |
|---|------|:-:|
| BK-01 | Confirm backup job ran (cron log) | ☐ |
| BK-02 | Verify backup file size > 0 | ☐ |
| BK-03 | Check backup age < 24 h | ☐ |
| BK-04 | Offsite sync confirmed (if configured) | ☐ |
| BK-05 | Log result in ops channel | ☐ |

### Restore test (monthly)

| Step | Action |
|------|--------|
| 1 | Select backup from 7 days prior |
| 2 | Restore to staging/isolated DB |
| 3 | Run `python manage.py migrate --check` |
| 4 | Spot-check row counts |
| 5 | Document in `release/OFFSITE_BACKUP_CERTIFICATION.md` |

### Restore command

```bash
gunzip < yala_YYYYMMDD.sql.gz | psql -U yala_user -d yala_db
```

**Reference:** `handover/08_DISASTER_RECOVERY_SUMMARY.md` · `release/BACKUP_RESTORE_GUIDE.md`

---

## 4. Log review

### Log sources

| Service | Command | Look for |
|---------|---------|----------|
| Django | `logs django --tail 200` | 500 errors, DB timeouts |
| Celery | `logs celery-worker --tail 200` | Task failures, retries |
| nginx | `logs nginx --tail 100` | 502/504, rate limit |
| PostgreSQL | container logs | Connection exhaustion |
| Redis | container logs | OOM, persistence errors |

### Daily log review workflow

```
Pull last 200 lines per service
         │
         ▼
Filter: ERROR, CRITICAL, 5xx
         │
         ▼
Group by pattern (new vs known)
         │
         ▼
Known → document in known issues register
New → create Launch incident (P1/P0)
         │
         ▼
Weekly trend summary to Engineering Lead
```

### Log review checklist

- [ ] Zero unhandled 500 spikes in last 24 h
- [ ] Celery failed tasks < 10/day or investigated
- [ ] No authentication brute-force pattern
- [ ] Payment webhook errors reviewed
- [ ] SOS endpoint errors = 0

---

## 5. SSL monitoring

| Item | Detail |
|------|--------|
| Domains | `api.yalataxi.live`, `www.yalataxi.live` |
| Termination | nginx reverse proxy |
| Config | `nginx/nginx.conf` |
| Renewal | Let's Encrypt / certbot (verify cron) |

### SSL checklist

| # | Check | Threshold | ☐ |
|---|-------|-----------|:-:|
| SSL-01 | Certificate expiry | > 30 days | ☐ |
| SSL-02 | HTTPS redirect working | HTTP → HTTPS | ☐ |
| SSL-03 | API TLS handshake | No errors | ☐ |
| SSL-04 | Admin portal load | Valid cert in browser | ☐ |

### SSL renewal failure response

1. Create P1 incident
2. Manual certbot renewal attempt
3. Reload nginx: `docker compose -p yala exec nginx nginx -s reload`
4. Verify with `curl -vI https://api.yalataxi.live`

---

## 6. Redis monitoring

| Item | Detail |
|------|--------|
| Persistence | AOF (`appendonly yes`) |
| RDB snapshots | Recommended every 15 min |
| Volume | `redis_data` Docker volume |
| Use | Celery broker, cache, Channels |

### Redis checklist

| # | Check | Command / metric | Expected | ☐ |
|---|-------|------------------|----------|:-:|
| RD-01 | PING | `redis-cli PING` | PONG | ☐ |
| RD-02 | Memory usage | `INFO memory` | < 80% maxmemory | ☐ |
| RD-03 | Connected clients | `INFO clients` | Stable | ☐ |
| RD-04 | AOF status | `INFO persistence` | aof_enabled=1 | ☐ |
| RD-05 | Evicted keys | `INFO stats` | Near zero | ☐ |

### Redis failure response

1. Restart Redis container
2. AOF replay should recover state
3. If volume corrupted → restore from snapshot
4. Restart Celery workers after broker healthy

---

## 7. Celery monitoring

### Celery configuration

| Item | Expected |
|------|----------|
| Workers | ≥ 2 ping responsive |
| Broker | Redis |
| Critical tasks | Payments, notifications, safety alerts |

### Celery checklist

| # | Check | ☐ |
|---|------|:-:|
| CE-01 | Worker count ≥ 2 | ☐ |
| CE-02 | `celery inspect ping` succeeds | ☐ |
| CE-03 | Queue depth normal (not growing unbounded) | ☐ |
| CE-04 | Failed tasks reviewed in logs | ☐ |
| CE-05 | Beat scheduler running (if applicable) | ☐ |

### Celery restart procedure

```bash
docker compose -p yala restart celery-worker
docker compose -p yala logs celery-worker --tail 50
```

### Celery outage impact

| Impact | Mitigation |
|--------|------------|
| Delayed notifications | Restart workers; monitor queue |
| Payment callbacks delayed | P1 incident; Finance notify |
| Safety alerts delayed | P0 if SOS affected |

---

## 8. Disk usage

### Monitored paths

| Path | Content |
|------|---------|
| Host `/` | OS, Docker images |
| `/var/backups/yala/` | PostgreSQL backups |
| Docker volumes | `postgres_data`, `redis_data`, media |
| `backend/taxi/media/` | Uploads, POD photos |

### Disk checklist

| # | Check | Threshold | Action if exceeded | ☐ |
|---|-------|-----------|-------------------|:-:|
| DK-01 | Root filesystem | < 80% | Clean logs, prune images | ☐ |
| DK-02 | Backup directory | < 90% | Rotate old backups | ☐ |
| DK-03 | Media volume | Monitor growth | Archive old media offsite | ☐ |
| DK-04 | Docker system df | Review weekly | `docker system prune` (careful) | ☐ |

---

## 9. Incident recovery

### Severity-based response

| Severity | Examples | RTO target |
|----------|----------|------------|
| P0 | API down, DB unreachable, data loss | 4 h full stack |
| P1 | Celery down, payment failures, Redis down | 1 h service |
| P2 | Slow queries, single container unhealthy | 4 h |

### Recovery workflow

```
Incident detected (monitoring, status page, alert)
         │
         ▼
Confirm via health endpoints + /admin/status
         │
         ▼
Create Launch incident (severity appropriate)
         │
         ▼
Identify failing component
         │
         ▼
┌─────────────────────────────────┐
│ Mitigation options:             │
│ - Restart container             │
│ - Maintenance mode ON           │
│ - Scale Daphne replicas         │
│ - Restore DB from backup        │
│ - Failover (future)             │
└───────────────┬─────────────────┘
                │
                ▼
Verify: health/ready, smoke test ride flow
                │
                ▼
Maintenance mode OFF
Document root cause + resolution
Run scripts/launch-certification-prod.py
```

### Service restart commands

```bash
docker compose -p yala up -d django nginx celery-worker
docker compose -p yala restart django
docker compose -p yala restart postgres  # last resort; causes downtime
```

### Post-recovery checklist

- [ ] All health checks green
- [ ] Admin login verified
- [ ] Test ride/delivery flow (QA)
- [ ] Payment webhook test
- [ ] SOS endpoint test
- [ ] Incident timeline complete
- [ ] CEO notified if P0

---

## 10. Maintenance windows

| Activity | Preferred window | Approval |
|----------|------------------|----------|
| Django deploy | 02:00–04:00 UTC | Engineering Lead |
| DB migration | 02:00–04:00 UTC | Engineering Lead + CEO if breaking |
| SSL renewal | Auto; verify weekly | DevOps |
| Backup restore test | Staging only | DevOps |
| Planned downtime | Communicate 24 h ahead | CEO + Operations |

### Maintenance mode

Enable via Executive Dashboard or `PlatformSetting` key `maintenance_mode`.  
Operations must verify caps and communicate to support before enabling.

---

## 11. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `09_BUSINESS_CONTINUITY_PLAN.md` · `02_OPERATIONS_TEAM_MANUAL.md` · `handover/04_ENVIRONMENT_REGISTER.md`
