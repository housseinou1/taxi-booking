# YALA Enterprise v1.0 — Security Review (Closed Beta)

**Document ID:** BETA-SECURITY-001  
**Date:** 2026-07-22  
**Scope:** Authentication, authorization, validation, uploads, rate limiting, JWT, data exposure  
**Method:** Code review + existing security reports + production health probe  
**Related:** `release/SECURITY_HARDENING_REPORT.md` · `release/SECURITY_PHASE2_REPORT.md`

---

## Executive summary

| Area | Status | Notes |
|------|:------:|-------|
| Authentication | ✅ Pass | JWT + refresh; admin 2FA mandatory when TOTP confirmed |
| Authorization | ⚠ Partial | Role checks present; least-privilege audit incomplete |
| Input validation | ✅ Pass | Coordinates, PIN lockout, abuse counters |
| File uploads | ✅ Pass | Driver documents; type/size via serializers |
| API rate limiting | ✅ Pass | Redis-backed on hot paths |
| JWT handling | ⚠ Partial | Refresh works; password-change revocation open (P2) |
| Sensitive data exposure | ✅ Pass | No raw card storage; audit logging on admin mutations |

**Overall security posture for Closed Beta:** **ACCEPTABLE WITH CONDITIONS** — complete RB-P1-007 and RB-P1-012 before expanding cohort beyond 25 users.

---

## 1. Authentication

| Control | Implementation | Status |
|---------|----------------|:------:|
| User login | `POST /auth/login/` — email/password | ✅ |
| JWT access + refresh | `rest_framework_simplejwt` + `token_blacklist` app | ✅ |
| Token refresh | `POST /auth/token/refresh/` | ✅ |
| Registration | `POST /auth/register/` with user_type | ✅ |
| Admin 2FA | TOTP required for staff when confirmed (`ADMIN_2FA_ENABLED`) | ✅ |
| Device session limit | `MAX_CONCURRENT_DEVICE_SESSIONS=5` | ✅ |
| Merchant login rate limit | 10 / 15 min | ✅ |
| Play Integrity | Optional; `PLAY_INTEGRITY_ENFORCE=false` default | ⚠ Post-beta |

**Production check (2026-07-22):** HTTPS enforced via nginx; health endpoint does not leak secrets.

---

## 2. Authorization

| Layer | Mechanism | Status |
|-------|-----------|:------:|
| API views | `@permission_classes([IsAuthenticated])` default on protected routes | ✅ |
| Merchant | `IsMerchantOwner`, `IsApprovedMerchant` | ✅ |
| Admin | `IsAdminUser`, `executive_permissions.py` decorators | ✅ |
| CEO / executive | Role-gated ops endpoints | ✅ |
| Driver availability | Requires approved status + documents + legal signature | ✅ |
| Least-privilege matrix | Documented role audit | ❌ RB-P1-007 open |

**Finding:** Executive permission module exists but formal role matrix audit not signed off.

---

## 3. Input validation

| Vector | Control | Location |
|--------|---------|----------|
| Ride coordinates | `validate_coordinates()` + service area bounds | `taxi/security/abuse.py`, `settings.YALA_SERVICE_AREA_BOUNDS` |
| Ride request rate | 5 requests / 10 min | `rides/views.py` |
| PIN verify | Lockout + retry limits | `pin_lockout_retry`, `record_pin_failure` |
| Cancellation abuse | Identity-scoped counters | `record_cancellation` |
| Delivery instructions | Normalized + length limits | `deliveries/instruction_utils.py` |
| DRF serializers | Field-level validation on all write endpoints | App serializers |

**Status:** ✅ Adequate for Closed Beta.

---

## 4. File uploads

| Upload type | Validation | Storage |
|-------------|------------|---------|
| Driver documents | Type whitelist, admin review workflow | `media/driver/documents/` |
| Profile/vehicle photos | ImageField | `media/drivers/` |
| Delivery proof photos | Courier trip endpoints | `media/deliveries/` |
| Merchant product images | Merchant portal | `media/merchants/` |

**Finding:** Documents require admin approval before driver can go online. No arbitrary file execution path identified.

---

## 5. API rate limiting

| Endpoint class | Limit | Backend |
|----------------|-------|---------|
| Ride request | 5 / 600s | Redis via `rate_limit()` |
| Schedule ride | 5 / 600s | Redis |
| Merchant login | 10 / 900s | Redis |
| PIN / auth abuse | Lockout counters | Redis |

**Dependency:** Redis must be healthy (production: ✅ per health probe).

---

## 6. JWT handling

| Control | Status |
|---------|:------:|
| Access token expiry | ✅ Configured in SIMPLE_JWT |
| Refresh token rotation | ✅ Supported |
| Blacklist app installed | ✅ `token_blacklist` |
| Revoke on password change | ❌ SEC-003 / RB-P2-011 — token theft window |
| Logout / blacklist on logout | ⚠ Partial — mobile session clear |

**Beta recommendation:** Accept for ≤25 users; fix before GA.

---

## 7. Sensitive data exposure

| Data class | Handling | Status |
|------------|----------|:------:|
| Payment card data | Token references only; Stripe/provider tokens | ✅ |
| Passwords | Django hashers | ✅ |
| PII in logs | Sentry `send_default_pii=False` | ✅ |
| Audit trail | `security/services/audit_service.py` — immutable logs | ✅ |
| API error messages | Generic messages on auth failures | ✅ |
| Health endpoint | No secrets; DB/Redis status only | ✅ Verified |

**Forwarded-for trust:** `YALA_TRUST_X_FORWARDED_FOR` for rate limiting behind nginx (production template: True).

---

## 8. Security UAT status

| Item | Status |
|------|:------:|
| S-01–S-10 security UAT checklist | ⚠ Partial (RB-P1-012) |
| OWASP API smoke script | ☐ Re-run post-RC3 deploy |
| RC2 security verify | ✅ Prior pass on RC2 scope |

---

## 9. Closed Beta security conditions

Before inviting users:

1. Complete admin least-privilege audit (RB-P1-007)
2. Finish security UAT S-01–S-10 (RB-P1-012)
3. Confirm `DJANGO_DEBUG=False` and strong `SECRET_KEY` on production
4. Confirm Sentry DSN active for crash/security monitoring
5. Keep Play Integrity off until beta stable (documented)
6. Do not expand beyond 25 users until device QA signed

---

## Verdict

**Security: CONDITIONAL GO for Closed Beta** at ≤25 controlled participants after RC3 deploy and ops checklist complete. Not ready for open beta or 100+ users until UAT and least-privilege audit close.
