# RC2 Release Notes

**Release candidate:** v1.0.0-rc2  
**Date:** 2026-07-21  
**Prior RC:** v1.0.0-rc1  

---

## RC2 Focus

Bug fixes, certification, and operational readiness for Nouakchott soft launch. No new product features.

### Certification & Ops
- RC2 certification scripts (`rc2-certification.py`, mobile API smoke, security verify, Play Store verify)
- Offsite backup setup script (`setup-offsite-backup.sh`) — rclone installed on prod
- JWT token fix for load testing (`fetch-load-test-token.sh`)
- Soft launch daily/weekly report automation (Phase 19)

### Verified on Production
- 335 concurrent requests @ **0% HTTP 5xx**
- Encrypted backup + DR decrypt drill PASS
- Platform health, operations drill, Launch Hub PASS
- Play Store automated checks 18/18 PASS

---

## Known Issues (RC2)

| ID | Severity | Issue |
|----|----------|-------|
| RC2-001 | P0 | Physical Android device QA not completed |
| RC2-002 | P0 | Offsite backup remote not configured |
| RC2-003 | P0 | Play Console Data Safety + account deletion pending |
| RC2-004 | P0 | Apple App Store metadata pending |
| RC2-005 | P1 | p95 latency 3865 ms (target < 2000 ms mixed load) |
| RC2-006 | P1 | Pilot cohort not recruited (2/100 drivers) |

---

## Remaining Before Soft Launch GO

1. Physical device QA — Rider 1.2.7, Driver 1.2.23, Delivery 1.0.4  
2. Configure `BACKUP_OFFSITE_REMOTE` + verify upload  
3. Complete Play Store manual attestation  
4. Recruit pilot drivers/couriers/riders per soft launch caps  
5. Optimize or accept p95 under mixed load  

See `release/RC2_CERTIFICATION.md` for full certification results.
