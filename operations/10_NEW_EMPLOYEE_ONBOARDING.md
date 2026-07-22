# YALA — New Employee Onboarding

**Document ID:** YALA-OPS-ONB-010  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** HR, department leads, new hires  
**Related:** `handover/06_SUPPORT_MATRIX.md` · `operations/README.md`

---

## 1. Overview

This guide standardizes onboarding for all Yala departments. Each hire receives role-specific training, system access, and assigned SOP documents.

**Production environment:**

| Resource | URL |
|----------|-----|
| Admin portal | https://www.yalataxi.live/admin |
| API | https://api.yalataxi.live |
| Privacy policy | https://www.yalataxi.live/privacy |
| Terms | https://www.yalataxi.live/terms |

---

## 2. Onboarding timeline (all roles)

| Day | Activity | Owner |
|-----|----------|-------|
| D-3 | Offer accepted; IT ticket for accounts | HR |
| D-1 | Accounts provisioned; welcome email with SOP links | IT / Lead |
| D1 AM | Orientation (company, product, safety culture) | HR + CEO/COO |
| D1 PM | Role-specific training begins | Department lead |
| D2–D5 | Shadowing + supervised tasks | Department lead |
| D7 | Checkpoint review | Lead + HR |
| D14 | Independent work with QA spot-checks | Lead |
| D30 | Probation review | Lead + HR |

---

## 3. Engineering onboarding

### Primary documents

| Document | Path |
|----------|------|
| Deployment guide | `DEPLOYMENT.md` |
| Docker Compose | `docker-compose.yml` |
| Environment register | `handover/04_ENVIRONMENT_REGISTER.md` |
| Dependency register | `handover/03_DEPENDENCY_REGISTER.md` |
| Disaster recovery | `handover/08_DISASTER_RECOVERY_SUMMARY.md` |
| System maintenance SOP | `operations/08_SYSTEM_MAINTENANCE_MANUAL.md` |
| BCP | `operations/09_BUSINESS_CONTINUITY_PLAN.md` |

### Engineering training checklist

| # | Topic | Complete ☐ |
|---|-------|:----------:|
| E-01 | Local dev setup (Docker, Django, React) | ☐ |
| E-02 | Repository structure walkthrough | ☐ |
| E-03 | Run backend test suite | ☐ |
| E-04 | Run frontend build | ☐ |
| E-05 | Read `backend/taxi/operations/` app overview | ☐ |
| E-06 | Health endpoints and monitoring | ☐ |
| E-07 | Deployment procedure (staging → prod) | ☐ |
| E-08 | On-call rotation and P0 response | ☐ |
| E-09 | Security: JWT, permissions, audit logging | ☐ |
| E-10 | First supervised production deploy (if applicable) | ☐ |

### Engineering access permissions

| System | Access level |
|--------|--------------|
| Git repository | Read/write (branch policy) |
| Production SSH | On-call engineers only |
| Admin portal | Staff account; no CEO groups unless lead |
| `/admin/status` | Yes |
| Secrets vault | On-call + Engineering Lead |
| Sentry/logs | Yes |
| Database read | On-call; write via migrations only |

---

## 4. Operations onboarding

### Primary documents

| Document | Path |
|----------|------|
| Operations team SOP | `operations/02_OPERATIONS_TEAM_MANUAL.md` |
| Driver operations | `operations/05_DRIVER_OPERATIONS_MANUAL.md` |
| Delivery operations | `operations/06_DELIVERY_OPERATIONS_MANUAL.md` |
| Trust & Safety | `operations/07_TRUST_AND_SAFETY_MANUAL.md` |
| Beta runbook | `release/BETA_OPERATIONS_RUNBOOK.md` |
| Day 1 checklist | `release/DAY1_OPERATIONS_CHECKLIST.md` |

### Operations training checklist

| # | Topic | Complete ☐ |
|---|-------|:----------:|
| O-01 | Admin portal navigation | ☐ |
| O-02 | Operations Command Center tour | ☐ |
| O-03 | Morning / closing checklists | ☐ |
| O-04 | Driver document review and approval | ☐ |
| O-05 | Courier and merchant monitoring | ☐ |
| O-06 | Incident creation in Launch Hub | ☐ |
| O-07 | SOS escalation (observe live drill) | ☐ |
| O-08 | Shift handover procedure | ☐ |
| O-09 | Daily reporting template | ☐ |
| O-10 | Multi-City and Launch Control overview | ☐ |

### Operations access permissions

| System | Access level |
|--------|--------------|
| Admin portal | Operations Manager / Supervisor groups |
| `/admin/operations-command` | Yes |
| `/admin/operations` | Yes |
| `/admin/launch` | Yes |
| `/admin/trust-safety` | Yes (ops + safety) |
| `/admin/fleet` | Yes |
| `/admin/merchant-platform` | Yes |
| `/admin/multi-city` | Manager only |
| `/admin/ceo-master` | No (unless executive) |
| Production SSH | No |
| Finance withdrawals approve | No |

