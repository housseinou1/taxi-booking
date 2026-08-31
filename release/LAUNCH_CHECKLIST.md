# YALA Enterprise v1.0 Launch Checklist

**Document ID:** YALA-REL-LAUNCH-CHECKLIST-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0  
**Golden commit:** `f6ffdcb4`  
**Rule:** Development frozen except release-blocking fixes.

Status key: **READY** · **PENDING** · **BLOCKED**

---

## Engineering

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Core development complete | **READY** | 256/256 core tests passing (validated 2026-07-22); launch context 235/235 |
| No P0 code blockers | **READY** | 0 open P0 code blockers |
| Golden release commit | **READY** | `f6ffdcb4` on `main` |
| Release tag `v1.0.0-rc-final` | **PENDING** | Only `v1.0.0-rc1`, `v1.0.0-rc2` exist — apply final tag |
| Production frontend build | **READY** | `frontend/build/index.html` dated 2026-07-22 |
| Frontend deploy archive | **PENDING** | `release/frontend-prod-deploy.zip` dated 2026-07-08 — rebuild from golden commit |
| Backend deployment package | **PENDING** | `release/phase2-backend-deploy.zip` dated 2026-07-08 — rebuild from golden commit |
| Production deploy (142.93.99.142) | **PENDING** | Golden code not deployed; health OK on current prod |
| Database migrations | **READY** | 180 migration files; `makemigrations --check` PASS |
| Native Rider package (AAB + APK) | **READY** | Signed artifacts 2026-07-20 in `release/android/` |
| Native Driver package (AAB + APK) | **READY** | Signed artifacts 2026-07-21 in `release/android/` |
| Native Delivery package | **PENDING** | AAB stale (2026-07-07); signed APK missing |
| Native Admin package | **BLOCKED** | No signed release AAB/APK found |
| Real Estate standalone apps | **BLOCKED** | No native wrappers — out of v1.0 scope |

---

## QA

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Core regression suite | **READY** | 256/256 OK (2026-07-22) |
| Release Candidate approved | **READY** | RC approved per launch context |
| Production smoke | **PENDING** | 34/40 PASS — ride geofence + delivery HTTP 400 failures |
| Physical Android QA (golden APKs) | **PENDING** | No LC1/golden device sign-off on file |
| Delivery production E2E | **PENDING** | `/deliveries/request/` HTTP 400 (UAT-D-010) |
| Store upload validation | **PENDING** | Requires Play Console upload after final artifacts |
| Crash-free launch baseline | **PENDING** | No Crashlytics; manual logcat validation required |

---

## Operations

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Launch day runbook | **READY** | `operations/LAUNCH_DAY_RUNBOOK.md` |
| Launch monitoring plan | **READY** | `operations/LAUNCH_MONITORING.md` |
| Incident playbook | **READY** | `operations/INCIDENT_PLAYBOOK.md` |
| Support playbook | **READY** | `operations/SUPPORT_PLAYBOOK.md` |
| First 30 days metrics | **READY** | `operations/FIRST_30_DAYS.md` |
| Production runbook | **READY** | `operations/PRODUCTION_RUNBOOK.md` |
| Production ops validation | **READY WITH CONDITIONS** | `operations/PRODUCTION_OPERATIONS_REPORT.md` — closed beta OK, GA not ready |
| Offsite encrypted backups | **BLOCKED** | RB-P0-005 / OPS-B-001 open |
| Failure recovery drills (live) | **PENDING** | Architecture validated; SSH drills not executed |
| Public launch expansion | **PENDING** | Requires pilot evidence + closed conditions |

---

