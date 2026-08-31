# YALA Final Release Report — v1.0 Stabilization

**Branch:** `release/final-stabilization`  
**Date:** 2026-07-25  
**Build stamp:** `20260725-110428`  
**Scope:** Production stability only (no new features, no UI/architecture redesign)  
**Merge / upload:** Not performed — awaiting approval

---

## Recommendation

# READY WITH CONDITIONS

YALA Rider, Driver, and Delivery have signed release AABs suitable for **Google Play Internal Testing**. Critical backend workflows validated in this mission (59 automated tests across core + extended suites). Remaining conditions are operational/config/device gates — not open code P0s that block Internal Testing upload after review.

**Not approved:** public Production track / open GA without clearing P0 ops items (backups, Data Safety, device sign-off).

---

## Completed modules (stability baseline)

| Module | Status | Notes |
|--------|:------:|-------|
| YALA Rider (mobile) | Ready* | AAB 1.2.12 (24); prod API `www.yalataxi.live`; Firebase present |
| YALA Driver (mobile) | Ready* | AAB 1.2.29 (44); prod API `api.yalataxi.live`; Firebase present |
| YALA Delivery (mobile) | Ready* | AAB 1.0.9 (11); prod API `www.yalataxi.live`; Firebase present |
| Django Backend | Ready* | Check + migrations clean; ride/delivery/auth/ops suites green this run |
| Admin Platform | Ready* | Ops center + BI + CEO master tests green; UI not redesigned |
| Operations Center | Ready* | Dashboard / ride ops coverage via existing tests |

\*Subject to conditions below (Maps key, device QA, backend deploy of hardening).

---

## Phase 1 — Critical workflow validation

### Automated evidence (this mission)

| Suite | Result |
|-------|:------:|
| `manage.py check` | PASS (0 issues) |
| `makemigrations --check --dry-run` | PASS |
| Core workflows (rides + cancel + delivery flow + courier onboarding + driver availability + request tracing) | **25/25 OK** |
| Extended (registration, documents, ride history, CEO, BI, ops center, notifications, legal QA) | **34/34 OK** |
| **Total this mission** | **59/59 OK** |

Logs: `release/final-stabilization-check.log`, `final-stabilization-core-tests.log`, `final-stabilization-extended-tests.log`.

### Workflow matrix

| Actor | Workflow | Validation |
|-------|----------|------------|
| **Rider** | Register | COVERED — registration preservation tests |
| | Login | COVERED — auth/security suites (prior + login paths) |
| | Logout | PARTIAL — `logout-all-devices` covered; single-device logout not a dedicated test |
| | Update profile | PARTIAL — endpoints exist; no dedicated API test this run |
| | Request / Cancel / History | COVERED — CompleteRideFlow + RideCancellationFlow |
| | Notifications | COVERED — notifications.tests |
| | Ratings | COVERED — rate-ride / rewards tests (prior suite map) |
| | Payment | PARTIAL — wallet/payment paths exist; full card E2E device-dependent |
| **Driver** | Register / Documents / Approval | COVERED / PARTIAL — register + document upload/approve tests |
| | Login / Go online | COVERED — availability tests |
| | Accept → Arrive → Start → Complete | COVERED — CompleteRideFlowTests |
| | Earnings / History / Ratings | PARTIAL / COVERED — history+feedback views; earnings service/API partial |
| **Delivery** | Onboarding / Accept / Pickup / Complete | COVERED — DeliveryFlow + CourierOnboarding + legal QA |
| | Online / Earnings / History | PARTIAL — mode/earnings/history endpoints; limited direct tests |
| **Admin** | Dashboard / Ops / Ride ops / Reports / CEO | COVERED — ops center, BI, CEO master tests |
| | User / Delivery management | PARTIAL — routes present; thinner dedicated coverage |

---

## Phase 2 — Bug fixes (P0/P1 only)

### Fixed this mission

| ID | Severity | Root cause | Fix | Validation |
|----|----------|------------|-----|------------|
| S0-P1-05 (partial) | P1 | `usesCleartextTraffic="true"` contradicted `network_security_config` (cleartext already denied) | Set `usesCleartextTraffic="false"` on Rider/Driver/Delivery manifests | Source change + **rebuild** stamp `20260725-110428`; jarsigner OK |

### Already on branch lineage (prior hardening / RC1 — retained)

| Area | Fix |
|------|-----|
| Dispatch / rides | Timeout + arrive/complete/cancel row locks |
| Payments | `create_payment` / `capture_ride_payment` atomic locks |
| Push | FCM transient retries |
| Celery | Late-ack + delivery offer autoretry |
| Client HTTP | Timeouts / GET retry on critical paths |
| Maps safety | LiveMap refuses placeholder/missing keys without crashing |
| Observability | Request/correlation IDs on logs |

### No new code P0 discovered

