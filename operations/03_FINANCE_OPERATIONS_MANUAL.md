# YALA — Finance Operations Manual

**Document ID:** YALA-OPS-FIN-003  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** Finance Lead, accountants, CEO (approvals)  
**Related:** `release/PHASE24_FINANCE_OPERATIONS_REPORT.md` · `handover/06_SUPPORT_MATRIX.md`

---

## 1. Overview

Finance Operations manages reconciliation, payouts, settlements, refunds, and audit compliance. The primary console is the **Finance Operations Center**.

| Tool | URL | Purpose |
|------|-----|---------|
| Finance Operations Center | `/admin/finance-ops` | Reconciliation, withdrawals, analytics, audit |
| Driver Incentive Engine | `/admin/incentives` | Bonus campaigns, wallet credits |
| Merchant Platform | `/admin/merchant-platform` | Merchant settlements |
| Partner Platform | `/admin/partner-platform` | Partner/franchise settlements |
| Business Operations | `/admin/business` | Legacy finance tabs, withdrawal accounts |
| Compliance & Governance | `/admin/compliance-governance` | Financial audit exports |

**API base:** `/operations/business/finance/operations/`  
**Permissions:** CEO, Super Admin, Accountant, Finance, executive staff (`IsFinanceStaff`)

---

## 2. Wallet reconciliation

### Daily reconciliation workflow

```
Start of business day
         │
         ▼
Open Finance Ops → Daily Reconciliation tab
         │
         ▼
Select date (default: yesterday / today)
         │
         ▼
Review reconciliation status
         │
    ┌────┴────────────────┐
    │                     │
 balanced            discrepancy
    │                     │
    ▼                     ▼
Sign off            Investigate:
EOD                 - PaymentRecord
                    - WalletTransaction
                    - Failed payments
                    - Refunds
                         │
                         ▼
                    Document adjustment
                    + audit trail entry
```

### Reconciliation data points

| Field | Source | Expected |
|-------|--------|----------|
| Ride revenue | Completed rides × fare | Matches payment records |
| Delivery revenue | Completed deliveries | Matches payment records |
| Platform commission | Configured rate | Per service type |
| Driver/courier earnings | Wallet credits | Matches trip payouts |
| Wallet deposits | Top-ups | Provider confirmation |
| Wallet withdrawals | Approved payouts | Bank/mobile money confirmation |
| Failed payments | Payment provider | Investigate same day |
| Refunds | Refund queue | Matched to original payment |
| Pending settlements | Merchant/partner | Scheduled per contract |

### Reconciliation checklist

| # | Task | ☐ |
|---|------|:-:|
| WR-01 | Open Daily Reconciliation for target date | ☐ |
| WR-02 | Status = `balanced` or document variance | ☐ |
| WR-03 | Cross-check payment provider breakdown | ☐ |
| WR-04 | Verify withdrawal totals vs paid queue | ☐ |
| WR-05 | Review failed payment count (< 3% target) | ☐ |
| WR-06 | Export reconciliation CSV for records | ☐ |
| WR-07 | Escalate variance > 500 MRU to Finance Lead | ☐ |
| WR-08 | CEO notify if variance > 1,000 MRU | ☐ |

### Payment providers

| Provider | Reconciliation note |
|----------|---------------------|
| Bankily | Match gateway report to `PaymentRecord` |
| Sedad | Same-day settlement preferred |
| Masravi | Watch for pending > 24 h |
| Cards (Stripe) | Match Stripe dashboard |
| Wallet | Internal ledger only |

---

## 3. Cash-out approval

### Withdrawal queue

**Module:** Finance Ops → Withdrawals tab  
**Auto-refresh:** 45 seconds

### Approval workflow

```
Driver submits withdrawal
         │
         ▼
Appears in withdrawal queue
(status: pending)
         │
         ▼
Finance reviews:
- KYC / payout account verified
- No open fraud flags
- Available balance sufficient
- Amount within limits
         │
    ┌────┴────┐
    │         │
 Reject    Approve
    │         │
    ▼         ▼
Notify     Mark processing
driver     → Mark Paid when
           transfer confirmed
```

