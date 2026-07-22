# YALA Enterprise v1.0 Launch Day Runbook

**Document ID:** YALA-OPS-LAUNCH-001  
**Version:** 1.0.1  
**Effective date:** 2026-07-22  
**Scope:** Pilot deployment and launch-day operations for YALA Enterprise v1.0  
**Primary command center:** https://www.yalataxi.live/admin/launch  
**Launch readiness score:** 71% — [LAUNCH_READINESS_SCORE.md](../release/LAUNCH_READINESS_SCORE.md)  
**Pilot decision:** EXTEND PILOT (≤25 users) — [PILOT_GO_LIVE_DECISION.md](../release/PILOT_GO_LIVE_DECISION.md)

## Operational readiness (verified 2026-07-22)

| Gate | Status | Evidence |
|------|:------:|----------|
| Production API health | ✅ | `/health/` 200 — DB + Redis ok |
| Platform smoke | ⚠ 34/40 | [PLATFORM_RC1_SMOKE_REPORT.md](../release/device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md) |
| Core tests | ✅ 235/235 | [CORE_DEVELOPMENT_FINAL_REPORT.md](../release/CORE_DEVELOPMENT_FINAL_REPORT.md) |
| LC1 code deployed | ❌ | [PILOT_DEPLOYMENT_REPORT.md](../deployment/PILOT_DEPLOYMENT_REPORT.md) |
| Device QA signed | ❌ | [PILOT_DEVICE_TESTING.md](../release/PILOT_DEVICE_TESTING.md) |
| Offsite backups | ❌ | [DATA_PROTECTION_CERTIFICATION.md](../release/DATA_PROTECTION_CERTIFICATION.md) |
| Pilot accounts ready | ⚠ Partial | [PILOT_USER_VALIDATION.md](../release/PILOT_USER_VALIDATION.md) |

**Launch day may proceed only after P0 gates in T-24 Hours are closed.**

## Purpose

This runbook defines the launch timeline, ownership, expected outcomes, and rollback triggers for YALA Enterprise v1.0. It is an execution procedure only. It does not introduce new product features or Version 2 work.

## Launch Roles

| Role | Owner | Primary duty |
| --- | --- | --- |
| Executive sponsor | CEO | Final Go / No-Go, external business decision |
| Incident commander | Engineering Lead | Technical triage, rollback decision recommendation |
| Operations commander | Operations Manager | Driver, courier, merchant, and support coordination |
| Deployment owner | DevOps Lead | Deploy, health checks, rollback execution |
| Support lead | Support Manager | Customer, driver, courier, merchant, and CEO escalation queues |
| Finance lead | Finance Manager | Wallets, payouts, refunds, revenue reconciliation |
| Trust and Safety lead | Safety Manager | SOS, fraud, high-risk incidents |

## Decision Rules

| Decision | Required condition |
| --- | --- |
| Launch Go | No open SEV-1, no unresolved payment outage, API healthy, support staffed |
| Launch Hold | Any critical workflow unverified, monitoring blind spot, staffing gap |
| Rollback | SEV-1 from deployment, sustained critical API failure, payment corruption, safety workflow failure |
| Forward fix | Isolated SEV-2 or SEV-3 with known mitigation and CEO/Ops approval |

## Minute-by-Minute Timeline

### T-7 Days

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| CEO | Confirm launch scope, pilot city, pilot cohort, and operating hours | Written launch scope approved | Scope unclear or public launch pressure outside pilot plan |
| Engineering Lead | Confirm 235/235 core tests and no P0 blockers | Release Candidate accepted for pilot | Any core regression or P0 reopened |
| DevOps Lead | Verify deploy access, backups, rollback artifacts, environment variables | Deploy and rollback path confirmed | Missing backup, missing rollback artifact, or untested deploy access |
| Operations Manager | Confirm driver, courier, merchant, and support staffing roster | Launch staffing calendar locked | Coverage gap during launch window |
| Support Manager | Prepare support macros and escalation channels | Support ready for launch tickets | No approved messaging for outage, payment, safety, or refund cases |
| Finance Manager | Confirm payment, wallet, payout, and refund controls | Finance approval workflow ready | Payout/refund path unverified |
| Safety Manager | Run SOS and safety escalation tabletop | Safety response path understood | SOS path unavailable or ownership unclear |

