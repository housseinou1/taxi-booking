# Yala Closed Beta — Launch Day Playbook

**Document ID:** BETA-LAUNCH-DAY-001  
**Effective:** 2026-07-21  
**Release:** v1.0.0 · Closed Beta Day 1  
**Pilot city:** Nouakchott, Mauritania  
**Feature freeze:** Active — P0/P1 defect fixes only  

**Production:** https://api.yalataxi.live · https://www.yalataxi.live/admin  
**Launch decision:** GO Limited Launch (see `LAUNCH_DECISION.md`)

**Related documents:**
- `DAY1_OPERATIONS_CHECKLIST.md` — printable ops checklist
- `DAY1_CEO_REPORT_TEMPLATE.md` — end-of-day CEO report
- `CLOSED_BETA_RUNBOOK.md` — ongoing beta operations
- `BETA_OPERATIONS_RUNBOOK.md` · `BETA_SUCCESS_METRICS.md`
- `POST_LAUNCH_SUPPORT_PROCEDURES.md` · `PRODUCTION_MONITORING_RC1.md`

---

## Launch parameters

| Cohort | Closed beta cap | Owner |
|--------|:---------------:|-------|
| Drivers | 20 | Operations Manager |
| Couriers | 10 | Operations Manager |
| Riders | 100 | Marketing / Ops |

**Beta access:** Controlled via soft launch config + approved accounts only.  
**Support hours (Day 1):** 06:00–24:00 UTC (extended)  
**War room channel:** WhatsApp / Slack `#yala-beta-launch`

---

## Roles (Launch Day)

| Role | Name | Phone | Responsibility |
|------|------|-------|----------------|
| **Launch commander** | CEO (H. Sakho) | _________ | Final GO/NO-GO, P0 escalation |
| **Operations Manager** | _____________ | _________ | Fleet, dispatch, incidents |
| **Engineering on-call** | _____________ | _________ | API, deploy, hotfixes |
| **Finance contact** | _____________ | _________ | Payments, withdrawals |
| **Support lead** | _____________ | _________ | Tickets, rider/driver comms |
| **QA observer** | _____________ | _________ | First-ride/delivery witness |

---

## Timeline overview

| Window | Section | Owner | Duration |
|--------|---------|-------|----------|
| **T-24 h** | Infrastructure & backup verification | Eng + DevOps | ~45 min |
| **T-2 h** | Cohort & team readiness | Ops + Support | ~30 min |
| **T-0** | Launch checklist (first transactions) | Ops + QA | ~60 min |
| **T+0 → T+24 h** | Live monitoring & escalation | Ops (continuous) | 24 h |
| **T+24 h (EOD)** | Day 1 report | Ops → CEO | ~30 min |

---

# SECTION 1 — T-24 HOURS

**When:** Day before launch · **Owner:** Engineering Lead + DevOps  
**Goal:** Confirm production is stable before inviting beta users.

### 1.1 Production health

| # | Check | Command / URL | Expected | Pass ☐ | Notes |
|---|-------|---------------|----------|:------:|-------|
| H-01 | API readiness | `curl -fsS https://api.yalataxi.live/api/health/ready/` | HTTP 200 · `"status":"ok"` · database + redis OK | ☐ | |
| H-02 | API liveness | `curl -fsS https://api.yalataxi.live/api/health/live/` | HTTP 200 | ☐ | |
| H-03 | Staff status (auth) | `GET /api/health/status/` (admin JWT) | celery ok · websocket ok | ☐ | |
| H-04 | Admin SPA | https://www.yalataxi.live/admin/status | All checks green | ☐ | |
| H-05 | Maintenance mode | Executive Dashboard → Maintenance | **OFF** | ☐ | |
| H-06 | HTTP 5xx spot check | `scripts/launch-certification-prod.py` | 0× 5xx | ☐ | |

**T-24 sign-off (Eng):** _________________ **Time:** _________

---

### 1.2 Database backup completed

