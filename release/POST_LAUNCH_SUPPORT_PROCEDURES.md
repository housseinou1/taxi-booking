# Yala Technologies — Post-Launch Support Procedures

**Effective:** 2026-07-21  
**Production:** https://api.yalataxi.live | https://www.yalataxi.live/admin  
**On-call:** CEO + Operations Manager (executive staff groups)

---

## 1. Critical Incident (Severity 1)

**Trigger:** API down, database unreachable, mass payment failure, SOS unhandled > 5 min, data breach suspicion.

**Immediate (0–5 min):**
1. Confirm via https://api.yalataxi.live/health/ and `/admin/status`
2. Open incident in Launch Hub → `/admin/launch` → Incidents (severity: critical)
3. Post internal status in incident timeline

**Investigation (5–30 min):**
```bash
ssh root@142.93.99.142
cd /opt/yala
docker compose -p yala ps
docker compose -p yala logs django --tail 200
docker compose -p yala logs nginx --tail 100
docker compose -p yala logs celery-worker --tail 100
```

**Mitigation:**
- Restart unhealthy service: `docker compose -p yala up -d django nginx celery-worker`
- Enable maintenance mode: Executive Dashboard → Maintenance Mode (or `PlatformSetting` key `maintenance_mode`)
- Scale Daphne replicas if connection exhaustion

**Resolution:** Document root cause + resolution in incident. Run `scripts/launch-certification-prod.py`.

---

## 2. Payment Failure

**Trigger:** Rider charged but ride not completed, driver not paid, wallet mismatch, withdrawal stuck.

**Steps:**
1. Launch Hub → Support queue → filter category `payment`
2. Cross-check `/admin/payments` and `/operations/executive/qa/`
3. Locate `PaymentRecord` + `WalletTransaction` for ride/delivery ID
4. If refund warranted: `/payments/admin/refunds/` → approve/reject
5. If withdrawal stuck: `/payments/withdrawals/` → approve/reject/mark-paid
6. Log action in audit trail (automatic via admin APIs)

**Escalation:** Finance group if amount > 5,000 MRU or > 3 related tickets in 1 h.

---

## 3. Driver Suspension

**Trigger:** Fraud flag, excessive cancellations, expired documents, SOS abuse, customer complaint.

**Steps:**
1. CRM → `/admin/business` → CRM tab → locate driver profile
2. Review: support history, ratings, fraud flags (`/operations/executive/security/`)
3. **Soft suspend:** set `account_under_review` via driver admin or pause via Operations Center
4. **Hard suspend:** PATCH CRM profile `is_blacklisted: true` OR `/auth/users/<id>/block/`
5. Document reason in CRM notes + `OpsIncident` if platform-wide pattern

**Reinstatement:** Verify documents current, resolve fraud flag, unblock user, notify driver via push.

---

## 4. SOS Response

**Trigger:** `LaunchAlert` type `sos_event`, emergency support ticket, Safety admin panel alert.

**Steps (target: acknowledge < 2 min, contact < 5 min):**
1. Operations Center → `/admin/operations` → Emergency panel
2. Identify ride/delivery ID, driver/rider phones from trip detail
3. Call parties; if no response, dispatch nearest available driver/courier
4. Create Launch incident severity **high** or **critical**
5. Resolve alert in Launch Hub → Alerts

**Post-incident:** Add timeline note; review Safety admin panel; escalate to legal if injury reported.

---

## 5. Refund Request

**Trigger:** Rider/customer refund request, duplicate charge, cancelled ride after payment.

**Steps:**
1. Launch Hub → Support → refund queue
2. Verify ride/delivery status and payment record
3. Approve partial/full refund via payments admin API
4. Confirm wallet credit or gateway reversal
5. Close support ticket; update CRM if repeat offender

**SLA:** Respond within 24 h; process approved refunds within 48 h.

---

## 6. Fraud Investigation

**Trigger:** `FraudFlag` open, flagged referral, duplicate accounts, ride/delivery farming pattern.

**Steps:**
1. Executive Dashboard → Security panel OR CRM profile → complaints
2. Review `/security/admin/fraud-flags/` and audit logs
3. Cross-reference device binding + referral analytics
4. Actions: dismiss flag, suspend account, blacklist via CRM, withhold referral credit
5. Document in fraud flag resolution + audit log

**Escalation:** CEO approval before bulk account actions (> 5 accounts).

---

## 7. System Outage

**Trigger:** Health check fail, 5xx spike, WebSocket disconnect storm, Celery stopped.

**Steps:**
1. Check `/admin/status` and `scripts/backup-monitor.sh` (infra unrelated but parallel)
2. Verify: Postgres, Redis, Celery, nginx, 3× Daphne replicas
3. Common fixes:
   - Postgres connections: check `max_connections=250`, restart replicas
   - Redis: `docker compose -p yala restart redis`
   - Celery backlog: scale workers or restart
   - nginx: `docker compose -p yala exec nginx nginx -t && nginx -s reload`
4. Communicate ETA in Launch incident
5. Post-mortem within 24 h

**Recovery verification:**
```bash
curl -fsS https://api.yalataxi.live/health/
python scripts/launch-certification-prod.py
python scripts/phase21-launch-certification.py
```

---

## Escalation Matrix

| Severity | Examples | Response time | Owner |
|----------|----------|---------------|-------|
| S1 | API down, SOS, breach | 5 min | CEO + Ops Manager |
| S2 | Payment batch fail, fraud ring | 30 min | Finance + Ops |
| S3 | Single refund, doc expiry | 24 h | Support staff |
| S4 | Feature request | Backlog | Product |

---

## Daily Ops Checklist

- [ ] Review Launch Hub KPIs (`/admin/launch` → CEO KPIs)
- [ ] Check withdrawal queue + pending refunds
- [ ] Review compliance expiring documents (`/admin/business` → Compliance)
- [ ] Confirm backup monitor OK (`scripts/backup-monitor.sh`)
- [ ] Review open incidents + support tickets

**Automated reports:** cron 07:00 UTC daily, Monday 08:00 UTC weekly (`scripts/soft-launch-daily-reports.sh`)
