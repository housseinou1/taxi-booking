# YALA Enterprise v1.0.0-rc1 — Release Notes

**Release:** v1.0.0-rc1  
**Date:** 2026-07-22  
**Branch:** `release/v1.0-rc1`  
**Market:** Nouakchott, Mauritania  
**Platforms:** Android (Rider, Driver, Delivery) · Web Admin · API

---

## Overview

YALA Enterprise v1.0.0-rc1 is the first official Release Candidate packaging **Phases 1–39** — ride-hailing, delivery, merchant commerce, enterprise operations, finance, trust & safety, CEO command, board reporting, compliance, BI, API Gateway, and YALA Academy.

This RC reflects core development finalization (235/235 tests passing) and RC3 stabilization fixes.

---

## New functionality in v1.0 (since platform inception)

### Consumer mobile
- **Yala Rider** — Request, track, pay, rate; wallet; SOS; trip share; loyalty hooks
- **Yala Driver** — Onboarding, documents, go online, dispatch, navigation, earnings, wallet, cash-out, rewards
- **Yala Delivery** — Customer + courier apps; food/pharmacy/grocery/parcel; PIN verification; proof of delivery

### Commerce
- **Merchant Platform** — Orders, catalog, settlements, checkout with delivery dispatch
- **Partner & Franchise Platform** — Partners, territories, revenue share
- **Customer Growth & Loyalty** — Promotions, referrals, campaigns

### Operations & command (Phases 24–39)
- Finance Operations Center · Operations Command Center · Launch Command Center
- Fleet & Performance · Multi-City Operations · Smart Pricing & Dispatch
- Trust & Safety Center · Driver Incentive Engine · AI Operations
- CEO Master Command Center · Board & Investor Reporting · Compliance & Governance
- Business Intelligence Center · API Gateway · YALA Academy

---

## Bug fixes in RC1 cut (2026-07-22)

| ID | Area | Fix |
|----|------|-----|
| UAT-D-001 | API Gateway | Merchant webhook uses `business_name` (was `Merchant.name`) |
| UAT-D-002 | Migrations | Model/migration sync — RC3 indexes + incentives/safety choices |
| UAT-D-007 | Rider UI | Cancellation fee copy matches backend (100 MRU) |
| UAT-D-008 | Merchant | Destination lat/lng persisted on orders; checkout wired |
| UAT-D-009 | Merchant | Delivery creation errors surfaced; no silent failure on mark-ready |
| — | Rides | Test-safe sync for ride-complete side effects under test runner |
| — | Board reports | Platform uptime derived from health checks |

---

## Known limitations

| Limitation | Impact | Target |
|------------|--------|--------|
| Real Estate (Landlord/Tenant/Rent) | Not in v1.0 | Future |
| Dual referral systems | Inconsistent referral credits | v1.1 |
| Rider loyalty mobile screen | Admin/API only | v1.1 |
| Merchant portal catalog UI partial | Admin-assisted merchants | v1.1 |
| Play Integrity enforcement off | Device fraud risk | Post-beta |
| BI ETL warehouse | Queries on primary DB | v2 |
| Apple iOS | Not submitted | TBD |
| Scheduled delivery WS broadcast | Not wired | Exclude from beta |
| Referral share URL placeholder domain | Broken share links | v1.1 |

Full list: [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md)

---

## Upgrade notes

### From RC2 / prior builds

1. **Backend:** Run all pending migrations before deploy:
   ```bash
   python manage.py migrate
   ```
   Critical: `payments 0020`, `drivers 0023`, `merchants 0005`, `incentives 0005`, `safety 0004`, Phases 29–39 apps.

2. **Mobile:** Uninstall prior APK before installing RC1 if package signature changed; preserve QA test accounts.

3. **Admin:** Hard refresh browser cache after frontend deploy (`Ctrl+Shift+R`).

4. **Configuration:** Verify `.env.production` matches [`.env.production.template`](../backend/taxi/.env.production.template).

---

## Deployment notes

### Backend (Docker Compose)

```bash
cd /opt/yala
git checkout release/v1.0-rc1
docker compose -p yala build django
docker compose -p yala run --rm django python manage.py migrate --noinput
docker compose -p yala run --rm django python manage.py collectstatic --noinput
docker compose -p yala up -d
curl -fsS https://api.yalataxi.live/api/health/ready/
```

### Frontend

```bash
cd frontend && npm ci && npm run build
# Copy frontend/build to nginx static root per deploy script
bash scripts/deploy-production-frontend.sh
```

### Android distribution

| App | Version | Package |
|-----|---------|---------|
| Yala Rider | 1.2.7 (19) | `com.yala.rider.mr` |
| Yala Driver | 1.2.23 (38) | `com.yala.driver.mr` |
| Yala Delivery | 1.0.4 (6) | `com.yala.delivery.mr` |

Artifacts: `release/android/yala-*-20260720-203407.{apk,aab}` (rebuild recommended from `release/v1.0-rc1` with signing credentials).

### Post-deploy smoke

```bash
python scripts/platform-rc1-smoke.py
python manage.py test tests.operations tests.academy tests.api_gateway --verbosity=1
```

---

## Build artifacts (RC1 session 2026-07-22)

| Component | Status | Location |
|-----------|:------:|----------|
| Frontend production build | ✅ Built | `frontend/build/` |
| Backend config template | ✅ Verified | `backend/taxi/.env.production.template` |
| Android signed APK/AAB | ⚠ Pending rebuild | `release/android/` (prior builds); requires `signing/credentials.env` |
| iOS | N/A | Not in v1.0 scope |

---

## Support

- Known issues: [KNOWN_ISSUES_v1.0.0.md](./KNOWN_ISSUES_v1.0.0.md)
- Defect log: [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md)
- Rollback: [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
