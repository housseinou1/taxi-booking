# Yala Closed Beta — Metrics Dashboard

**Document ID:** BETA-METRICS-001  
**Effective:** 2026-07-21  
**Release:** v1.0.0-rc2  
**Pilot city:** Nouakchott  
**Update frequency:** Daily (EOD) + live via admin dashboards  

**Related:** `CLOSED_BETA_RUNBOOK.md` · `DAILY_CEO_REPORT.md` · `UAT_KNOWN_ISSUES_REGISTER.md`

---

## How to use

1. **Live data** — pull from admin dashboards (see § Data sources).  
2. **Daily snapshot** — fill one row in the tracking table at shutdown (§ Daily log).  
3. **Weekly review** — Monday stand-up; compare vs targets in § Targets.  
4. **Escalate** — any metric in red for 2 consecutive days → open S2 incident + CEO brief.

**Legend:** 🟢 On target · 🟡 Watch · 🔴 Action required

---

## Pilot caps (closed beta)

| Cohort | Cap | Purpose |
|--------|-----|---------|
| Drivers | **20** | Limit dispatch pressure on 2-vCPU prod |
| Couriers | **10** | Validate delivery with small pool |
| Riders | **100** | Sufficient feedback without overload |

---

## Core metrics

### 1. User growth & activity

| Metric | Definition | Target (beta) | Live source |
|--------|------------|---------------|-------------|
| **New riders** | Riders registered today (cumulative beta total) | Steady invite-only growth toward 100 | Launch Hub → Onboarding · `/operations/launch/onboarding/` |
| **Active riders** | Riders with ≥ 1 completed ride in last 7 days | ≥ 30% of registered riders | Business BI → `kpis.users.active_riders_7d` |
| **Active drivers** | Approved drivers with ≥ 1 completed ride in last 7 days | ≥ 50% of approved (≥ 10 of 20) | Business BI → driver productivity |
| **Active couriers** | Approved couriers with ≥ 1 delivery in last 7 days | ≥ 50% of approved | Business BI → courier productivity |
| **Drivers online (now)** | `is_available = true` + GPS recent | ≥ 2 during peak hours | Launch Hub → live metrics |
| **Couriers online (now)** | Delivery mode on + available | ≥ 1 during peak | Operations Center live panel |

### 2. Trip volume

| Metric | Definition | Target (beta) | Live source |
|--------|------------|---------------|-------------|
| **Ride requests** | `POST /rides/request/` created today | Trend up week-over-week | Launch Hub KPIs · `live.ride_requests_today` |
| **Completed rides** | Rides with `status = completed` today | ≥ 80% of requests | Launch Hub · `revenue_today` context |
| **Completed deliveries** | Deliveries with `status = delivered` today | ≥ 1/day once couriers live | Operations Center · `active_deliveries` |
| **Active rides (now)** | In-progress rides | Monitor for stuck states | `/operations/launch/live/` |
| **Active deliveries (now)** | In-progress deliveries | Monitor for stuck states | Operations Center |

### 3. Quality & reliability

| Metric | Definition | Target (beta) | Live source |
|--------|------------|---------------|-------------|
| **Acceptance rate** | Accepted requests ÷ total requests (7-day rolling) | **≥ 70%** | Business BI → `kpis.rates.acceptance_rate_pct` |
| **Cancellation rate** | Cancelled ÷ total requests (7-day rolling) | **< 20%** | Business BI → `kpis.rates.cancellation_rate_pct` |
| **Ride completion rate** | Completed ÷ non-cancelled requests | **> 95%** | Weekly exec report · exit criteria |
| **Average ETA** | Mean time request → driver arrived (min) | < 15 min (Nouakchott beta) | Manual sample + ride timestamps |
| **Avg rider rating** | Mean rating on completed rides (7-day) | **≥ 4.0** | Weekly exec report |
| **p95 API latency** | 95th percentile response time under load | < 2000 ms (currently ~4086 ms — watch) | `scripts/launch-perf-smoke.py` weekly |

### 4. Payments & wallet

| Metric | Definition | Target (beta) | Live source |
|--------|------------|---------------|-------------|
| **Payment success rate** | Paid ÷ total payment attempts (7-day) | **≥ 98%** | Finance Center · exit criteria report |
| **Failed payments today** | `PaymentRecord.status = failed` today | **0** (investigate any) | CEO daily report · `/admin/payments` |
| **Revenue today (MRU)** | Sum of completed ride/delivery fares today | Track trend | Launch Hub → `revenue_today` |
| **Wallet withdrawals (pending)** | Open withdrawal requests | Clear within 48 h | `/payments/withdrawals/` · `withdrawals_pending` |
| **Wallet withdrawals (today)** | Processed withdrawals today | — | Finance Center |
| **Refunds today** | Approved refunds issued today | — | Finance reconciliation report |

### 5. Support & stability

