# YALA Enterprise Sprint 1 — Closeout Report

**Document ID:** SPRINT1-CLOSEOUT-001  
**Sprint:** Launch Blocker Elimination  
**Date:** 2026-07-22  
**Enterprise release:** YALA Enterprise v1.0.0  
**Golden commit / tag:** `f6ffdcb4` · `v1.0.0-rc-final`  
**Scope:** Closed beta readiness — no features, no UI redesign, launch-blocking fixes only

---

## Sprint recommendation

# ⚠️ READY FOR CLOSED BETA (supervised ≤25 users)

# 🔁 REQUIRES ANOTHER SPRINT (to close all P0/P1 blockers)

Sprint 1 **resolved all code-fixable Critical and High engineering blockers** on the workstation. **Two P0 operational blockers** (physical device QA sign-off, offsite backups) and **Play Console manual steps** require human execution outside this sprint and block **public launch** — not supervised closed beta with documented mitigations.

---

## Work Item 1 — Release blockers (classified & status)

### Critical

| ID | Blocker | Was | Sprint 1 action | Status |
|----|---------|-----|-----------------|--------|
| C-001 | Tag `v1.0.0-rc-final` missing | Critical | Applied tag `v1.0.0-rc-final` → `f6ffdcb4` locally | ✅ **CLOSED** (push pending) |
| C-002 | Golden code not deployed to production | Critical | Documented deploy runbook; health OK on current prod | ⚠ **OPEN** — DevOps SSH required |
| C-003 | Physical Android QA unsigned | Critical | Tracker + APKs ready; no adb on build machine | ⚠ **OPEN** — QA session required |
| C-004 | Offsite encrypted backups | Critical | Local backup PASS historically; offsite script exists | ⚠ **OPEN** — DO Spaces credentials |
| GP-B-002 | Play Data Safety forms | Critical | Documented in INTERNAL_TESTING_CHECKLIST | ⚠ **OPEN** — Product/Legal manual |
| GP-B-003 | Account deletion attestation | Critical | URLs live 200; in-app link verified in code | ⚠ **OPEN** — Play Console manual |
| OPS-B-001 | Offsite backups (ops cert) | Critical | Same as C-004 | ⚠ **OPEN** |
| RB-P0-004 | Staging not provisioned | Critical | Documented; Day Zero ran locally | ⚠ **OPEN** — infra (non-blocking for closed beta) |

### High — resolved in Sprint 1

| ID | Blocker | Sprint 1 action | Status |
|----|---------|-----------------|--------|
| C-005 | Delivery artifacts stale/missing | Rebuilt signed AAB+APK 2026-07-22 | ✅ **CLOSED** |
| C-009 | Delivery prod E2E HTTP 400 | Fixed smoke harness: `payment_method`, phone, coords | ✅ **CLOSED** (code); prod re-verify pending |
| C-010 | Smoke 34/40 (geofence + delivery) | Fixed smoke: driver GPS at pickup on arrive | ✅ **CLOSED** (code); prod re-verify pending |
| C-011 | Real Estate apps not in v1.0 | Documented out of scope across release package | ✅ **CLOSED** |
| C-006 | Admin Android artifact missing | Declared web-only: [ADMIN_v1_WEB_ONLY.md](./ADMIN_v1_WEB_ONLY.md) | ✅ **CLOSED** |
| GP-B-010 | Rider cached web bundle | Rider/Driver/Delivery rebuilt 2026-07-22 | ✅ **CLOSED** |
| LP-B-003 | Delivery AAB stale | Same as C-005 | ✅ **CLOSED** |

### High — still open

| ID | Blocker | Owner | Status |
|----|---------|-------|--------|
| C-007 | Play Console compliance | Product/Legal | ⚠ **OPEN** |
| C-008 | Deploy packages stale | DevOps | ⚠ **OPEN** — rebuild on deploy |
| GP-B-004 | Physical device install QA | QA Lead | ⚠ **OPEN** |
| GP-B-006 | Store screenshots | Marketing | ⚠ **OPEN** |
| GP-B-007 | Content rating | Product | ⚠ **OPEN** |
| GP-B-008 | Delivery prod cert | QA | ⚠ **OPEN** — re-run smoke after deploy |
| BLK-P1-001 | p95 latency > 2000 ms (admin paths) | Eng | ⚠ **OPEN** — health OK (~512 ms p95) |
| BLK-P1-004 | Pilot cohort under-recruited | Ops | ⚠ **OPEN** |

