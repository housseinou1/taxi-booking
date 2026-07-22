# YALA — Driver Operations Manual

**Document ID:** YALA-OPS-DRV-005  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** Operations Manager, onboarding staff  
**Related:** `release/POST_LAUNCH_SUPPORT_PROCEDURES.md` · `release/PHASE30_DRIVER_INCENTIVE_ENGINE_REPORT.md`

---

## 1. Overview

Driver Operations manages the full driver lifecycle: recruitment, document verification, approval, performance monitoring, suspension, and reactivation.

| Tool | URL | Purpose |
|------|-----|---------|
| Admin Dashboard | `/admin` | Driver list, document review, approve/reject |
| Operations Command Center | `/admin/operations-command` | Live drivers, onboarding pause |
| Fleet & Performance | `/admin/fleet` | Ratings, trips, maintenance |
| Driver Incentive Engine | `/admin/incentives` | Bonuses, campaigns |
| Trust & Safety | `/admin/trust-safety` | Driver safety profile |
| Launch Control | `/admin/launch` | Beta driver cap (20) |
| Smart Pricing & Dispatch | `/admin/smart-pricing` | Dispatch config |

**Beta cap:** 20 approved drivers (Nouakchott pilot)

---

## 2. Driver onboarding

### Onboarding pipeline

```
Applicant registers (Driver app)
         │
         ▼
Phone verification
         │
         ▼
Profile + vehicle info submitted
         │
         ▼
Document upload
         │
         ▼
Operations review queue
(/admin → Drivers tab)
         │
    ┌────┴────┐
    │         │
 Reject    Approve
    │         │
    ▼         ▼
Notify     Account activated;
applicant  payout account setup;
           training assigned
```

### Pre-launch recruitment targets

| Metric | Beta target |
|--------|-------------|
| Approved drivers | 20 |
| Pre-approved before Day 1 | ≥ 3 |
| Documents complete | 100% |
| Payout account verified | 100% |

### Onboarding checklist (operations)

| # | Task | ☐ |
|---|------|:-:|
| OB-01 | Verify beta cap not exceeded (Launch Hub) | ☐ |
| OB-02 | Check onboarding pause state (Command Center) | ☐ |
| OB-03 | Review new applications daily | ☐ |
| OB-04 | Complete document verification within 48 h | ☐ |
| OB-05 | Confirm payout method before first trip | ☐ |
| OB-06 | Assign training module / checklist | ☐ |
| OB-07 | Welcome message via ops WhatsApp | ☐ |

---

## 3. Document verification

### Required documents

| Document | Field | Validity check |
|----------|-------|----------------|
| Driver's license | `license_file` | Not expired; name matches ID |
| National ID | `national_id_document` | Clear photo, readable |
| Vehicle registration | `vehicle_registration` | Plate matches vehicle info |
| Insurance | `insurance_document` | Current coverage |
| Vignette (if applicable) | `vignette_document` | Current year |

### Verification workflow

```
Open driver profile in Admin Dashboard
         │
         ▼
Review each document (open file link)
         │
         ▼
Checklist per document:
- Legible
- Not expired
- Name/plate consistent
- No obvious tampering
         │
    ┌────┴────┐
    │         │
 Fail      Pass all
    │         │
    ▼         ▼
Reject     Mark approved;
with       enable driver role
reason
```

### Document verification checklist

| # | Document | Verified ☐ | Expiry date | Notes |
|---|----------|:----------:|-------------|-------|
| DV-01 | Driver's license | ☐ | | |
| DV-02 | National ID | ☐ | | |
| DV-03 | Vehicle registration | ☐ | | |
| DV-04 | Insurance | ☐ | | |
| DV-05 | Vignette | ☐ | | |
| DV-06 | Profile photo | ☐ | | |
| DV-07 | Vehicle photo (if required) | ☐ | | |
| DV-08 | Payout account | ☐ | | |

### Rejection reasons (standard)

| Code | Reason | Driver action |
|------|--------|---------------|
| DOC-01 | Expired document | Re-upload current |
| DOC-02 | Illegible photo | Retake and upload |
| DOC-03 | Name mismatch | Correct profile or re-upload |
| DOC-04 | Missing document | Complete upload |
| DOC-05 | Vehicle not eligible | Contact support |

---

## 4. Approval workflow

### Approval gates

| Gate | Requirement | System action |
|------|-------------|---------------|
| G1 | Phone verified | Automatic |
| G2 | All documents approved | Ops manual review |
| G3 | Payout account verified | Finance/ops check |
| G4 | Beta cap available | Launch Hub onboarding |
| G5 | Training complete | Ops confirmation |
| G6 | Background check (if policy) | Compliance sign-off |

### Approval workflow diagram