### T-3 Days

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| DevOps Lead | Dry-run production health checks and monitoring checklist | Baseline captured for API, DB, Redis, Celery, WebSockets | Missing metric for any critical service |
| Engineering Lead | Review known risks and verify hotfix branch freeze | No unapproved code changes entering launch | Late unreviewed code change in core flow |
| Operations Manager | Confirm pilot drivers/couriers can log in and go online | Minimum pilot supply available | Driver online path fails for multiple accounts |
| Merchant Ops | Confirm merchant catalog and delivery readiness | Pilot merchant can receive and complete orders | Merchant cannot accept orders |
| Support Manager | Staff live launch support channel and escalation group | Support queue ready | Support channel unavailable |
| Finance Manager | Verify finance dashboard and payment reconciliation view | Finance can identify revenue and refund exceptions | Finance cannot reconcile payments |

### T-24 Hours

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| CEO | Confirm launch still aligns with business readiness | Executive launch intent recorded | CEO decision changes to Hold |
| DevOps Lead | Take pre-launch backup and record restore point | Backup timestamp and artifact recorded | Backup fails or restore point unavailable |
| DevOps Lead | Deploy LC1 backend + migrations + frontend | Smoke ≥38/40 PASS | Deploy fails or smoke below threshold |
| Engineering Lead | Run `fix-qa-cert-accounts.py` on production | QA accounts phone-verified, no stale rides | Delivery still HTTP 400 |
| Engineering Lead | Freeze feature development and approve only operational hotfixes | Code freeze active | New feature work merges into launch branch |
| Operations Manager | Confirm active pilot roster by phone/WhatsApp | Drivers, couriers, merchants know launch window | Pilot supply below launch threshold |
| Support Manager | Confirm response SLA coverage | Support coverage active for launch day | No support lead assigned |
| Safety Manager | Confirm emergency contact path | Safety response path live | Emergency escalation unresponsive |

### T-6 Hours

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| DevOps Lead | Verify API uptime, CPU, RAM, DB, Redis, Celery, WebSockets | All systems green in Launch Monitoring | Critical service degraded before launch |
| Engineering Lead | Check error logs and crash telemetry | No active crash spike or fatal server error | Fatal error trend in core flow |
| Operations Manager | Confirm driver online readiness | Pilot drivers ready to go online | No driver supply |
| Merchant Ops | Confirm merchant operations start time | Merchants ready for orders | Merchant readiness below pilot needs |
| Support Manager | Open launch support bridge | Cross-functional channel active | Support bridge unavailable |
| Finance Manager | Confirm payment provider and manual refund backup process | Finance ready for exceptions | Payment provider outage |

### T-1 Hour

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| CEO | Final executive Go / No-Go | Launch decision recorded | CEO declares No-Go |
| DevOps Lead | Re-run health checks and confirm rollback package | Technical Go confirmed | API, DB, Redis, Celery, or WebSocket failure |
| Engineering Lead | Confirm no open SEV-1 or SEV-2 launch blockers | Engineering Go confirmed | Open SEV-1 or unresolved critical workflow |
| Operations Manager | Confirm first driver/courier/merchant cohort online | Operational Go confirmed | Supply or merchant readiness insufficient |
| Support Manager | Confirm support queues staffed | Support Go confirmed | Support staffing unavailable |
| Finance Manager | Confirm finance watch started | Finance Go confirmed | Payment reconciliation unavailable |

### Launch

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| DevOps Lead | Keep deployment stable and monitor health | API and services remain healthy | Sustained API outage, 5xx spike, DB failure |
| Operations Manager | Coordinate first live rides and deliveries | First successful rides/deliveries complete | Dispatch failure across pilot |
| Support Manager | Triage live issues within SLA | Users receive timely responses | Support queue exceeds capacity |
| Finance Manager | Watch payment and wallet events | No payment mismatch trend | Payment corruption, duplicate charges, payout issue |
| Safety Manager | Watch SOS and safety alerts | No unresolved critical safety event | SOS failure or unhandled safety incident |
| CEO | Stay available for launch decisions | Executive response available | CEO unavailable during SEV-1 |

