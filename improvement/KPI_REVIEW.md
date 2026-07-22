# YALA Enterprise — KPI Review Process

**Document ID:** CIP-KPI-REVIEW-001  
**Version:** YALA Enterprise v1.0  
**Date:** 2026-07-22  
**Status:** Active  
**Related:** [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) · [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) · [program-management/KPI_SCOREBOARD.md](../program-management/KPI_SCOREBOARD.md)

---

## Purpose

Define **when**, **how**, and **by whom** YALA business and operational KPIs are reviewed to drive continuous improvement.

---

## Review cadence overview

| Cadence | Focus | Owner | Output | Audience |
|---------|-------|-------|--------|----------|
| **Daily** | Ops health, beta metrics, P0 alerts | Operations Manager | Daily snapshot | Ops + CEO (beta) |
| **Weekly** | Program KPIs, feedback trends, sprint progress | Program Office | Weekly status | All leads + CEO |
| **Monthly** | Business KPIs, CIP backlog, improvement ROI | CEO + Finance | Monthly review | Executive team |
| **Quarterly** | Strategic alignment, v1.1/v2 priorities | CEO | Quarterly plan | Board / investors |
| **Annual** | Platform retrospective, CIP policy review | Program Office | Annual report | CEO + leadership |

---

## Daily review

**When:** Every operational day during Closed Beta and first 90 days post-GA; reduced to weekdays after stabilization.

**Owner:** Operations Manager (delegate: duty officer)

**Duration:** 15–30 minutes

### Metrics reviewed

| Metric | Target | Source |
|--------|--------|--------|
| Active drivers online | Per city plan | Operations Center |
| Active couriers online | Per city plan | Operations Center |
| Rides in progress / completed (24 h) | Trend up | Launch Hub |
| Deliveries completed (24 h) | Trend up | Launch Hub |
| Open SOS / incidents | 0 unresolved P0 | Trust & Safety |
| Support ticket backlog | < 24 h oldest | Support Center |
| API health | 200 ready | `/api/health/ready/` |
| Critical errors (Sentry) | Below baseline | Monitoring |

**Reference:** `release/BETA_SUCCESS_METRICS.md` · `release/DAY1_OPERATIONS_CHECKLIST.md` · `docs/CEO_DAILY_CHECKLIST.md`

### Daily output

- Update CEO daily dashboard template (`release/CEO_DAILY_DASHBOARD_TEMPLATE.md`)
- Escalate 🔴 metrics to Engineering + CEO same day
- Log ops anomalies as feedback items if pattern detected

---

## Weekly review

**When:** Every Monday 09:00 UTC (align with program dashboard refresh)

**Owner:** Program Office

**Duration:** 60 minutes

**Participants:** Engineering Lead, DevOps, QA Lead, Operations Manager, Product Lead, Support Lead, Finance Lead (optional)

### Metrics reviewed

| Domain | Key KPIs | Source |
|--------|----------|--------|
| **Engineering** | Test pass rate, open P0 bugs, deploy status | KPI_SCOREBOARD |
| **QA** | Device QA status, E2E certification | UAT checklist |
| **Operations** | Pilot cohort progress, dispatch metrics | Launch Hub |
| **Deployment** | Staging/prod parity, migration status | PROJECT_STATUS |
| **Launch** | RC/Gate A/B readiness score | EXECUTIVE_SCORECARD |
| **Feedback** | New items, triage backlog age | CUSTOMER_FEEDBACK_PROCESS |

### Business metrics (weekly snapshot)

| Metric | Target (beta) | Source |
|--------|:-------------:|--------|
| **Ride completion rate** | > 95% | Launch Hub · BETA_SUCCESS_METRICS |
| **Delivery completion rate** | > 90% | Launch Hub |
| **Driver acceptance rate** | ≥ 70% | BI / Launch KPIs |
| **Customer satisfaction (CSAT)** | ≥ 4.0 / 5.0 | Surveys / support |
| **Driver retention (7-day)** | ≥ 80% active | Fleet dashboard |
| **Merchant growth** | +N new approved/week | Merchant Platform |

### Weekly output

