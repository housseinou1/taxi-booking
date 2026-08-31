# YALA Enterprise v1.0 Launch Decision

**Document ID:** YALA-REL-V1-DECISION-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0  
**Golden commit:** `f6ffdcb4`  
**Validation:** Repository inspection · 256/256 regression · live prod health · artifact verification

---

## Recommendation

# ⚠️ GO WITH CONDITIONS

YALA Enterprise v1.0 is approved for **controlled pilot and closed internal testing preparation**. It is **not ready for Google Play production launch or public GA today**.

The codebase is Release Candidate quality with golden commit applied. Publishing requires artifact rebuild, compliance attestation, production deploy, device QA, and backup conditions to close.

---

## Decision Basis

| Evidence | Result | Date |
| --- | --- | --- |
| Core regression | **256/256 OK** | 2026-07-22 |
| Launch context baseline | 235/235 (suite grew) | Per task context |
| P0 code blockers | **0 open** | 2026-07-22 |
| `makemigrations --check` | **PASS** | 2026-07-22 |
| Golden commit | **`f6ffdcb4` on `main`** | 2026-07-22 |
| Release tag `v1.0.0-rc-final` | **Not applied** | 2026-07-22 |
| Production health | **200 OK** — DB + Redis ok | 2026-07-22 |
| Legal URLs (privacy, terms, account deletion) | **All HTTP 200** | 2026-07-22 |
| Rider signed AAB + APK | **Present** (2026-07-20) | Verified |
| Driver signed AAB + APK | **Present** (2026-07-21) | Verified |
| Delivery signed AAB | **Present but stale** (2026-07-07) | Verified |
| Delivery signed APK | **Missing** | Verified |
| Admin signed AAB/APK | **Missing** | Verified |
| Frontend production build | **Present** (2026-07-22) | Verified |
| Backend deploy archive | **Stale** (2026-07-08) | Verified |
| Golden code on production | **Not deployed** | Per certification |
| Production smoke | **34/40 PASS** | 2026-07-22 |
| Real Estate standalone apps | **Not in repository** | Verified |
| Offsite encrypted backups | **Not configured** | Per ops certification |

---

## Launch Scope Decisions

| Launch target | Decision |
| --- | --- |
| Controlled pilot (≤25 users) | ⚠ **GO WITH CONDITIONS** |
| Internal testing APK (Rider/Driver) | ⚠ **GO WITH CONDITIONS** |
| Internal testing APK (Delivery/Admin) | ❌ **PENDING** |
| Google Play closed testing | ⚠ **GO WITH CONDITIONS** — after C-003, C-004, C-007 |
| Google Play production launch | ❌ **NO GO today** |
| Real Estate standalone app launch | ❌ **NO GO** — apps not in v1.0 |
| CEO Dashboard (web admin module) | ✅ **GO** — included in Admin web build |
| Apple App Store | ❌ **NO GO** — not in v1.0 scope |

---

## Conditions

Every condition includes description, severity, owner, and required action.

