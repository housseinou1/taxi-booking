# Yala — CEO Daily Dashboard Template

**Document ID:** BETA-CEO-DASH-001  
**Effective:** 2026-07-21  
**Audience:** H. Sakho, CEO · Executive staff  
**Cadence:** Daily · 07:00 UTC (automated) + EOD ops summary  
**Beta duration:** 14 days  

**Related:** `BETA_OPERATIONS_RUNBOOK.md` · `BETA_SUCCESS_METRICS.md` · `CLOSED_BETA_EXIT_CRITERIA.md`

---

## How to use

1. **Morning (07:00 UTC)** — review automated JSON or complete Section A from Launch Hub.  
2. **Evening (23:00 UTC)** — Ops completes Section B action items.  
3. **Day 7 & Day 14** — attach exit criteria scorecard from `CLOSED_BETA_EXIT_CRITERIA.md`.

**Automated report:**

```bash
ssh root@142.93.99.142
cd /opt/yala
scripts/soft-launch-daily-reports.sh daily-ceo
```

**Live dashboard:** https://yalataxi.live/admin/launch → CEO KPIs

---

# Section A — Morning dashboard

**Date:** __________________ **Beta day:** D___ / 14 **Prepared by:** ________________

---

## 1. Revenue

| Metric | Today | Yesterday | Beta cumulative | Trend |
|--------|------:|----------:|----------------:|:-----:|
| Gross revenue (MRU) | | | | ☐ ↑ ☐ → ☐ ↓ |
| Ride revenue | | | | |
| Delivery revenue | | | | |
| Refunds issued (MRU) | | | | |
| **Net revenue (est.)** | | | | |

**Notes:** _________________________________________________________________

---

## 2. Completed rides

| Metric | Today | Yesterday | 7-day total | Target |
|--------|------:|----------:|------------:|--------|
| Ride requests | | | | |
| **Completed rides** | | | | ↑ daily |
| Cancelled rides | | | | < 20% |
| Ride completion rate | | | | > 95% |
| Driver acceptance rate | | | | ≥ 70% |

**Notes:** _________________________________________________________________

---

## 3. Completed deliveries

| Metric | Today | Yesterday | 7-day total | Target |
|--------|------:|----------:|------------:|--------|
| Delivery requests | | | | |
| **Completed deliveries** | | | | ≥ 1/day |
| Delivery completion rate | | | | > 95% |
| Active deliveries (now) | | | | — |

**Notes:** _________________________________________________________________

---

## 4. Active drivers

| Metric | Value | Cap |
|--------|------:|----:|
| **Online now** | | — |
| Approved (total) | | **20** |
| Completed ride today (unique) | | — |
| Active last 7 days | | — |
| Gap to cap | | |

**Peak drivers online yesterday:** _____ **At time:** _____

---

## 5. Active couriers

| Metric | Value | Cap |
|--------|------:|----:|
| **Online now** | | — |
| Approved (total) | | **10** |
| Completed delivery today (unique) | | — |
| Active last 7 days | | — |
| Gap to cap | | |

---

## 6. Active riders

| Metric | Value | Cap |
|--------|------:|----:|
| Registered (total) | | **100** |
| New today | | — |
| **Active last 7 days** (≥ 1 ride) | | — |
| Active last 7 days (%) | | ≥ 30% |
| Gap to cap | | |

---

## 7. Incidents

| Severity | Open | New (24 h) | Resolved (24 h) |
|----------|:----:|:----------:|:---------------:|
| S1 Critical | | | |
| S2 High | | | |
| S3 Medium | | | |
| **Total open** | | | |

| Time | Type | Summary | Owner | Status |
|------|------|---------|-------|--------|
| | | | | |
| | | | | |

**SOS events (24 h):** _____ **All handled:** ☐ Yes ☐ No

---

## 8. Failed payments

| Metric | Today | Open disputes | Action |
|--------|------:|--------------:|--------|
| Failed payment attempts | | | |
| Payment success rate (7d) | | | Target ≥ 99% |
| Refund requests (open) | | | |
| Withdrawals pending | | | Target < 48 h |
| Cash Out failures | | | |

**Finance escalation:** ☐ Required ☐ Not required

**Notes:** _________________________________________________________________

---

## 9. Infrastructure health

| Component | Status | Last checked |
|-----------|:------:|--------------|
| API | ☐ OK ☐ Degraded ☐ Down | |
| Database | ☐ OK ☐ Degraded | |
| Redis | ☐ OK ☐ Degraded | |
| Celery | ☐ OK ☐ Degraded | |
| WebSocket | ☐ OK ☐ Degraded | |
| SSL / HTTPS | ☐ OK | |
| Local backup (24 h) | ☐ OK ☐ FAIL | |
| Offsite backup | ☐ OK ☐ FAIL ☐ N/A | |
| p95 latency | _____ ms | Target < 2000 ms |

**Platform status:** ☐ Normal ☐ Degraded ☐ Maintenance

**Containers (9 Up):** ☐ Verified ☐ Not checked

---

## 10. Top action items

| # | Priority | Action | Owner | Due | ☐ |
|---|:--------:|--------|-------|-----|:-:|
| 1 | | | | | ☐ |
| 2 | | | | | ☐ |
| 3 | | | | | ☐ |
| 4 | | | | | ☐ |
| 5 | | | | | ☐ |

**CEO decisions required today:**

1. _________________________________________________________________  
2. _________________________________________________________________  

---

### CEO morning ack

| Field | Value |
|-------|-------|
| Reviewed by | H. Sakho, CEO |
| Time | |
| Beta status | ☐ Continue ☐ Hold ☐ Escalate |
| Signature | |

---

# Section B — End of day summary (Ops)

**Completed by:** _________________ **Time:** _________________

| Area | Summary |
|------|---------|
| Best result today | |
| Worst issue today | |
| Metrics updated in `BETA_SUCCESS_METRICS.md` | ☐ Yes |
| Tomorrow's focus | |

---

## Automated JSON field map

For `daily_ceo_YYYYMMDD.json`:

| Dashboard section | JSON field |
|-------------------|------------|
| Revenue today | `revenue_today` |
| Drivers online | `drivers_online` |
| Couriers online | `couriers_online` |
| Active rides | `active_rides` |
| Active deliveries | `active_deliveries` |
| Withdrawals pending | `withdrawals_pending` |
| Refunds today | `refunds_today` |
| Open incidents | `open_incidents` |
| Critical alerts | `critical_alerts[]` |
| Platform health | `platform_health` |
| Support summary | `support` |
| Live metrics | `live` |

---

## Escalation — call CEO immediately

| Trigger | Condition |
|---------|-----------|
| S1 incident | API down, SOS unhandled > 5 min |
| Payment batch failure | ≥ 3 failures in 1 hour |
| Safety | Injury-related SOS |
| New P0 defect | Any launch blocker discovered |
| Fleet collapse | 0 drivers online > 2 h at peak |

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial CEO daily dashboard template (2-week closed beta) |
