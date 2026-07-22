# YALA Enterprise v1.0 Incident Playbook

**Document ID:** YALA-OPS-INCIDENT-001  
**Version:** 1.0.1  
**Effective date:** 2026-07-22  
**Primary incident system:** https://www.yalataxi.live/admin/launch → Incidents  
**Issue tracker:** [PILOT_ISSUES.md](../release/PILOT_ISSUES.md)

## Known launch risks (observed pre-launch)

| Risk | Severity | Detection | Owner |
|------|:--------:|-----------|-------|
| Delivery request HTTP 400 on prod | P1 | Smoke TEST2 fail | Engineering |
| LC1 code not deployed | P0 | Deploy hash mismatch | DevOps |
| Offsite backups missing | P0 | Backup monitor | DevOps |
| Device QA unsigned | P0 | No signed QA report | QA Lead |
| Auth rate limit during validation bursts | P3 | HTTP 429 on login | Engineering |
| Crash telemetry absent | P2 | No Crashlytics metric | Mobile |

## Purpose

This playbook defines severity levels, detection, escalation, response, communication, and resolution requirements for YALA Enterprise v1.0 launch operations.

## Incident Principles

1. Protect rider, driver, courier, merchant, and financial safety first.
2. Open a Launch Hub incident for every SEV-1 and SEV-2.
3. Assign one incident commander.
4. Communicate known facts only.
5. Prefer rollback for deployment-caused SEV-1.
6. Do not expand launch while SEV-1 is active.

## Severity Levels

| Severity | Definition | Examples | First response target | Executive visibility |
| --- | --- | --- | --- | --- |
| SEV-1 | Critical outage, safety failure, data loss, payment corruption, or launch rollback condition | API down, payments corrupt, SOS unavailable, widespread app crash, database unavailable | 5 minutes | Immediate CEO notification |
| SEV-2 | Major degradation affecting a core launch workflow but with mitigation | ride dispatch degraded, driver earnings unavailable, delivery completion stuck, WebSocket delivery degraded | 15 minutes | CEO summary within 30 minutes |
| SEV-3 | Limited issue affecting a subset of users or non-critical workflow | one merchant misconfigured, one driver account issue, support queue spike | 4 business hours | Daily launch summary |
| SEV-4 | Minor issue, documentation gap, cosmetic defect, or isolated user confusion | typo, FAQ update, low-impact warning | Next business day | Weekly summary |

## SEV-1 Procedure

### Detection

- Monitoring shows API down, database unavailable, Redis unavailable, or critical 5xx spike.
- Support reports widespread login, booking, payment, or app crash failure.
- Safety Manager reports SOS or emergency workflow unavailable.
- Finance reports payment corruption, duplicate charges, or ledger mismatch.

### Escalation

| Step | Owner | Target |
| --- | --- | --- |
| Declare SEV-1 | First responder | Within 5 minutes |
| Open Launch Hub incident | Incident Commander | Immediately |
| Notify CEO, Operations, Support, Finance, Safety | Incident Commander | Immediately |
| Assign technical owner | Engineering Lead | Within 5 minutes |
| Decide rollback vs forward fix | CEO with Engineering Lead | Within 15 minutes |

### Response

1. Confirm impact: who, what workflow, start time, current scope.
2. Stop expansion and pause affected operational workflow if needed.
3. Preserve logs, metrics, screenshots, and affected IDs.
4. If deploy-related, execute `release/ROLLBACK_PLAN.md`.
5. If not deploy-related, isolate service and apply approved mitigation.
6. Support Lead prepares user-facing message.

### Communication

| Audience | Channel | Frequency | Owner |
| --- | --- | --- | --- |
| CEO and leadership | Launch bridge | Every 15 minutes | Incident Commander |
| Support team | Support channel | Every 15 minutes | Support Manager |
| Affected users | In-app/WhatsApp/manual outreach as approved | At declaration and material updates | Support Manager |
| Operations staff | Operations channel | Every 15 minutes | Operations Manager |