## Security

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Android release signing (Rider/Driver/Delivery) | **READY WITH CONDITIONS** | Signed AAB/APK present; keystore not in repo |
| Admin release signing | **BLOCKED** | Signed Admin release artifact not found |
| HTTPS enforcement | **READY** | Smoke: HTTP redirects/blocks; prod HTTPS 200 |
| Privacy policy URL live | **READY** | https://www.yalataxi.live/privacy — HTTP 200 |
| Terms URL live | **READY** | https://www.yalataxi.live/terms — HTTP 200 |
| Account deletion URL live | **READY** | https://yalataxi.live/account-deletion — HTTP 200 |
| Account deletion Play attestation | **PENDING** | In-app link in `SettingsPage.js`; Play declaration unverified |
| Data Safety forms (Play Console) | **PENDING** | Manual submission required |
| Offsite encrypted backups | **BLOCKED** | Critical open item in certification |
| JWT / rate limiting | **READY** | Smoke: refresh 200, rate limit 401 |

---

## Legal

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Privacy Policy URL | **READY** | Live 200; store metadata references privacy links |
| Terms of Service URL | **READY** | Live 200 |
| Account deletion URL | **READY WITH CONDITIONS** | Live 200; Play attestation pending |
| Rider/driver/courier legal acceptance flows | **READY** | In-app terms + privacy acceptance components present |
| Play Console declarations | **PENDING** | Data Safety, account deletion, content rating |
| Real Estate store claims | **BLOCKED** | No standalone Real Estate apps — do not publish claims |
| CEO / executive sign-off | **PENDING** | `UAT_SIGNOFF.md` unsigned |

---

## Finance

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Payment/wallet release readiness | **READY WITH CONDITIONS** | Core certified; smoke payment recorded |
| Refund process documented | **READY** | Operations and support manuals present |
| Payout process | **READY WITH CONDITIONS** | Driver wallet/payout modules; device QA pending |
| Revenue reconciliation | **READY** | Smoke: admin revenue=243.98 MRU |
| Payment exception monitoring | **READY** | Launch monitoring + support playbooks |
| Failed payments on prod | **READY** | 0 failed payments (prior certification) |

---

## Support

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Customer support playbook | **READY** | `operations/SUPPORT_PLAYBOOK.md` |
| Driver support playbook | **READY** | Support playbook + driver manual |
| Merchant support playbook | **READY** | Support playbook present |
| Courier support playbook | **READY** | Support playbook + delivery manual |
| Landlord support (operational) | **READY WITH CONDITIONS** | No standalone app; support macros only |
| CEO escalations | **READY** | Support + executive launch docs |
| Support email on all store listings | **PENDING** | Rider: `support@yalataxi.live` ✅; Driver: `drivers@yala.mr`; Delivery/Admin: missing |
| Support website | **READY** | https://yalataxi.live — referenced in store metadata |

---

## Marketing

| Item | Status | Evidence / required action |
| --- | --- | --- |
| Rider store listing copy | **READY WITH CONDITIONS** | `store-listings/rider/` — release notes version stale |
| Driver store listing copy | **READY WITH CONDITIONS** | `store-listings/driver/` — release notes version stale |
| Delivery store listing copy | **READY WITH CONDITIONS** | `release/play-store/delivery/listing.md` — notes say v1.0.1, build is 1.0.4 |
| Admin store listing | **PENDING** | No admin store listing package found |
| Store screenshots | **PENDING** | Ordering docs exist; Play upload not validated |
| Feature graphics | **PENDING** | Specs in delivery listing; PNG upload not validated |
| Release notes (current build versions) | **PENDING** | Rider `v1.2.2`, Driver `v1.1.3`, Delivery `v1.0.1` — all stale |
| Apple App Store | **BLOCKED** | Not in v1.0 scope |

---

## Launch Checklist Summary

| Area | READY | PENDING | BLOCKED |
|------|:-----:|:-------:|:-------:|
| Engineering | 7 | 5 | 2 |
| QA | 2 | 5 | 0 |
| Operations | 6 | 3 | 1 |
| Security | 5 | 2 | 2 |
| Legal | 3 | 2 | 1 |
| Finance | 4 | 0 | 0 |
| Support | 6 | 1 | 0 |
| Marketing | 0 | 6 | 1 |

**Recommendation:** **GO WITH CONDITIONS** for controlled pilot / closed testing.  
**Not ready** for Google Play production launch until Delivery/Admin artifacts, Play attestations, device QA, production deploy, backup, and tag conditions are closed.
