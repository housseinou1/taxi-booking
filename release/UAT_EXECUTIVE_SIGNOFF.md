# Yala RC2 — Executive Sign-Off

**Release:** v1.0.0-rc2  
**Document ID:** UAT-RC2-SIGNOFF-001  
**Date:** _________________________  
**Production:** https://api.yalataxi.live · https://yalataxi.live/admin  

---

## Certification summary

| Field | Value |
|-------|-------|
| **Launch score** | **74 / 100** |
| **Risk score** | **26 / 100** |
| **UAT plan** | `release/UAT_RC2_FINAL_ACCEPTANCE_TEST_PLAN.md` |
| **Known issues** | 2× P0 open · 4+× P1 open |
| **Feature freeze** | Active |

### Platform status at sign-off

| Area | Status |
|------|--------|
| Rider / Driver / Delivery apps (RC2 builds) | Built · device UAT **pending** |
| Executive Dashboard | ✅ Certified (API) |
| Operations Center | ✅ Certified (API) |
| AI Operations | ✅ Certified (API) |
| Launch Hub | ✅ Certified (API) |
| Business Operations Hub | ✅ Certified (API) |
| Production API ride lifecycle | ✅ Certified |
| Local encrypted backups | ✅ Certified |
| Offsite backups | ❌ Pending Spaces credentials |
| Performance p95 | ❌ 4086 ms (target 2000 ms) |

---

## Recommended decision (pre-filled from RC2 certification)

Based on automated RC2 certification and UAT evidence dated **2026-07-21**:

| Option | Recommendation |
|--------|----------------|
| ☐ **GO Closed Beta** | **Recommended** — controlled Nouakchott pilot with monitoring |
| ☐ **GO Public Launch** | **Not recommended** — P0 items open |
| ☐ **NO-GO** | Not recommended — platform operational for limited beta |

**Recommended closed beta caps:** Drivers **20** · Couriers **10** · Riders **100**

---

## Conditions for closed beta (if GO Closed Beta selected)

The undersigned acknowledge the following conditions:

1. **P0-001:** Physical device QA must be completed and signed within **14 days** of beta start.  
2. **P0-002:** Offsite encrypted backups must be configured within **7 days** of beta start.  
3. **P1-001:** p95 latency monitored daily; escalation if > 5000 ms sustained.  
4. Pilot caps enforced by Operations; no public marketing until public launch GO.  
5. Feature freeze remains; only P0/P1 defect fixes permitted.  
6. Post-launch procedures per `release/POST_LAUNCH_SUPPORT_PROCEDURES.md` are in effect.

---

## Executive attestation

We have reviewed the RC2 UAT plan, known issues register, release readiness checklist, and RC2 certification reports. We understand the open P0/P1 items and accept the risk profile described herein.

---

## Sign-off table

| Role | Name | Date | Signature |
|------|------|------|-----------|
| **QA Lead** | | | |
| **Operations Manager** | | | |
| **Engineering Lead** | | | |
| **CTO** | | | |
| **CEO (H. Sakho)** | | | |

---

## Final decision

Select **one**:

☐ **GO Closed Beta**  
&nbsp;&nbsp;&nbsp;&nbsp;Effective date: _______________  
&nbsp;&nbsp;&nbsp;&nbsp;Pilot market: ☐ Nouakchott ☐ Other: _______________  

☐ **GO Public Launch**  
&nbsp;&nbsp;&nbsp;&nbsp;Effective date: _______________  

☐ **NO-GO**  
&nbsp;&nbsp;&nbsp;&nbsp;Reason: _______________________________________________

---

## CEO authorization

| Field | Value |
|-------|-------|
| **Authorized by** | H. Sakho, CEO |
| **Decision** | ☐ GO Closed Beta · ☐ GO Public Launch · ☐ NO-GO |
| **Date** | |
| **Signature** | |

---

## Attachments (required with signed copy)

- [ ] `UAT_RC2_FINAL_ACCEPTANCE_TEST_PLAN.md` (completed UAT Pass/Fail columns)
- [ ] `UAT_KNOWN_ISSUES_REGISTER.md` (current version)
- [ ] `UAT_RELEASE_READINESS_CHECKLIST.md` (all pre-launch items checked)
- [ ] `physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` (when available)
- [ ] `RC2_FINAL_LAUNCH_CERTIFICATION.md`

---

## Document control

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial RC2 executive sign-off page |

---

*Yala Technologies — Official RC2 Release Documentation*  
*Print: A4 · portrait · margins normal · headers/footers optional*