| # | Check | Command | Expected | Pass ☐ | Notes |
|---|-------|---------|----------|:------:|-------|
| B-01 | Trigger manual backup (optional) | `ssh root@142.93.99.142` → `bash /opt/yala/scripts/backup-encrypted.sh` | Exit 0 | ☐ | |
| B-02 | Latest backup exists | `ls -lt /home/yala/backups/daily/ \| head -3` | File < 24 h old | ☐ | |
| B-03 | GPG encryption verified | Backup file ends in `.gpg` | AES-256 header | ☐ | |
| B-04 | Manifest checksum | `cat /home/yala/backups/daily/manifest_*.sha256` | SHA-256 present | ☐ | |
| B-05 | Backup monitor | `bash /opt/yala/scripts/backup-monitor.sh` | PASS or no alert | ☐ | |

**Reference:** `OFFSITE_BACKUP_CERTIFICATION.md` · `BACKUP_RESTORE_GUIDE.md`

---

### 1.3 Offsite backup verified

| # | Check | Command | Expected | Pass ☐ | Notes |
|---|-------|---------|----------|:------:|-------|
| O-01 | Offsite remote configured | `grep SPACES /home/yala/.backup-offsite.env` | Keys set (not empty) | ☐ | |
| O-02 | Offsite certification | `bash /opt/yala/scripts/offsite-backup-certification.sh` | `verdict: PASS` | ☐ | |
| O-03 | Remote copy < 48 h | rclone ls or cert JSON | Latest upload recent | ☐ | |

**If FAIL:** Document waiver in launch log. CEO must acknowledge before GO. Local encrypted backup + restore drill must be PASS.

---

### 1.4 SSL valid

| # | Check | Command / URL | Expected | Pass ☐ | Notes |
|---|-------|---------------|----------|:------:|-------|
| S-01 | API cert expiry | `echo \| openssl s_client -connect api.yalataxi.live:443 2>/dev/null \| openssl x509 -noout -dates` | notBefore valid · notAfter > 30 days | ☐ | |
| S-02 | Admin cert expiry | Same for `www.yalataxi.live` | notAfter > 30 days | ☐ | |
| S-03 | HTTPS redirect | `curl -I http://www.yalataxi.live` | 301 → https | ☐ | |
| S-04 | HSTS header | `curl -sI https://api.yalataxi.live \| grep -i strict` | Present | ☐ | |

---

### 1.5 Docker healthy

| # | Check | Command | Expected | Pass ☐ | Notes |
|---|-------|---------|----------|:------:|-------|
| D-01 | All containers up | `cd /opt/yala && docker compose -p yala ps` | 9+ services **Up (healthy)** | ☐ | |
| D-02 | django × 3 | Status healthy | 3 replicas | ☐ | |
| D-03 | postgres | healthy | pg_isready pass | ☐ | |
| D-04 | redis | healthy | ping PONG | ☐ | |
| D-05 | nginx | running | ports 80/443 | ☐ | |
| D-06 | celery-worker × 2 | running/healthy | ≥ 2 workers | ☐ | |
| D-07 | celery-beat | running | scheduler active | ☐ | |
| D-08 | No restart loops | `docker compose ps` — low restart count | 0 unexpected restarts | ☐ | |

---

### 1.6 Celery healthy

| # | Check | Command | Expected | Pass ☐ | Notes |
|---|-------|---------|----------|:------:|-------|
| C-01 | Worker ping | `docker compose exec django celery -A taxi.celery inspect ping` | ≥ 2 workers respond pong | ☐ | |
| C-02 | Active tasks | `celery -A taxi.celery inspect active` | No stuck backlog | ☐ | |
| C-03 | Beat schedule | Admin → django_celery_beat | Periodic tasks enabled | ☐ | |

---

### 1.7 Redis healthy

| # | Check | Command | Expected | Pass ☐ | Notes |
|---|-------|---------|----------|:------:|-------|
| R-01 | Ping | `docker compose exec redis redis-cli ping` | PONG | ☐ | |
| R-02 | Memory | `redis-cli info memory \| grep used_memory_human` | < 80% of max | ☐ | |
| R-03 | AOF enabled | `redis-cli info persistence \| grep aof_enabled` | 1 | ☐ | |
| R-04 | Cache probe | Health API redis: ok | ok | ☐ | |

