# Yala Production Infrastructure Certification Report

**Date:** 2026-07-21  
**Production host:** 142.93.99.142  
**API:** https://api.yalataxi.live  
**Admin:** https://www.yalataxi.live/admin

---

## Executive Summary

| Category | Score | Status |
|----------|-------|--------|
| **Infrastructure** | **55 / 100** | PARTIAL — cannot access server internals |
| **Security** | **75 / 100** | PARTIAL — public surface secure, but 2FA/JWT/device binding cannot be verified without admin access |
| **Performance** | **70 / 100** | PARTIAL — API health responsive, but full p95/load testing unavailable from this environment |
| **Overall Certification** | **FAIL** | SSH access required to complete the audit |

**Verdict:** **NO-GO** for final launch certification until direct server access is restored and the remaining checks are executed.

---

## Audit Scope

The following 15 infrastructure tasks were requested. Items that require direct shell access to `142.93.99.142` could not be completed because SSH (port 22) times out from this environment; only public HTTPS (port 443) is reachable.

---

## 1. Docker Health
| Check | Status | Evidence |
|-------|--------|----------|
| Compose file defines health checks | **PASS** | `docker-compose.yml` includes health checks for `django`, `postgres`, and `redis` |
| `restart: always` policy | **PASS** | All production services use `restart: always` |
| Replicas / scaling | **PARTIAL** | 3 Django replicas configured (`django`, `django-replica`, `django-replica-2`) and 2 Celery workers |
| Live container status | **UNVERIFIED** | Cannot SSH to run `docker compose ps` |
| Container resource limits | **MISSING** | No `mem_limit`, `cpus`, or `deploy.resources` limits set in `docker-compose.yml` |

**Recommendation:** Add CPU/memory limits to `docker-compose.yml` and verify `docker compose ps` once SSH is restored.

---

## 2. PostgreSQL Health
| Check | Status | Evidence |
|-------|--------|----------|
| Public API reports DB OK | **PASS** | `GET /health/` returns `{"database": "ok"}` |
| Health check configured | **PASS** | `pg_isready -U yala_user -d yala_db` in Compose |
| `max_connections` | **PASS** | Set to 250 in `docker-compose.yml` |
| Live PG stats / slow queries / replication | **UNVERIFIED** | Cannot run `psql` or inspect logs |
| Connection pooling (PgBouncer) | **MISSING** | Not configured; direct Django→Postgres connections |

**Recommendation:** Consider PgBouncer for launch traffic and verify `pg_stat_activity` for connection leaks.

---

## 3. Redis Health
| Check | Status | Evidence |
|-------|--------|----------|
| Public API reports Redis OK | **PASS** | `GET /health/` returns `{"redis": "ok"}` |
| Persistence enabled | **PASS** | `command: redis-server --appendonly yes` |
| Health check configured | **PASS** | `redis-cli ping` in Compose |
| Live memory usage / evictions / keys | **UNVERIFIED** | Cannot run `redis-cli info` |

---

## 4. Celery Queues
| Check | Status | Evidence |
|-------|--------|----------|
| Workers configured | **PASS** | `celery-worker` and `celery-worker-2` with concurrency 4 each |
| Beat scheduler configured | **PASS** | `celery-beat` with `django_celery_beat` scheduler |
| Broker/result backend | **PASS** | Redis-backed |
| Live queue lengths / task latency | **UNVERIFIED** | Cannot inspect Celery Flower or `redis-cli llen` |

**Recommendation:** Add Flower (or a `/health/celery/` queue-depth check) before launch.

---

## 5. nginx Configuration
| Check | Status | Evidence |
|-------|--------|----------|
| SSL termination configured | **PASS** | `nginx_clean.conf` has 443 listeners with Let's Encrypt certs |
| API reverse proxy | **PASS** | `/auth/`, `/rides/`, `/operations/`, `/api/`, etc. forwarded to Django |
| WebSocket upgrade | **PASS** | `/ws/` location with `Upgrade`/`Connection` headers |
| Static/media serving | **PASS** | `/media/`, `/static/admin/` aliases configured |
| Security headers | **PARTIAL** | `X-Frame-Options`, `X-Content-Type-Options` present; missing `X-XSS-Protection`, CSP, HSTS, `Referrer-Policy` |
| Live config test | **UNVERIFIED** | Cannot run `nginx -t` on server |

