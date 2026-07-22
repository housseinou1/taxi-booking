# Yala Technologies — Closed Beta Runbook

**Document ID:** BETA-RUNBOOK-001  
**Effective:** 2026-07-21  
**Release:** v1.0.0-rc2 (closed beta)  
**Feature freeze:** Active — P0/P1 defect fixes only; no new features  

**Production:** https://api.yalataxi.live · https://yalataxi.live/admin  
**Pilot city:** Nouakchott  

**Related:** `POST_LAUNCH_SUPPORT_PROCEDURES.md` · `BETA_METRICS_DASHBOARD.md` · `DAILY_CEO_REPORT.md` · `UAT_KNOWN_ISSUES_REGISTER.md`

---

## Closed beta parameters

| Cohort | Cap | Current (RC2) | Recruitment owner |
|--------|-----|---------------|-------------------|
| **Drivers** | 20 | ~2 | Ops Manager |
| **Couriers** | 10 | ~0 | Ops Manager |
| **Riders** | 100 | ~5 | Marketing / Ops |

**Soft launch config:** `docker compose -p yala exec -T django python manage.py configure_soft_launch`  
**Disable beta:** `configure_soft_launch --disable`  
**Verify caps:** Launch Hub → `/admin/launch` → Onboarding metrics

---

## 1. Daily startup checklist

**Owner:** Operations Manager · **Time:** 06:00–08:00 UTC (before peak) · **Duration:** ~30 min

| # | Task | Where / how | Pass ☐ |
|---|------|-------------|:------:|
| S-01 | Confirm API health | `curl -fsS https://api.yalataxi.live/health/` → database + redis OK | ☐ |
| S-02 | Confirm admin SPA loads | https://yalataxi.live/admin/status → all green | ☐ |
| S-03 | Review overnight incidents | Launch Hub → `/admin/launch` → Incidents (open = 0 target) | ☐ |
| S-04 | Review active alerts | Launch Hub → Alerts (acknowledge or resolve) | ☐ |
| S-05 | Check backup status | SSH: `scripts/backup-monitor.sh` or cron log `/home/yala/reports/soft-launch/cron.log` | ☐ |
| S-06 | Verify containers healthy | `ssh root@142.93.99.142` → `cd /opt/yala && docker compose -p yala ps` (9 Up) | ☐ |
| S-07 | Review withdrawal queue | `/admin/business` → Finance → pending withdrawals | ☐ |
| S-08 | Review refund queue | Launch Hub → Support → refund requests | ☐ |
| S-09 | Check compliance expiries | `/admin/business` → Compliance → documents expiring ≤ 7 days | ☐ |
| S-10 | Confirm pilot caps not exceeded | Launch Hub → Onboarding → drivers / couriers / riders vs caps | ☐ |
| S-11 | Review P0/P1 register | `release/UAT_KNOWN_ISSUES_REGISTER.md` — no new P0 overnight | ☐ |
| S-12 | Generate CEO daily report | `scripts/soft-launch-daily-reports.sh daily-ceo` (or wait for 07:00 UTC cron) | ☐ |
| S-13 | Post stand-up note | Slack / WhatsApp ops channel: fleet online, open incidents, blockers | ☐ |

**Startup sign-off:** _________________ Date: _________ Time: _________

---

## 2. Daily shutdown checklist

**Owner:** Operations Manager · **Time:** 22:00–23:00 UTC · **Duration:** ~20 min

