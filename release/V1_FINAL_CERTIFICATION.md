# YALA Enterprise v1.0.0 — Final Certification

**Document ID:** V1-FINAL-CERT-001  
**Date:** 2026-07-22  
**Release:** YALA Enterprise v1.0.0 Golden Release  
**Target tag:** `v1.0.0-rc-final`  
**Method:** Local regression + production smoke + store checklist review + pilot evidence

---

## Certification decisions

| Store / channel | Decision |
|-----------------|----------|
| **Google Play (production track)** | ❌ **NOT CERTIFIED** |
| **Google Play (closed testing)** | ⚠ **CONDITIONAL** — after tag + deploy + device QA |
| **Apple App Store** | ❌ **NOT CERTIFIED** — not in v1.0 scope |
| **Controlled pilot (≤25 users)** | ⚠ **CONDITIONAL GO** — per pilot decision |
| **Enterprise backend + admin** | ✅ **CERTIFIED** — 256/256 tests, health OK |

---

## Overall assessment

| Domain | Score | Certify? |
|--------|:-----:|:--------:|
| Code quality | 96% | ✅ |
| Local regression | 100% (256/256) | ✅ |
| Production E2E | 85% (34/40 smoke) | ⚠ |
| Infrastructure | 78% | ⚠ |
| Data protection | 70% | ❌ |
| Device QA | 40% | ❌ |
| Store readiness | 55% | ❌ |
| **Overall golden release** | **74%** | **NOT CERTIFIED for public store** |

---

## Failed certification items

### CRITICAL — delay v1.0.0 public release

| ID | Item | Reason | Severity | Resolution | Owner | Est. |
|----|------|--------|:--------:|------------|-------|:----:|
| CERT-C-001 | Golden snapshot not committed/tagged | Uncommitted working tree; `v1.0.0-rc-final` not applied | **Critical** | Commit all golden changes; apply tag | Engineering | 4h |
| CERT-C-002 | LC1/golden code not deployed to production | Prod running prior deploy | **Critical** | Deploy + migrate on 142.93.99.142 | DevOps | 4h |
| CERT-C-003 | Physical device QA unsigned | No LC1 sign-off on golden APKs | **Critical** | Execute `DEVICE_QA_CHECKLIST.md` | QA Lead | 2–3d |
| CERT-C-004 | Offsite encrypted backups | RB-P0-005 open | **Critical** | Configure `BACKUP_OFFSITE_REMOTE` | DevOps | 1–2d |

### HIGH — delay v1.0.0 public release

| ID | Item | Reason | Severity | Resolution | Owner | Est. |
|----|------|--------|:--------:|------------|-------|:----:|
| CERT-H-001 | Delivery prod E2E failure | HTTP 400 on `/deliveries/request/` | **High** | Fix UAT-D-010; verify phone on QA accounts | Engineering | 1–2d |
| CERT-H-002 | Play Console Data Safety form | Manual attestation incomplete | **High** | Complete Play Console forms | Product | 3–5d |
| CERT-H-003 | Account deletion attestation | In-app + Play declaration unverified | **High** | Verify in-app flow; submit attestation | Product/Legal | 2d |
| CERT-H-004 | Play Store screenshots / graphics | Not uploaded for golden cut | **High** | Upload store listing assets | Product | 2d |
| CERT-H-005 | Delivery AAB stale (2026-07-07) | Predates latest golden fixes | **High** | Rebuild signed AAB from golden tag | Mobile | 1d |
| CERT-H-006 | Executive sign-off pending | CEO not signed UAT | **High** | Complete `UAT_SIGNOFF.md` | CEO | 1d |
| CERT-H-007 | Production smoke 34/40 | Ride complete + delivery fail | **High** | Fix delivery; update smoke with GPS coords | QA/Eng | 1d |

### MEDIUM — do not delay v1.0.0 closed testing

| ID | Item | Reason | Severity | Resolution | Owner |
|----|------|--------|:--------:|------------|-------|
| CERT-M-001 | Crash telemetry absent | No Crashlytics | **Medium** | Enable post-launch | Mobile |
| CERT-M-002 | Dual referral systems | KNOWN-001 | **Medium** | Defer v1.1 | Product |
| CERT-M-003 | p95 admin latency | 4086 ms baseline | **Medium** | Re-measure post-deploy | QA |
| CERT-M-004 | Push delivery rate unmeasured | No FCM metrics | **Medium** | Instrument during pilot | Engineering |
| CERT-M-005 | Mobile versionName ≠ 1.0.0 | Play Store continuity | **Medium** | Document in release notes | Release Mgr |

### LOW — backlog

| ID | Item | Reason | Severity | Resolution | Owner |
|----|------|--------|:--------:|------------|-------|
| CERT-L-001 | Referral share URL placeholder | `yala.app` domain | **Low** | v1.1 | Engineering |
| CERT-L-002 | Console.log in mobile bundles | P3 cleanup | **Low** | Post-launch | Mobile |
| CERT-L-003 | Real Estate user expectations | Out of scope | **Low** | Support macros | Support |

---

## Store readiness verification (Phase 4)