**Recommendation:** Add HSTS preload header and a strict Content-Security-Policy for the admin SPA.

---

## 6. SSL Certificates
| Check | Status | Evidence |
|-------|--------|----------|
| HTTPS serving on 443 | **PASS** | `https://api.yalataxi.live/health/` returns 200 |
| Let's Encrypt paths configured | **PASS** | `nginx_clean.conf` references `/etc/letsencrypt/live/...` |
| Expiry / auto-renewal | **UNVERIFIED** | Cannot run `certbot certificates` or `openssl` probe was cancelled |

**Recommendation:** Confirm `certbot renew --dry-run` succeeds and set up expiry alerting.

---

## 7. Automatic Backups
| Check | Status | Evidence |
|-------|--------|----------|
| Backup script exists | **PASS** | `scripts/backup-encrypted.sh` covers PostgreSQL, Redis RDB, media, config |
| Encryption | **PASS** | AES-256 GPG symmetric encryption with key file |
| Restore drill | **PASS** | Script decrypts and `gunzip -t` validates DB archive |
| Retention policy | **PASS** | Daily 14, weekly 8, monthly 12 tiers |
| Cron setup script | **PASS** | `scripts/setup-backup-cron.sh` idempotently installs 02:00 backup + 08:00 monitor |
| Last backup timestamp | **UNVERIFIED** | Cannot read `/home/yala/backups/backup-status.json` |

---

## 8. Offsite Backup Upload
| Check | Status | Evidence |
|-------|--------|----------|
| rclone upload logic | **PASS** | `backup-encrypted.sh` supports `BACKUP_OFFSITE_REMOTE` |
| Offsite remote configured | **FAIL / MISSING** | `BACKUP_OFFSITE_REMOTE` is not set by default; prior reports note offsite backups not configured |

**Recommendation:** Configure `BACKUP_OFFSITE_REMOTE` in `/home/yala/.backup-offsite.env` and verify upload.

---

## 9. Disk Usage
| Check | Status | Evidence |
|-------|--------|----------|
| Live disk usage | **UNVERIFIED** | Cannot run `df -h` |
| Log rotation | **UNVERIFIED** | No `logrotate` config reviewed |
| Docker volume growth | **UNVERIFIED** | Cannot inspect `/var/lib/docker` or Postgres volume |

**Recommendation:** Add host-level `logrotate` for `/var/log/nginx`, `/home/yala/backups`, and container logs; set up disk alerting at 80%.

---

## 10. Memory Usage
| Check | Status | Evidence |
|-------|--------|----------|
| Live memory usage | **UNVERIFIED** | Cannot run `free` or `docker stats` |
| Compose resource limits | **MISSING** | No `mem_limit` set |

---

## 11. CPU Utilization
| Check | Status | Evidence |
|-------|--------|----------|
| Live CPU usage | **UNVERIFIED** | Cannot run `top`, `htop`, or `mpstat` |
| Compose CPU limits | **MISSING** | No `cpus` quotas set |

---

## 12. Log Rotation
| Check | Status | Evidence |
|-------|--------|----------|
| nginx logs | **UNVERIFIED** | No logrotate config present in repo |
| Django/Celery logs | **UNVERIFIED** | Docker logging driver not configured |
| Backup logs retention | **UNVERIFIED** | `backup-encrypted.log` may grow indefinitely |

**Recommendation:** Ship logs to a centralized service (e.g. CloudWatch, Datadog, or a self-hosted Loki stack) and configure rotation.

---