| # | Task | Where / how | Pass ☐ |
|---|------|-------------|:------:|
| D-01 | Resolve or hand off open support tickets | Launch Hub → Support queue | ☐ |
| D-02 | Clear pending SOS / safety alerts | Operations Center → `/admin/operations` → Emergency | ☐ |
| D-03 | Process same-day withdrawals (if any) | `/payments/withdrawals/` → approve / reject / mark paid | ☐ |
| D-04 | Reconcile failed payments | `/admin/payments` + Launch Hub → filter `payment` category | ☐ |
| D-05 | Log incidents with incomplete RCA | Launch Hub → Incidents → add timeline note | ☐ |
| D-06 | Update known issues register | Add any new P0/P1 from today to `UAT_KNOWN_ISSUES_REGISTER.md` | ☐ |
| D-07 | Snapshot beta metrics | Fill `BETA_METRICS_DASHBOARD.md` daily row | ☐ |
| D-08 | Complete end-of-day report | Section 10 below | ☐ |
| D-09 | Verify no maintenance mode left on | Executive Dashboard → Maintenance Mode = OFF | ☐ |
| D-10 | Confirm backup cron ran (if after 02:00 UTC) | Check latest encrypted backup timestamp | ☐ |

**Shutdown sign-off:** _________________ Date: _________ Time: _________

---

## 3. Driver onboarding process

**Goal:** Approved, document-verified driver with payout method, within cap of **20**.

### 3.1 Intake

| Step | Action | Owner |
|------|--------|-------|
| 1 | Recruit via partner referral or direct outreach (Nouakchott) | Ops |
| 2 | Send Driver APK (1.2.23) or Play closed-testing invite | Ops |
| 3 | Driver registers in app with phone + email | Driver |
| 4 | Driver uploads required documents | Driver |

**Required documents:** national ID · driver license · insurance · carte grise · vehicle photo

### 3.2 Verification

| Step | Action | Admin path |
|------|--------|------------|
| 1 | Locate pending driver | `/admin/business` → CRM → filter `driver` |
| 2 | Review documents | Driver admin or CRM profile → Documents tab |
| 3 | Approve each document | Status → `approved` (or `rejected` with reason) |
| 4 | Verify vehicle plate / make registered | Driver profile |
| 5 | Confirm payout method | `/payments/payout-methods/` — Bankily / Sedad / Masrvi verified |
| 6 | Approve driver profile | Status → `approved` |
| 7 | Confirm under cap | Launch Hub → Onboarding → approved drivers < 20 |

### 3.3 Activation

| Step | Action |
|------|--------|
| 1 | Send welcome message + beta guidelines (WhatsApp / SMS) |
| 2 | Driver toggles **Available** in app |
| 3 | Confirm GPS heartbeat in Operations Center live map |
| 4 | Optional: assign mentor driver for first 3 rides |
| 5 | Add CRM note: `Closed beta cohort — onboarded YYYY-MM-DD` |

### 3.4 Rejection / hold

- Missing docs → CRM note + push notification to re-upload  
- Expired docs → Compliance panel flag; do not approve until renewed  
- Fraud flag → hold; escalate per `POST_LAUNCH_SUPPORT_PROCEDURES.md` § Fraud  

---

## 4. Courier onboarding process

**Goal:** Delivery-enabled courier within cap of **10**.

### 4.1 Prerequisites

- User must be an **approved driver** OR register as delivery-only (if supported)  
- Delivery app 1.0.4 installed  

### 4.2 Intake & verification

| Step | Action | Admin path |
|------|--------|------------|
| 1 | Enable delivery mode on profile | Driver admin → Delivery settings → `delivery_mode_enabled = true` |
| 2 | Set vehicle type | motorcycle · car · bicycle (bicycle = national ID only) |
| 3 | Verify documents per vehicle type | CRM → Compliance |
| 4 | Approve courier | Confirm `is_suspended = false` |
| 5 | Confirm under cap | Launch Hub → couriers < 10 |

### 4.3 Activation

| Step | Action |
|------|--------|
| 1 | Send Delivery APK or Play invite |
| 2 | Courier goes online in Delivery app |
| 3 | Run test delivery with ops observer (optional) |
| 4 | CRM note: `Courier beta — onboarded YYYY-MM-DD` |

---

## 5. Rider onboarding process

**Goal:** Registered rider within cap of **100**, invited only (controlled beta).

### 5.1 Intake (invite-only)