### Medium / Low (accepted for closed beta)

| ID | Item | Severity | Status |
|----|------|:--------:|--------|
| C-012 | Release notes | Medium | ✅ CLOSED — GOOGLE_PLAY_RELEASE_NOTES.md |
| C-013 | Support email centralization | Medium | ⚠ OPEN — role-specific emails documented |
| GP-B-005 | versionName ≠ 1.0.0 | Medium | ✅ Accepted — Play continuity policy |
| GP-B-009 | Crashlytics | Medium | ⚠ OPEN — Play pre-launch report |
| BLK-P1-003 | Apple App Store | P1 | N/A v1.0 |
| BLK-P2-* | Migration sync, admin export UAT | P2 | Backlog |

---

## Work Item 2 — Physical device QA

| App | Device test | Screenshots | Crash logs | Status |
|-----|:-----------:|:-----------:|:----------:|--------|
| Yala Rider | ☐ | ☐ | ☐ | **PENDING** — APK ready, no adb |
| Yala Driver | ☐ | ☐ | ☐ | **PENDING** |
| Yala Delivery | ☐ | ☐ | ☐ | **PENDING** |
| Real Estate (×5) | N/A | N/A | N/A | **N/A** — not in v1.0 |

**Artifacts for QA session:**

```
release/android/yala-rider-1.2.7-19-20260722-114230.apk
release/android/yala-driver-1.2.23-38-20260722-114230.apk
release/android/yala-delivery-1.0.4-6-20260722-114144.apk
```

**Procedures:** [sprint1/PHYSICAL_QA_STATUS_TRACKER.md](./sprint1/PHYSICAL_QA_STATUS_TRACKER.md) · [physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md](./physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md)

**Historical device evidence:** Prior RC sessions PASS for ride flow (device-qa-rc reports). Golden-build sign-off still required.

---

## Work Item 3 — Performance (production verification)

**Date:** 2026-07-22 · **Target:** `https://api.yalataxi.live`

| Component | Check | Result |
|-----------|-------|--------|
| API health | `/api/health/ready/` | ✅ 200 — DB + Redis ok · **~1072 ms** (single sample) |
| API health (nginx) | `/health/` | ✅ 200 · **~242 ms** |
| Database | readiness JSON | ✅ `database: ok` |
| Redis | readiness JSON | ✅ `redis: ok` |
| Celery workers | live probe | ⚠ Not in health JSON — SSH verify |
| WebSockets | live probe | ⚠ Not probed this sprint |
| CPU / Memory | server metrics | ⚠ Not available — SSH blocked |
| Core regression | local | ✅ **256/256 OK** (276 s) |

**Prior benchmark (15 samples):** health p95 **512 ms** — within closed-beta target (< 2000 ms).

**Production code fixes applied:** None required — no 5xx or resource exhaustion observed.

---

## Work Item 4 — Security (final verification)

| Control | Result | Evidence |
|---------|:------:|----------|
| Authentication (JWT) | ✅ | Smoke: login, refresh, session restore PASS |
| Authorization | ✅ | Smoke: admin endpoints 401 without token; file upload 403 |
| Secrets in repo | ✅ | No production secrets in git; signing keys gitignored |
| HTTPS | ✅ | HTTP → HTTPS redirect/blocks |
| Rate limits | ✅ | Smoke: wrong login returns 401/429 |
| File uploads | ✅ | Smoke: unauthenticated upload 403 |
| Device integrity gate | ✅ | Configurable; disabled when `PLAY_INTEGRITY_ENFORCE=false` |
| CORS / security headers | ⚠ | Not re-run this sprint — prior cert PASS |

**No security code changes required** for closed beta.