**Django groups:** `Operations Manager`, `Supervisor` (see `operations/executive_permissions.py`)

---

## 5. Finance onboarding

### Primary documents

| Document | Path |
|----------|------|
| Finance operations SOP | `operations/03_FINANCE_OPERATIONS_MANUAL.md` |
| Phase 24 report | `release/PHASE24_FINANCE_OPERATIONS_REPORT.md` |
| CEO approval matrix | `operations/01_CEO_OPERATIONS_MANUAL.md` §8 |
| Compliance | `handover/07_LICENSE_AND_COMPLIANCE.md` |

### Finance training checklist

| # | Topic | Complete ☐ |
|---|-------|:----------:|
| F-01 | Finance Operations Center tour | ☐ |
| F-02 | Daily reconciliation workflow | ☐ |
| F-03 | Payment provider breakdown | ☐ |
| F-04 | Withdrawal approve/reject/mark paid | ☐ |
| F-05 | Refund process with Support | ☐ |
| F-06 | Merchant settlement cycle | ☐ |
| F-07 | Partner settlement cycle | ☐ |
| F-08 | COD reconciliation (deliveries) | ☐ |
| F-09 | Audit trail export | ☐ |
| F-10 | Monthly close procedure | ☐ |

### Finance access permissions

| System | Access level |
|--------|--------------|
| Admin portal | Finance / Accountant groups |
| `/admin/finance-ops` | Full |
| `/admin/incentives` | Read + approve payouts |
| `/admin/merchant-platform` | Settlements tab |
| `/admin/partner-platform` | Settlements tab |
| `/admin/compliance-governance` | Audit export |
| Withdrawal approve > 5,000 MRU | Finance Lead only |
| Production SSH | No |

**Django groups:** `Finance`, `Accountant`, `IsFinanceStaff` permission

---

## 6. Support onboarding

### Primary documents

| Document | Path |
|----------|------|
| Customer support SOP | `operations/04_CUSTOMER_SUPPORT_MANUAL.md` |
| Post-launch support | `release/POST_LAUNCH_SUPPORT_PROCEDURES.md` |
| Support matrix | `handover/06_SUPPORT_MATRIX.md` |

### Support training checklist

| # | Topic | Complete ☐ |
|---|-------|:----------:|
| S-01 | Support Center queue navigation | ☐ |
| S-02 | Ticket categories and routing | ☐ |
| S-03 | SLA targets and response templates | ☐ |
| S-04 | Ride complaint workflow | ☐ |
| S-05 | Delivery complaint workflow | ☐ |
| S-06 | Refund eligibility and escalation | ☐ |
| S-07 | Lost item process | ☐ |
| S-08 | Emergency / SOS escalation (critical) | ☐ |
| S-09 | CRM notes in Business Operations | ☐ |
| S-10 | WhatsApp support line procedures | ☐ |

### Support access permissions

| System | Access level |
|--------|--------------|
| Admin portal | Support staff group |
| `/admin/support` | Full |
| `/admin/launch` | Read + incident create |
| `/admin/business` | CRM read/write notes |
| `/admin/operations-command` | Read (trip lookup) |
| `/admin/trust-safety` | Read; escalate only |
| `/admin/finance-ops` | No approve |
| Refund approve | Support Lead only ≤ 2,000 MRU |
| User block/suspend | No — escalate to Operations |

---

## 7. Executive onboarding

### Primary documents

| Document | Path |
|----------|------|
| CEO operations SOP | `operations/01_CEO_OPERATIONS_MANUAL.md` |
| BCP | `operations/09_BUSINESS_CONTINUITY_PLAN.md` |
| CEO daily template | `release/CEO_DAILY_DASHBOARD_TEMPLATE.md` |
| Success metrics | `release/BETA_SUCCESS_METRICS.md` |
| Go-live readiness | `handover/09_GO_LIVE_READINESS.md` |
| Project dashboard | `project-management/06_PROJECT_DASHBOARD.md` |

### Executive training checklist

| # | Topic | Complete ☐ |
|---|-------|:----------:|
| X-01 | CEO Master Command Center | ☐ |
| X-02 | Executive Dashboard + maintenance mode | ☐ |
| X-03 | Daily CEO checklist | ☐ |
| X-04 | Weekly executive review agenda | ☐ |
| X-05 | Financial approval workflow | ☐ |
| X-06 | Expansion / GO-NO-GO process | ☐ |
| X-07 | Trust & Safety CEO dashboard | ☐ |
| X-08 | Board & Investor Reports | ☐ |
| X-09 | Compliance & Governance overview | ☐ |
| X-10 | P0 escalation and BCP activation | ☐ |

### Executive access permissions

| System | Access level |
|--------|--------------|
| Admin portal | CEO / executive staff groups |
| All operations modules | Read (+ write where noted) |
| `/admin/ceo-master` | Full |
| `/admin/executive` | Full |
| `/admin/board-reports` | Full |
| `/admin/compliance-governance` | Full |
| Finance approve all thresholds | CEO |
| Maintenance mode | CEO / Executive |
| Production SSH | No (unless CTO dual role) |