| Method | Process |
|--------|---------|
| **Direct invite** | Ops sends Rider APK (1.2.7) + invite code / link |
| **Referral** | Existing beta rider refers → ops approves in CRM |
| **Waitlist** | Collect name + phone → batch approve weekly |

**Do not** open public registration until Gate B sign-off.

### 5.2 Verification

| Step | Action | Admin path |
|------|--------|------------|
| 1 | Confirm registration completed | CRM → filter `rider` |
| 2 | Verify phone (`phone_verified_at` set) | User admin or CRM |
| 3 | Confirm terms accepted | User profile |
| 4 | Check not blacklisted | CRM → `is_blacklisted = false` |
| 5 | Confirm under cap | Launch Hub → riders < 100 |

### 5.3 Activation

| Step | Action |
|------|--------|
| 1 | Send beta welcome + support WhatsApp number |
| 2 | Rider completes first booking with ops on standby |
| 3 | CRM note: `Beta rider — cohort YYYY-MM-DD` |

---

## 6. Customer support workflow

**Channels:** In-app support · WhatsApp ops line · Launch Hub queue  
**SLA:** First response < 4 h (beta) · Resolution target < 24 h  

### 6.1 Triage

| Priority | Examples | Response |
|----------|----------|----------|
| **P0** | SOS, safety, stranded rider, payment double-charge | Immediate — call user; open S1 incident |
| **P1** | Ride stuck, withdrawal stuck, app crash blocking trip | < 30 min — assign owner |
| **P2** | Receipt missing, rating issue, general question | < 4 h |
| **P3** | Feature request | Log → backlog (feature freeze) |

### 6.2 Handling steps

1. **Receive** — ticket in Launch Hub → `/admin/launch` → Support queue  
2. **Identify** — CRM profile: `/admin/business` → CRM → search phone/email  
3. **Investigate** — trip detail, payment record, wallet ledger  
4. **Resolve** — refund / credit / manual ride state fix / education  
5. **Document** — CRM notes + close ticket with resolution code  
6. **Escalate** — if payment > 5,000 MRU or repeat offender → Finance + CEO  

**Resolution codes:** `resolved_refund` · `resolved_credit` · `resolved_education` · `escalated_finance` · `escalated_incident` · `duplicate`

---

## 7. Incident escalation

Reference: `POST_LAUNCH_SUPPORT_PROCEDURES.md`

| Severity | Examples | Response time | First responder | Escalate to |
|----------|----------|:-------------:|-----------------|-------------|
| **S1** | API down, database unreachable, SOS unhandled > 5 min, suspected breach | **5 min** | On-call Ops | CEO + Ops Manager |
| **S2** | Batch payment failure, fraud ring, mass push failure | **30 min** | Ops Manager | Finance + CEO |
| **S3** | Single refund dispute, doc expiry, one stuck withdrawal | **24 h** | Support staff | Ops Manager |
| **S4** | Feature request, cosmetic bug | Backlog | Support | Product (post-freeze) |

### Escalation procedure

1. Create incident → Launch Hub → Incidents → severity + title  
2. Post timeline updates every **15 min** (S1) or **60 min** (S2)  
3. If S1 persists > 30 min → enable maintenance mode (Executive Dashboard)  
4. Post-mortem within **24 h** for S1/S2  
5. Update `UAT_KNOWN_ISSUES_REGISTER.md` if new platform defect  

---

## 8. Emergency contacts

| Role | Name | Phone | Email | When to call |
|------|------|-------|-------|--------------|
| **CEO** | H. Sakho | _[fill]_ | _[fill]_ | S1, legal, press, > 5,000 MRU dispute |
| **Operations Manager** | _[fill]_ | _[fill]_ | _[fill]_ | S1/S2, fleet issues, onboarding blockers |
| **Finance lead** | _[fill]_ | _[fill]_ | _[fill]_ | Payment failures, reconciliation, withdrawals |
| **Engineering on-call** | _[fill]_ | _[fill]_ | _[fill]_ | API outage, deploy rollback, data issue |
| **Hosting (DO)** | DigitalOcean support | — | support ticket | Infrastructure / network |
| **Payment gateway** | Bankily / Sedad / Masrvi | _[fill]_ | _[fill]_ | Gateway outage, settlement delay |