---

### 1.8 PostgreSQL healthy

| # | Check | Command | Expected | Pass ☐ | Notes |
|---|-------|---------|----------|:------:|-------|
| P-01 | Connection | Health API database: ok | ok | ☐ | |
| P-02 | Active connections | `SELECT count(*) FROM pg_stat_activity;` | < 180 / 250 | ☐ | |
| P-03 | Pending migrations | `python manage.py showmigrations --plan \| grep '\[ \]'` | None unapplied | ☐ | |
| P-04 | Disk space | `df -h /var/lib/postgresql` | < 80% used | ☐ | |

**Required migrations before launch:**
```bash
python manage.py migrate operations 0010
python manage.py migrate payments 0020
python manage.py migrate drivers 0023
python manage.py migrate notifications 0006
python manage.py migrate security 0003
```

---

### 1.9 Monitoring active

| # | Check | Where | Expected | Pass ☐ | Notes |
|---|-------|-------|----------|:------:|-------|
| M-01 | Production Status page | `/admin/status` | Loads · checks visible | ☐ | |
| M-02 | Health cron (15 min) | Server cron or UptimeRobot | Active | ☐ | |
| M-03 | Backup cron (02:00 UTC) | `/home/yala/reports/soft-launch/cron.log` | Scheduled | ☐ | |
| M-04 | Launch Hub KPIs | `/admin/launch` | Dashboard loads | ☐ | |
| M-05 | Operations Center map | `/admin/operations` | Live map renders | ☐ | |

---

### 1.10 Alerting active

| # | Check | Where | Expected | Pass ☐ | Notes |
|---|-------|-------|----------|:------:|-------|
| A-01 | Backup monitor alert | `backup-monitor.sh` test | Alert path configured | ☐ | |
| M-02 | Launch Hub alerts | `/admin/launch` → Alerts | Panel active | ☐ | |
| A-03 | Ops war room | WhatsApp / Slack | All roles joined | ☐ | |
| A-04 | CEO escalation phone | Documented in roles table | Confirmed | ☐ | |
| A-05 | On-call engineer reachable | Ping test message | Acknowledged | ☐ | |

---

### T-24 GO / NO-GO

| Decision | ☐ GO · ☐ NO-GO (delay launch) |
|----------|-------------------------------|
| **Blockers** | _________________________________________________ |
| **CEO approval** | _________________ **Date/time:** _____________ |

---

# SECTION 2 — T-2 HOURS

**When:** Two hours before first rider invite · **Owner:** Operations Manager  
**Goal:** People, accounts, and dashboards ready — not just infrastructure.

| # | Check | How to verify | Expected | Pass ☐ | Notes |
|---|-------|---------------|----------|:------:|-------|
| T2-01 | **Driver accounts active** | Launch Hub → Onboarding · `/admin/business` CRM | ≥ 3 approved drivers · docs approved · payout method set | ☐ | |
| T2-02 | **Courier accounts active** | Same · filter couriers | ≥ 1 approved courier · delivery mode enabled | ☐ | |
| T2-03 | **Rider invitations sent** | CRM / WhatsApp log | Invite link + APK or Play closed-testing sent to beta list | ☐ | |
| T2-04 | **Support team online** | War room + Support Center | Support lead logged into `/admin/support` | ☐ | |
| T2-05 | **Finance contact available** | Phone ping | Finance staff reachable for payment issues | ☐ | |
| T2-06 | **Operations Manager assigned** | Roles table signed | On Launch Command Center | ☐ | |
| T2-07 | **CEO dashboard operational** | `/admin/launch` · `/admin/command` · `/admin/executive` | All load · KPIs visible | ☐ | |
| T2-08 | Soft launch config enabled | `python manage.py configure_soft_launch` | Caps 20/10/100 active | ☐ | |
| T2-09 | Beta APK builds installed (QA phones) | Physical devices | Rider 1.2.7+ · Driver 1.2.23+ · Delivery 1.0.4+ | ☐ | |
| T2-10 | Test accounts verified | `scripts/fix-qa-cert-accounts.py` if needed | phone_verified · can request ride | ☐ | |