### Resolution

SEV-1 can be resolved only when:

- Critical workflow is restored.
- Monitoring is stable for at least 30 minutes.
- No new user-impacting reports are arriving.
- Finance and safety impacts are reconciled if relevant.
- CEO or Incident Commander approves downgrade/closure.
- Post-incident review is scheduled within 24 hours.

## SEV-2 Procedure

### Detection

- Core workflow degraded but not fully down.
- A critical endpoint returns intermittent 5xx.
- WebSockets unreliable but polling fallback works.
- Driver earnings, merchant dashboard, or delivery completion fails for a group.

### Escalation

| Step | Owner | Target |
| --- | --- | --- |
| Declare SEV-2 | First responder | Within 15 minutes |
| Open Launch Hub incident | Incident Commander or Ops Manager | Within 15 minutes |
| Notify Engineering, Operations, Support | Incident Commander | Within 15 minutes |
| Notify CEO summary | Incident Commander | Within 30 minutes |

### Response

1. Identify impacted workflow and user group.
2. Apply operational workaround if available.
3. Assign engineering owner for root cause.
4. Monitor for escalation to SEV-1.
5. Keep launch scope unchanged until stable.

### Communication

| Audience | Frequency | Owner |
| --- | --- | --- |
| Launch bridge | Every 30 minutes | Incident Commander |
| Support team | At declaration and material update | Support Manager |
| CEO | Initial summary and closure | Incident Commander |

### Resolution

- Mitigation or fix confirmed.
- Error rate returns to normal for 30 minutes.
- Support confirms no active wave of user reports.
- Incident notes include root cause, affected users, and follow-up owner.

## SEV-3 Procedure

### Detection

- Isolated support tickets.
- Single merchant, driver, courier, or rider issue.
- Minor metric delay with no user-facing outage.

### Escalation

| Step | Owner | Target |
| --- | --- | --- |
| Log issue | Support or Operations | Same shift |
| Assign owner | Department lead | Same shift |
| Escalate if pattern appears | Department lead | Immediately when repeated |

### Response

1. Resolve through normal support or operations workflow.
2. Link ticket, account, ride, delivery, or merchant ID.
3. Watch for repeated reports.
4. Escalate to SEV-2 if multiple users or core flow impact appears.

### Communication

- User receives ticket response.
- Department lead includes summary in daily launch report.

### Resolution

- User or operational issue closed.
- Notes include cause and action taken.
- No repeated reports after closure.

## SEV-4 Procedure

### Detection

- Documentation clarification.
- Cosmetic issue.
- Low-impact warning.
- Internal process improvement.

### Escalation

- Route to owning department backlog.
- No launch bridge escalation unless trend increases severity.

### Response

- Record issue.
- Assign owner and expected follow-up date.
- Fix after launch freeze if it is not operationally urgent.

### Communication

- Internal only unless user-facing confusion requires support macro update.

### Resolution

- Documentation or minor correction completed.
- Closed in daily or weekly launch review.

## Incident Template

| Field | Value |
| --- | --- |
| Incident ID | |
| Severity | SEV-1 / SEV-2 / SEV-3 / SEV-4 |
| Start time | |
| Detection source | Monitoring / Support / Operations / Finance / Safety / User |
| Impacted workflow | |
| Impacted users | |
| Current status | Investigating / Mitigating / Monitoring / Resolved |
| Incident commander | |
| Technical owner | |
| Operations owner | |
| Support owner | |
| Finance owner | |
| Safety owner | |
| Latest update | |
| Next update due | |
| Rollback required | Yes / No / Under review |

## Related Documents

- `operations/LAUNCH_DAY_RUNBOOK.md`
- `operations/LAUNCH_MONITORING.md`
- `operations/SUPPORT_PLAYBOOK.md`
- `release/ROLLBACK_PLAN.md`
- `operations/09_BUSINESS_CONTINUITY_PLAN.md`
