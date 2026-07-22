# YALA — CEO Operations Manual

**Document ID:** YALA-OPS-CEO-001  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** CEO, executive staff  
**Related:** `release/CEO_DAILY_DASHBOARD_TEMPLATE.md` · `release/BETA_SUCCESS_METRICS.md` · `release/LAUNCH_DECISION.md`

---

## 1. Overview

The CEO owns final launch decisions, P0 escalations, investor/board reporting, and strategic expansion. Daily oversight uses the **CEO Master Command Center** and **Operations Command Center** dashboards.

| Tool | URL | Purpose |
|------|-----|---------|
| CEO Master Command Center | `/admin/ceo-master` | Unified executive KPIs, alerts, strategic actions |
| Executive Dashboard | `/admin/executive` | Revenue, maintenance mode, platform health |
| Operations Command Center | `/admin/operations-command` | Live ops, CEO daily summary, incidents |
| Launch Control | `/admin/launch` | Beta caps, launch incidents, alerts |
| Board & Investor Reports | `/admin/board-reports` | Board packs, investor metrics |
| Trust & Safety (CEO view) | `/admin/trust-safety` | Safety score, critical incidents |
| Compliance & Governance | `/admin/compliance-governance` | Policy, audit, regulatory posture |

**Production URLs:** https://www.yalataxi.live/admin · https://api.yalataxi.live

---

## 2. Daily CEO checklist

**When:** 07:00–09:00 UTC (morning) · 22:00–23:00 UTC (EOD review)  
**Duration:** ~30 min morning · ~15 min evening

### Morning (07:00 UTC)

| # | Task | Source / action | ☐ |
|---|------|-----------------|:-:|
| D-01 | Review automated CEO daily report | `scripts/soft-launch-daily-reports.sh daily-ceo` or Launch Hub → CEO KPIs | ☐ |
| D-02 | Open CEO Master Command Center | `/admin/ceo-master` — verify dashboard loads | ☐ |
| D-03 | Revenue snapshot | Gross/net revenue, refunds, trend vs yesterday | ☐ |
| D-04 | Completed rides & deliveries | Completion rates vs targets (> 95%) | ☐ |
| D-05 | Active drivers & couriers | Online count vs caps (beta: 20 drivers / 10 couriers) | ☐ |
| D-06 | Open P0/P1 incidents | Launch Hub → Incidents — zero open S1 | ☐ |
| D-07 | Critical safety incidents | Trust & Safety → critical open count = 0 | ☐ |
| D-08 | Payment health | Failed payments, pending withdrawals > 48 h | ☐ |
| D-09 | Platform status | `/admin/status` — all green | ☐ |
| D-10 | Maintenance mode | Confirm OFF unless planned window | ☐ |
| D-11 | Beta metrics color | Cross-check `release/BETA_SUCCESS_METRICS.md` 🟢🟡🔴 | ☐ |
| D-12 | Sign off morning brief | Note blockers for ops stand-up | ☐ |

### Evening (22:00 UTC)

| # | Task | ☐ |
|---|------|:-:|
| E-01 | Review Operations Manager EOD summary | ☐ |
| E-02 | Confirm no unresolved P0/P1 | ☐ |
| E-03 | Approve pending financial items > threshold (see §7) | ☐ |
| E-04 | Note expansion or supply decisions for weekly review | ☐ |
| E-05 | Update investor/board notes if material event occurred | ☐ |

---

## 3. Weekly executive review

**When:** Monday 10:00 UTC · **Duration:** 60 min  
**Attendees:** CEO, Engineering Lead, Operations Manager, Finance Lead, Product Lead, Security Lead (as needed)

### Agenda

| # | Topic | Owner | Deliverable |
|---|-------|-------|-------------|
| W-01 | Production health & uptime | Engineering Lead | Status page summary, open incidents |
| W-02 | Beta / launch metrics | Operations Manager | 7-day trend vs `BETA_SUCCESS_METRICS.md` |
| W-03 | Revenue & unit economics | Finance Lead | Finance Ops reconciliation summary |
| W-04 | Supply (drivers/couriers) | Operations Manager | Onboarding pipeline, utilization |
| W-05 | Safety & trust | Security Lead | Trust & Safety weekly report |
| W-06 | P0/P1 bug register | QA Lead | `UAT_KNOWN_ISSUES_REGISTER.md` status |
| W-07 | Growth & campaigns | Growth Lead | Customer Growth Center summary |
| W-08 | Launch / public GO-NO-GO | CEO | Decision or defer with conditions |

### Weekly checklist

- [ ] Export CEO summary from Operations Command Center (CSV/PDF)
- [ ] Review `project-management/06_PROJECT_DASHBOARD.md` launch score
- [ ] Confirm offsite backup status (P0 blocker if not configured)
- [ ] Review partner/merchant settlement backlog
- [ ] Document decisions in Board Reports module or executive notes