### Approval matrix

| Amount (MRU) | Approver | SLA |
|--------------|----------|-----|
| ≤ 5,000 | Finance Lead | 24 h |
| 5,001 – 20,000 | Finance Lead + second review | 48 h |
| > 20,000 | CEO approval required | 48 h |

### Cash-out checklist (per request)

- [ ] Payout method matches verified withdrawal account (`/admin` withdrawal accounts)
- [ ] No open Trust & Safety suspension
- [ ] Wallet balance ≥ requested amount
- [ ] No duplicate pending request
- [ ] Fraud flags cleared (`/operations/executive/security/` if needed)
- [ ] Approve / Reject / Mark Paid action logged in audit trail

### Rejection reasons (standard)

| Code | Reason |
|------|--------|
| R-01 | Invalid or unverified payout account |
| R-02 | Insufficient wallet balance |
| R-03 | Open fraud investigation |
| R-04 | Duplicate request |
| R-05 | Document expiry (license, ID) |

---

## 4. Merchant settlement

**Module:** `/admin/merchant-platform` → Settlements

### Settlement cycle

| Phase | Owner | Action |
|-------|-------|--------|
| Accrual | System | Orders completed → settlement line items |
| Review | Finance | Verify gross, commission, net |
| Approval | Finance Lead | Approve batch |
| Payout | Finance | Transfer per merchant contract |
| Reconcile | Finance | Mark settled; export report |

### Merchant settlement checklist

| # | Task | ☐ |
|---|------|:-:|
| MS-01 | List pending settlements for period | ☐ |
| MS-02 | Match order count to Merchant Platform report | ☐ |
| MS-03 | Deduct platform commission per contract | ☐ |
| MS-04 | Apply chargebacks/refunds | ☐ |
| MS-05 | Approve settlement batch | ☐ |
| MS-06 | Execute bank transfer | ☐ |
| MS-07 | Mark paid in system | ☐ |
| MS-08 | Send settlement statement to merchant | ☐ |

### Dispute handling

| Dispute type | Resolution |
|--------------|------------|
| Missing order | Cross-check delivery proof photo |
| Commission error | Recalculate; adjust next cycle |
| Refund after settlement | Deduct from next settlement |

---

## 5. Partner settlement

**Module:** `/admin/partner-platform` → Settlements  
**API:** `/partners/settlements/`

### Partner settlement workflow

```
Period close (weekly/monthly per contract)
         │
         ▼
Generate PartnerSettlement records
         │
         ▼
Finance reviews territory revenue
         │
         ▼
Apply revenue share % per Partner contract
         │
         ▼
Finance Lead approves
         │
         ▼
CEO approval if > contract threshold
         │
         ▼
Payout + mark settled
```

### Partner settlement checklist

- [ ] Territory mapping correct (`PartnerTerritory`)
- [ ] Ride + delivery revenue attributed to territory
- [ ] Partner revenue share % applied
- [ ] Prior period adjustments included
- [ ] Audit export saved
- [ ] Partner portal reflects updated status

---

## 6. Refund workflow

### Refund sources

| Trigger | Entry point |
|---------|-------------|
| Support ticket | Support Center → escalate to Finance |
| Cancelled ride after payment | Launch Hub support queue |
| Duplicate charge | Finance Ops + Payments admin |
| CEO/legal decision | Compliance case |

### Refund process

```
Refund request received
         │
         ▼
Verify PaymentRecord + trip status
         │
         ▼
Determine: full / partial / deny
         │
         ▼
┌─────────────────────────┐
│ Approve via payments    │
│ admin refund API        │
│ (/payments/admin/refunds/)│
└───────────┬─────────────┘
            │
            ▼
Confirm wallet credit OR
gateway reversal
            │
            ▼
Close support ticket
Audit trail auto-logged
```

### Refund approval matrix

| Amount (MRU) | Approver | SLA |
|--------------|----------|-----|
| ≤ 2,000 | Support Lead → Finance | 24 h response, 48 h process |
| 2,001 – 10,000 | Finance Lead | 48 h |
| > 10,000 | CEO | Case-by-case |

