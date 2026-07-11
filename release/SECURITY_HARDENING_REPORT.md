# Yala Advanced Security Hardening Report

**Date:** 2026-07-08  
**Standards:** OWASP MASVS (mobile) + OWASP API Security Top 10  
**Overall:** **FAIL (hardening incomplete for production enforcement)**  
**Foundation status:** Core controls implemented and unit-tested; full MASVS/Play Integrity production posture still open.

---

## Risks found (before / during audit)

| Risk | Severity | Notes |
|------|----------|-------|
| Admin 2FA API existed but login still issued JWTs immediately | Critical | Attacker with password bypassed TOTP |
| Device sessions backend-only — clients never sent `device_id` | High | Multi-account / binding ineffective |
| No new-device user notification | High | Account takeover undetected by victim |
| Play Integrity backend stub unused by apps / ride flows | High | Rooted/tampered devices unrestricted when enforce ON without tokens |
| No native emulator signal | Medium | Soft detection missing |
| Backups gzip-only (not encrypted) | High | Breach of backup host = full DB |
| Frontend Sentry missing | Medium | Client crash/incident blind spot |
| npm dependency vulns (`ws`, etc.) | Medium/High | 41 audit findings in frontend tree |
| Logout-all API existed without settings UI | Medium | Users could not self-remediate |

---

## Fixes applied

### 1–2. Play Integrity + rooted/emulator/tamper gates
- Backend: `/auth/integrity/verify/`, `require_integrity()`, settings `PLAY_INTEGRITY_*`
- Ride + delivery request flows now call `require_integrity` when `PLAY_INTEGRITY_ENFORCE=true`
- Frontend: `playIntegrity.js` bridge helper + post-login verify attempt
- Native: emulator heuristics injected via `MainActivity` for Rider/Driver/Delivery (`window.__YALA_DEVICE_TRUST__`)

### 3–5. Device binding, new-device alerts, logout-all
- Login accepts `device_id` / `X-Device-Id` + `device_name`
- Email alert on new device
- Frontend sends stable device id (`deviceId.js`)
- Settings: **Log out all devices** → `POST /auth/logout-all-devices/`
- DeviceSession + JWT blacklist retained

### 6–7. Admin 2FA + audit logs
- Confirmed-admin TOTP now **blocks JWT** until `/auth/2fa/verify/` with `pending_token`
- Login UI: 2FA step for Admin
- Existing `AuditLog` / admin audit endpoints remain for admin actions

### 8–9. Rate limits + suspicious behavior
- Already present: login, register, reset, OTP, rides, deliveries, payments, PIN lockouts, cancel abuse, fake GPS heuristics, multi-account cache (now usable with client device ids)

### 10–11. Encrypted backups + Sentry
- New `scripts/backup-encrypted.sh` (GPG AES-256 + decrypt restore test)
- Django Sentry already env-gated; frontend optional loader `monitoring/sentry.js` (`REACT_APP_SENTRY_DSN`)

### 12. Security tests
- New: `tests/security/test_advanced_hardening.py` — **6/6 PASS**
- New: `scripts/owasp-api-security-smoke.sh`
- `npm audit`: **41 vulnerabilities** reported (not auto-fixed; breaking changes risk)
- `pip check`: No broken requirements; `pyotp` installed

---

## Remaining risks (must close for PASS)

1. **Full Google Play Integrity SDK** not integrated in Android Gradle (only JS bridge + soft emulator flags). Production enforcement needs Play Console API key + native token generation.
2. **Root/Magisk/Frida detection** incomplete (no RootBeer/Play Integrity hard fail on client).
3. **PLAY_INTEGRITY_ENFORCE** defaults **false** — leave false until native tokens work or rides/deliveries break.
4. **Admin 2FA enrollment UX** incomplete (API setup exists; no polished Admin setup wizard beyond login verify).
5. **Frontend Sentry** requires adding `@sentry/browser` (or CDN) + DSN; current loader is optional/dynamic.
6. **npm audit** remaining high/critical advisories (`ws`, transitively).
7. **WebSocket auth** needs continuous CI coverage in more environments; smoke script exists but not yet in CI gate.
8. **Encrypted backup cron** not installed on the droplet yet — script only.
9. **Device multi-account enforcement** is soft/cache-based; production may need hard block + admin review queue.

---

## Key files changed

- `backend/taxi/authapp/views.py` — 2FA gate, new-device email, device name  
- `backend/taxi/admin_2fa/views.py` — pending-token JWT issuance  
- `backend/taxi/admin_2fa/pending.py` — pending token store  
- `backend/taxi/admin_2fa/integrity.py` — (existing)  
- `backend/taxi/taxi/rides/views.py` / `deliveries/views.py` — integrity gate  
- `backend/taxi/taxi/settings.py` — Play Integrity + ADMIN_2FA settings  
- `backend/taxi/tests/security/test_advanced_hardening.py`  
- `frontend/src/auth/Login.js` — device id + 2FA UI  
- `frontend/src/native/deviceId.js`, `playIntegrity.js`  
- `frontend/src/App.js` — logout all devices  
- `frontend/src/index.js`, `monitoring/sentry.js`  
- `scripts/backup-encrypted.sh`, `scripts/owasp-api-security-smoke.sh`  
- Native `MainActivity.java` (rider/driver/delivery)

---

## Immediate ops checklist

1. Migrate `admin_2fa` + `DeviceSession` on production.  
2. Set `ADMIN_2FA` / enroll TOTP for `sakho@admin.mr` via `/auth/2fa/setup/`.  
3. Install encrypted backup cron with `BACKUP_ENCRYPTION_KEY`.  
4. Keep `PLAY_INTEGRITY_ENFORCE=false` until native Integrity SDK ships.  
5. Run `bash scripts/owasp-api-security-smoke.sh` against prod API.  
6. Plan `npm audit fix` carefully (avoid breaking CRA / Capacitor).
