# YALA Enterprise v1.0 — Pilot User Validation

**Document ID:** PILOT-USERS-001  
**Date:** 2026-07-22  
**Environment:** Production (`https://api.yalataxi.live`)  
**Method:** Live login probes + workflow smoke + admin API validation

---

## Pilot account registry

| Role | Email (pilot) | Primary workflow | Login | Workflow | Notes |
|------|---------------|------------------|:-----:|:--------:|-------|
| **CEO** | `sakho@admin.mr` | Executive dashboard, launch KPIs | ✅ | ✅ | Admin + CEO groups per `seed_executive_roles.py` |
| **Admin** | `sakho@admin.mr` | Admin dashboard, reports, finance | ✅ | ✅ | Smoke TEST3 all PASS |
| **Operations** | _Not provisioned_ | Operations Center, dispatch | ☐ | ☐ | Use admin until `pilot-ops@` created |
| **Rider** | `qa-rider-profile-fix@test.local` | Book ride, rate, history | ✅ | ⚠ | Request/accept PASS; complete blocked by geofence in API smoke |
| **Driver** | `qa-driver-final-qa@test.local` | Go online, accept, complete | ✅ | ⚠ | Online + accept PASS; arrive FAIL in API smoke (no GPS) |
| **Merchant** | _Not provisioned_ | Catalog, orders, mark-ready | ☐ | ☐ | PILOT-012 — provision before merchant pilot |
| **Courier** | `qa-driver-final-qa@test.local` | Delivery mode, accept, deliver | ✅ | ❌ | Login PASS; `delivery_mode_enabled: false`; request delivery HTTP 400 |
| **Tenant** | N/A | Rent payment, lease view | N/A | N/A | Real Estate not in v1.0 |
| **Landlord** | N/A | Property management | N/A | N/A | Academy audience only |
| **Collector** | N/A | Rent collection routes | N/A | N/A | Support playbook only |
| **Supervisor** | _Not provisioned_ | Field supervision | ☐ | ☐ | PILOT-018 |
| **Accountant** | _Not provisioned_ | Finance reconciliation | ☐ | ☐ | Group exists in seed script; no pilot user |

**Passwords:** QA accounts documented in `scripts/fix-qa-cert-accounts.py` and smoke scripts (not repeated here for security — available to pilot ops team in secure vault).

---

## Workflow validation detail

### CEO / Admin (`sakho@admin.mr`)

| Step | Result | Evidence |
|------|:------:|----------|
| Login | ✅ | Smoke TEST3 — 2026-07-22 13:08 UTC |
| View ride history | ✅ | Ride 114 visible |
| Payments dashboard | ✅ | revenue=243.98 MRU |
| Analytics | ✅ | HTTP 200 |
| Driver performance | ✅ | 4 drivers, acceptance 91% |
| Launch KPIs | ✅ | `/operations/launch/kpis/` HTTP 200 |
| Executive UI | ✅ | `/admin/executive` HTTP 200 |

### Rider (`qa-rider-profile-fix@test.local`)

| Step | Result | Evidence |
|------|:------:|----------|
| Login | ✅ | Smoke TEST1 |
| Request ride | ✅ | HTTP 201, ride 114 |
| View PIN | ✅ | PIN issued (0051****) |
| Complete ride | ❌ | Cascade from driver arrive 400 |
| Rate ride | ✅ | HTTP 200 (on partial flow) |
| Trip history | ✅ | Ride 114 in history |
| Wallet | ☐ | Not probed |

### Driver (`qa-driver-final-qa@test.local`)

| Step | Result | Evidence |
|------|:------:|----------|
| Login | ✅ | Smoke TEST1 |
| Go online | ✅ | Availability toggle |
| Accept ride | ✅ | driver_arriving |
| Arrive + PIN | ❌ | HTTP 400 (geofence) |
| Complete ride | ❌ | Cascade |
| Earnings | ⚠ | Endpoint OK; no increment (ride incomplete) |
| Logout | ✅ | Smoke TEST4 session clear |

**Device reference:** Full lifecycle **PASS** on Samsung R5CN80M3ZYJ with GPS — `device-qa-driver-release/DRIVER_RELEASE_QA_REPORT.md` (2026-07-09).

### Courier (QA driver account used as courier)

| Step | Result | Evidence |
|------|:------:|----------|
| Login | ✅ | Smoke TEST2 |
| Delivery mode config | ✅ | GET mode 200 |
| Request delivery (as customer) | ❌ | HTTP 400 |
| Accept on device | ❌ | RC4 — no Accept button |
| Complete via API fallback | ✅ | RC4 delivery 14 delivered |

### Merchant

| Step | Result | Evidence |
|------|:------:|----------|
| All steps | ☐ | No pilot merchant account validated |

**Action:** Provision approved merchant before merchant pilot users.

### Real Estate roles

All marked **N/A** — v1.0 scope excludes Tenant, Landlord, Collector product modules. CEO dashboard covers platform-level finance and operations only.

---

## Account preparation checklist

| # | Action | Owner | Status |
|---|--------|-------|:------:|
| 1 | Run `fix-qa-cert-accounts.py` on production | DevOps | ☐ |
| 2 | Enable `delivery_mode_enabled` on pilot courier | Ops | ☐ |
| 3 | Provision `pilot-merchant@yalataxi.live` (approved) | Ops | ☐ |
| 4 | Provision `pilot-ops@`, `pilot-accountant@` with groups | Ops | ☐ |
| 5 | Verify phone_verified on delivery customer accounts | Engineering | ☐ |
| 6 | Cancel stale QA rides (rides 112–114 in `driver_arriving`) | QA | ☐ |

---

## Related

- [PILOT_ISSUES.md](./PILOT_ISSUES.md)
- [PILOT_METRICS.md](./PILOT_METRICS.md)
- [deployment/PILOT_DEPLOYMENT_REPORT.md](../deployment/PILOT_DEPLOYMENT_REPORT.md)