**T-2 sign-off (Ops Manager):** _________________ **Time:** _________

---

# SECTION 3 — LAUNCH (T-0)

**When:** Launch moment · **Owner:** Operations Manager + QA  
**Goal:** Prove end-to-end flows with real beta users.

**War room:** Keep Operations Center (`/admin/operations`) and Launch Command Center (`/admin/command`) open on shared screen.

### Launch checklist

| # | Task | Owner | Verification | Done ☐ | Time |
|---|------|-------|--------------|:------:|------|
| L-01 | **Enable beta access** | Ops | Soft launch ON · caps enforced · maintenance OFF | ☐ | |
| L-02 | **Verify first driver online** | Ops | Operations Center map · green/online marker · GPS updating | ☐ | |
| L-03 | **Verify first courier online** | Ops | Delivery fleet view · courier online | ☐ | |
| L-04 | **Verify first rider login** | Support | CRM shows active session · welcome message sent | ☐ | |
| L-05 | **Complete first ride** | QA + Ops | Request → accept → arrive → PIN → start → complete | ☐ | |
| L-06 | **Complete first delivery** | QA + Ops | Request → accept → pickup PIN → deliver → proof photo | ☐ | |
| L-07 | **Verify payment** | Finance | `/admin/payments` · status paid/authorized · amount correct | ☐ | |
| L-08 | **Verify wallet update** | Finance | Driver/courier wallet balance increased post-trip | ☐ | |
| L-09 | **Verify withdrawal workflow** | Finance | Test withdrawal → OTP → pending queue visible (do not force paid on Day 1 unless tested) | ☐ | |
| L-10 | **Verify CEO dashboard updates** | CEO | Launch Hub KPIs reflect completed ride/delivery | ☐ | |

### First ride script (witness log)

| Step | Actor | Action | OK ☐ |
|------|-------|--------|:----:|
| 1 | Rider | Open app → request ride (Regular) → confirm fare | ☐ |
| 2 | Driver | Receive offer → accept within 30 s | ☐ |
| 3 | Rider | See driver assigned · map updates | ☐ |
| 4 | Driver | Navigate → Arrived (GPS at pickup) | ☐ |
| 5 | Rider | Share PIN with driver | ☐ |
| 6 | Driver | Verify PIN → Start ride | ☐ |
| 7 | Driver | Complete ride at destination | ☐ |
| 8 | Rider | Rate driver · view receipt | ☐ |
| 9 | Ops | Confirm ride `completed` in Operations Center | ☐ |

**Launch moment declared:** _________________ **Time:** _________ **By:** _____________

---

# SECTION 4 — FIRST 24 HOURS

**Owner:** Operations Manager (continuous) · **Engineering on-call** for P0  
**Cadence:** Health check every **15 min** (hours 0–6) · every **30 min** (hours 6–24)

### 4.1 Monitoring dashboard

| Surface | URL | Refresh |
|---------|-----|---------|
| Production Status | `/admin/status` | 5 min |
| Operations Center | `/admin/operations` | Live |
| Launch Command | `/admin/command` | 20 s auto |
| Launch Hub | `/admin/launch` | 15 min |
| Support Center | `/admin/support` | 10 min |
| Finance Ops | `/admin/finance-ops` | 30 min |

### 4.2 Metrics to watch

| Metric | Source | Green | Yellow | Red | Log every |
|--------|--------|-------|--------|-----|-----------|
| **API health** | `/api/health/ready/` | 200 OK | 503 < 5 min | 503 > 5 min | 15 min |
| **Active users** | Launch Hub · CRM | Growing | Flat 4 h | Declining | 1 h |
| **Completed rides** | Operations Center | ≥ 1/h peak | 0 in 2 h peak | Stuck requests > 30 min | 1 h |
| **Completed deliveries** | Operations Center | ≥ 1 if couriers on | 0 all day | Failed > 50% | 1 h |
| **Failed payments** | `/admin/payments` · Support | 0 | 1–2 | ≥ 3 or any > 1000 MRU | Real-time |
| **GPS issues** | Support tags `gps` | 0 | 1–2 | ≥ 3 or ride blocked | Real-time |
| **Crash reports** | Support tags `crash` · Play vitals | 0 | 1 | ≥ 2 | Real-time |
| **Support tickets** | `/admin/support` | < 5 open | 5–10 | > 10 or any P0 open | 30 min |
| **Incidents** | Launch Hub | 0 open S1 | 1 S2 | Any S1 open > 15 min | Real-time |

