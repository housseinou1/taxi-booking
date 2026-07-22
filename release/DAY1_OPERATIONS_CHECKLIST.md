# Day 1 Operations Checklist — Closed Beta Launch

**Document ID:** BETA-DAY1-OPS-001  
**Launch date:** __________________ **Beta Day:** D1 / 14  
**Operations Manager:** __________________ **Engineer on-call:** __________________

**Playbook:** `CLOSED_BETA_LAUNCH_DAY_PLAYBOOK.md`  
**War room:** _________________________________________________

---

## Part A — T-24 Hours (Engineering / DevOps)

**Completed by:** __________________ **Date/time:** __________________

| # | Check | PASS ☐ | FAIL ☐ | Notes |
|---|-------|:------:|:------:|-------|
| A1 | API readiness `/api/health/ready/` → 200 | ☐ | ☐ | |
| A2 | Admin status page all green | ☐ | ☐ | |
| A3 | Database backup completed (< 24 h) | ☐ | ☐ | |
| A4 | Offsite backup verified (or waiver signed) | ☐ | ☐ | |
| A5 | SSL valid (> 30 days remaining) | ☐ | ☐ | |
| A6 | Docker: 9+ containers Up (healthy) | ☐ | ☐ | |
| A7 | Celery: ≥ 2 workers ping | ☐ | ☐ | |
| A8 | Redis: PONG · memory OK | ☐ | ☐ | |
| A9 | PostgreSQL: connections < 180 · migrations applied | ☐ | ☐ | |
| A10 | Monitoring active (status page + cron) | ☐ | ☐ | |
| A11 | Alerting active (war room + backup monitor) | ☐ | ☐ | |
| A12 | Maintenance mode OFF | ☐ | ☐ | |

**T-24 decision:** ☐ GO · ☐ NO-GO **CEO sign-off:** __________________

---

## Part B — T-2 Hours (Operations)

**Completed by:** __________________ **Date/time:** __________________

| # | Check | PASS ☐ | FAIL ☐ | Notes |
|---|-------|:------:|:------:|-------|
| B1 | ≥ 3 approved drivers · docs + payout OK | ☐ | ☐ | Count: ___ |
| B2 | ≥ 1 approved courier · delivery enabled | ☐ | ☐ | Count: ___ |
| B3 | Rider invitations sent | ☐ | ☐ | Sent: ___ |
| B4 | Support team online in war room | ☐ | ☐ | |
| B5 | Finance contact confirmed available | ☐ | ☐ | |
| B6 | Operations Manager on Command Center | ☐ | ☐ | |
| B7 | CEO dashboard operational | ☐ | ☐ | |
| B8 | Soft launch caps enabled (20/10/100) | ☐ | ☐ | |
| B9 | QA devices on latest APK builds | ☐ | ☐ | |
| B10 | Test accounts phone-verified | ☐ | ☐ | |

**T-2 decision:** ☐ GO · ☐ NO-GO **Ops sign-off:** __________________

---

## Part C — Launch (T-0)

**Launch time declared:** __________________ **Witness (QA):** __________________

| # | Task | Done ☐ | Time | Notes |
|---|------|:------:|------|-------|
| C1 | Enable beta access | ☐ | | |
| C2 | First driver online (map confirmed) | ☐ | | Driver ID: ___ |
| C3 | First courier online | ☐ | | Courier ID: ___ |
| C4 | First rider login | ☐ | | Rider ID: ___ |
| C5 | First ride completed | ☐ | | Ride ID: ___ |
| C6 | First delivery completed | ☐ | | Delivery ID: ___ |
| C7 | Payment verified | ☐ | | Payment ID: ___ |
| C8 | Wallet update verified | ☐ | | |
| C9 | Withdrawal workflow verified | ☐ | | |
| C10 | CEO dashboard updated | ☐ | | |

**Launch declared successful:** ☐ Yes · ☐ Partial · ☐ No — reason: __________________

---

## Part D — Hourly monitoring log (First 24 hours)

**Instructions:** Fill each row at the top of the hour. Escalate red metrics immediately.

| Hour (UTC) | API OK ☐ | Rides done | Deliveries done | Open tickets | Open incidents | P0? ☐ | Initials |
|:----------:|:--------:|:----------:|:---------------:|:------------:|:--------------:|:-----:|:--------:|
| 06:00 | ☐ | | | | | ☐ | |
| 07:00 | ☐ | | | | | ☐ | |
| 08:00 | ☐ | | | | | ☐ | |
| 09:00 | ☐ | | | | | ☐ | |
| 10:00 | ☐ | | | | | ☐ | |
| 11:00 | ☐ | | | | | ☐ | |
| 12:00 | ☐ | | | | | ☐ | |
| 13:00 | ☐ | | | | | ☐ | |
| 14:00 | ☐ | | | | | ☐ | |
| 15:00 | ☐ | | | | | ☐ | |
| 16:00 | ☐ | | | | | ☐ | |
| 17:00 | ☐ | | | | | ☐ | |
| 18:00 | ☐ | | | | | ☐ | |
| 19:00 | ☐ | | | | | ☐ | |
| 20:00 | ☐ | | | | | ☐ | |
| 21:00 | ☐ | | | | | ☐ | |
| 22:00 | ☐ | | | | | ☐ | |
| 23:00 | ☐ | | | | | ☐ | |

### Incident log (Day 1)

| Time | ID | Severity | Summary | Resolved ☐ | Owner |
|------|-----|----------|---------|:------------:|-------|
| | | | | ☐ | |
| | | | | ☐ | |
| | | | | ☐ | |

### Support ticket summary (Day 1)

| Category | Opened | Resolved | Still open |
|----------|:------:|:--------:|:----------:|
| Ride | | | |
| Payment | | | |
| GPS | | | |
| Crash | | | |
| Driver | | | |
| Delivery | | | |
| Other | | | |
| **Total** | | | |

---

## Part E — Escalation quick card

| Priority | Trigger | Action | Contact |
|----------|---------|--------|---------|
| **P0** | API down · SOS · mass payment fail | Call CEO + Eng · open S1 incident | CEO: _________ Eng: _________ |
| **P1** | Single payment fail · can't go online | War room · resolve < 4 h | Ops: _________ Finance: _________ |
| **P2** | Minor UI · slow dashboard | Log ticket · weekly review | Support: _________ |

---

## Part F — End of day handoff

| Item | Value |
|------|-------|
| Total completed rides | |
| Total completed deliveries | |
| Gross revenue (MRU) | |
| Failed payments | |
| Open P0/P1 at EOD | |
| Day 1 launch score (/100) | |
| Ready for Day 2 | ☐ Yes · ☐ No |

**Ops Manager EOD sign-off:** __________________ **Time:** __________________

**CEO report filed:** ☐ `DAY1_CEO_REPORT_TEMPLATE.md` completed and sent

---

*Print and use during Closed Beta Launch Day · Yala Technologies*