Infra/store/device P0s remain **process** items (see Remaining issues) — not fixable solely in app code this mission.

---

## Phase 3 — Build validation

| Check | Rider | Driver | Delivery |
|-------|:-----:|:------:|:--------:|
| Package ID | `com.yala.rider.mr` | `com.yala.driver.mr` | `com.yala.delivery.mr` |
| Version name | **1.2.12** | **1.2.29** | **1.0.9** |
| Version code | **24** | **44** | **11** |
| Firebase (`google-services.json`) | YES | YES | YES |
| Production API host | www.yalataxi.live | api.yalataxi.live | www.yalataxi.live |
| Google Maps key in native env | Missing | Missing | Missing |
| Maps key in `.env.production` | Placeholder | Placeholder | Placeholder |
| Signing | `yala-release.keystore` / `yala-key` | same | `yala-delivery-upload-key.jks` |
| `bundleRelease` | SUCCESS | SUCCESS | SUCCESS |
| jarsigner verify | OK | OK | OK |
| Cleartext (manifest after rebuild) | false | false | false |

**Artifacts**

- `release/android/yala-rider-1.2.12-24-20260725-110428.aab`
- `release/android/yala-driver-1.2.29-44-20260725-110428.aab`
- `release/android/yala-delivery-1.0.9-11-20260725-110428.aab`
- `release/android/build-report-20260725-110428.json`

---

## Remaining issues

| ID | Severity | Item | Blocks Internal Testing? | Blocks public GA? |
|----|----------|------|:------------------------:|:-----------------:|
| S0-P0-01 | P0 | Offsite encrypted backups not certified | No | Yes |
| S0-P0-02 | P0 | Play Data Safety form incomplete | Widening / public | Yes |
| S0-P0-03 | P0 | Physical device QA unsigned on **these** version codes | Soft — run after upload | Yes |
| S0-P0-04 | P0 | Delivery POD device sign-off incomplete | Delivery featuring only | Delivery public |
| S0-P1-02 | P1 | Push matrix on device incomplete | No (condition) | Soft-launch |
| S0-P1-03 | P1 | Google Maps key placeholder / absent on native envs | No (safe empty UI) | UX quality |
| S0-P1-04 | P1 | Crashlytics not in binaries | No | Observability |
| L1 | P1 | Ride offer in-process timer (not durable Celery) | No | Scale / multi-worker |
| — | P2 | Frontend Jest full suite not green | No | CI hygiene |

---

## Known limitations

1. Native Maps: inject restricted `REACT_APP_GOOGLE_MAPS_API_KEY` into `.env.rider` / `.env.driver` (and rebuild) before relying on Google Maps tiles.
2. Dual API hosts (`www` vs `api`) are intentional — wrong stamp breaks that app.
3. Uninstall sideloaded/debug builds before Play update (signature mismatch).
4. Deploy backend hardening (locks/retries/logging) to API hosts before field reliance.
5. Delivery public featuring remains restricted until device POD sign-off.

See `docs/release/KNOWN_LIMITATIONS.md`.

---

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Maps blank for riders/drivers | High until key set | Medium UX | Placeholder guard; inject key + rebuild |
| Multi-worker missed ride offers | Medium | Medium | HTTP poll + known timer limitation; Celery migration post-launch |
| Push miss under FCM blips | Low–Med | Medium | In-process retries; device matrix still open |
| Tester install failure | Medium | Low | Uninstall-first Play install SOP |
| Backend not matching client | Medium | High | Deploy `release/final-stabilization` / RC1 hardening before testers |

**Overall risk for Internal Testing:** Acceptable with conditions.  
**Overall risk for public Production:** Not acceptable until P0 ops/device items clear.

---

## Conditions checklist (before treating as GO for Internal Testing upload)

- [ ] Reviewer approves branch `release/final-stabilization`
- [ ] Upload AABs stamp `20260725-110428` to Play Internal Testing only
- [ ] Testers uninstall prior sideloaded builds
- [ ] Backend with stabilization/hardening deployed to prod API hosts
- [ ] One physical ride + one delivery + push smoke on stamped builds
- [ ] (Recommended) Inject real Maps key and rebuild if maps are required in Internal Testing UX

---

## Decision options (mission vocabulary)

| Option | Applies? |
|--------|:--------:|
| READY FOR GOOGLE PLAY INTERNAL TESTING | No — conditions remain |
| **READY WITH CONDITIONS** | **Yes** |
| NOT READY | No |

---

## Sign-off

| Role | Name | Date | Vote |
|------|------|------|------|
| Engineering | | | READY WITH CONDITIONS (proposed) |
| QA / Device | | | |
| Operations | | | |
| Product | | | |

**Next step after approval:** Upload the three `20260725-110428` AABs to Google Play Internal Testing. Do not merge to `main` or promote to Production until P0 conditions clear.