| Metric | Definition | Target (beta) | Live source |
|--------|------------|---------------|-------------|
| **Crash reports** | App crashes reported via support or device QA | **0 P0 crashes** | Support tickets · device QA bug log |
| **Support tickets (open)** | Open + in-progress tickets | **< 10** | Launch Hub support · `support.open_tickets` |
| **Support tickets (today)** | New tickets created today | Trend down after week 1 | Support queue |
| **SOS / safety events** | Safety incidents + SOS alerts today | **0 unhandled** | Operations Center emergency panel |
| **Open incidents** | Ops incidents open or investigating | **0 S1/S2 overnight** | Launch Hub incidents |
| **Platform health** | API + DB + Redis + Celery + WebSocket | All OK | `/admin/status` · `/health/` |

### 6. Issues register

| Metric | Definition | Target (beta) | Live source |
|--------|------------|---------------|-------------|
| **P0 issues (open)** | Launch blockers | **0 new** · resolve known 2 | `UAT_KNOWN_ISSUES_REGISTER.md` |
| **P1 issues (open)** | High priority; beta acceptable with monitoring | Trend down | Known issues register |
| **P2 issues (open)** | Backlog | Track only | Known issues register |

**Known P0 at beta start (2026-07-21):**

1. Physical Android device QA not signed off  
2. Offsite encrypted backups not configured  

---

## Targets summary (closed beta week 1–4)

| Metric | Week 1 | Week 2 | Week 4 | Gate |
|--------|--------|--------|--------|------|
| Approved drivers | 5 | 10 | 20 | Cap |
| Approved couriers | 2 | 5 | 10 | Cap |
| Registered riders | 20 | 50 | 100 | Cap |
| Daily completed rides | 5 | 15 | 30 | Growth |
| Acceptance rate | ≥ 60% | ≥ 70% | ≥ 75% | Quality |
| Cancellation rate | < 25% | < 20% | < 15% | Quality |
| Payment success | ≥ 95% | ≥ 98% | ≥ 99% | Finance |
| Open support tickets | < 15 | < 10 | < 5 | Ops |
| P0 issues | 0 new | 0 new | 0 open | Launch |

---

## Data sources

### Admin dashboards (live)

| Dashboard | URL | Key fields |
|-----------|-----|------------|
| Launch Hub | https://yalataxi.live/admin/launch | KPIs, onboarding, incidents, support |
| Live metrics API | `/operations/launch/live/` | Active rides/deliveries, online fleet |
| Onboarding API | `/operations/launch/onboarding/` | Cohort counts vs caps |
| Business BI | `/operations/business/bi/` | `ceo_report.kpis`, growth, rates |
| Finance Center | `/admin/business` → Finance | Revenue, refunds, reconciliation |
| Operations Center | `/admin/operations` | Live map, emergency, deliveries |
| System status | https://yalataxi.live/admin/status | Infra health |

### Automated reports (production)

```bash
ssh root@142.93.99.142
cd /opt/yala
scripts/soft-launch-daily-reports.sh daily-ceo      # 07:00 UTC cron
scripts/soft-launch-daily-reports.sh weekly-exec    # Monday 08:00 UTC
scripts/soft-launch-daily-reports.sh financial
scripts/soft-launch-daily-reports.sh exit-criteria
```

**Output directory:** `/home/yala/reports/soft-launch/`

### Manual / device

| Metric | Source |
|--------|--------|
| Crash reports | `release/physical-device-qa/BUG_REPORT_TEMPLATE.md` |
| Physical QA sign-off | `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` |
| p95 latency | `python scripts/launch-perf-smoke.py` (weekly) |

---

## Daily log

Fill at end of day. Copy forward each week; archive monthly.

| Date | New riders | Active riders (7d) | Active drivers (7d) | Active couriers (7d) | Ride req | Rides done | Deliveries done | Accept % | Cancel % | Avg ETA (min) | Pay success % | Wdraw pending | Crashes | Tickets open | P0 | P1 | Notes |
|------|:----------:|:------------------:|:-------------------:|:--------------------:|:--------:|:----------:|:---------------:|:--------:|:--------:|:-------------:|:-------------:|:-------------:|:-------:|:------------:|:--:|:--:|-------|
| 2026-07-21 | | | | | | | | | | | | | | | 2 | | Beta start |
| | | | | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | | | | |
| | | | | | | | | | | | | | | | | | |

**Weekly rollup owner:** _________________ **Review date:** _________

---

## Alert thresholds

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Acceptance rate | < 60% for 2 days | Review dispatch + driver incentives |
| Cancellation rate | > 25% for 2 days | Ops call drivers; check ETA |
| Failed payments | ≥ 3 in 1 day | S2 incident; Finance reconciliation |
| Open support tickets | > 15 | Add support capacity |
| SOS unhandled | > 5 min | S1 incident (see runbook) |
| API health degraded | Any component not OK | S1 if user-facing; check containers |
| Drivers online at peak | < 2 | Recruitment push; contact offline drivers |
| P0 issue opened | Any new | Halt cohort expansion; CEO brief |
| Withdrawals pending | > 48 h | Finance escalation |

---

## Weekly metrics review agenda (30 min)

1. Compare daily log vs targets (§ Targets summary)  
2. Review `weekly_executive_*.json` recommendations  
3. Update known issues register (close / open items)  
4. Decide: expand cohort · hold · rollback feature  
5. Assign action items with owners + due dates  

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial closed beta metrics dashboard |