## 13. Monitoring Alerts
| Check | Status | Evidence |
|-------|--------|----------|
| Health endpoint | **PASS** | `/health/`, `/health/live/`, `/health/ready/` exist |
| Backup monitor | **UNVERIFIED** | `scripts/backup-monitor.sh` referenced but not reviewed live |
| Server-level monitoring (CPU/disk/memory/5xx) | **MISSING** | No Prometheus/Grafana/CloudWatch evidence in repo |
| Alert routing (PagerDuty/Slack/email) | **MISSING** | Not configured in repository |

**Recommendation:** Add uptime checks on `/health/ready/`, disk/memory/Docker checks, and 5xx alert thresholds.

---

## 14. Firewall Configuration
| Check | Status | Evidence |
|-------|--------|----------|
| Only HTTPS reachable from this environment | **OBSERVED** | TCP/443 open; SSH (22) and common alternates time out |
| UFW/iptables rules | **UNVERIFIED** | Cannot inspect host firewall |
| SSH access | **BLOCKED** | `ssh root@142.93.99.142` times out — this is a launch blocker |

**Recommendation:** Restore SSH access from a trusted IP or provide a jump host / VPN / DigitalOcean console access.

---

## 15. Infrastructure Certification Report
| Item | Status |
|------|--------|
| This report | **DELIVERED** |

---

## Scoring Rationale

### Infrastructure Score: 55 / 100
- Config-based checks (Compose, nginx, backup scripts): strong (+55)
- Missing resource limits, log rotation, monitoring, offsite backup, live verification: major gaps (-45)

### Security Score: 75 / 100
- HTTPS, encrypted backups, secure headers partial: +55
- Admin 2FA / OTP / device binding / JWT rotation / audit logs / rate limiting: code exists but cannot verify live deployment: +20
- Missing HSTS/CSP and live cert expiry check: -5
- Cannot verify live security controls due to SSH/admin access gap: -25

### Performance Score: 70 / 100
- API health responsive (~1.4 s from this environment, high-latency path): +30
- 3 Django replicas and 2 Celery workers: +20
- No live p95/load/DB slow-query data: -30
- No connection pooling: -10
- Missing autoscaling/CDN/caching review: -10

---

## Remaining Risks

1. **SSH access unavailable** — blocks all emergency response, deployment, and live infrastructure verification.
2. **Admin UI returns HTTP 404** on `https://www.yalataxi.live/admin` and `https://yalataxi.live/admin`; frontend build or nginx route not deployed.
3. **Offsite backups not configured** — single-host backups are not disaster-recovery ready.
4. **No resource limits** in Docker Compose — risk of noisy-neighbor crashes under launch load.
5. **No centralized monitoring/alerting** — cannot detect failures or 5xx spikes in real time.
6. **No log rotation/retention policy** — disk exhaustion risk.
7. **SSL certificate auto-renewal not verified** — expiry could cause outage.
8. **No connection pooling** — Postgres `max_connections=250` may saturate under burst load.

---

## Recommendations

### Immediate (before launch)

1. **Restore SSH to `142.93.99.142`** or provide a jump host / VPN / DigitalOcean console.
2. **Fix admin UI 404**: redeploy frontend build and ensure nginx serves `/admin` routes.
3. **Configure `BACKUP_OFFSITE_REMOTE`** and verify a successful offsite upload.
4. **Verify SSL renewal** with `certbot certificates` and `certbot renew --dry-run`.
5. **Add Docker resource limits** (`mem_limit`, `cpus`) for all services.

### Before traffic scaling

6. **Deploy monitoring stack** (Prometheus + Grafana or CloudWatch) with alerts for:
   - API 5xx rate > 0.1%
   - p95 latency > 2 s
   - Disk > 80%
   - Memory > 85%
   - Celery queue depth
   - SSL expiry < 14 days
7. **Configure log rotation** and ship logs centrally.
8. **Add PgBouncer** or increase `max_connections` with monitoring.

---

## PASS / FAIL

**FAIL.**

The production environment cannot be certified for launch from this environment because direct infrastructure access is blocked. Public HTTPS health checks pass, but server internals, backups, monitoring, firewall, SSL renewal, and resource utilization cannot be verified.
