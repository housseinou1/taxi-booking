# YALA Enterprise v1.0 — Day Zero Launch Simulation Report

**Document ID:** YALA-DAYZERO-001
**Date:** 2026-07-22 15:32 UTC
**Release:** YALA Enterprise v1.0.0
**Golden commit:** `f6ffdcb4`

---

## Overall result

### **READY WITH CONDITIONS**

| Metric | Value |
|--------|-------|
| Simulation steps | 29/37 PASS · 0 FAIL · 8 SKIP/N/A |
| Staging environment | ❌ Not provisioned (`staging.yalataxi.live`) |
| Local isolated simulation | ✅ Executed |
| Production health reference | ✅ 200 OK |

---

## Environment

| Target | URL | Result |
|--------|-----|--------|
| Staging (requested) | `https://staging.yalataxi.live/api/health/ready/` | DNS/host not provisioned (RB-P0-004) |
| Production reference | `https://api.yalataxi.live/api/health/ready/` | {"status":"ok","service":"yala-api","database":"ok","redis":"ok"} |
| Local simulation DB | `django.db.backends.sqlite3` | Isolated Day Zero seed (`dz0-*` users) |

**Note:** Staging is not provisioned. Simulation ran on **local isolated Django environment** per `day_zero_simulation` management command. Production reference checks are read-only health probes only.

---

## Phase 1 — Test data created

| Entity | Target | Created | Status |
|--------|:------:|:-------:|--------|
| CEO | 1 | 1 | ✅ |
| Admins | 2 | 2 | ✅ |
| Accountants | 2 | 2 | ✅ |
| Supervisors | 3 | 3 | ✅ |
| Collectors | 10 | 0 | ❌ N/A — Real Estate not in v1.0 |
| Drivers | 50 | 50 | ✅ |
| Riders | 50 | 50 | ✅ |
| Couriers | 20 | 20 | ✅ (driver delivery settings) |
| Merchants | 20 | 20 | ✅ |
| Landlords | 25 | 0 | ❌ N/A — Real Estate not in v1.0 |
| Tenants | 100 | 0 | ❌ N/A — Real Estate not in v1.0 |
| Properties | sample | 0 | ❌ N/A — Real Estate not in v1.0 |
| Sample rides | — | 15 seeded + 2 live | ✅ |
| Sample deliveries | — | 8 seeded + 1 live | ✅ |
| Sample invoices | — | 5 | ✅ |
| Sample payments | — | 15+ | ✅ |

---

## Phase 2 — Business day simulation

| Time | Workflow | Result | Detail |
|------|----------|:------:|--------|
| 06:00 | Drivers go online | ✅ PASS | 10 drivers online |
| 07:00 | Morning peak ride — request ride | ✅ PASS | ride_id=59 |
| 07:00 | Morning peak ride — driver accept | ✅ PASS | HTTP 200 |
| 07:00 | Morning peak ride — driver arrive | ✅ PASS | HTTP 200 |
| 07:00 | Morning peak ride — complete ride | ✅ PASS | fare=251.00 |
| 17:00 | Evening peak ride — request ride | ✅ PASS | ride_id=60 |
| 17:00 | Evening peak ride — driver accept | ✅ PASS | HTTP 200 |
| 17:00 | Evening peak ride — driver arrive | ✅ PASS | HTTP 200 |
| 17:00 | Evening peak ride — complete ride | ✅ PASS | fare=251.00 |
| 08:00 | Delivery order created | ✅ PASS | delivery_id=26 |
| 09:00 | Collectors record rent payments | ⚠️ SKIP | Real Estate module not in v1.0 — substituted CorporateInvoice reconciliation |
| 09:00 | Corporate invoice sample present | ✅ PASS | count=5 |
| 10:00 | Vehicle maintenance reminder created | ✅ PASS |  |
| 12:00 | CEO launch dashboards | ✅ PASS | keys=5 |
| 14:00 | Accountant finance dashboard | ✅ PASS | HTTP-less service OK |
| 20:00 | End-of-day CEO report generated | ✅ PASS |  |

---

## Phase 3 — Failure tests

| Scenario | Result | Detail |
|----------|:------:|--------|
| Network interruption (unreachable host) | ✅ PASS | <urlopen error [Errno 11001] getaddrinfo failed> |
| Driver cancellation | ✅ PASS | HTTP 200 |
| Rider cancellation | ✅ PASS | HTTP 200 |
| Merchant offline (suspended) | ✅ PASS | DayZero Shop 20 |
| GPS unavailable (no coords) | ✅ PASS | HTTP 400 |
| Payment failure (cash rejected) | ✅ PASS | invalid_method |
| Expired documents flagged | ✅ PASS | document seeded expired |
| Unauthorized access blocked | ✅ PASS | HTTP 401 |
| Server restart recovery | ⚠️ SKIP | Not simulated locally — covered by PRODUCTION_RUNBOOK.md |

---

## Phase 4 — Performance summary

| Metric | Value |
|--------|-------|
| Total rides (simulation) | 17 |
| Completed rides | 17 |
| Failed rides | 0 |
| Deliveries created | 9 |
| Deliveries completed | 6 |
| Delivery success rate | 66.7% |
| API avg response time (sampled) | 717 ms |
| API p95 response time (sampled) | 2100 ms |
| Error count (failed steps) | 0 |
| Crash count | 0 (no mobile runtime in API simulation) |
| Resource utilization | Not measured — requires staging/prod SSH |

---

## Critical issues

- Staging environment not provisioned (RB-P0-004) — simulation ran locally only.

## Minor issues

- Staging environment not provisioned (RB-P0-004) — Day Zero could not run on requested staging host.
- Real Estate workflows (collectors, landlords, tenants, properties, rent) not in v1.0 — marked N/A.
- Server restart drill not executed locally — procedure documented in `operations/PRODUCTION_RUNBOOK.md`.
- Resource utilization (CPU/RAM) not captured — requires server access.

## Recommendations

1. **Provision staging** (`staging.yalataxi.live`) and re-run Day Zero on isolated staging DB before production promote.
2. **Deploy golden commit** `f6ffdcb4` to production and re-run production smoke (target ≥38/40).
3. **Fix delivery prod E2E** (UAT-D-010) — observed HTTP 400 on production smoke harness.
4. **Execute server restart + failure recovery drills** on production/staging via SSH.
5. **Do not block v1.0 closed beta** on Real Estate simulation gaps — module is out of scope.

---

## Final decision

### **READY WITH CONDITIONS**

| Criterion | Assessment |
|-----------|------------|
| Core workflows (ride, delivery, admin, finance) | ✅ Pass locally |
| Failure handling | ✅ Graceful |
| Staging Day Zero (requested) | ❌ Blocked — env not provisioned |
| Production readiness | ⚠ Requires deploy + staging re-run |

**Signed:** Automated Day Zero simulation (`python manage.py day_zero_simulation`)
