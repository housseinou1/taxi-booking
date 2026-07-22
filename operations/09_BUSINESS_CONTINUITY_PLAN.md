# YALA — Business Continuity Plan

**Document ID:** YALA-OPS-BCP-009  
**Version:** 1.0.0  
**Effective:** 2026-07-21  
**Audience:** CEO, Engineering Lead, Operations Manager, Finance Lead, all department heads  
**Related:** `handover/08_DISASTER_RECOVERY_SUMMARY.md` · `release/POST_LAUNCH_SUPPORT_PROCEDURES.md` · `handover/06_SUPPORT_MATRIX.md`

---

## 1. Purpose and scope

This Business Continuity Plan (BCP) defines how Yala maintains or restores critical operations during disruptions. It covers infrastructure failures, natural events, cyber incidents, and third-party outages (payments, internet).

**Critical services:**

| Service | RTO | RPO |
|---------|-----|-----|
| API (rides, deliveries) | 4 hours | 24 hours |
| Admin / operations consoles | 4 hours | 24 hours |
| SOS / safety endpoints | 1 hour | 0 (real-time) |
| Payments | 2 hours | 24 hours |
| Support channels | Best effort | — |

**Production:** https://api.yalataxi.live · https://www.yalataxi.live/admin  
**Host:** `142.93.99.142` · `/opt/yala`

---

## 2. Business impact analysis

| Function | Criticality | Max tolerable downtime | Manual workaround |
|----------|-------------|------------------------|-------------------|
| Ride dispatch | Critical | 30 min | Phone dispatch (ops) — last resort |
| Delivery dispatch | High | 1 h | Merchant direct contact |
| SOS | Critical | 5 min | Phone emergency line |
| Payments | Critical | 2 h | Cash only; defer wallet |
| Driver payouts | High | 24 h | Manual bank transfer |
| Admin dashboards | High | 4 h | SSH + logs |
| Support tickets | Medium | 4 h | WhatsApp manual log |

---

## 3. Scenario: Power outage

### Detection

- Host unreachable via ping/SSH
- Status page all red
- Monitoring alerts from external uptime checker

### Response workflow

```
Power outage at datacenter/host
         │
         ▼
Confirm scope (host only vs ISP vs city)
         │
         ▼
Notify: Engineering Lead, CEO, Operations
         │
         ▼
If UPS/generator restores < 30 min:
  Wait + monitor
         │
         ▼
If extended (> 1 h):
  Assess failover to backup host (future)
  OR communicate service pause
         │
         ▼
Power restored → verify cold boot sequence
         │
         ▼
docker compose up → health checks → all-clear
```

### Power outage checklist

- [ ] Incident declared (P0 if > 30 min expected)
- [ ] Operations pauses new ride invites (Launch Hub)
- [ ] Support posts service advisory (WhatsApp/status)
- [ ] On power restore: full daily server checks (`08_SYSTEM_MAINTENANCE_MANUAL.md`)
- [ ] Verify no DB corruption (PostgreSQL logs)
- [ ] CEO all-clear before resuming marketing

### Prevention

- Hosted VPS with provider SLA (document in environment register)
- Future: secondary region / warm standby

---

## 4. Scenario: Server failure

### Types

| Failure | Symptoms | First action |
|---------|----------|--------------|
| VM crash | SSH timeout | Provider console reboot |
| Docker daemon down | Containers stopped | Restart Docker |
| Single container OOM | One service 502 | Restart container |
| Disk full | Writes fail | Clear logs/backups |

### Server failure recovery

```
Server failure detected
         │
         ▼
SSH to host OR provider console
         │
         ▼
docker compose -p yala ps
         │
         ▼
Restart failed services:
docker compose -p yala up -d
         │
         ▼
If host unrecoverable:
  Provision new host (Scenario: Host/VM Failure)
         │
         ▼
Health checks + launch certification
```

### Host / VM failure (full rebuild)

Reference: `handover/08_DISASTER_RECOVERY_SUMMARY.md` Scenario 2