### Google Play — Rider (`com.yala.rider.mr`)

| Item | Status | Evidence |
|------|:------:|----------|
| App icons | ✅ | `rider-app/android/.../ic_launcher*.png` |
| Splash screens | ✅ | Capacitor config present |
| Version name / code | ✅ | 1.2.7 (19) |
| Privacy Policy link | ✅ | https://www.yalataxi.live/privacy |
| Terms of Service | ✅ | https://www.yalataxi.live/terms |
| Account deletion link | ⚠ | In settings chunk present; Play attestation ☐ |
| Permissions (AndroidManifest) | ✅ | Location, notifications declared |
| Signed AAB | ✅ | SHA256 verified 2026-07-20 build |
| Signed APK | ✅ | SHA256 verified |
| Store descriptions | ☐ | Manual Play Console |
| Screenshots | ☐ | Manual Play Console |
| Feature graphics | ☐ | Manual Play Console |
| Signing certificate | ✅ | Release keystore (not in repo) |

### Google Play — Driver (`com.yala.driver.mr`)

| Item | Status |
|------|:------:|
| Icons / splash | ✅ |
| Version 1.2.23 (38) | ✅ |
| Privacy / Terms | ✅ |
| Signed AAB/APK | ✅ 2026-07-20 |
| Store listing | ☐ |

### Google Play — Delivery (`com.yala.delivery.mr`)

| Item | Status |
|------|:------:|
| Version 1.0.4 (6) | ✅ |
| Signed AAB | ✅ (2026-07-07 — stale) |
| Signed APK | ⚠ Missing recent golden build |
| Store listing | ☐ |

### Apple App Store

| Item | Status |
|------|:------:|
| All items | ❌ **N/A** — iOS not in v1.0 |

---

## Regression certification (Phase 3)

| Module | Tests | Smoke | Certified |
|--------|:-----:|:-----:|:---------:|
| Authentication | ✅ | ✅ | ✅ |
| Permissions | ✅ | ✅ | ✅ |
| Ride flow | ✅ | ⚠ | ⚠ |
| Driver flow | ✅ | ⚠ | ⚠ |
| Delivery flow | ✅ | ❌ | ❌ |
| Merchant flow | ✅ | ☐ | ⚠ |
| Real Estate | N/A | N/A | N/A |
| Admin | ✅ | ✅ | ✅ |
| CEO Dashboard | ✅ | ⚠ | ⚠ |
| Finance | ✅ | ✅ | ✅ |
| Notifications / Push | ⚠ | ☐ | ❌ |
| Payments | ✅ | ✅ | ✅ |
| Maps / GPS | ✅ | ☐ | ⚠ (device historical PASS) |

---

## Path to certification

### Google Play closed testing (minimum)

1. ✅ CERT-C-001 — Commit + tag `v1.0.0-rc-final`
2. ✅ CERT-C-002 — Deploy to production
3. ✅ CERT-C-003 — Device QA sign-off
4. ✅ CERT-H-001 — Delivery prod fix
5. ✅ CERT-H-005 — Rebuild delivery AAB
6. ✅ CERT-H-002, H-003, H-004 — Play Console forms + assets
7. Re-run smoke ≥38/40

### Google Play production track (GA)

All closed testing items **plus:**

8. ✅ CERT-C-004 — Offsite backups
9. ✅ CERT-H-006 — Executive sign-off
10. 14-day pilot success per [FIRST_30_DAYS.md](../operations/FIRST_30_DAYS.md)
11. Crash-free sessions >99% (requires CERT-M-001)

---

## Sign-off

| Role | Google Play | App Store | Pilot | Date | Signature |
|------|:-----------:|:---------:|:-----:|------|-----------|
| Engineering | ❌ NOT CERTIFIED | N/A | ⚠ Conditional | 2026-07-22 | _Pending_ |
| QA | ❌ NOT CERTIFIED | N/A | ⚠ Conditional | 2026-07-22 | _Pending_ |
| DevOps | ❌ NOT CERTIFIED | N/A | ⚠ Conditional | 2026-07-22 | _Pending_ |
| Product | ❌ NOT CERTIFIED | N/A | ⚠ Conditional | 2026-07-22 | _Pending_ |
| CEO | PENDING | N/A | PENDING | — | _Pending_ |

---

## Evidence index

| Document | Purpose |
|----------|---------|
| [GOLDEN_RELEASE_REPORT.md](./GOLDEN_RELEASE_REPORT.md) | Artifacts, checksums, deploy |
| [VERSION_LOCK_GOLDEN.md](./VERSION_LOCK_GOLDEN.md) | Phase 1 lock |
| [STORE_READINESS_CHECKLIST.md](./STORE_READINESS_CHECKLIST.md) | Store items |
| [PILOT_GO_LIVE_DECISION.md](./PILOT_GO_LIVE_DECISION.md) | Pilot evidence |
| [PRODUCTION_CERTIFICATE.md](./PRODUCTION_CERTIFICATE.md) | Infra/security cert |

**Certification issued:** 2026-07-22  
**Re-certification trigger:** After `v1.0.0-rc-final` tag + deploy + smoke re-run