- Complete [WEEKLY_STATUS_TEMPLATE.md](../program-management/WEEKLY_STATUS_TEMPLATE.md)
- Update [PROGRAM_DASHBOARD.md](../program-management/PROGRAM_DASHBOARD.md)
- Update [KPI_SCOREBOARD.md](../program-management/KPI_SCOREBOARD.md)
- Assign actions to [ACTION_REGISTER.md](../program-management/ACTION_REGISTER.md)

---

## Monthly review

**When:** First business Monday of each month

**Owner:** CEO (facilitated by Program Office)

**Duration:** 2 hours

**Participants:** Full leadership team

### Metrics reviewed

| Metric | Definition | Target | Owner |
|--------|------------|--------|-------|
| **Revenue** | Gross platform revenue (rides + delivery + fees) | Monthly plan | Finance Lead |
| **Ride completion rate** | Completed ÷ non-cancelled requests (30-day) | > 95% | Operations |
| **Delivery completion rate** | Delivered ÷ accepted orders (30-day) | > 90% | Operations |
| **Customer satisfaction** | CSAT or NPS | ≥ 4.0 / ≥ 30 NPS | Product |
| **Driver retention** | Active drivers week 4 ÷ week 1 cohort | ≥ 75% | Operations |
| **Merchant growth** | Active merchants (≥1 order/month) | Growth plan | Growth |
| **Support SLA** | Tickets resolved within SLA | ≥ 95% | Support |
| **Platform uptime** | API availability | ≥ 99.5% | DevOps |
| **CIP backlog velocity** | Items closed ÷ opened | > 1.0 | Program Office |

### Data sources

| System | Metrics |
|--------|---------|
| Finance Operations Center | Revenue, settlements, withdrawals |
| Business Intelligence Center | Completion rates, cohort analysis |
| Launch Hub / Growth dashboard | Acquisition, retention |
| Customer Growth Center | Loyalty, referrals |
| Merchant Platform | Merchant counts, order volume |
| Support / Beta Feedback | CSAT, ticket trends |

### Monthly output

- Monthly executive summary (1 page)
- [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) grooming — approve/deny v1.1 items
- [RISK_REGISTER.md](../program-management/RISK_REGISTER.md) update
- [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) update

---

## Quarterly review

**When:** First month of each quarter (Jan, Apr, Jul, Oct)

**Owner:** CEO

**Duration:** Half day

### Focus areas

| Area | Questions |
|------|-----------|
| **Strategy** | Are we on track for GA and growth targets? |
| **Product** | Which v1.1 items deliver highest ROI? |
| **Version 2** | Any Phase 40–44 items ready for business case? |
| **Operations** | City expansion readiness? Supply/demand balance? |
| **Finance** | Unit economics, take rate, payout accuracy? |
| **People & process** | CIP effectiveness; team capacity |

### Quarterly metrics (trends)

| Metric | Q target | Review |
|--------|:--------:|--------|
| Revenue | Quarterly plan | Trend vs plan |
| Ride completion | > 95% | QoQ |
| Delivery completion | > 90% | QoQ |
| Customer satisfaction | Improving | QoQ |
| Driver retention (90-day) | ≥ 60% | QoQ |
| Merchant growth | Net new merchants | QoQ |
| Platform availability | ≥ 99.9% | QoQ |

### Quarterly output

- Update [VERSION2_BACKLOG.md](../docs/VERSION2_BACKLOG.md) priorities (no implementation without approval)
- Board/investor KPI pack via Board Reporting Suite (Phase 35)
- Quarterly OKRs for next quarter

---

## Annual review

**When:** Q4 each year (or anniversary of GA)

**Owner:** Program Office + CEO

**Duration:** Full day retrospective

### Activities

1. Review annual KPI trends (all metrics below).
2. Assess CIP policy effectiveness — update [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) if needed.
3. Comprehensive [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) synthesis.
4. Strategic planning input for next year → VERSION2_BACKLOG / business plan.
5. Team retrospective (engineering, ops, support).

### Annual metrics summary