| ID | Description | Severity | Owner | Required action |
| --- | --- | --- | --- | --- |
| **C-001** | Tag `v1.0.0-rc-final` not applied to golden commit `f6ffdcb4` | **Critical** | Engineering | `git tag -a v1.0.0-rc-final f6ffdcb4 -m "YALA Enterprise v1.0.0 Golden Release"` and push |
| **C-002** | Golden code not deployed to production server | **Critical** | DevOps | Deploy `f6ffdcb4` to 142.93.99.142; run migrations; verify health |
| **C-003** | Physical Android QA unsigned for golden APKs | **Critical** | QA Lead | Execute device QA checklist on final Rider, Driver, Delivery, Admin artifacts |
| **C-004** | Offsite encrypted backups not configured | **Critical** | DevOps | Configure `BACKUP_OFFSITE_REMOTE`; verify restore drill |
| **C-005** | Delivery release artifacts incomplete/stale | **High** | Mobile | Rebuild signed AAB + APK from golden commit (`1.0.4`/6 or incremented) |
| **C-006** | Admin Android release artifact missing | **High** | Mobile / DevOps | Build/sign Admin AAB+APK **or** formally declare Admin web-only for v1.0 |
| **C-007** | Play Console Data Safety and account deletion attestations pending | **High** | Product / Legal | Complete Play Console forms for Rider, Driver, Delivery |
| **C-008** | Backend and frontend deployment packages stale (2026-07-08) | **High** | DevOps | Rebuild `phase2-backend-deploy.zip` and `frontend-prod-deploy.zip` from golden commit |
| **C-009** | Delivery production E2E failure (HTTP 400) | **High** | Engineering | Fix UAT-D-010; re-verify `/deliveries/request/` on prod |
| **C-010** | Production smoke 34/40 (delivery + ride geofence) | **High** | QA / Engineering | Fix delivery E2E; document geofence smoke limitation (no driver GPS in harness) |
| **C-011** | Real Estate standalone apps requested but not in v1.0 | **High** | Product | Remove Real Estate apps from v1.0 publish plan; document as post-v1 scope |
| **C-012** | Store release notes stale vs current mobile versions | **Medium** | Marketing / Release Manager | Update Rider (1.2.7), Driver (1.2.23), Delivery (1.0.4) release notes |
| **C-013** | Support email not on every store listing | **Medium** | Support / Marketing | Standardize `support@yalataxi.live` on Driver, Delivery, Admin listings |
| **C-014** | Play Store screenshots and feature graphics not uploaded | **Medium** | Product / Marketing | Upload assets per `store-listings/*/screenshot-order.md` |
| **C-015** | CEO / executive UAT sign-off pending | **Medium** | CEO | Complete `UAT_SIGNOFF.md` before public launch |

---

## Required Before Closed Testing

1. Close **C-001** — apply release tag.
2. Close **C-005** — rebuild Delivery signed AAB + APK.
3. Close **C-006** — Admin artifact or web-only declaration.
4. Close **C-007** — Play Console compliance forms.
5. Close **C-008** — rebuild deployment packages.
6. Close **C-012**, **C-013**, **C-014** — store metadata.
7. Close **C-003** — physical device QA on final artifacts.

---

## Required Before Public Production Launch

1. Complete all closed testing requirements above.
2. Close **C-002** — production deploy verified.
3. Close **C-004** — offsite backup certified.
4. Close **C-009**, **C-010** — smoke ≥38/40 or documented acceptance.
5. Close **C-015** — CEO sign-off.
6. Pilot first-30-days review or approved executive waiver.
7. Confirm crash-free sessions and support readiness.

---

## What Is Ready Today

| Item | Status |
|------|--------|
| Core code (256/256 tests) | ✅ Ready |
| Golden commit on main | ✅ Ready |
| Rider signed AAB + APK | ✅ Ready |
| Driver signed AAB + APK | ✅ Ready |
| Frontend production build | ✅ Ready |
| Database migrations | ✅ Ready |
| Environment templates | ✅ Ready |
| Legal URLs live | ✅ Ready |
| Operations runbooks | ✅ Ready |
| CEO Dashboard (web) | ✅ Ready |

---

## What Is Not Ready Today

| Item | Status |
|------|--------|
| Google Play production launch | ❌ Not ready |
| Real Estate standalone apps (×5) | ❌ Not in v1.0 |
| Delivery publish package | ❌ Stale/missing artifacts |
| Admin Android publish | ❌ No signed artifact |
| Offsite backups | ❌ Not configured |
| Golden code on production | ❌ Not deployed |
| Play Console attestations | ❌ Pending |

---

## Final Statement

The correct v1.0 launch decision is **⚠️ GO WITH CONDITIONS**.

Proceed operationally toward controlled pilot and Google Play closed testing for Rider and Driver. Do not publish Delivery or Admin until artifacts are rebuilt. Do not publish Real Estate standalone apps — they are not in v1.0. Public production launch must wait until Critical conditions C-001 through C-004 and High conditions C-005 through C-010 are closed.

**Next actions (priority order):**

1. Apply tag `v1.0.0-rc-final`
2. Deploy golden commit to production
3. Rebuild Delivery signed AAB + APK
4. Complete Play Console compliance
5. Execute physical device QA
6. Configure offsite backups
