# Yala Security Phase 2 — Production Hardening Report

**Date:** 2026-07-08  
**Scope:** Authentication, mobile integrity, OWASP API Top 10, fraud, payments, admin audit, monitoring, backup/DR, dependency audit, pen-test smoke  
**Constraint:** No UI redesign; no new business features; no breaking Rider/Driver/Delivery/Admin flows  

---

## Verdict

| Field | Result |
|--------|--------|
| **PASS / FAIL** | **FAIL** |
| **Security score** | **72 / 100** |
| **Production readiness** | **Conditional launch OK for soft public beta; not enterprise-grade until Critical/High mobile + dependency + ops items close.** |

Phase 2 added measurable controls on top of Phase 1, but Google Play Integrity is still soft, frontend dependency risk remains, and production ops (encrypted backup cron, Sentry DSN, OWASP smoke against live API) are incomplete.

---

## Score breakdown (0–100)

| Area | Weight | Score | Notes |
|------|--------|-------|-------|
| 1. Authentication | 12 | 10 | Optional Admin 2FA, device notify, logout-all, concurrent session cap |
| 2. Mobile security | 12 | 5 | Emulator soft flags only; no Play Integrity SDK / root / signature |
| 3. API / OWASP | 12 | 10 | BOLA/auth/rate-limit/abuse present; smoke script exists (not run vs prod this pass) |
| 4. Fraud detection | 10 | 9 | Flags for multi-account, PIN BF, GPS, farming, cancels → Admin FraudFlag |
| 5. Payment security | 10 | 8 | Keys env-only; Stripe webhook sig gate; wallet duplicates guarded; no card rail live |
| 6. Admin security | 10 | 9 | AuditLog who/what/when/IP; admin routes `IsAdminUser` + 2FA gate |
| 7. Monitoring | 8 | 5 | Backend Sentry env-gated; frontend loader without `@sentry/browser` |
| 8. Backup & DR | 8 | 6 | Encrypted script + DR doc; cron/restore not verified on droplet |
| 9. Dependency audit | 8 | 4 | npm: 43 vulns (1 critical / ~20 high); pip-audit blocked by local SSL |
| 10. Pen tests | 10 | 6 | Unit tests 7/7 PASS; OWASP bash smoke ready; live prod probe not executed |
| **Total** | **100** | **72** | |

---

## Critical findings

1. **Play Integrity not production-ready** — No Play Integrity native SDK; `isRooted` / `isTampered` hardcoded `false` in `MainActivity`; `PLAY_INTEGRITY_ENFORCE` must stay `false` or ride/delivery requests break.
2. **npm audit critical vulnerability remains** in the frontend dependency tree (CRA / transitive tooling chain) — not safely auto-fixed without risk of breaking Capacitor builds.

---

## High findings

1. **Root / Magisk / Frida / signature mismatch detection incomplete** — soft emulator heuristics only.
2. **Concurrent session limit drops `DeviceSession` rows but does not blacklist outstanding JWTs** for trimmed devices — old access tokens remain valid until expiry/refresh fail.
3. **Frontend Sentry not installed** — `monitoring/sentry.js` dynamic-imports `@sentry/browser` which is not in `package.json`.
4. **Encrypted backup cron not confirmed on production** — script + `docs/DISASTER_RECOVERY.md` exist; ops install pending.
5. **npm high advisories (~20)** including `ws` (runtime via `socket.io-client` / `engine.io-client`), plus many CRA/dev-toolchain issues.
6. **`pip-audit` could not complete** in this environment (PyPI SSL verify failure) — Python vulnerability posture unconfirmed for Phase 2 sign-off.

---

## Medium findings

1. Admin 2FA is optional until staff enrolls (password-only staff still get JWT immediately).
2. Multi-account device detection is flag/alert oriented — not a hard registration block.
3. Stripe webhook endpoint returns 503 until secrets configured (correct fail-closed) — card flows unused.
4. OWASP / WS / upload / SQLi / XSS / CSRF pen suite is partial (smoke + unit); not a full third-party PT report.
5. Device binding relies on client-supplied `device_id` (spoofable without Integrity attestation).

---

## Low findings

1. Admin 2FA enrollment UX remains API-centric (no dedicated polished wizard).
2. Fraud farming thresholds (20 rides/deliveries / 24h) are heuristic and may need market tuning.
3. Soft emulator flags are injectable/spoofable from WebView until server-side Integrity attestations exist.
4. DR RPO target is 24h (daily) — not continuous PITR.

