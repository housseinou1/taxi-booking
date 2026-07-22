# YALA — Operations Team Manual

**Document ID:** YALA-OPS-OPS-002  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** Operations Manager, supervisors, duty officers  
**Related:** `release/BETA_OPERATIONS_RUNBOOK.md` · `release/DAY1_OPERATIONS_CHECKLIST.md`

---

## 1. Overview

The Operations team runs live platform activity: supply (drivers/couriers), demand monitoring, merchant coordination, incident triage, and daily reporting. Primary consoles are the **Operations Command Center** and **Operations Center**.

| Tool | URL | Purpose |
|------|-----|---------|
| Operations Command Center | `/admin/operations-command` | Live ops, heat map, alerts, CEO summary, incidents |
| Operations Center | `/admin/operations` | Legacy ops dashboard, emergency panel |
| Launch Control | `/admin/launch` | Beta caps, alerts, onboarding pause |
| Multi-City Operations | `/admin/multi-city` | City rollout, territory config |
| Fleet & Performance | `/admin/fleet` | Driver performance, documents |
| Smart Pricing & Dispatch | `/admin/smart-pricing` | Surge, dispatch radius |
| Trust & Safety Center | `/admin/trust-safety` | SOS, incident queue |
| Production Status | `/admin/status` | Infrastructure health |

**Beta caps (closed beta):** 20 drivers · 10 couriers · 100 riders · Pilot city: Nouakchott

---

## 2. Morning checklist

**When:** 06:00–08:00 UTC · **Owner:** Operations Manager · **~25 min**

| # | Task | Verification | ☐ |
|---|------|--------------|:-:|
| M-01 | API health | `curl -fsS https://api.yalataxi.live/api/health/ready/` → 200 | ☐ |
| M-02 | Admin status page | `/admin/status` — all components green | ☐ |
| M-03 | Docker containers (if SSH access) | 9+ containers Up (healthy) | ☐ |
| M-04 | Overnight incidents | Launch Hub → Incidents — zero open S1/S2 | ☐ |
| M-05 | Active alerts | Launch Hub → Alerts — ack or resolve all | ☐ |
| M-06 | Maintenance mode OFF | Executive Dashboard — disabled | ☐ |
| M-07 | Pilot caps | Launch Hub → Onboarding — within caps | ☐ |
| M-08 | Withdrawal queue | Finance Ops — no requests > 48 h | ☐ |
| M-09 | Compliance expiries | Business Hub → Compliance — no critical expired docs | ☐ |
| M-10 | P0/P1 register | `release/UAT_KNOWN_ISSUES_REGISTER.md` — no new P0 | ☐ |
| M-11 | Online drivers | Operations Command → Live Operations ≥ 3 online | ☐ |
| M-12 | Online couriers | ≥ 1 courier online if delivery day | ☐ |
| M-13 | CEO dashboard prep | Confirm `daily-ceo` report cron or run script | ☐ |
| M-14 | Ops stand-up | Post fleet status + blockers to ops channel | ☐ |

**Sign-off:** _________________ **Date:** _________ **Time:** _________

---

## 3. Driver monitoring

### Live monitoring workflow

```
Open Operations Command Center
         │
         ▼
┌────────────────────┐
│ Live Operations    │──▶ Active rides, online drivers, open incidents
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ City Heat Map      │──▶ Shortage areas, surge zones, long ETA
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ Operations Alerts  │──▶ Driver shortage, high cancel rate, GPS outage
└────────────────────┘
```

### Driver monitoring checklist (hourly during peak)

| # | Check | Action if abnormal |
|---|-------|-------------------|
| DM-01 | Online driver count vs demand | Broadcast to offline drivers; review incentives |
| DM-02 | Acceptance rate (7-day) | Target ≥ 70%; if < 60% call top drivers |
| DM-03 | Stuck rides (non-terminal > 30 min) | Operations Center → trip detail → contact driver |
| DM-04 | Driver offline during active trip | Trust & Safety monitoring alert → call driver |
| DM-05 | Document expiry warnings | Fleet & Performance → schedule renewal |
| DM-06 | New onboarding queue | Admin Dashboard → driver approval queue |

