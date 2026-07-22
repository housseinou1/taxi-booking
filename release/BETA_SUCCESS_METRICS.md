# Yala Closed Beta — Success Metrics

**Document ID:** BETA-SUCCESS-METRICS-001  
**Effective:** 2026-07-21  
**Beta duration:** 14 days  
**Review cadence:** Daily snapshot · Day 7 mid-review · Day 14 exit assessment  

**Related:** `BETA_OPERATIONS_RUNBOOK.md` · `CEO_DAILY_DASHBOARD_TEMPLATE.md` · `CLOSED_BETA_EXIT_CRITERIA.md`

---

## Purpose

Define the **12 success metrics** for the 2-week closed beta. Each metric has a definition, data source, beta target, and red/yellow/green thresholds. Use the daily log to track trends and feed the exit criteria assessment.

**Legend:** 🟢 On target · 🟡 Watch · 🔴 Action required

---

## Metrics definitions

### 1. Driver acceptance rate

| Field | Value |
|-------|-------|
| **Definition** | Rides accepted by a driver ÷ total ride requests dispatched (7-day rolling) |
| **Formula** | `accepted / (accepted + timed_out + rejected)` |
| **Beta target** | **≥ 70%** by Day 7 · **≥ 75%** by Day 14 |
| **Source** | Business BI → `kpis.rates.acceptance_rate_pct` · Launch Hub KPIs |
| **🟢** | ≥ 70% |
| **🟡** | 60–69% |
| **🔴** | < 60% for 2 consecutive days |

**If red:** Call offline drivers · review dispatch radius · check driver incentives

---

### 2. Ride completion rate

| Field | Value |
|-------|-------|
| **Definition** | Rides reaching `status = completed` ÷ non-cancelled ride requests (7-day rolling) |
| **Beta target** | **> 95%** |
| **Source** | `scripts/soft-launch-daily-reports.sh exit-criteria` · Launch Hub |
| **🟢** | > 95% |
| **🟡** | 90–95% |
| **🔴** | < 90% |

**If red:** Identify stuck states in Operations Center · review cancel reasons

---

### 3. Delivery completion rate

| Field | Value |
|-------|-------|
| **Definition** | Deliveries reaching `status = delivered` ÷ total delivery requests (7-day rolling) |
| **Beta target** | **> 95%** (once couriers active) |
| **Source** | Exit criteria report · Operations Center |
| **🟢** | > 95% |
| **🟡** | 90–95% or insufficient volume (< 10 deliveries/week) |
| **🔴** | < 90% with ≥ 10 deliveries |

**If red:** Review courier availability · delivery timeout settings · address accuracy

---

### 4. Cancellation rate

| Field | Value |
|-------|-------|
| **Definition** | Cancelled rides ÷ total ride requests (7-day rolling) |
| **Beta target** | **< 20%** by Day 7 · **< 15%** by Day 14 |
| **Source** | Business BI → `kpis.rates.cancellation_rate_pct` |
| **🟢** | < 15% |
| **🟡** | 15–20% |
| **🔴** | > 20% for 2 consecutive days |

**If red:** Segment by rider vs driver cancel · review ETA and acceptance

---

### 5. Average pickup time

| Field | Value |
|-------|-------|
| **Definition** | Mean minutes from ride request to driver `arrived` at pickup (completed rides) |
| **Beta target** | **< 15 min** (Nouakchott beta) |
| **Source** | Ride timestamps: `created_at` → `arrived_at` · sample 20 rides/day manually or SQL |
| **🟢** | < 12 min |
| **🟡** | 12–15 min |
| **🔴** | > 15 min at peak |

**If red:** Increase online drivers · tighten dispatch radius · peak-hour staffing

---

### 6. Average trip duration

| Field | Value |
|-------|-------|
| **Definition** | Mean minutes from ride `start` to `complete` (completed rides) |
| **Beta target** | Baseline only (no hard gate) — track for pricing validation |
| **Source** | Ride timestamps: `started_at` → `completed_at` |
| **🟢** | Stable week-over-week |
| **🟡** | > 20% deviation from Week 1 average |
| **🔴** | Anomaly suggests GPS or state-machine bug |

---

### 7. Payment success rate

| Field | Value |
|-------|-------|
| **Definition** | Payments with `status = paid` ÷ total payment attempts (7-day rolling) |
| **Beta target** | **≥ 98%** during beta · **≥ 99%** for public launch |
| **Source** | Exit criteria report · `/admin/payments` |
| **🟢** | ≥ 99% |
| **🟡** | 98–98.9% |
| **🔴** | < 98% or ≥ 3 failures in one day |

**If red:** S2 incident · Finance reconciliation · gateway status check

---

### 8. Cash Out success rate

| Field | Value |
|-------|-------|
| **Definition** | Withdrawals reaching `paid` ÷ total withdrawal requests processed (7-day rolling) |
| **Beta target** | **≥ 95%** · cleared within **48 h** |
| **Source** | `/payments/withdrawals/` · Finance Center |
| **🟢** | ≥ 98% · none pending > 48 h |
| **🟡** | 95–97% or 1–2 pending > 48 h |
| **🔴** | < 95% or any pending > 72 h |

**If red:** Finance escalation · verify OTP flow · payout method verification

---

### 9. Crash-free sessions