**Django groups:** `CEO`, executive staff per `operations/executive_permissions.py`

---

## 8. Training schedule (detailed)

### Week 1 — All hires (common)

| Session | Duration | Content |
|---------|----------|---------|
| Company intro | 2 h | Mission, beta scope, Nouakchott pilot |
| Product tour | 2 h | Rider, Driver, Delivery apps (demo) |
| Admin portal overview | 1 h | Login, navigation, status page |
| Safety culture | 1 h | SOS, Trust & Safety, zero tolerance policy |
| Security & privacy | 1 h | PII handling, password policy, audit |
| Tools setup | 2 h | Email, WhatsApp groups, admin account test |

### Week 1 — Role-specific (parallel tracks)

| Role | Mon | Tue | Wed | Thu | Fri |
|------|-----|-----|-----|-----|-----|
| Engineering | Local setup | Backend deep dive | Frontend + deploy | Monitoring + on-call | Shadow deploy |
| Operations | Command Center | Driver onboarding | Delivery + merchant | Incidents + SOS drill | Solo shift (supervised) |
| Finance | Reconciliation | Withdrawals | Settlements | Refunds + COD | Monthly close review |
| Support | Ticket system | Ride complaints | Delivery + refunds | Emergency escalation | Live queue (supervised) |
| Executive | CEO dashboard | KPI review | Finance approvals | Safety + BCP | Launch decision framework |

### Week 2–4

| Week | Focus |
|------|-------|
| 2 | Independent work with daily lead check-in |
| 3 | Cross-functional shadow (half day in adjacent dept) |
| 4 | 30-day review; full access confirmation |

---

## 9. Required accounts

| Account | All | Eng | Ops | Finance | Support | Exec |
|---------|:---:|:---:|:---:|:-------:|:-------:|:----:|
| Company email | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin portal user | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| WhatsApp ops group | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| WhatsApp war room | | ✓ | ✓ | ✓ | | ✓ |
| Git repository | | ✓ | | | | ✓ |
| Production SSH | | On-call | | | | |
| Secrets vault | | Lead | | Lead | | ✓ |
| Google Play / App Store | | | | | | Product |

### Admin account provisioning checklist

| # | Step | Owner | ☐ |
|---|------|-------|:-:|
| A-01 | Create Django user with corporate email | Engineering Lead | ☐ |
| A-02 | Assign correct group(s) | Department lead | ☐ |
| A-03 | Verify role routing (`frontend/src/auth/roleRouting.js`) | Engineering | ☐ |
| A-04 | Test login to assigned modules only | New hire + lead | ☐ |
| A-05 | Enable 2FA if policy requires | IT | ☐ |
| A-06 | Document in access register | HR | ☐ |
| A-07 | Remove access on offboarding (same day) | Engineering Lead | ☐ |

---

## 10. Access permissions matrix

| Module | Route | CEO | Ops Mgr | Finance | Support | Engineer |
|--------|-------|:---:|:-------:|:-------:|:-------:|:--------:|
| CEO Master | `/admin/ceo-master` | ✓ | | | | |
| Executive | `/admin/executive` | ✓ | read | read | | read |
| Operations Command | `/admin/operations-command` | ✓ | ✓ | | read | read |
| Operations Center | `/admin/operations` | ✓ | ✓ | | read | read |
| Launch Control | `/admin/launch` | ✓ | ✓ | read | ✓ | read |
| Finance Ops | `/admin/finance-ops` | ✓ | | ✓ | | |
| Trust & Safety | `/admin/trust-safety` | ✓ | ✓ | | escalate | read |
| Support Center | `/admin/support` | ✓ | read | read | ✓ | |
| Merchant Platform | `/admin/merchant-platform` | ✓ | ✓ | ✓ | read | read |
| Partner Platform | `/admin/partner-platform` | ✓ | read | ✓ | | read |
| Customer Growth | `/admin/customer-growth` | ✓ | read | read | read | read |
| Incentive Engine | `/admin/incentives` | ✓ | read | ✓ | | read |
| Compliance | `/admin/compliance-governance` | ✓ | read | ✓ | | read |
| Board Reports | `/admin/board-reports` | ✓ | | ✓ | | |
| Production Status | `/admin/status` | ✓ | ✓ | ✓ | ✓ | ✓ |

**Legend:** ✓ = full access · read = view only · escalate = create/escalate tickets only

**Source of truth for permissions:** `backend/taxi/operations/executive_permissions.py` and Django group membership.

---

## 11. Offboarding

| Step | Timing | Owner |
|------|--------|-------|
| Disable admin account | Last working day | Engineering Lead |
| Remove from WhatsApp groups | Same day | HR |
| Revoke SSH/vault access | Same day | DevOps |
| Knowledge transfer doc | Last week | Departing + lead |
| Access audit | Within 48 h | Security Lead |

---

## 12. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial onboarding guide |

**Cross-references:** All documents in `operations/` · `handover/06_SUPPORT_MATRIX.md` · `project-management/README.md`