| Step | Action |
|------|--------|
| 1 | Provision new host with Docker Compose |
| 2 | Clone repository; checkout release tag |
| 3 | Restore `.env.production` from secrets vault |
| 4 | Restore PostgreSQL backup |
| 5 | Restore `media/` from offsite |
| 6 | `docker compose up --build -d` |
| 7 | Verify health endpoints and SSL |
| 8 | Update DNS if IP changed |

**Target RTO:** 4 hours

---

## 5. Scenario: Database corruption

### Detection

- Migration errors
- Query failures / inconsistent data
- PostgreSQL log corruption warnings
- Reconciliation mismatches unexplained

### Response

```
Suspected DB corruption
         │
         ▼
STOP WRITES: stop Django + Celery
         │
         ▼
Assess scope (table vs full DB)
         │
         ▼
Identify last good backup
(/var/backups/yala/postgres/ or offsite)
         │
         ▼
Restore to isolated instance first (validate)
         │
         ▼
Cut over OR point-in-time recovery
         │
         ▼
python manage.py migrate --check
         │
         ▼
Restart services + reconciliation audit
         │
         ▼
Finance full wallet reconciliation
```

### Database corruption checklist

- [ ] P0 incident declared
- [ ] Writes stopped immediately
- [ ] CEO + Finance notified
- [ ] Backup identified and tested before production restore
- [ ] Data loss window documented (RPO)
- [ ] Post-restore reconciliation signed by Finance Lead
- [ ] Root cause analysis within 72 h

---

## 6. Scenario: Cyberattack

### Types

| Type | Indicators |
|------|------------|
| Ransomware | Encrypted files, ransom note |
| Account takeover | Unusual admin logins |
| DDoS | Traffic spike, nginx errors |
| Data breach | Exfiltration logs, external report |

### Cyberattack response

```
Attack detected or suspected
         │
         ▼
P0 incident + CEO immediately
         │
         ▼
Isolate: maintenance mode ON
Block suspicious IPs / rotate credentials
         │
         ▼
Preserve logs (do not delete)
         │
         ▼
Assess: breach scope, data affected
         │
         ▼
┌─────────────────────────────┐
│ Ransomware / corruption:    │
│ Restore from offsite        │
│ immutable backup            │
│ Rotate ALL secrets          │
└──────────────┬──────────────┘
               │
               ▼
Audit unauthorized access
Compliance + legal notification if PII breached
               │
               ▼
Rebuild from verified clean image
Post-incident security review
```

### Secret rotation checklist (after breach)

- [ ] Django `SECRET_KEY`
- [ ] Database passwords
- [ ] JWT signing keys
- [ ] Payment provider API keys
- [ ] SMS/push provider keys
- [ ] Admin staff passwords forced reset
- [ ] SSH keys rotated

**Reference:** `handover/07_LICENSE_AND_COMPLIANCE.md` · Compliance & Governance module

---

## 7. Scenario: Payment outage

### Detection

- Failed payment rate > 8% (`BETA_SUCCESS_METRICS.md`)
- Provider status page down
- Webhook errors in Django logs
- Support ticket spike (category: payment)

### Response workflow

```
Payment provider outage
         │
         ▼
Confirm provider status (Bankily/Sedad/Masravi/Stripe)
         │
         ▼
P1 incident; Finance + Engineering
         │
         ▼
Enable rider communication:
"CASH/wallet only" if partial outage
         │
         ▼
Queue failed payments for retry
         │
         ▼
Provider restored → replay webhooks / manual reconcile
         │
         ▼
Finance Ops full reconciliation for outage window
```

### Payment outage checklist

- [ ] Affected providers identified
- [ ] Operations informed (dispatch continues if cash/wallet OK)
- [ ] Support macro message approved
- [ ] No duplicate charges on retry
- [ ] Refund queue cleared for outage-related failures
- [ ] Post-mortem with provider

---

## 8. Scenario: Internet outage

### Types

| Scope | Impact | Action |
|-------|--------|--------|
| Office ISP | Staff cannot access admin | Mobile hotspot; ops from secondary location |
| Datacenter ISP | Production down | Provider ticket; status page update |
| Regional (Mauritania) | Users offline | Wait; communicate when restored |
| DNS failure | Domain unreachable | Verify DNS provider; TTL check |

### Internet outage response