### Driver shortage response

| Severity | Condition | Action |
|----------|-----------|--------|
| Yellow | Online < 5 during peak | Push notification to approved drivers |
| Orange | Acceptance rate < 60% | Enable incentive bonus (Finance approval) |
| Red | Zero online > 15 min | CEO notify; consider pausing new rider invites |

**Reference:** `05_DRIVER_OPERATIONS_MANUAL.md` · `/admin/incentives`

---

## 4. Courier monitoring

### Courier monitoring checklist

| # | Check | Module | Target |
|---|-------|--------|--------|
| CM-01 | Online couriers | Live Operations | ≥ 1 (beta) |
| CM-02 | Active deliveries | Operations Command | No stuck > 45 min |
| CM-03 | Failed delivery rate | Exit criteria / BI | < 5% daily |
| CM-04 | COD pending collection | Finance Ops | Reconcile EOD |
| CM-05 | Merchant prep delays | Merchant Platform | Contact merchant if > 20 min |
| CM-06 | Courier document status | Admin driver/courier profiles | All approved |

### Delivery issue triage

| Issue | First action | Escalate |
|-------|--------------|----------|
| Courier not moving | Call courier; verify GPS | Operations Manager if no response 10 min |
| Merchant not ready | Call merchant; adjust ETA | Support if customer complaint |
| Wrong address | Support updates; courier reroute | — |
| COD dispute | Finance Ops COD log | Finance Lead |

**Reference:** `06_DELIVERY_OPERATIONS_MANUAL.md`

---

## 5. Merchant monitoring

### Daily merchant checklist

| # | Task | Module | ☐ |
|---|------|--------|:-:|
| MM-01 | Active merchants online | `/admin/merchant-platform` | ☐ |
| MM-02 | Pending merchant approvals | Merchant onboarding queue | ☐ |
| MM-03 | Settlement pending | Merchant settlements tab | ☐ |
| MM-04 | Menu/catalog errors | Support tickets category `merchant` | ☐ |
| MM-05 | Order failure rate | Operations alerts | ☐ |
| MM-06 | Partner territories overlap | `/admin/partner-platform` | ☐ |

### Merchant coordination workflow

```
New order spike detected
         │
         ▼
Verify courier availability (Heat Map)
         │
    ┌────┴────┐
    │         │
  OK      Shortage
    │         │
    ▼         ▼
Monitor   Notify merchant of
delivery  extended prep time;
          assign nearest courier
```

---

## 6. Incident handling

### Incident types

| Type | Severity | Owner | Module |
|------|----------|-------|--------|
| SOS / safety | P0 | Operations + Security | Trust & Safety |
| API / service down | P0 | Engineering on-call | Launch Hub incident |
| Mass payment failure | P1 | Finance + Engineering | Finance Ops |
| Stuck ride/delivery | P1 | Operations duty | Operations Command |
| Single bad experience | P2 | Support | Support Center |
| Fraud pattern | P1 | Security Lead | Trust & Safety |

### Incident workflow

```
Detect (alert, ticket, SOS)
         │
         ▼
Create incident in Launch Hub
(/admin/launch → Incidents)
         │
         ▼
Assign owner + severity
         │
         ▼
┌────────────────────────┐
│ Investigate            │
│ - Trip/ride ID         │
│ - User profiles        │
│ - Logs if technical    │
└───────────┬────────────┘
            │
            ▼
Mitigate (broadcast, suspend,
maintenance mode, refund)
            │
            ▼
Resolve + document root cause
            │
            ▼
Post-incident review if P0/P1
```

### Incident creation checklist

- [ ] Severity assigned (critical / high / medium / low)
- [ ] Ride/delivery/user IDs captured
- [ ] Timeline notes added at each step
- [ ] Stakeholders notified per escalation matrix
- [ ] Linked support tickets closed
- [ ] Audit trail verified in Command Center