---

## 4. Monthly KPI review

**When:** First business day of month · **Duration:** 90 min

### KPI dashboard sources

| KPI category | Admin module | Key metrics |
|--------------|--------------|-------------|
| Revenue | `/admin/finance-ops` | Gross, net, commission, refunds |
| Rides | `/admin/bi`, Launch Hub | Requests, completions, cancellation rate |
| Deliveries | `/admin/operations`, Merchant Platform | Completion rate, COD volume |
| Supply | `/admin/fleet`, Incentive Engine | Active drivers, acceptance rate, churn |
| Safety | `/admin/trust-safety` | Safety score, resolution time, SOS count |
| Growth | `/admin/customer-growth` | Loyalty tiers, referrals, promo ROI |
| Finance | `/admin/finance-ops` | Reconciliation status, outstanding settlements |
| Compliance | `/admin/compliance-governance` | Audit findings, policy updates |

### Monthly review workflow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Finance     │────▶│ CEO Master + BI  │────▶│ Board Reports   │
│ monthly     │     │ aggregate KPIs   │     │ export pack     │
│ close       │     └──────────────────┘     └─────────────────┘
└─────────────┘              │
                             ▼
                    ┌─────────────────┐
                    │ CEO decision:   │
                    │ expand / hold / │
                    │ invest / cut    │
                    └─────────────────┘
```

### Monthly checklist

- [ ] Finance monthly closing complete (§03_FINANCE)
- [ ] Trust & Safety monthly trust report generated
- [ ] Incentive Engine ROI reviewed
- [ ] Multi-City expansion candidates assessed
- [ ] Public launch readiness vs `handover/09_GO_LIVE_READINESS.md`
- [ ] Board pack published via `/admin/board-reports`

---

## 5. Revenue monitoring

### Daily revenue workflow

| Step | Action | Module |
|------|--------|--------|
| 1 | Open Finance Operations → Daily Reconciliation | `/admin/finance-ops` |
| 2 | Compare gross vs net (after refunds) | Reconciliation tab |
| 3 | Review payment provider breakdown | Bankily, Sedad, Masravi, Cards, Wallet |
| 4 | Flag failed payments > 5 in 24 h | Operations alerts |
| 5 | Cross-check CEO Master revenue cards | `/admin/ceo-master` |

### Thresholds (beta)

| Metric | 🟢 Green | 🟡 Yellow | 🔴 Red | Action if red |
|--------|----------|-----------|--------|---------------|
| Daily gross revenue trend | ≥ prior 7-day avg | −10% to −20% | > −20% | Review supply, pricing, promos |
| Refund rate | < 2% of gross | 2–5% | > 5% | Finance + Support root cause |
| Failed payment rate | < 3% | 3–8% | > 8% | Engineering + Finance escalation |
| Pending withdrawals | 0 > 48 h | 1–3 > 48 h | > 3 or any > 72 h | Finance Lead same-day clearance |

### Revenue escalation

| Condition | Escalate to | CEO action |
|-----------|-------------|------------|
| Payment provider outage | Engineering Lead (P0) | Authorize maintenance mode |
| Reconciliation mismatch > 1,000 MRU | Finance Lead (P1) | Approve manual adjustment |
| Suspected revenue fraud | Security Lead (P1) | Approve account suspensions |

---

## 6. Growth monitoring

### Sources

| Area | Module | Metrics |
|------|--------|---------|
| Rider acquisition | `/admin/customer-growth` | New riders, referral completions |
| Loyalty | Customer Growth Center | Tier distribution, points redeemed |
| Promotions | Growth & Expansion | Campaign uptake, CAC estimate |
| Business accounts | `/admin/business-accounts` | Corporate ride volume |
| Multi-city | `/admin/multi-city` | City-level demand vs supply |

### Weekly growth review

- [ ] Referral completion rate vs target
- [ ] Promo code abuse flags (Trust & Safety / fraud)
- [ ] Driver incentive spend vs ride volume (Incentive Engine)
- [ ] Merchant order growth (Merchant Platform)
- [ ] Partner territory performance (Partner Platform)

### Growth decision triggers

| Signal | Recommended action |
|--------|-------------------|
| Acceptance rate < 60% for 2 days | Increase driver incentives; review dispatch radius |
| Rider cap hit (beta) | CEO approves cap increase or waitlist |
| High surge zones persistent | Smart Pricing review; supply recruitment |
| Low delivery completion | Courier recruitment; merchant coordination |

---

## 7. Safety monitoring

### Daily safety checklist

| # | Check | Target | Module |
|---|-------|--------|--------|
| S-01 | Critical open incidents | 0 | `/admin/trust-safety` |
| S-02 | SOS response time (avg) | Ack < 2 min | Incident queue |
| S-03 | Unresolved SOS > 30 min | 0 | Launch alerts |
| S-04 | High-risk areas | Review map | CEO safety dashboard |
| S-05 | Repeat offenders | Review list | Driver/rider safety profiles |
| S-06 | Document violations | Clear or suspend | Fleet & Performance |

### Safety escalation (CEO)

| Event | CEO role |
|-------|----------|
| Injury or assault reported | Immediate awareness; legal/comms decision |
| Multiple SOS same ride | P0 incident; authorize ops broadcast |
| Platform-wide fraud ring | Approve mass suspension after Security review |
| Regulatory inquiry | Compliance & Governance lead; CEO sign-off on response |

**Reference:** `07_TRUST_AND_SAFETY_MANUAL.md` · `release/PHASE29_TRUST_SAFETY_CENTER_REPORT.md`

---

## 8. Financial approval workflow

### Approval matrix

| Transaction type | Amount (MRU) | Approver | System |
|------------------|-------------|----------|--------|
| Driver withdrawal | ≤ 5,000 | Finance Lead | Finance Ops → Approve |
| Driver withdrawal | > 5,000 | CEO | Finance Ops → CEO notify |
| Refund (standard) | ≤ 2,000 | Support Lead → Finance | Payments admin |
| Refund (disputed) | > 2,000 | Finance Lead | Finance Ops audit trail |
| Refund (legal) | Any | CEO | Compliance review |
| Incentive campaign | ≤ 50,000/month | Finance Lead | Incentive Engine |
| Incentive campaign | > 50,000/month | CEO | Incentive Engine + Board note |
| Merchant settlement | Per contract | Finance Lead | Merchant Platform |
| Partner settlement | Per contract | Finance Lead + CEO | Partner Platform |
| Manual wallet adjustment | Any | Finance Lead + CEO | Audit log required |

### Approval workflow diagram

```
Request submitted
       │
       ▼
