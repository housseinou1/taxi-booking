# YALA Enterprise v1.0 — Production Runbook

**Document ID:** YALA-OPS-PROD-RUNBOOK-001  
**Version:** 1.0.0  
**Effective date:** 2026-07-22  
**Environment:** Production — `142.93.99.142` · `/opt/yala`  
**API:** https://api.yalataxi.live  
**Admin:** https://www.yalataxi.live/admin  
**Compose project:** `yala`

---

## Purpose

Operational procedures for continuous production use of YALA Enterprise v1.0. No feature changes — reliability, observability, and resilience only.

**Related:** [08_SYSTEM_MAINTENANCE_MANUAL.md](./08_SYSTEM_MAINTENANCE_MANUAL.md) · [INCIDENT_PLAYBOOK.md](./INCIDENT_PLAYBOOK.md) · [LAUNCH_MONITORING.md](./LAUNCH_MONITORING.md) · [../release/ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md)

---

## Service inventory

| Service | Container(s) | Port | Health check | Restart policy |
|---------|----------------|------|:------------:|:--------------:|
| Django (Daphne ASGI) | `django`, `django-replica`, `django-replica-2` | 8000 | `/api/health/ready/` | `always` |
| PostgreSQL 15 | `postgres` | 5432 | `pg_isready` | `always` |
| Redis 7 | `redis` | 6379 | `redis-cli ping` | `always` |
| Celery worker | `celery-worker`, `celery-worker-2` | — | `celery inspect ping` | `always` |
| Celery Beat | `celery-beat` | — | — | `always` |
| nginx | `nginx` | 80, 443 | depends on django | `always` |
| WebSockets | Via Daphne + nginx `/ws/` | — | — | — |

**WebSocket path:** `wss://api.yalataxi.live/ws/` or `wss://www.yalataxi.live/ws/`

---

## 1. Service restart procedures

### 1.1 Full stack status

```bash
ssh root@142.93.99.142
cd /opt/yala
docker compose -p yala ps
```

**Expected:** All services `Up` (healthy where configured).

### 1.2 Django / backend restart (zero-downtime rolling)

```bash
cd /opt/yala
docker compose -p yala restart django django-replica django-replica-2
curl -fsS https://api.yalataxi.live/api/health/ready/
```

**When:** Deploy, memory leak, 5xx spike on API.  
**RTO target:** < 2 minutes  
**Data risk:** None — stateless app containers

### 1.3 Celery worker restart

```bash
docker compose -p yala restart celery-worker celery-worker-2
docker compose -p yala exec celery-worker celery -A taxi.celery inspect ping
```

**When:** Stuck tasks, queue backlog, worker OOM.  
**Verify:** Launch Hub or `/api/health/ready/` celery field (when deployed).

### 1.4 Celery Beat restart

```bash
docker compose -p yala restart celery-beat
docker compose -p yala logs celery-beat --tail 30
```

**When:** Scheduled tasks not firing.

### 1.5 Redis restart

```bash
docker compose -p yala restart redis
curl -fsS https://api.yalataxi.live/api/health/ready/
```

**When:** Redis unreachable, cache errors, rate-limit failures.  
**Impact:** Brief session/cache flush; AOF persistence enabled (`appendonly yes`).  
**Verify:** `redis: ok` in health response.

### 1.6 PostgreSQL restart

```bash
# Prefer during low-traffic window
docker compose -p yala restart postgres
sleep 10
curl -fsS https://api.yalataxi.live/api/health/ready/
```

**When:** Connection exhaustion, PG crash only.  
**Impact:** ~10–30s API unavailability.  
**Do not** restart PG during active migrations.

### 1.7 nginx restart

```bash
docker compose -p yala exec nginx nginx -t
docker compose -p yala restart nginx
curl -fsS https://api.yalataxi.live/health/
```

**When:** SSL reload, config change, 502 from nginx.

### 1.8 SSL certificate renewal

```bash
certbot renew --dry-run          # verify first
certbot renew
docker compose -p yala restart nginx
```

**Schedule:** Let's Encrypt auto-renew via cron (verify on server).  
**Evidence:** HTTP 301 → HTTPS on all domains (validated 2026-07-22).

---

## 2. Backup verification

### Daily (automated — 02:00 UTC)

```bash
bash /opt/yala/scripts/backup-encrypted.sh
cat /home/yala/backups/backup-status.json
```

### Manual verification

```bash
bash /opt/yala/scripts/backup-monitor.sh
bash /opt/yala/scripts/backup-restore-drill.sh   # non-destructive default
```

| Check | Pass criteria |
|-------|---------------|
| `backup-status.json` | `"status":"success"` |
| Backup age | < 26 hours |
| Offsite copy | `"offsite":"success"` (when configured) |

**Blocker:** Offsite backup not certified — see PRODUCTION_OPERATIONS_REPORT.md OPS-B-001.

---

## 3. Incident escalation

| Severity | First responder | Escalate to | Channel |
|:--------:|-----------------|-------------|---------|
| SEV-1 | On-call DevOps | Engineering Lead + CEO | Launch bridge |
| SEV-2 | DevOps / Engineering | Operations Manager | Launch bridge |
| SEV-3 | Support / Ops | Department lead | Support channel |
| SEV-4 | Support | Backlog | Ticket queue |