| Metric | Annual target | Benchmark |
|--------|:-------------:|-----------|
| Revenue | Annual plan | YoY growth |
| Ride completion | > 95% avg | Industry baseline |
| Delivery completion | > 90% avg | |
| Customer satisfaction | NPS ≥ 40 | |
| Driver retention (annual) | ≥ 50% | |
| Merchant growth | Net merchant count | |
| Incidents (P0) | < 4 per year | |
| Releases shipped | Per calendar | |

---

## Core business metrics — definitions

### Revenue

| Field | Detail |
|-------|--------|
| **Definition** | Total platform revenue: ride fares + delivery fees + commissions + subscription (if any) |
| **Formula** | Sum of completed transaction revenue per Finance Operations |
| **Cadence** | Daily snapshot · Weekly trend · Monthly close |
| **Owner** | Finance Lead |
| **Source** | Finance Operations Center · `/admin/finance-ops` |
| **Improvement trigger** | > 10% below plan for 2 consecutive weeks |

### Ride completion rate

| Field | Detail |
|-------|--------|
| **Definition** | Rides reaching `completed` ÷ non-cancelled ride requests |
| **Target** | > 95% (beta and GA) |
| **Cadence** | Daily (beta) · Weekly · Monthly |
| **Owner** | Operations Manager |
| **Source** | Launch Hub · `release/BETA_SUCCESS_METRICS.md` |
| **Improvement trigger** | < 90% for 2 consecutive days |

### Delivery completion rate

| Field | Detail |
|-------|--------|
| **Definition** | Deliveries reaching `delivered` ÷ accepted delivery requests |
| **Target** | > 90% |
| **Cadence** | Daily (beta) · Weekly · Monthly |
| **Owner** | Operations Manager |
| **Source** | Launch Hub · Delivery analytics |
| **Improvement trigger** | < 85% for 2 consecutive days |

### Customer satisfaction

| Field | Detail |
|-------|--------|
| **Definition** | CSAT (post-ride/delivery survey) or NPS (quarterly) |
| **Target** | CSAT ≥ 4.0/5.0 · NPS ≥ 30 |
| **Cadence** | Weekly sample · Monthly aggregate · Quarterly NPS |
| **Owner** | Product Lead |
| **Source** | Surveys · support feedback · app store ratings |
| **Improvement trigger** | CSAT < 3.5 or NPS drop > 10 points |

### Driver retention

| Field | Detail |
|-------|--------|
| **Definition** | % of drivers active in week N who were active in week N-4 (rolling) |
| **Target** | ≥ 80% (weekly) · ≥ 75% (monthly cohort) |
| **Cadence** | Weekly · Monthly |
| **Owner** | Operations Manager |
| **Source** | Fleet Performance Center · BI |
| **Improvement trigger** | < 70% for 2 consecutive weeks |

### Merchant growth

| Field | Detail |
|-------|--------|
| **Definition** | Net active merchants (≥1 completed order in 30 days) |
| **Target** | Per growth plan (monthly net +N) |
| **Cadence** | Weekly new approvals · Monthly active count |
| **Owner** | Growth / Operations |
| **Source** | Merchant Platform · Growth dashboard |
| **Improvement trigger** | Zero net growth for 4 consecutive weeks |

---

## KPI → improvement linkage

| KPI red trigger | Automatic action |
|-----------------|------------------|
| Ride completion < 90% | Ops incident review → IMPROVEMENT_BACKLOG or bug |
| Driver retention < 70% | Driver incentive + ops outreach review |
| CSAT < 3.5 | Product feedback deep-dive within 48 h |
| Revenue > 10% below plan | Finance + CEO review within 1 week |
| Merchant growth flat | Growth campaign review |

Reference: [CONTINUOUS_IMPROVEMENT_POLICY.md](./CONTINUOUS_IMPROVEMENT_POLICY.md) Stage 1–3

---

## Cross-references

| Document | Purpose |
|----------|---------|
| [PROJECT_STATUS.md](../docs/PROJECT_STATUS.md) | Current platform status |
| [KPI_SCOREBOARD.md](../program-management/KPI_SCOREBOARD.md) | Program KPI scores |
| [BETA_SUCCESS_METRICS.md](../release/BETA_SUCCESS_METRICS.md) | Beta metric definitions |
| [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) | Improvement items from KPI gaps |

---

*Effective 2026-07-22 · Owner: Program Office · Review this process annually*