**Hourly log template:** Use `DAY1_OPERATIONS_CHECKLIST.md` hourly section.

### 4.3 Escalation matrix

| Priority | Definition | Response time | Escalate to | Channel |
|----------|------------|:-------------:|-------------|---------|
| **P0** | API down · mass payment failure · SOS unhandled · data loss · ride stuck fleet-wide | **Immediate** (< 15 min) | CEO + Engineering | Call + war room |
| **P1** | Single payment fail · driver can't go online · GPS widespread · withdrawal stuck | **Same day** (< 4 h) | Ops Manager + Finance | War room |
| **P2** | UI glitch · slow dashboard · non-blocking suggestion | **Weekly review** | Support lead | Ticket only |

**P0 procedure:** `POST_LAUNCH_SUPPORT_PROCEDURES.md` § Critical Incident  
**Incident creation:** Launch Hub → Incidents → severity **critical** or **high**

### 4.4 Engineering hotfix rule (Day 1)

- **Allowed:** P0 defect fixes only · no new features  
- **Process:** Branch → fix → test → deploy → post in war room  
- **Rollback:** Maintenance mode ON if fix fails verification  

---

# SECTION 5 — END OF DAY (T+24 HOURS)

**Owner:** Operations Manager → CEO  
**Deliverable:** Completed `DAY1_CEO_REPORT_TEMPLATE.md`  
**Deadline:** 23:30 UTC on launch day

### 5.1 Data collection

| Report section | Primary source |
|----------------|----------------|
| Revenue | Finance Operations Center · `/admin/finance-ops` |
| Trips | Launch Hub · Operations Center |
| Deliveries | Operations Center → Deliveries |
| Active drivers / couriers / riders | Launch Hub onboarding · CRM |
| Incidents | Launch Hub → Incidents |
| Support summary | Support Center dashboard |
| Payment summary | `/admin/payments` · Finance reconciliation |
| Launch score | `LAUNCH_DECISION.md` scoring rubric + Day 1 observations |

### 5.2 Automated helpers

```bash
# On production server
ssh root@142.93.99.142
cd /opt/yala

# CEO daily JSON
scripts/soft-launch-daily-reports.sh daily-ceo

# Exit criteria snapshot
scripts/soft-launch-daily-reports.sh exit-criteria

# Backup verification
scripts/backup-monitor.sh
```

### 5.3 Day 1 retrospective (30 min · optional)

| Question | Notes |
|----------|-------|
| Did first ride complete without manual intervention? | |
| Top 3 support issues? | |
| Any P0/P1 opened today? | |
| Cohort feedback (drivers/riders)? | |
| Adjustments for Day 2? | |

### 5.4 EOD sign-off

| Role | Signature | Date |
|------|-----------|------|
| Operations Manager | | |
| CEO (acknowledge Day 1 report) | | |

---

## Quick reference

| Need | Document |
|------|----------|
| Printable checklists | `DAY1_OPERATIONS_CHECKLIST.md` |
| CEO end-of-day report | `DAY1_CEO_REPORT_TEMPLATE.md` |
| Ongoing beta ops | `CLOSED_BETA_RUNBOOK.md` |
| Success metrics | `BETA_SUCCESS_METRICS.md` |
| Known issues | `KNOWN_ISSUES_v1.0.0.md` |
| Support playbooks | `POST_LAUNCH_SUPPORT_PROCEDURES.md` |

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial Closed Beta Launch Day Playbook |

---

*Yala Technologies · Closed Beta Launch Day · Documentation only · Feature freeze active*
