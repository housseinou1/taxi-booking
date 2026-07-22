# Yala Enterprise Handover — System Inventory

**Document ID:** HANDOVER-02  
**Version:** 1.1.0  
**Date:** 2026-07-21

---

## Repository

| Item | Value |
|------|-------|
| **Monorepo path** | `taxi-booking/` (this repository) |
| **Backend** | `backend/taxi/` |
| **Frontend SPA** | `frontend/` |
| **Mobile shells** | `rider-app/`, `driver-app/`, `delivery-app/`, `admin-app/` |
| **Infrastructure** | `docker-compose.yml`, `nginx/` |
| **Production host** | `142.93.99.142` → `/opt/yala` |

---

## Consumer & mobile applications

| Application | Purpose | Technology | Repository Path | Deployment | Owner | Status |
|-------------|---------|------------|-----------------|------------|-------|--------|
| **Yala Rider** | Consumer ride-hailing: request, track, pay, wallet, SOS, loyalty | React + Ionic/Capacitor, Android AAB | `frontend/src/rider/` + `rider-app/` | Google Play closed testing 1.2.7 | Product / Mobile | **Beta ready** (95%) |
| **Yala Driver** | Driver onboarding, dispatch, earnings, documents, incentives, SOS | React + Ionic/Capacitor, Android AAB | `frontend/src/driver/` + `driver-app/` | Google Play 1.2.23 | Product / Mobile | **Beta ready** (95%) |
| **Yala Delivery** | Courier onboarding, delivery flow, COD, chat, earnings | React + Ionic/Capacitor, Android AAB | `frontend/src/delivery/` + `delivery-app/` | Google Play 1.0.4 | Product / Mobile | **Conditional** (92%) |
| Admin Mobile App | Optional mobile admin companion | React + Capacitor | `admin-app/` | Internal distribution | Engineering | Basic |

---

## Web portals & admin centers

| Application | Purpose | Technology | Route | Deployment | Owner | Status |
|-------------|---------|------------|-------|------------|-------|--------|
| **Admin Portal** | Core admin: users, drivers, dispatch, cities, documents | React 18 SPA | `/admin` | nginx static | Engineering | Complete (96%) |
| **Executive Dashboard** | CEO KPIs, revenue, maintenance mode | React | `/admin/executive` | nginx static | CEO / Engineering | Complete |
| **Operations Center** | Live trips, map, emergency, dispatch actions | React | `/admin/operations` | nginx static | Operations Manager | Complete (97%) |
| **Operations Command Center** | Unified command: heat map, alerts, CEO summary, incidents | React | `/admin/operations-command` | nginx static | Operations Manager | Complete (Phase 25) |
| **Finance Operations Center** | Reconciliation, withdrawals, revenue, audit | React | `/admin/finance-ops` | nginx static | Finance Lead | Complete (Phase 24) |
| **Fleet & Performance** | Documents, driver performance, training, rewards | React | `/admin/fleet` | nginx static | Operations | Complete |
| **AI Operations** | Smart insights, surge, hotspots, recommendations | React | `/admin/ai-operations` | nginx static | Operations / Engineering | Complete (93%) |
| **Growth & Expansion** | Market analytics, CEO forecast | React | `/admin/growth` | nginx static | CEO / Growth | Complete (Phase 26) |
| **Multi-City Operations** | Per-city profiles, national overview | React | `/admin/multi-city` | nginx static | Regional Ops | Complete (Phase 27) |
| **Smart Pricing & Dispatch** | Surge rules, dispatch analytics, simulator | React | `/admin/smart-pricing` | nginx static | Product / Ops | Complete (Phase 28) |
| **Trust & Safety Center** | SOS, incidents, monitoring, safety profiles | React | `/admin/trust-safety` | nginx static | Security / Ops | Complete (Phase 29) |
| **Driver Incentive Engine** | Campaigns, progress, finance payouts | React | `/admin/incentives` | nginx static | Finance / Ops | Complete (Phase 30) |
| **Merchant Platform** | Merchant admin, settlements, commission | React | `/admin/merchant-platform` | nginx static | Product / Finance | Complete (Phase 31) |
| **Partner & Franchise Platform** | Partners, territories, settlements | React | `/admin/partner-platform` | nginx static | CEO / Regional | Complete (Phase 32) |
| **Customer Growth & Loyalty** | Loyalty tiers, promos, referrals, campaigns | React | `/admin/customer-growth` | nginx static | Growth / Marketing | Complete (Phase 33) |
| **CEO Master Command Center** | Unified CEO dashboard, strategic actions | React | `/admin/ceo-master` | nginx static | CEO | Complete (Phase 34) |
| **Board & Investor Reports** | Board packs, financial/operational exports | React | `/admin/board-reports` | nginx static | CEO / Finance | Complete (Phase 35) |
| **Compliance & Governance** | Policies, audits, risk register, calendar | React | `/admin/compliance-governance` | nginx static | Legal / Security | Complete (Phase 36) |
| **Business Intelligence** | Analytics, geographic intelligence, exports | React | `/admin/bi` | nginx static | Engineering / Finance | Partial (Phase 37, 75%) |
| **Support Center** | Tickets, beta feedback | React | `/admin/support` | nginx static | Support Lead | Complete |
| **Launch Control** | Beta caps, incidents, alerts, KPIs | React | `/admin/launch`, `/admin/beta` | nginx static | CEO / Ops | Complete |
| **Production Status** | Infrastructure health page | React | `/admin/status` | nginx static | DevOps | Complete |
| **Merchant Portal** | Merchant self-service: menu, orders, analytics | React | `/merchant` | nginx static | Product | Complete (88%) |
| **Business Operations Hub** | CRM, corporate, marketing | React | `/admin/business` | nginx static | Business / Ops | Complete (Phase 20) |