```
Internet outage detected
         │
         ▼
Determine: local office vs production vs DNS
         │
         ▼
Production down → P0 (same as server failure)
Office only → remote ops via mobile backup
         │
         ▼
Support: WhatsApp may still work on mobile data
SOS: phone line remains critical backup
         │
         ▼
Document downtime; resume checklists when restored
```

---

## 9. Disaster recovery summary

### Recovery objectives

| Objective | Target | Current status |
|-----------|--------|----------------|
| RTO (full API) | 4 hours | Not fully verified — schedule DR drill |
| RPO (data loss) | 24 hours | Local backups OK; offsite pending |
| RTO (database only) | 1 hour | Not verified |
| RTO (full stack rebuild) | 4 hours | Not verified |

### Backup inventory

| Asset | Method | Location |
|-------|--------|----------|
| PostgreSQL | Daily pg_dump gzip | `/var/backups/yala/postgres/` |
| Redis | AOF + volume snapshot | `redis_data` volume |
| Media | Daily rsync | Offsite object storage |
| Source code | Git | Remote repository |
| Secrets | Vault / secure store | Not in git |

### DR drill schedule

| Drill | Frequency | Owner |
|-------|-----------|-------|
| Backup restore test | Monthly | DevOps |
| Full stack rebuild | Quarterly | Engineering Lead |
| SOS failover test | Monthly | Operations + Security |
| Payment failover tabletop | Quarterly | Finance + Engineering |
| BCP review | Annually | CEO |

---

## 10. Communication plan

### Internal communication

| Severity | Channel | Audience | Update frequency |
|----------|---------|----------|------------------|
| P0 | WhatsApp war room + phone | All leadership | Every 30 min |
| P1 | WhatsApp ops group | Ops, Eng, Finance, Support | Every 2 h |
| P2 | Ticket / email | Affected team | Daily |

### War room contacts

| Role | Responsibility during P0 |
|------|---------------------------|
| CEO | Final decisions, external comms approval |
| Engineering Lead | Technical recovery lead |
| Operations Manager | User/supply communication |
| Finance Lead | Payment impact assessment |
| Support Lead | Customer messaging |
| Security Lead | Breach/safety assessment |

### External communication

| Audience | Channel | Owner | When |
|----------|---------|-------|------|
| Beta riders/drivers | WhatsApp broadcast, push | Operations | Service degradation > 30 min |
| Merchants | Direct contact | Operations | Delivery impact |
| Public (future) | Status page, social | CEO + Product | Major outage > 2 h |
| Regulators | Formal letter | Compliance + CEO | If legally required |
| Investors | Email | CEO | Material incident |

### Message templates

**Service degradation:**

```
Yala Update — [Date/Time UTC]
We are experiencing [brief description].
Rides/deliveries may be delayed. SOS remains available at [number].
Next update in [30/60] minutes.
```

**Service restored:**

```
Yala Update — [Date/Time UTC]
All systems are operational. We apologize for the disruption.
Contact support if you were affected: [channel].
```

### Status page

- Admin: `/admin/status`
- Consider public status subdomain for public launch

---

## 11. Plan activation and stand-down

### Activation criteria

Activate this BCP when any of the following occur:

- Production API unavailable > 15 minutes
- SOS system unavailable
- Confirmed data breach or ransomware
- Payment failure rate > 50% for > 30 minutes
- CEO or Engineering Lead declares disaster

### Stand-down criteria

- All critical services pass health checks
- Finance reconciliation complete (if financial impact)
- No open P0 incidents
- CEO or Engineering Lead declares all-clear

### Post-incident review (within 72 h)

| Item | Owner |
|------|-------|
| Timeline reconstruction | Engineering Lead |
| Root cause | Engineering Lead |
| Financial impact | Finance Lead |
| Customer impact count | Support Lead |
| Action items | All leads |
| BCP update | DevOps |

---

## 12. Document control

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07-21 | Initial BCP |

**Cross-references:** `08_SYSTEM_MAINTENANCE_MANUAL.md` · `01_CEO_OPERATIONS_MANUAL.md` · `handover/05_RISK_REGISTER.md` · `handover/09_GO_LIVE_READINESS.md`
