# YALA Enterprise v1.0 Launch Monitoring

**Document ID:** YALA-OPS-MONITOR-001  
**Version:** 1.0.1  
**Effective date:** 2026-07-22  
**Primary dashboard:** https://www.yalataxi.live/admin/launch  
**Supporting dashboards:** `/admin/status`, `/admin/operations`, `/admin/operations-command`, `/admin/executive`, `/admin/finance-ops`, `/admin/support`, `/admin/trust-safety`

## Observed baselines (2026-07-22)

Captured from production before launch day. Use as comparison during launch window.

| Signal | Observed value | Source | Notes |
|--------|---------------|--------|-------|
| API health | 200 OK | `/api/health/ready/` | DB + Redis ok |
| Health latency p95 | 533 ms | 10-sample probe | Acceptable for pilot |
| Driver acceptance rate | 91.0% | `/operations/launch/kpis/` | 🟢 |
| Ride completion rate | 37.0% | Launch KPIs | 🔴 QA-inflated — exclude QA accounts post-launch |
| Cancellation rate | 60.9% | Launch KPIs | 🔴 QA-inflated |
| Failed payments | 0 | `/payments/admin/dashboard/` | 🟢 |
| Platform revenue | 243.98 MRU commission | Finance dashboard | Baseline |
| DAU / WAU / MAU | 1 / 6 / 6 | Launch KPIs | Pre-pilot cohort |
| Crash-free sessions | Unknown | — | Not instrumented (PILOT-015) |
| Celery workers | Not exposed | Health endpoint | Verify via SSH at T-6h |

**Automated probe:** `python scripts/platform-rc1-smoke.py` — run at T-1h and +1h.

## Purpose

This document defines what must be watched during launch day, who owns each signal, when to escalate, and what action to take. It is an operational readiness plan only.

## Monitoring Cadence

| Window | Cadence | Owner | Output |
| --- | --- | --- | --- |
| T-24 h to T-6 h | Every 4 hours | DevOps Lead | Baseline health note |
| T-6 h to T-1 h | Every hour | DevOps Lead, Engineering Lead | Launch readiness checkpoint |
| T-1 h to +1 h | Every 5 minutes | Launch bridge | Live launch health log |
| +1 h to +6 h | Every 15 minutes | Launch bridge | Stability trend |
| +6 h to +24 h | Every hour | Operations and Engineering | Day 1 launch scorecard |
| Day 2 to Day 7 | Twice daily | Operations Manager | Pilot trend report |
| Day 8 to Day 30 | Daily | CEO dashboard owner | First 30 days metrics |

## Golden Signals

| Signal | Target | Warning | Critical |
| --- | --- | --- | --- |
| API uptime | 99.5%+ during pilot window | Any outage over 2 min | Outage over 5 min or repeated outages |
| API 5xx rate | Below 1% | 1-3% for 5 min | Above 3% for 5 min |
| p95 API latency | Under 2,000 ms | 2,000-4,000 ms | Above 4,000 ms sustained |
| Crash-free sessions | 99%+ | 97-99% | Below 97% or repeated same crash |
| DB availability | Healthy | Slow queries or connection pressure | DB unavailable or migration issue |
| Redis availability | Healthy | transient reconnects | Redis unavailable |
| Celery backlog | Draining normally | Backlog growing for 10 min | Critical task backlog or stuck workers |
| WebSockets | Connected and receiving events | reconnect spike | dispatch/status events not delivered |

## Service Monitoring Matrix

| Area | What to monitor | Owner | Source | Escalate when |
| --- | --- | --- | --- | --- |
| API uptime | `/health/`, login, rider request, driver status, earnings | DevOps Lead | `/admin/status`, external uptime, server logs | API unavailable or core endpoint returns 5xx |
| Ride requests | Created requests, dispatch attempts, available ride feed | Operations Manager | Launch Hub (`/operations/launch/kpis/`), Operations Command | Requests created but not visible to drivers |
| Ride completion | Accepted, arrived, in progress, completed statuses | Operations Manager | Launch Hub, `/rides/history/` | Accepted rides do not progress or complete |
| Delivery completion | Merchant accepted, courier assigned, delivered | Delivery Ops Lead | Merchant Platform, `/deliveries/mine/` | Delivery orders stuck in active statuses |
| Driver online count | Online taxi drivers by city | Driver Ops Lead | Launch Hub, Fleet dashboard | Online count drops below launch threshold (pilot min: 2) |
| Merchant activity | Active merchants, orders, menu availability | Merchant Ops Lead | `/admin/merchant-platform` | Merchants cannot receive or complete orders |
| Crash rate | Rider, driver, delivery, admin fatal errors | Engineering Lead | Android logs, crash telemetry, support tickets | Spike or repeated launch-flow crash |
| CPU | API, web, worker hosts | DevOps Lead | Server metrics | Sustained high CPU affecting latency |
| RAM | API, web, worker hosts | DevOps Lead | Server metrics | Memory pressure, process restarts, OOM |
| Database | connections, query latency, locks, disk | DevOps Lead | DB metrics, logs | Connections exhausted, lock contention, disk near full |
| Redis | memory, evictions, connectivity | DevOps Lead | Redis metrics, logs | Redis unavailable or evicting critical keys |
| Celery | worker heartbeats, queue age, failed tasks | DevOps Lead | worker logs, Launch Hub alerts | task backlog grows or payment/notification tasks fail |
| WebSockets | connection count, reconnect rate, event delivery | Engineering Lead | ASGI logs, client reports | drivers miss ride offers or status updates |

