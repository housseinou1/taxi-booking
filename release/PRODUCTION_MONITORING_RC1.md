# Production Monitoring — RC1

**Release:** v1.0.0-rc1  
**Production:** https://api.yalataxi.live  

---

## Dashboards

| Surface | URL |
|---------|-----|
| Production Status | https://www.yalataxi.live/admin/status |
| Launch Hub | https://www.yalataxi.live/admin/launch |
| Operations Center | https://www.yalataxi.live/admin/operations |
| Executive Dashboard | https://www.yalataxi.live/admin/executive |
| Health API | https://api.yalataxi.live/health/ |
| Staff status | https://api.yalataxi.live/api/health/status/ |

---

## Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| `/health/` uptime | < 99.5% / 15m | < 99% / 15m |
| HTTP 5xx rate | > 0.5% / 5m | > 2% / 5m |
| API p95 latency | > 3000 ms | > 8000 ms |
| CPU | > 75% / 10m | > 90% / 5m |
| Memory | > 80% | > 92% |
| Disk | > 80% | > 90% |
| PG connections | > 180 / 250 | > 230 |
| Celery workers | < 2 | 0 |
| Backup age | > 26 h | > 48 h |

---

## Automated Checks

| Schedule | Script |
|----------|--------|
| 02:00 UTC | `scripts/backup-encrypted.sh` |
| 08:00 UTC | `scripts/backup-monitor.sh` |
| Every 15 min | `curl -f https://api.yalataxi.live/health/` |
| Daily | `scripts/launch-certification-prod.py` |

---

## Notification Procedures

### Severity 1 (page immediately)
API down > 2 min, DB unreachable, 0 Celery workers, backup failure 2 nights, SOS down.

1. Acknowledge within 15 minutes  
2. Create OpsIncident in Launch Hub  
3. Check Production Status  
4. Escalate to CEO if unresolved after 30 minutes  

### Severity 2 (1 hour)
p95 > 8 s, disk > 85%, Celery queue > 100, backup stale > 26 h.

### Severity 3 (next business day)
Single 429 burst, P3 triage items.

---

## RC1 Verification

| Component | Status |
|-----------|--------|
| API uptime | Verified |
| Error rate (5xx) | 0 @ 335 concurrent |
| PostgreSQL | production_status ok |
| Redis | production_status ok |
| Celery | ≥ 2 workers |
| WebSockets | ok (Redis-backed) |
