# YALA Enterprise v1.0 Launch Dashboard

**Document ID:** YALA-REL-LAUNCH-DASHBOARD-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0  
**Golden commit:** `f6ffdcb4`

---

## Overall Readiness

### **70%**

| Domain | Weight | Score | Weighted |
|--------|:------:|:-----:|:--------:|
| Core code & regression | 20% | 100% | 20.0 |
| Release artifacts | 25% | 58% | 14.5 |
| Store compliance | 15% | 42% | 6.3 |
| QA & smoke | 15% | 68% | 10.2 |
| Operations | 15% | 72% | 10.8 |
| Legal & support URLs | 10% | 85% | 8.5 |
| **Total** | | | **70.3%** |

**Validated today:** 256/256 tests OK · production health 200 · legal URLs 200 · Rider/Driver signed AAB+APK present.

---

## Executive Status

| Area | Status |
| --- | --- |
| Core code | ✅ **READY** |
| Golden commit | ✅ **READY** (`f6ffdcb4`) |
| Release tag | ⚠ **PENDING** (`v1.0.0-rc-final` not applied) |
| Operations package | ✅ **READY** |
| Rider publish package | ⚠ **READY WITH CONDITIONS** |
| Driver publish package | ⚠ **READY WITH CONDITIONS** |
| Delivery publish package | ⚠ **PENDING** |
| Admin publish package | ❌ **BLOCKED** |
| CEO Dashboard | ✅ **READY AS ADMIN MODULE** |
| Real Estate standalone apps | ❌ **BLOCKED — N/A v1.0** |
| Store legal/compliance forms | ⚠ **PENDING** |
| Production deploy (golden) | ⚠ **PENDING** |
| Closed testing / controlled pilot | ⚠ **GO WITH CONDITIONS** |
| Google Play production launch | ❌ **NOT READY** |

---

## Open Blockers

| ID | Blocker | Severity | Owner | Required action |
| --- | --- | --- | --- | --- |
| LP-B-001 | Real Estate standalone apps not in v1.0 repo | High | Product | Confirm out-of-scope; remove from publish plan |
| LP-B-002 | Admin signed release AAB/APK missing | High | Mobile / DevOps | Build/sign Admin artifact or declare web-only for v1.0 |
| LP-B-003 | Delivery AAB stale (2026-07-07); signed APK missing | High | Mobile | Rebuild Delivery from golden commit; produce signed AAB + APK |
| LP-B-004 | Tag `v1.0.0-rc-final` not applied | High | Engineering | Apply tag to `f6ffdcb4` and push |
| LP-B-005 | Deployment packages stale (2026-07-08) | High | DevOps | Rebuild backend + frontend deploy archives from golden commit |
| LP-B-006 | Golden code not deployed to production | Critical | DevOps | Deploy + migrate on 142.93.99.142 |
| LP-B-007 | Play Console Data Safety / account deletion attestations | High | Product / Legal | Submit Play Console declarations per app |
| LP-B-008 | Physical Android QA unsigned for golden artifacts | Critical | QA Lead | Execute device QA on final Rider/Driver/Delivery/Admin builds |
| LP-B-009 | Offsite encrypted backups unresolved | Critical | DevOps | Configure and verify offsite backups (RB-P0-005) |
| LP-B-010 | Delivery prod E2E HTTP 400 | High | Engineering | Fix UAT-D-010; verify on prod after deploy |
| LP-B-011 | Production smoke 34/40 | High | QA / Eng | Close delivery failure; geofence failures are smoke-harness limitation |

---

## Critical Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Publishing Real Estate apps that do not exist | Store rejection, user confusion, support overload | Exclude Real Estate from v1.0 publish plan |
| Delivery package predates golden commit | Couriers receive stale build with known fixes missing | Rebuild Delivery signed AAB/APK before any distribution |
| Admin package unsigned | Cannot distribute Admin as Android release | Build/sign or restrict Admin to web-only |
| Play declarations incomplete | Play submission rejection | Complete Data Safety, account deletion, content rating |
| Device QA incomplete | Post-publish crashes or workflow failures | Physical QA on golden APKs before closed testing expansion |
| Golden code not on production | Pilot users hit pre-golden bugs | Deploy `f6ffdcb4` before expanding pilot |
| Offsite backups absent | Data loss on server failure | Configure offsite backup before GA |
| Stale release notes | User confusion at install | Update store release notes to match current build versions |

---

## Applications Ready

| Application | Readiness | Evidence |
| --- | --- | --- |
| Yala Rider | **READY WITH CONDITIONS** | Signed AAB+APK (2026-07-20); icons/splash present; legal URLs live |
| Yala Driver | **READY WITH CONDITIONS** | Signed AAB+APK (2026-07-21); icons/splash present; legal URLs live |
| CEO Dashboard | **READY AS ADMIN MODULE** | Web route in `frontend/build/`; admin smoke PASS |

---

## Applications Pending

| Application | Status | Reason |
| --- | --- | --- |
| Yala Delivery | **PENDING** | AAB stale (2026-07-07); signed APK missing; prod E2E HTTP 400 |
| Admin Portal | **PENDING / BLOCKED** | Web build ready; signed Android release artifact missing |
| Real Estate Tenant | **BLOCKED** | No standalone app in v1.0 |
| Real Estate Landlord | **BLOCKED** | No standalone app in v1.0 |
| Real Estate Collector | **BLOCKED** | No standalone app in v1.0 |
| Real Estate Supervisor | **BLOCKED** | No standalone app in v1.0 |
| Real Estate Maintenance | **BLOCKED** | No standalone app in v1.0 |

---

## Recommended Launch Sequence

### Stage 1 — Package finalization (now)

1. Apply tag `v1.0.0-rc-final` to `f6ffdcb4`.
2. Rebuild Delivery signed AAB + APK from golden commit.
3. Build/sign Admin release artifact **or** declare Admin web-only for v1.0.
4. Rebuild backend + frontend deployment archives.
5. Update store release notes to current build versions.

### Stage 2 — Closed internal validation

1. Distribute Rider + Driver signed APKs to internal QA cohort.
2. Deploy golden commit to production; run migrations.
3. Execute physical device QA on golden artifacts.
4. Re-run production smoke — target ≥38/40.

### Stage 3 — Google Play closed testing

1. Upload Rider, Driver, Delivery AABs to Play closed tracks.
2. Complete Data Safety, account deletion, content rating, screenshots, feature graphics.
3. Monitor via operations launch package for 7–14 days.

### Stage 4 — Controlled pilot (≤25 users)

1. Expand to approved pilot cohort per `release/PILOT_*` docs.
2. Track first-30-days metrics.
3. Verify offsite backups and failure recovery drills.

### Stage 5 — Public production launch

1. CEO sign-off on UAT + pilot evidence.
2. Offsite backup certified.
3. Crash-free sessions baseline established.
4. Promote Play tracks to production.

**Do not publish Real Estate standalone apps in v1.0.**

---

## Dashboard Decision

| Target | Decision |
|--------|----------|
| Controlled pilot (≤25 users) | ⚠ **GO WITH CONDITIONS** |
| Internal APK distribution | ⚠ **GO WITH CONDITIONS** — Rider/Driver ready; Delivery/Admin pending |
| Google Play closed testing | ⚠ **GO WITH CONDITIONS** — after artifact rebuild + compliance |
| Google Play production launch | ❌ **NO GO today** |
| Real Estate standalone launch | ❌ **NO GO** — not in v1.0 |
