# YALA Version 1.0 — Final Release Status

**Date:** 2026-07-25  
**Branch:** `release/final-stabilization`  
**Verdict:** **READY WITH CONDITIONS**

YALA Rider, Driver, Delivery, Django backend, Admin, and Operations are suitable for **Google Play Internal Testing** upload and pilot API hardening. Public Production / open GA remains blocked until operational P0 conditions below are cleared.

---

## Recommendation

| Option | Selected |
|--------|----------|
| READY | No |
| **READY WITH CONDITIONS** | **Yes** |
| NOT READY | No |

**Next action:** Upload stamped AABs (`20260725-110428` or newer rebuild) to Play Internal Testing. Confirm production env has strong `DJANGO_SECRET_KEY`, explicit `DJANGO_ALLOWED_HOSTS`, `REDIS_URL`, and `CORS_ALLOW_ALL_ORIGINS=False`.

---

## Completed work (this completion program)

### Security (P0)

| Change | Why | Risk | Tests |
|--------|-----|------|-------|
| Fail-closed `DEBUG` / `SECRET_KEY` / `ALLOWED_HOSTS` / CORS defaults (`settings.py`) | Prevent insecure prod boot | Medium (misconfigured env fails closed) | `tests.test_production_settings_guards` |
| Ride exclusive-offer accept/decline → **403**; IDOR suite | Close cross-user offer mutations | Low | `tests.rides.test_ride_object_permissions` + ride flow |
| Delivery offer-timeout / accept / decline ownership; dispute not-owner → **403** | Stop any-user offer expiry / IDOR | Low | `tests.deliveries.test_delivery_object_permissions` + delivery flow |
| Track `.env.pilot.template` (+ gitignore exception) | Pilot compose could not boot under fail-closed settings | Low | Template review |

### Commits

- `aa3c3c7a` — fail-closed Django DEBUG, hosts, CORS, and secrets  
- `50732e83` — ride offer ownership + IDOR tests  
- `9497b4f0` — delivery offer mutations locked to offered courier  
- `7677cdde` — pilot env template tracked  

### Validation executed

```
python manage.py test \
  taxi.rides.tests \
  deliveries.tests.DeliveryFlowTests.test_complete_delivery_flow \
  tests.test_production_settings_guards \
  tests.rides.test_ride_object_permissions \
  tests.deliveries.test_delivery_object_permissions
```

**Result:** **30/30 OK**

Prior mission suites (core + extended lifecycle) remained green at **59/59** before this security pass.

### Release builds (prior final-stabilization)

| App | versionName | versionCode | Stamp |
|-----|-------------|-------------|-------|
| Rider | 1.2.12 | 24 | 20260725-110428 |
| Driver | 1.2.29 | 44 | 20260725-110428 |
| Delivery | 1.0.9 | 11 | 20260725-110428 |

Manifests: `usesCleartextTraffic="false"` on Rider/Driver/Delivery.

---

## Product stability summary

| Product | Status | Notes |
|---------|--------|-------|
| YALA Rider | Stable for Internal Testing | Maps key may be missing on some native builds → empty map fallback |
| YALA Driver | Stable for Internal Testing | Same maps note; trip lifecycle + AuthZ covered |
| YALA Delivery | Stable for Internal Testing | Offer AuthZ hardened; POD device sign-off still needed for public |
| Django Backend | Stable for pilot/prod with correct env | Fail-closed settings now enforced in code |
| Admin Platform | Usable | Large uncommitted admin work remains outside this security pass |
| Operations Center | Usable | Ops P0 backups / runbooks still operational |

---

## Remaining work

### Blocks public Production (not Internal Testing upload)

1. **Offsite encrypted backups + restore drill** (YALA-009)  
2. **Play Data Safety attestation** complete for all three apps (YALA-010)  
3. **Physical device QA sign-off** on current versionCodes (YALA-011)  
4. **Delivery POD device sign-off** before featuring Delivery publicly  
5. **Secrets rotation / scrub** if any historical credentials were ever committed (YALA-001/002) — operational  

### Does not block Internal Testing

- Duplicate `User.city` relations (YALA-008) — tech debt  
- Full Jest frontend green — targeted suites used for release gates  
- Large dirty working tree (admin/ops features) — stage and land separately  

---

## Known limitations

- Native maps require a valid Google Maps key in the build env; without it the UI fails soft (empty map), not crash.  
- Signing: uninstall sideloaded packages before installing Play Internal Testing builds (package-name collision).  
- Pilot stack requires filled `backend/taxi/.env.pilot` from `.env.pilot.template` with a strong secret.  
- Admin/Operations have substantial uncommitted local changes; release verdict above is based on committed security + prior AAB stamps, not a full re-cut of admin UI.

---

## Conditions checklist (must clear before READY)

- [ ] Production `.env` uses non-insecure `DJANGO_SECRET_KEY`, non-empty `DJANGO_ALLOWED_HOSTS`, `REDIS_URL`, `CORS_ALLOW_ALL_ORIGINS=False`  
- [ ] Internal Testing upload of Rider/Driver/Delivery AABs  
- [ ] Device QA matrix signed for versionCodes 24 / 44 / 11 (or successor)  
- [ ] Play Data Safety forms submitted  
- [ ] Backup restore drill timestamped  

---

## Overall

**READY WITH CONDITIONS** for Google Play Internal Testing and pilot hardening.

**Not READY** for unrestricted public Production until the conditions checklist is complete.