**Full procedures:** [INCIDENT_PLAYBOOK.md](./INCIDENT_PLAYBOOK.md)

**Open incident:** https://www.yalataxi.live/admin/launch → Incidents

---

## 4. Daily health checks

**When:** 06:00 and 18:00 UTC · **Owner:** DevOps · **Duration:** ~15 min

| # | Check | Command / URL | Expected |
|---|-------|---------------|----------|
| 1 | API readiness | `curl -fsS https://api.yalataxi.live/api/health/ready/` | HTTP 200, db+redis ok |
| 2 | Admin status | https://www.yalataxi.live/admin/status | All green |
| 3 | Container health | `docker compose -p yala ps` | All Up (healthy) |
| 4 | Django errors | `docker compose -p yala logs django --tail 100 \| grep -i error` | No novel critical |
| 5 | Celery workers | `docker compose -p yala exec celery-worker celery -A taxi.celery inspect ping` | pong |
| 6 | Backup status | `cat /home/yala/backups/backup-status.json` | success, age < 26h |
| 7 | Disk usage | `df -h /` | < 80% |
| 8 | Smoke (optional) | `python scripts/platform-rc1-smoke.py` | ≥38/40 PASS |

**Log results** in Launch Hub daily note or `release/sprint1/daily-operations/MORNING_SYSTEM_CHECK.md`.

---

## 5. Weekly maintenance

**When:** Sunday 03:00 UTC · **Owner:** DevOps + Engineering Lead

| Task | Procedure |
|------|-----------|
| Review SEV-1/SEV-2 incidents | Launch Hub incident log |
| Backup restore drill | `backup-restore-drill.sh` |
| SSL cert expiry | `certbot certificates` |
| Docker image prune | `docker system prune -f` (careful — no volumes) |
| Migration drift | `python manage.py makemigrations --check` on deployed tag |
| Performance baseline | 20× health probe; record p95 |
| Security patches | `apt update && apt upgrade` on host (schedule window) |
| Celery failed tasks | Review worker logs for repeated failures |
| Offsite backup test | Upload + list remote (when configured) |

---

## 6. Emergency rollback

### When to rollback

- SEV-1 after deploy
- Sustained 5xx > 3% for 5 minutes
- Payment ledger corruption
- Migration failure

### Application rollback

```bash
cd /opt/yala
export PREVIOUS_TAG=v1.0.0-rc2    # document before every deploy
git fetch --tags
git checkout $PREVIOUS_TAG
docker compose -p yala build django celery-worker celery-beat
docker compose -p yala up -d django django-replica django-replica-2 celery-worker celery-worker-2 celery-beat
curl -fsS https://api.yalataxi.live/api/health/ready/
```

**RTO:** < 15 minutes

### Database rollback

**Last resort only.** Restore from pre-deploy backup:

```bash
bash /opt/yala/scripts/backup-restore-drill.sh
# Full restore: see release/BACKUP_RESTORE_GUIDE.md
```

**RTO:** < 4 hours

### Mobile rollback

- Halt Play Console rollout
- Distribute previous APK from `release/android/`

**Full matrix:** [../release/ROLLBACK_PLAN.md](../release/ROLLBACK_PLAN.md)

---

## 7. Failure recovery reference

| Failure | Auto-recovery | Manual procedure | Data corruption risk |
|---------|:-------------:|------------------|:--------------------:|
| Django crash | Docker `restart: always` | §1.2 restart | Low |
| Redis restart | AOF persistence | §1.5 restart | Low (cache/session) |
| Celery worker crash | Docker restart | §1.3 restart | Medium — requeue failed tasks |
| Celery Beat crash | Docker restart | §1.4 restart | Low — missed schedules only |
| PostgreSQL reconnect | Django connection pool | §1.6 if needed | Low if clean shutdown |
| nginx crash | Docker restart | §1.7 restart | None |
| Network blip | Client retry + WS reconnect | Monitor; no action if transient | None |
| Full host reboot | Docker `restart: always` | Verify all containers Up | Low with AOF + PG volume |

**Live failure simulation:** Not executed from validation workstation (SSH blocked). Procedures validated via compose config review + health probe recovery after API requests.

---

## 8. Observability quick reference

| Signal | Source |
|--------|--------|
| Health | `/health/`, `/api/health/ready/` |
| Admin dashboard | `/admin/status` |
| Django logs | `docker compose -p yala logs django` |
| Celery logs | `docker compose -p yala logs celery-worker` |
| nginx access | `docker compose -p yala logs nginx` |
| Sentry | `SENTRY_DSN` in `.env.production` (verify active) |
| API Gateway logs | `APIGatewayLog` model (partner routes only) |

**Gaps:** See [PRODUCTION_OPERATIONS_REPORT.md](./PRODUCTION_OPERATIONS_REPORT.md) Phase 3.

---

## 9. Contacts

| Role | Escalation |
|------|------------|
| DevOps Lead | Deployment, rollback, infrastructure |
| Engineering Lead | SEV-1 technical owner |
| Operations Manager | Supply, merchants, couriers |
| CEO | SEV-1 business decisions |

**Full matrix:** [LAUNCH_EXECUTIVE_BRIEF.md](./LAUNCH_EXECUTIVE_BRIEF.md)