### +1 Hour

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| Engineering Lead | Review first-hour API, crash, and error profile | No critical technical trend | Crash spike or core API failure |
| Operations Manager | Review first-hour supply and completion rates | Dispatch loop is working | No successful ride/delivery completion |
| Support Manager | Review support backlog and categories | Backlog controlled and categorized | Backlog exceeds staffed capacity |
| Finance Manager | Review revenue, refunds, wallet ledger | No reconciliation anomaly | Payment mismatch or ledger inconsistency |
| CEO | Decide Continue / Hold / Rollback based on first hour | Executive checkpoint recorded | Any SEV-1 unresolved |

### +6 Hours

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| DevOps Lead | Confirm infrastructure stability under real usage | CPU, RAM, DB, Redis, Celery stable | Sustained saturation or queue backlog |
| Engineering Lead | Review bugs and classify SEV levels | No open SEV-1; SEV-2 mitigated | Recurring critical workflow failure |
| Operations Manager | Adjust driver/courier staffing if needed | Supply matches demand | Supply collapse or merchant shutdown |
| Support Manager | Publish internal issue summary | Leadership has support picture | Repeated unresolved user-critical issue |
| Finance Manager | Validate mid-day revenue and refund state | Financial controls remain intact | Payment reconciliation failure |

### +24 Hours

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| CEO | Review Day 1 scorecard | Continue pilot, hold expansion, or rollback decision | Day 1 scorecard fails critical criteria |
| Engineering Lead | Complete Day 1 incident review | Root causes assigned | Unowned SEV-1/SEV-2 |
| Operations Manager | Review ride/delivery completion and supply | Operational plan adjusted for Day 2 | Completion rate below pilot threshold |
| Support Manager | Review SLA and satisfaction | Support plan adjusted | SLA miss for SEV-1/SEV-2 |
| Finance Manager | Reconcile Day 1 gross revenue, refunds, payouts | Finance report complete | Revenue mismatch unresolved |
| Safety Manager | Review all safety events | Safety report complete | Critical safety event unresolved |

### +7 Days

| Owner | Task | Expected outcome | Rollback trigger |
| --- | --- | --- | --- |
| CEO | Decide continue pilot, expand pilot, or hold | Executive seven-day decision recorded | Success criteria not met |
| Engineering Lead | Review defect trends and release stability | No repeating critical defects | Repeating SEV-1/SEV-2 without mitigation |
| Operations Manager | Review cohort size and service coverage | Operational capacity plan updated | Supply, merchant, or courier readiness below target |
| Support Manager | Review support load and top categories | Support playbook updated | Support load unsustainable |
| Finance Manager | Review revenue, refunds, cancellations, payout health | Financial launch report complete | Ledger or payout discrepancy unresolved |
| Safety Manager | Review safety, fraud, and trust metrics | Safety risk accepted or mitigated | Safety risk unacceptable |

## Launch Exit Criteria

| Area | Pass condition |
| --- | --- |
| API uptime | Meets monitoring target during launch window |
| Rides | Requests and completions visible in Launch Hub |
| Deliveries | Delivery completions visible when merchants are active |
| Drivers | Online count visible and stable for pilot demand |
| Merchants | Activity visible and no blocking catalog/order issue |
| Crashes | No launch-blocking crash spike |
| Payments | Revenue, wallet, and refund records reconcile |
| Support | SEV-1 response within SLA; backlog controlled |
| Safety | SOS and safety escalation remain available |

## Related Documents

- `operations/LAUNCH_MONITORING.md`
- `operations/INCIDENT_PLAYBOOK.md`
- `operations/SUPPORT_PLAYBOOK.md`
- `operations/FIRST_30_DAYS.md`
- `operations/LAUNCH_EXECUTIVE_BRIEF.md`
- `release/ROLLBACK_PLAN.md`
- `release/PILOT_GO_LIVE_DECISION.md`
- `release/PILOT_USER_VALIDATION.md`
- `deployment/PILOT_DEPLOYMENT_REPORT.md`
- `operations/09_BUSINESS_CONTINUITY_PLAN.md`