---

## What Phase 2 implemented / verified

### Authentication
- Optional Admin TOTP withholds JWT until `/auth/2fa/verify/` when confirmed.
- New-device login email + `DeviceSession`.
- `POST /auth/logout-all-devices/` blacklists refresh tokens + clears sessions.
- `MAX_CONCURRENT_DEVICE_SESSIONS` (default 5) trims oldest device sessions.
- Tests: device binding, logout-all, concurrent cap, 2FA pending token, integrity gate — **7/7 PASS**.

### Mobile
- Soft `__YALA_DEVICE_TRUST__` emulator injection (Rider/Driver/Delivery).
- Backend `/auth/integrity/verify/` + `require_integrity` when enforce enabled.
- **Not** enterprise-complete (see Critical).

### Fraud → Admin alerts
- Reasons: multi_account, pin_bruteforce, fake_location, ride/delivery farming, integrity_fail, excessive cancellations, refunds, failed payments.
- Hooks: register multi-account, ride + delivery PIN lockouts, GPS rejection, integrity failure, ride cancel abuse.

### Payments
- Secrets from env only.
- Wallet settlement refuses duplicate paid records.
- New `POST /payments/webhooks/stripe/` with signature verification + rate limit (fail-closed if unset).

### Admin / monitoring / DR
- AuditLog retained for who/what/when/IP actions.
- Backend Sentry via `SENTRY_DSN` when `DEBUG=False`.
- `scripts/backup-encrypted.sh` + `docs/DISASTER_RECOVERY.md`.

### Dependencies
- `pip check`: no broken requirements; `pyotp`, `sentry-sdk`, `stripe` listed.
- `npm audit --omit=dev`: **41** findings (10 low / 12 moderate / 18 high / 1 critical). Full tree ~43.

---

## Production readiness assessment

**Ready for:** soft public launch of Rider/Driver/Delivery with current soft integrity (enforce OFF), wallet/MMO payments, Admin with enrolled 2FA, rate limits, and fraud flag review queue.

**Not ready for:** “enterprise-grade” claim or store reviewers expecting enforced Play Integrity / hardened mobile attestation.

### Must-do before claiming PASS (≥85)

1. Integrate Play Integrity SDK on native apps; set package/API keys; then enable `PLAY_INTEGRITY_ENFORCE`.
2. Real root + signing checks (or rely solely on Play Integrity verdicts).
3. Blacklist JWTs when concurrent sessions are trimmed (parity with logout-all).
4. Add `@sentry/browser` + production DSN; confirm backend Sentry alerts.
5. Install encrypted backup cron; run one restore drill per DR doc.
6. Resolve npm critical + production-impacting `ws` highs carefully; re-run `pip-audit` with working CA trust.
7. Run `scripts/owasp-api-security-smoke.sh` against the intended API base and keep it in CI.

### Safe defaults for launch

- Keep `PLAY_INTEGRITY_ENFORCE=false` until native tokens work.
- Enroll Admin TOTP for all staff before marketing push.
- Do not commit signing keys / `.env` / backup passphrase.

---

## Key files (Phase 2)

- `backend/taxi/authapp/views.py` — concurrent session trim  
- `backend/taxi/security/services/fraud_service.py` — farming / PIN / GPS / integrity flags  
- `backend/taxi/deliveries/services/delivery_service.py` — delivery PIN brute-force flags  
- `backend/taxi/payments/webhooks.py` + `payments/urls.py` — Stripe webhook gate  
- `backend/taxi/taxi/settings.py` — session limit, Stripe webhook secret, Sentry  
- `backend/taxi/tests/security/test_advanced_hardening.py` — 7 tests  
- `docs/DISASTER_RECOVERY.md`  
- `scripts/backup-encrypted.sh`, `scripts/owasp-api-security-smoke.sh`  

---

## Ops checklist (not code)

- [ ] Migrate `admin_2fa` + `DeviceSession` on production if not done  
- [ ] Enroll TOTP for ops admins  
- [ ] Cron encrypted backups + store passphrase offline  
- [ ] Set `SENTRY_DSN` (+ optional `REACT_APP_SENTRY_DSN`)  
- [ ] Run OWASP smoke vs staging/prod API with owner approval  
- [ ] Keep Integrity enforce off until native SDK ships  
