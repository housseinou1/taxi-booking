# Yala v1.0.0 — Changelog

All notable changes for the v1.0.0 commercial release.  
Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [1.0.0] — 2026-07-21

### Added — Product (pre-freeze · Phases 1–28)

#### Rider
- Ride request, tracking, PIN verification, rating, wallet
- Share rides with dynamic pricing
- Saved places, referrals, legal acceptance flows

#### Driver
- Online/offline, smart dispatch offers, document compliance
- Ride lifecycle (arrive, start, complete, no-show)
- Earnings, rewards, performance levels, QR verification
- Wallet and cash-out with OTP verification

#### Delivery
- Courier onboarding, category-based deliveries
- PIN pickup/dropoff, proof-of-delivery photos
- Pricing engine, prepay methods, chat moderation

#### Platform
- JWT auth with refresh rotation and blacklist
- Phone OTP verification and password reset
- Device session binding and admin 2FA
- WebSocket real-time updates (rides, deliveries)
- FCM push notifications (rider, driver, delivery)
- Payments: cash, card, wallet, Bankily, Masravi, Sedad
- Fraud flags, audit logging, SOS safety

#### Admin & Operations
- Executive Dashboard, Operations Center, AI Operations
- Business Operations Hub (CRM, marketing, corporate, compliance)
- Fleet Performance Center
- Finance Operations & Reconciliation (Phase 24)
- Launch Operations Command Center (Phase 25)
- Growth & Expansion Dashboard (Phase 26)
- Multi-City Operations Platform (Phase 27)
- Smart Pricing & Dispatch Engine (Phase 28)
- Closed Beta Dashboard, Launch Hub, Support Center

### Changed — RC3 Stabilization

#### Performance
- Removed surge monitor N+1 queries (`ai_operations_service`)
- Removed AI recommendation generation on dashboard GET
- Added 45s Redis cache for AI ops, fleet, smart-engine dashboards
- Consolidated finance/executive daily charts to single SQL aggregation
- Deduplicated fleet CEO driver scoring pass
- Batched dispatch analytics accepted-log lookups
- Added `select_related` and pagination caps on ride history
- Added database indexes: Payment.ride_id, withdrawal/refund queues, driver availability, document expiry

#### Reliability
- Docker healthcheck uses HTTP readiness probe
- Celery worker healthcheck added
- Readiness endpoint reports Celery status and worker count

#### Security
- Audit log client IP respects `YALA_TRUST_X_FORWARDED_FOR`

#### Mobile (RC3 · requires AAB rebuild)
- Rider: cancel cleanup, WS leave, state sync, cancel toast
- Driver: green online toast, toggle stuck fix, terminal ride clear
- Driver: document alert dot logic corrected

### Fixed — RC2 and earlier

- QA account phone verification for certification flows
- Driver arrive GPS distance gate
- Ride offer expiry and stale ride state
- Withdrawal idempotency and OTP production flow
- Delivery PIN and exception review workflows

### Database migrations (deploy required)

```
operations 0010_multicity_operations
payments 0020_rc3_stabilization_indexes
drivers 0023_rc3_stabilization_indexes
notifications 0006_alter_fcmtoken_app_type
security 0003_alter_fraudflag_reason
```

---

## [1.0.0-rc3] — 2026-07-21

Stabilization sprint only — no new features. See `RC3_STABILIZATION_REPORT.md`.

---

## [1.0.0-rc2] — 2026-07-21

- RC2 certification scripts and load testing
- Offsite backup infrastructure (local PASS, remote pending)
- Soft launch daily report automation
- 335 concurrent requests @ 0% HTTP 5xx

---

## [1.0.0-rc1] — 2026-06

- Initial release candidate
- Core ride, driver, delivery, wallet flows
- Admin executive and operations dashboards

---

## Upgrade notes

1. Deploy backend and run all pending migrations
2. Rebuild and publish Android AABs (Rider 19, Driver 38, Delivery 6 minimum)
3. Enable smart engine via Admin → Smart Pricing & Dispatch (optional, off by default)
4. Configure offsite backup before production scale

---

*Full phase reports: `release/PHASE*_*.md` · Certification: `RC2_FINAL_LAUNCH_CERTIFICATION.md`*