**Production server:** `142.93.99.142` · `/opt/yala` · compose project `yala`  
**On-call rotation:** CEO + Ops Manager (executive staff groups) during closed beta  

---

## 9. Payment reconciliation

**Frequency:** Daily (shutdown) + weekly deep review (Monday)  
**Owner:** Finance  

### 9.1 Daily reconciliation

| # | Check | Source |
|---|-------|--------|
| 1 | Completed rides vs payment records | `/admin/payments` · filter today |
| 2 | Failed / pending payments | Launch Hub → Support → `payment` |
| 3 | Wallet ledger balance integrity | `/operations/executive/qa/` |
| 4 | Withdrawals processed | `/payments/withdrawals/` — none stuck > 48 h |
| 5 | Refunds issued | Finance Center → refunds today |
| 6 | Driver payouts marked paid | Match bank transfer confirmations |

### 9.2 Weekly reconciliation

```bash
# On production
scripts/soft-launch-daily-reports.sh financial
scripts/soft-launch-daily-reports.sh weekly-exec
```

| Report | Output path |
|--------|-------------|
| Financial reconciliation | `/home/yala/reports/soft-launch/financial_*.json` |
| Weekly executive | `/home/yala/reports/soft-launch/weekly_executive_*.json` |

**Discrepancy protocol:**  
1. Freeze affected wallet if fraud suspected  
2. Open S2 incident if > 3 related failures  
3. Document in Finance Center + audit log  
4. CEO sign-off for manual adjustments > 1,000 MRU  

---

## 10. End-of-day reporting

**Owner:** Operations Manager · **Due:** 23:00 UTC daily  

### 10.1 Report template

Copy to ops channel / email CEO:

```
YALA CLOSED BETA — END OF DAY REPORT
Date: YYYY-MM-DD
Prepared by: _______________

FLEET
  Drivers online (peak): ___
  Couriers online (peak): ___
  Approved / cap: drivers ___/20 · couriers ___/10 · riders ___/100

TRIPS
  Ride requests: ___
  Completed rides: ___
  Cancelled rides: ___
  Completed deliveries: ___

FINANCE
  Revenue today (MRU): ___
  Failed payments: ___
  Withdrawals pending: ___
  Refunds issued: ___

QUALITY
  Acceptance rate: ___%
  Cancellation rate: ___%
  Avg rider rating: ___

INCIDENTS
  Open incidents: ___
  SOS events: ___
  Support tickets opened / closed: ___ / ___

PLATFORM
  API health: OK / DEGRADED / DOWN
  Backup: OK / FAIL
  New P0/P1 issues: ___

ACTION ITEMS (tomorrow)
  1.
  2.
  3.
```

### 10.2 Automated sources

| Data | Command / URL |
|------|---------------|
| CEO daily JSON | `scripts/soft-launch-daily-reports.sh daily-ceo` |
| Live metrics | `/operations/launch/live/` |
| Business KPIs | `/operations/business/bi/` → `ceo_report` |
| Metrics dashboard | `BETA_METRICS_DASHBOARD.md` daily row |

---

## Appendix A — Quick links

| Function | URL |
|----------|-----|
| Launch Hub | https://yalataxi.live/admin/launch |
| Operations Center | https://yalataxi.live/admin/operations |
| Business Hub | https://yalataxi.live/admin/business |
| Executive Dashboard | https://yalataxi.live/admin/executive |
| System status | https://yalataxi.live/admin/status |
| API health | https://api.yalataxi.live/health/ |

## Appendix B — Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial closed beta runbook (RC2) |