┌──────────────┐    No     ┌─────────────┐
│ Within       │──────────▶│ Reject with │
│ Finance Lead │           │ reason      │
│ authority?   │           └─────────────┘
└──────┬───────┘
       │ Yes
       ▼
┌──────────────┐    No     ┌─────────────┐
│ Within amount│──────────▶│ Route to CEO│
│ threshold?   │           │ for approval│
└──────┬───────┘           └──────┬──────┘
       │ Yes                      │
       ▼                          ▼
┌──────────────┐           ┌─────────────┐
│ Approve in   │           │ CEO approve │
│ Finance Ops  │           │ / reject    │
└──────┬───────┘           └──────┬──────┘
       │                          │
       └──────────┬───────────────┘
                  ▼
         Audit trail logged
         (Finance Ops / Compliance)
```

---

## 9. Expansion decision process

### Expansion types

| Type | Lead | Module | CEO gate |
|------|------|--------|----------|
| New city | Operations Manager | `/admin/multi-city` | Supply plan + legal review |
| New merchant vertical | Product Lead | Merchant Platform | Pilot KPIs |
| Partner / franchise | Business Dev | `/admin/partner-platform` | Contract + settlement terms |
| Cap increase (beta) | Operations Manager | Launch Control | Risk vs learning value |
| Public launch | All leads | Go-live checklist | Final GO/NO-GO |

### Expansion readiness checklist

- [ ] City demand data from BI / heat map (7+ days)
- [ ] Minimum supply committed (drivers, couriers per city playbook)
- [ ] Payment methods active in target market
- [ ] Support staffing for new timezone
- [ ] Compliance & Governance — local requirements documented
- [ ] Finance — settlement and tax implications reviewed
- [ ] Engineering — infrastructure capacity confirmed
- [ ] CEO written GO decision recorded in Launch Hub or Board Reports

### GO / NO-GO criteria (summary)

Reference: `release/CLOSED_BETA_EXIT_CRITERIA.md` · `handover/09_GO_LIVE_READINESS.md`

| Criterion | Minimum for expansion |
|-----------|----------------------|
| Ride completion rate | > 95% (7-day rolling) |
| Payment success rate | > 92% |
| Open P0 bugs | 0 |
| Offsite backups | Configured and verified |
| SOS process | Tested with < 5 min contact SLA |
| CEO launch score | ≥ 80/100 for public launch |

---

## 10. Document control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-07-21 | Yala Ops | Initial SOP |

**Cross-references:** `02_OPERATIONS_TEAM_MANUAL.md` · `03_FINANCE_OPERATIONS_MANUAL.md` · `07_TRUST_AND_SAFETY_MANUAL.md` · `handover/06_SUPPORT_MATRIX.md`