**Reference:** `release/POST_LAUNCH_SUPPORT_PROCEDURES.md`

---

## 7. Emergency escalation

### Escalation matrix

| Severity | First responder | Time to escalate | Escalate to | Method |
|----------|-----------------|------------------|-------------|--------|
| P0 | Engineering on-call | 5 min | Engineering Lead → CEO | WhatsApp / page |
| P0 Safety | Operations duty | Immediate | Operations Manager → CEO | Phone + Trust & Safety |
| P1 | Operations / Support | 15 min | Operations Manager / Finance | WhatsApp |
| P2 | Support agent | Same day | Support Lead | Ticket system |

### P0 safety escalation (SOS)

| Step | Time | Action |
|------|------|--------|
| 1 | 0–2 min | Acknowledge in Trust & Safety incident queue |
| 2 | 2–5 min | Call rider/driver/courier; confirm location |
| 3 | 5–10 min | Create Launch incident (critical); notify CEO if injury |
| 4 | 10+ min | Dispatch nearest available driver if no police/EMS yet |
| 5 | Post | SafetyResponseLog complete; weekly review if pattern |

### Emergency contacts

| Role | When to contact |
|------|-----------------|
| Engineering on-call | API down, database, Celery failure |
| Finance Lead | Payment outage, large refund batch |
| Security Lead | Fraud ring, account takeover |
| CEO | P0 only, injury, media, regulatory |

---

## 8. Shift handover

**When:** Every shift change · **Duration:** 15 min

### Handover template

| Field | Outgoing shift | Incoming shift |
|-------|----------------|----------------|
| Date / time | | |
| On-duty operator | | |
| Open incidents (IDs) | | |
| Open SOS / safety | | |
| Stuck rides/deliveries | | |
| Pending driver approvals | | |
| Withdrawals flagged | | |
| Alerts unacknowledged | | |
| Maintenance windows | | |
| Notes for next shift | | |

### Handover checklist

- [ ] Live Operations snapshot shared (screenshot or verbal)
- [ ] All P0/P1 incidents briefed
- [ ] Onboarding pause state confirmed (Launch Command)
- [ ] Heat map hotspots discussed
- [ ] Incoming operator logged into admin + WhatsApp ops group
- [ ] Outgoing operator remains available 15 min for questions

---

## 9. Daily reporting

### End-of-day checklist (22:00–23:00 UTC)

| # | Task | Output | ☐ |
|---|------|--------|:-:|
| R-01 | Close or escalate all open incidents | Zero open S1 | ☐ |
| R-02 | Resolve or ack all alerts | Launch Hub clean | ☐ |
| R-03 | Log hourly metrics (beta Day 1–14) | `DAY1_OPERATIONS_CHECKLIST.md` Part D | ☐ |
| R-04 | Export CEO daily summary | Operations Command → Export | ☐ |
| R-05 | Driver/courier online peak counts | EOD summary note | ☐ |
| R-06 | Onboarding stats | Approved / pending / rejected | ☐ |
| R-07 | Support ticket backlog | Support Center count | ☐ |
| R-08 | Post EOD summary to CEO / ops channel | Written brief | ☐ |

### Daily report template

```
YALA Operations — EOD Summary
Date: ___________
Beta day: D___ / 14

Supply: ___ drivers online (peak) · ___ couriers online (peak)
Demand: ___ rides completed · ___ deliveries completed
Incidents: ___ opened · ___ resolved · ___ open
Safety: ___ SOS events · critical open: ___
Blockers: ___
Tomorrow priority: ___
```

### Automated reports

```bash
# On production host
cd /opt/yala
scripts/soft-launch-daily-reports.sh daily-ceo
scripts/soft-launch-daily-reports.sh exit-criteria
```

---

## 10. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `01_CEO_OPERATIONS_MANUAL.md` · `05_DRIVER_OPERATIONS_MANUAL.md` · `06_DELIVERY_OPERATIONS_MANUAL.md` · `07_TRUST_AND_SAFETY_MANUAL.md`