## Launch Dashboard Checklist

| Check | Owner | Frequency | Pass condition |
| --- | --- | --- | --- |
| API health visible | DevOps Lead | Every 5 min during launch | Green or healthy response |
| Open SEV-1 incidents | Incident Commander | Every 5 min during launch | 0 open |
| Driver online count | Operations Manager | Every 15 min | Meets pilot supply plan |
| Ride request count | Operations Manager | Every 15 min | Requests visible and trackable |
| Ride completion count | Operations Manager | Every 30 min | Completed rides increasing |
| Delivery completion count | Delivery Ops Lead | Every 30 min | Completed deliveries increasing when active |
| Merchant order activity | Merchant Ops Lead | Every 30 min | Active merchants show expected activity |
| Support queue | Support Manager | Every 15 min | Backlog within staffing capacity |
| Payment exceptions | Finance Manager | Every 30 min | No unresolved financial mismatch |
| Safety incidents | Safety Manager | Every 15 min | No unacknowledged critical event |

## Alert Routing

| Alert type | First responder | Escalation | Communication channel |
| --- | --- | --- | --- |
| API down | DevOps Lead | Engineering Lead, CEO if SEV-1 | Launch bridge |
| Payment issue | Finance Manager | Engineering Lead, CEO if broad impact | Finance launch channel |
| Dispatch issue | Operations Manager | Engineering Lead | Operations launch channel |
| Driver app crash | Engineering Lead | DevOps Lead, Support Manager | Launch bridge |
| Rider booking issue | Engineering Lead | Operations Manager, Support Manager | Launch bridge |
| Merchant order issue | Merchant Ops Lead | Operations Manager | Merchant ops channel |
| Safety/SOS issue | Safety Manager | CEO, Operations Manager | Safety escalation channel |
| Support backlog | Support Manager | Operations Manager | Support channel |

## Response Actions

| Condition | Immediate action | Follow-up |
| --- | --- | --- |
| API outage | Declare SEV-1, open Launch Hub incident, assess rollback | Execute rollback if deploy-related and unresolved within target |
| 5xx spike | Declare SEV-2 or SEV-1 based on impact | Identify endpoint, pause affected workflow if needed |
| Driver offers not delivered | Check WebSockets and ride available endpoint | Use support/ops manual coordination until fixed |
| Payments mismatch | Stop refunds/payouts if needed, declare SEV-1 or SEV-2 | Reconcile ledger before resuming |
| Crash spike | Capture affected app/version/workflow | Hotfix or hold launch expansion |
| Celery backlog | Restart worker if safe, inspect failed tasks | Requeue or manually reconcile affected jobs |
| Redis failure | Validate app behavior and sessions | Restore Redis or rollback if session/dispatch impaired |

## Evidence Log

During launch, the monitoring owner records:

| Timestamp | Metric | Current value | Status | Action | Owner |
| --- | --- | --- | --- | --- | --- |
| | API uptime | | | | |
| | Ride requests | | | | |
| | Completed rides | | | | |
| | Completed deliveries | | | | |
| | Driver online count | | | | |
| | Merchant activity | | | | |
| | Crash rate | | | | |
| | CPU/RAM/DB/Redis/Celery/WebSockets | | | | |

## Related Documents

- `engineering/06_MONITORING_RUNBOOK.md`
- `operations/INCIDENT_PLAYBOOK.md`
- `release/PRODUCTION_MONITORING_RC1.md`
- `release/ROLLBACK_PLAN.md`