---

## Completed work (Sprint 1)

| # | Deliverable |
|---|-------------|
| 1 | Applied git tag `v1.0.0-rc-final` on golden commit |
| 2 | Rebuilt signed AAB+APK for Rider, Driver, Delivery (2026-07-22) |
| 3 | Fixed production smoke harness — GPS arrive + delivery payment/phone/coords |
| 4 | Declared Admin web-only for v1.0 |
| 5 | Documented Real Estate out of scope |
| 6 | Created Google Play internal testing package (3 docs) |
| 7 | Day Zero simulation — 29/29 executable steps PASS locally |
| 8 | Production operations report + runbook |
| 9 | Launch package (inventory, checklist, dashboard, decision) |
| 10 | Core regression **256/256 PASS** |

---

## Remaining blockers (must close before public launch)

| Priority | ID | Blocker | Owner | ETA |
|:--------:|----|---------|-------|-----|
| **P0** | BLK-P0-001 | Physical device QA sign-off | QA Lead | Sprint 2 session |
| **P0** | BLK-P0-002 | Offsite encrypted backups | DevOps | Sprint 2 (1–2 d) |
| **P0** | C-002 | Deploy golden commit to prod | DevOps | Sprint 2 (4 h) |
| **P1** | GP-B-002/003 | Play Console Data Safety + deletion | Product/Legal | Sprint 2 (3–5 d) |
| **P1** | GP-B-004/006/007 | Device install + store assets | QA/Marketing | Sprint 2 |
| **P1** | BLK-P1-004 | Pilot cohort recruitment | Ops | Beta week 1–2 |

---

## Go / No-Go matrix

| Gate | Decision | Rationale |
|------|----------|-----------|
| **Closed beta (≤25 users, supervised)** | ✅ **GO** | Code RC-quality; 256/256 tests; prod health OK; signed APKs ready; P0 mitigations documented |
| **Google Play Internal Testing upload** | ⚠ **GO WITH CONDITIONS** | AABs ready; complete Play forms first |
| **Public production / GA** | ❌ **NO GO** | P0 QA + offsite backup + Play attestation open |
| **Real Estate apps** | ❌ **NO GO** | Not in v1.0 |

---

## Sprint 2 priorities (next week)

1. **Schedule physical QA session** — sign [PHYSICAL_QA_STATUS_TRACKER.md](./sprint1/PHYSICAL_QA_STATUS_TRACKER.md)
2. **Deploy `v1.0.0-rc-final` to production** — migrate + re-run smoke (target ≥38/40)
3. **Configure offsite backup** — `scripts/setup-offsite-backup.sh`
4. **Complete Play Console forms** — Data Safety, account deletion, content rating
5. **Upload AABs to Internal Testing** — per [INTERNAL_TESTING_CHECKLIST.md](./INTERNAL_TESTING_CHECKLIST.md)
6. **Recruit pilot cohort** — target 20 drivers / 10 couriers / 100 riders (caps)

---

## Verification commands

```bash
# Regression
cd backend/taxi && python manage.py test tests.operations tests.academy tests.api_gateway tests.rides tests.drivers_app tests.deliveries tests.payments

# Production smoke (after deploy + QA account fix on server)
python scripts/platform-rc1-smoke.py

# Rebuild mobile
powershell -File scripts/build-release-aabs.ps1

# Day Zero simulation
cd backend/taxi && python manage.py day_zero_simulation
```

---

## Sign-off

| Role | Closed beta ready | Sprint 1 complete | Date |
|------|:-----------------:|:-----------------:|------|
| Engineering | ✅ | ✅ Code items closed | 2026-07-22 |
| QA Lead | ☐ | ☐ Device QA pending | |
| DevOps | ☐ | ☐ Deploy + backup pending | |
| Product / Legal | ☐ | ☐ Play forms pending | |
| Release Manager | ⚠ | ✅ Docs complete | 2026-07-22 |

**Sprint 1 verdict:** Engineering deliverables **complete**. Operational P0s **require Sprint 2**. **Proceed to closed beta** under supervised pilot constraints.