```
Application complete
         │
         ▼
Ops reviewer assigned
         │
         ▼
Document verification (§3)
         │
         ▼
Fleet review (vehicle type, city)
         │
         ▼
Finance: payout account OK
         │
         ▼
Approve in Admin Dashboard
         │
         ▼
Driver notified (push/SMS)
Audit log written
```

### Dual approval (recommended for beta)

| Step | Role |
|------|------|
| 1 | Operations agent — document review |
| 2 | Operations Manager — final approve |

---

## 5. Suspension process

### Suspension triggers

| Trigger | Type | Owner |
|---------|------|-------|
| Expired documents | Soft | Operations |
| Excessive cancellations | Soft → Hard | Operations |
| Fraud flag | Hard | Security Lead |
| SOS abuse | Hard | Trust & Safety |
| Customer safety complaint | Hard | Trust & Safety |
| Payment/wallet fraud | Hard | Finance + Security |

### Suspension types

| Type | Effect | How |
|------|--------|-----|
| Soft | Cannot accept new rides; complete active | `account_under_review` or Operations Center pause |
| Hard | Blocked from platform | CRM `is_blacklisted: true` or `/auth/users/<id>/block/` |

### Suspension workflow

```
Trigger identified
         │
         ▼
Review: CRM history, Trust & Safety profile,
       fraud flags, support tickets
         │
         ▼
Determine soft vs hard suspension
         │
         ▼
Apply suspension in system
         │
         ▼
Document reason in CRM notes
Create OpsIncident if pattern
         │
         ▼
Notify driver (push + SMS if policy)
         │
         ▼
Finance: hold pending withdrawals if fraud
```

### Suspension checklist

- [ ] Reason code documented
- [ ] Evidence linked (ticket IDs, incident IDs)
- [ ] Active ride handled (complete or reassign)
- [ ] Driver notified
- [ ] Trust & Safety profile updated
- [ ] Withdrawal queue flagged if needed

---

## 6. Reactivation process

### Reactivation eligibility

| Prior reason | Requirements for reinstatement |
|--------------|-------------------------------|
| Expired docs | New valid documents uploaded and verified |
| Cancellations | Manager review + warning acknowledged |
| Fraud (cleared) | Security Lead written clearance |
| Safety complaint | Investigation closed; training completed |
| Hard block (admin) | CEO/Ops Manager approval |

### Reactivation workflow

```
Driver requests reinstatement
         │
         ▼
Review suspension reason + resolution
         │
         ▼
Re-verify documents if expired
         │
         ▼
Security clearance if fraud/safety
         │
         ▼
Remove blacklist / unblock user
         │
         ▼
Notify driver; monitor first 5 trips
```

### Reactivation checklist

- [ ] Root cause addressed
- [ ] Documents current
- [ ] Security sign-off (if applicable)
- [ ] Unblock executed in admin
- [ ] CRM note with reactivation date
- [ ] 7-day monitoring flag set

---

## 7. Training checklist

### New driver training (before first ride)

| # | Topic | Method | Complete ☐ |
|---|-------|--------|:----------:|
| T-01 | App navigation (accept, navigate, complete) | In-person or video | ☐ |
| T-02 | PIN verification at pickup | Demo + QA doc | ☐ |
| T-03 | Cancellation policy | Briefing | ☐ |
| T-04 | SOS button usage | Briefing | ☐ |
| T-05 | Wallet and withdrawals | Finance overview | ☐ |
| T-06 | Customer service standards | Support playbook | ☐ |
| T-07 | Document renewal reminders | Email/SMS process | ☐ |
| T-08 | Incentive program overview | Incentive Engine summary | ☐ |
| T-09 | Test ride with ops observer | Live ride | ☐ |
| T-10 | Sign training acknowledgment | Written/digital | ☐ |

### Ongoing training triggers

| Event | Training |
|-------|----------|
| Rating drops below 4.0 | Customer service refresher |
| Route deviation alerts | Navigation best practices |
| Repeat cancellations | Policy re-read |
| Post-suspension | Full checklist repeat |

---

## 8. Performance monitoring

**Module:** `/admin/fleet` · Trust & Safety driver profile

| Metric | Green | Yellow | Red | Action |
|--------|-------|--------|-----|--------|
| Acceptance rate | ≥ 70% | 60–69% | < 60% | Incentive / outreach |
| Completion rate | > 95% | 90–95% | < 90% | Investigate cancels |
| Rating | ≥ 4.5 | 4.0–4.4 | < 4.0 | Coaching / review |
| SOS reports | 0 | 1 | ≥ 2 | Trust & Safety review |
| Document expiry | > 30 days | 7–30 days | Expired | Suspend if expired |

---

## 9. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial SOP |

**Cross-references:** `02_OPERATIONS_TEAM_MANUAL.md` · `04_CUSTOMER_SUPPORT_MANUAL.md` · `07_TRUST_AND_SAFETY_MANUAL.md`