---

## Backend monolith

| Application | Purpose | Technology | Repository Path | Deployment | Owner | Status |
|-------------|---------|------------|-----------------|------------|-------|--------|
| **Yala Django Backend** | Core API, business logic, WebSockets, Celery, admin APIs | Python 3.12, Django 4.2, DRF, Daphne, Celery | `backend/taxi/` | Docker Compose ×3 replicas | Engineering Lead | Complete |
| **Admin static bundle** | React build served by nginx | React 18 build output | `frontend/build/` | nginx | Engineering | Complete |

**API base:** `https://api.yalataxi.live`  
**Admin:** `https://www.yalataxi.live/admin`  
**Health:** `https://api.yalataxi.live/api/health/ready/`

See `engineering/02_API_CATALOG.md` for full endpoint listing.

---

## Django apps (backend modules)

| App | Purpose | Owner | Status |
|-----|---------|-------|--------|
| `authapp` | User model, JWT, OTP, phone verification, device sessions | Engineering | Complete |
| `taxi.rides` | Ride lifecycle, dispatch, share rides, ratings | Engineering | Complete |
| `taxi.drivers` | Driver profiles, documents, gamification, QR | Engineering | Complete |
| `deliveries` | Delivery lifecycle, courier, chat, disputes | Engineering | Complete |
| `merchants` | Catalog, orders, settlements (Phase 31) | Product / Engineering | Complete |
| `partners` | Franchise partners, territories, settlements (Phase 32) | Business / Engineering | Complete |
| `loyalty` | Rider loyalty tiers, points, rewards (Phase 33) | Growth / Engineering | Complete |
| `payments` | Wallet, transactions, withdrawals, refunds | Finance / Engineering | Complete |
| `operations` | All admin/executive dashboard APIs (~220 routes) | Engineering | Complete |
| `safety` | SOS, incidents, trip monitoring, trip share | Operations / Engineering | Complete |
| `security` | Audit logs, fraud flags, saved addresses | Security / Engineering | Complete |
| `notifications` | FCM, push subscriptions, device tokens | Engineering | Complete |
| `referrals` | Rider/driver/merchant referral chains | Growth | Complete |
| `promotions` | Promo codes, campaigns | Growth | Complete |
| `incentives` | Driver incentive programs, bonus payments | Finance / Ops | Complete |
| `features` | Surge, airport, corporate, lost & found | Product | Complete |
| `intercity` | Intercity routes and trips | Product | Complete |
| `shifts` | Driver shift scheduling | Operations | Complete |
| `locations` / `cities` | Geo hierarchy, city pricing | Engineering | Complete |
| `legal` | Terms, e-signatures, compliance logs | Product / Legal | Complete |
| `api_gateway` | B2B partner API, developer portal | Engineering | Complete |
| `chat` | In-ride messaging | Engineering | Complete |
| `admin_2fa` | TOTP for admin staff | Security | Complete |
| `health` | Liveness/readiness probes | DevOps | Complete |

---

## Infrastructure services

| Service | Purpose | Technology | Deployment | Owner | Status |
|---------|---------|------------|------------|-------|--------|
| **nginx** | TLS, reverse proxy, static, rate limits | nginx:alpine | Docker Compose | DevOps | Complete |
| **PostgreSQL** | Primary relational database | postgres:15-alpine | Docker Compose | DevOps | Complete |
| **Redis** | Cache, Celery broker, Channels layer | redis:7-alpine | Docker Compose | DevOps | Complete |
| **Celery Workers** | Background tasks (×2, 4 concurrency) | Celery 5.6 | Docker Compose | DevOps | Complete |
| **Celery Beat** | Scheduled tasks | django-celery-beat | Docker Compose | DevOps | Complete |
| **Daphne** | ASGI HTTP + WebSocket (×3) | daphne 4.2 | Docker Compose | DevOps | Complete |

---

## External services

| Service | Purpose | Owner | Status |
|---------|---------|-------|--------|
| Firebase Cloud Messaging | Push notifications | Engineering | Configured |
| Google Maps Platform | Maps, geocoding, routing | Engineering | Configured |
| Stripe | Card payments | Finance / Engineering | Configured |
| Bankily / Sedad / Masravi | Mobile money (Mauritania) | Finance | Integration hooks |
| Let's Encrypt | SSL certificates | DevOps | Configured |
| Google Play Console | Android distribution | Product | Listing drafted |
| Apple App Store Connect | iOS distribution | Product | Not submitted |
| SMTP | Transactional email | Engineering | Configured |
| Sentry | Error tracking (production) | Engineering | Optional via `SENTRY_DSN` |

---

## Documentation inventory

| Package | Path | Documents |
|---------|------|-----------|
| Handover (this package) | `handover/` | 10 + README |
| Engineering handbook | `engineering/` | 8 + README |
| Operations SOPs | `operations/` | 10 + README |
| Project management | `project-management/` | 6 |
| Release / launch | `release/` | 60+ phase reports, runbooks |

---

## Cross-references

- Architecture: `engineering/01_SYSTEM_ARCHITECTURE.md`
- Deployment: `engineering/05_DEPLOYMENT_GUIDE.md`, `DEPLOYMENT.md`
- Docker stack: `docker-compose.yml`
- nginx: `nginx/nginx.conf`
- Requirements: `requirements.txt`, `frontend/package.json`