| Field | Value |
|-------|-------|
| **Definition** | App sessions without crash ÷ total sessions (7-day rolling, all 3 apps) |
| **Beta target** | **≥ 99%** |
| **Source** | **Manual** — device QA bug log · Play Console vitals (when available) · support tickets tagged `crash` |
| **🟢** | ≥ 99% · zero P0 crashes |
| **🟡** | 98–98.9% · P2 crashes only |
| **🔴** | < 98% or any P0 crash |

**If red:** Halt cohort expansion · hotfix under feature freeze · re-run physical QA

---

### 10. GPS accuracy

| Field | Value |
|-------|-------|
| **Definition** | % of active trips where driver GPS is within **200 m** of expected route point (sample audit) |
| **Beta target** | **≥ 90%** of sampled trips |
| **Source** | **Manual** — Operations Center live map · 10 trips/day sample · device QA checklist |
| **🟢** | ≥ 95% sample pass |
| **🟡** | 90–94% |
| **🔴** | < 90% or arrived endpoint failures |

**If red:** Review driver app location permissions · `arrived` GPS requirements · device QA § GPS tests

---

### 11. Support tickets

| Field | Value |
|-------|-------|
| **Definition** | Count of open tickets · new tickets/day · mean time to first response |
| **Beta target** | **< 10 open** · first response **< 4 h** · P0 **< 30 min** |
| **Source** | Launch Hub → Support · `support.open_tickets` in CEO report |
| **🟢** | < 5 open · SLA met |
| **🟡** | 5–10 open · 1 SLA miss |
| **🔴** | > 10 open · repeated SLA misses |

**If red:** Add support capacity · root-cause top 3 ticket categories

---

### 12. Revenue

| Field | Value |
|-------|-------|
| **Definition** | Gross MRU from completed rides + deliveries (daily and cumulative beta) |
| **Beta target** | Trend upward · no negative net after refunds |
| **Source** | Launch Hub → `revenue_today` · Finance Center · CEO dashboard |
| **🟢** | Week-over-week growth |
| **🟡** | Flat (supply-constrained) |
| **🔴** | Declining with adequate supply · reconciliation mismatch |

**If red:** Reconcile payments · check for failed completions not charged

---

## Beta targets by week

| Metric | Week 1 (Day 1–7) | Week 2 (Day 8–14) | Public launch gate |
|--------|:----------------:|:-----------------:|:------------------:|
| Driver acceptance rate | ≥ 65% | ≥ 75% | ≥ 75% |
| Ride completion rate | > 90% | > 95% | > 95% |
| Delivery completion rate | > 90%* | > 95% | > 95% |
| Cancellation rate | < 25% | < 15% | < 15% |
| Avg pickup time | < 18 min | < 15 min | < 12 min |
| Payment success | ≥ 98% | ≥ 99% | ≥ 99% |
| Cash Out success | ≥ 95% | ≥ 98% | ≥ 98% |
| Crash-free sessions | ≥ 98% | ≥ 99% | ≥ 99% |
| GPS accuracy (sample) | ≥ 85% | ≥ 90% | ≥ 95% |
| Support tickets open | < 15 | < 5 | < 5 |
| Revenue | Baseline | ↑ vs Week 1 | Sustainable |

\*Apply once ≥ 10 deliveries recorded

---

## Daily tracking log

Fill at closing checklist. **Owner:** Ops Manager

| Date | Accept % | Ride compl % | Del compl % | Cancel % | Pickup min | Trip min | Pay % | CashOut % | Crash-free % | GPS % | Tickets open | Revenue MRU | Status |
|------|:--------:|:------------:|:-----------:|:--------:|:----------:|:--------:|:-----:|:---------:|:------------:|:-----:|:------------:|:-----------:|:------:|
| D1 | | | | | | | | | | | | | |
| D2 | | | | | | | | | | | | | |
| D3 | | | | | | | | | | | | | |
| D4 | | | | | | | | | | | | | |
| D5 | | | | | | | | | | | | | |
| D6 | | | | | | | | | | | | | |
| D7 | | | | | | | | | | | | | **Mid-review** |
| D8 | | | | | | | | | | | | | |
| D9 | | | | | | | | | | | | | |
| D10 | | | | | | | | | | | | | |
| D11 | | | | | | | | | | | | | |
| D12 | | | | | | | | | | | | | |
| D13 | | | | | | | | | | | | | |
| D14 | | | | | | | | | | | | | **Exit review** |

---

## Data sources

| Type | Location |
|------|----------|
| Live KPIs | https://yalataxi.live/admin/launch |
| Business BI | `/operations/business/bi/` |
| Exit criteria JSON | `scripts/soft-launch-daily-reports.sh exit-criteria` |
| Financial | `scripts/soft-launch-daily-reports.sh financial` |
| Device / crash / GPS | `release/physical-device-qa/` |
| Automated output | `/home/yala/reports/soft-launch/` |

---

## Day 7 mid-beta review

**Attendees:** CEO · Ops Manager · Finance  
**Agenda (30 min):**

1. Review daily log — count 🟢/🟡/🔴 metrics  
2. Compare vs Week 1 targets  
3. Decision: ☐ Continue · ☐ Hold recruitment · ☐ Pause beta  
4. Assign top 3 action items  

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial closed beta success metrics (2-week program) |