### Refund checklist

- [ ] Original payment located
- [ ] Ride/delivery status confirms eligibility
- [ ] Partial vs full amount documented
- [ ] Refund executed in system
- [ ] Customer notified via Support
- [ ] CRM note if repeat requester

---

## 7. Daily accounting

**Module:** Finance Ops → Accounting tab  
**Report types:** daily, weekly, monthly, cash-flow, outstanding, commission

### Daily accounting routine

| Time | Task |
|------|------|
| 08:00 UTC | Run daily reconciliation (previous day if after midnight cutoff) |
| 10:00 UTC | Process withdrawal queue (pending > 24 h) |
| 14:00 UTC | Payment provider sync check |
| 17:00 UTC | Refund queue clearance |
| 22:00 UTC | Daily accounting report export + sign-off |

### Daily checklist

| # | Task | ☐ |
|---|------|:-:|
| DA-01 | Daily reconciliation complete | ☐ |
| DA-02 | Accounting report type=`daily` exported | ☐ |
| DA-03 | Cash-flow summary reviewed | ☐ |
| DA-04 | Outstanding withdrawals list empty or escalated | ☐ |
| DA-05 | Incentive payouts reconciled (Incentive Engine) | ☐ |
| DA-06 | Audit trail spot-check (10 random actions) | ☐ |

---

## 8. Monthly closing

**When:** Last business day + 3 working days  
**Owner:** Finance Lead

### Monthly close workflow

```
Day 1-2: Complete all daily reconciliations for month
         │
Day 3:   Generate monthly accounting report
         │
Day 4:   Merchant + partner settlement finalization
         │
Day 5:   Commission report + revenue analytics
         │
Day 6:   CEO review + Board Reports feed
         │
Day 7:   Archive exports + compliance backup
```

### Monthly close checklist

| # | Task | ☐ |
|---|------|:-:|
| MC-01 | All days reconciled (no open discrepancies) | ☐ |
| MC-02 | Monthly accounting report generated | ☐ |
| MC-03 | Revenue analytics (monthly) exported | ☐ |
| MC-04 | Commission report verified vs contracts | ☐ |
| MC-05 | Merchant settlements complete | ☐ |
| MC-06 | Partner settlements complete | ☐ |
| MC-07 | Refund summary vs budget | ☐ |
| MC-08 | Incentive spend vs ROI review | ☐ |
| MC-09 | Audit trail export to Compliance | ☐ |
| MC-10 | CEO sign-off on monthly pack | ☐ |

---

## 9. Audit procedures

### Audit trail sources

| System | Content |
|--------|---------|
| Finance Ops → Audit tab | Payment, refund, admin actions with before/after |
| Compliance & Governance | Policy compliance, compliance audits |
| Trust & Safety | SafetyResponseLog for financial fraud cases |
| Launch Command | Operational incident financial impact |

### Audit procedure

| Step | Action |
|------|--------|
| 1 | Export finance audit trail for period (CSV/XLSX/PDF) |
| 2 | Sample 5% of withdrawal approvals — verify documentation |
| 3 | Sample 5% of refunds — verify support ticket linkage |
| 4 | Verify segregation of duties (approver ≠ requester) |
| 5 | Review CEO-approved items > threshold |
| 6 | Document findings in Compliance module |
| 7 | Remediation plan for any gaps |

### Retention

| Record type | Retention |
|-------------|-----------|
| Daily reconciliation exports | 7 years |
| Withdrawal approvals | 7 years |
| Refund records | 7 years |
| Settlement statements | 7 years |
| Audit logs | Per Compliance policy |

### Export commands

Finance Ops UI supports CSV, Excel, PDF export on all tabs. For programmatic export:

```
GET /operations/business/finance/operations/export/?type=reconciliation&format=csv
```

---

## 10. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `01_CEO_OPERATIONS_MANUAL.md` · `04_CUSTOMER_SUPPORT_MANUAL.md` · `06_DELIVERY_OPERATIONS_MANUAL.md`
