# YALA production credential rotation runbook

Status: **prepared, not executed.** Every step below changes production and needs the
administrator's go-ahead. Nothing in this document contains a credential value.

Why: credentials were hardcoded in tracked scripts and pushed to `origin/main` (CEO password in
11 files, QA passwords, a shared default password). The production database password in the
current server env file matches a value present in pushed git history (commit `008482bf^`).
Removing them from the working tree does not remove them from history, so **every exposed value
must be treated as compromised and rotated**.

Production layout (from `docker-compose.yml`): compose project `yala` on the production host
(`$YALA_PROD_HOST`, app dir `/opt/yala`); services `nginx`, `django`, `django-replica`,
`django-replica-2`, `celery-worker`, `celery-beat` (all read `backend/taxi/.env.production` and
`DATABASE_URL=postgres://yala_user:${POSTGRES_PASSWORD}@postgres:5432/yala_db`), `postgres`
(internal only, `expose: 5432`, not published), `redis`.

Facts that drive the ordering:

| Mechanism | Effect |
|---|---|
| SimpleJWT `SIGNING_KEY` defaults to `SECRET_KEY` (HS256) | Rotating `DJANGO_SECRET_KEY` invalidates **every** access and refresh token: all riders, drivers, couriers and staff are logged out. |
| Access token lifetime `JWT_ACCESS_TOKEN_MINUTES` (default 15) | Blacklisting refresh tokens does not kill an access token already issued; it stays valid until it expires (≤ 15 min). |
| `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION` | Per-user revocation = blacklist that user's `OutstandingToken` rows. |
| Password change via Django | Does **not** revoke JWTs by itself. Revoke explicitly (section 7). |
| `CARD_QR_TOKEN_SECRET` (falls back to `SECRET_KEY`) | If unset, rotating `SECRET_KEY` invalidates employee ID-card QR tokens (24 h TTL). |
| Postgres `POSTGRES_PASSWORD` | Only used when the data volume is first initialised. Changing the env var alone does nothing: the role password must be changed inside Postgres. |

---

## 0. Preparation (all rotations)

1. **Two people**: an operator with shell access and a verifier. Agree a maintenance window
   (low traffic; Nouakchott night) and announce it to support/ops.
2. **Password manager**: create entries for every new value *before* starting. Generate values
   there or with `openssl rand -base64 33 | tr -d '/+=' | cut -c1-32` (URL-safe, needed for
   `DATABASE_URL`). Never paste values in chat, tickets, commits, shell arguments or logs.
3. **Shell hygiene on the server**: `export HISTCONTROL=ignorespace` and prefix any command
   that must carry a value with a space; prefer interactive prompts (`\password`,
   `changepassword`) over arguments.
4. **Evidence first** (before anything changes, so attacker traces are not overwritten):
   ```bash
   ts=$(date +%F-%H%M); mkdir -p /root/incident/$ts && chmod 700 /root/incident/$ts
   cd /opt/yala
   docker compose -p yala logs --no-color --since 720h nginx  > /root/incident/$ts/nginx.log
   docker compose -p yala logs --no-color --since 720h django > /root/incident/$ts/django.log
   last -Faiw > /root/incident/$ts/ssh-logins.txt; cp /var/log/auth.log* /root/incident/$ts/ 2>/dev/null
   ```
5. **Backups** (required before sections 1, 3, 5):
   ```bash
   docker compose -p yala exec -T postgres pg_dump -U yala_user -Fc yala_db > /root/backups/yala_db-$ts.dump
   docker compose -p yala exec -T postgres pg_restore --list < /root/backups/yala_db-$ts.dump | head   # must list objects
   cp -p .env backend/taxi/.env.production /root/backups/ && chmod 600 /root/backups/.env* /root/backups/*.production
   ```
   Keep the dump off-host as well (encrypted). Record the dump size and checksum.
6. **Rollback material**: keep the *old* values in the password manager, marked
   "compromised – rollback only", until verification passes. Rollback restores service; it does
   not restore security, so re-attempt the rotation as soon as the cause is fixed.

## Safe execution order

| Step | Section | User impact | Expected downtime |
|---|---|---|---|
| 1 | CEO password + 2FA + CEO sessions | CEO re-logs in | none |
| 2 | Production DB password | API errors while app containers restart | 1–5 min |
| 3 | QA accounts | none (QA only) | none |
| 4 | Shared default password accounts | affected demo/staff accounts must reset | none |
| 5 | Django `SECRET_KEY` verification / rotation | **everyone logged out** if rotated | 1–3 min restart |
| 6 | Payment provider credentials | payments paused per provider during swap | per provider, minutes |
| 7 | Session revocation (global sweep) | users re-login | none |
| 8 | Access-log review | none | none |

Do 1 first: the CEO account has full administrative and financial authority. Do 5 after 1–4 so
that a single global logout also kills any session obtained with an old password.

---

## 1. CEO password rotation (`sakho@admin.mr`)

The account must not be deleted and its permissions, access and financial authority must not
change. Only the password, 2FA enrolment and sessions change.

1. On the server: `docker compose -p yala exec django python manage.py changepassword sakho@admin.mr`
   (interactive; the value never appears in history). The CEO may instead change it themselves
   from a trusted device; either way the new value goes straight into the password manager.
2. Revoke all existing CEO refresh tokens and device sessions (section 7, per-user snippet).
3. CEO logs in on a trusted device with the new password.
4. Enrol 2FA: `POST /auth/2fa/setup/` → scan the TOTP secret in an authenticator app →
   `POST /auth/2fa/confirm/` with a current code → `GET /auth/2fa/status/` shows enabled.
   Store recovery material offline.
5. Wait 15 minutes (access-token lifetime) or perform section 5 to cut off any token already
   issued with the old password.
6. **Verify**: old password rejected (one attempt only, to avoid lockout noise); new password +
   TOTP accepted; CEO dashboard and financial summary load; `is_staff`/`is_superuser`/groups
   unchanged (compare with the pre-change snapshot from step 0).
7. **Rollback**: `changepassword` again with the rollback value from the password manager. Do not
   disable 2FA as part of rollback.

## 2. Production database password

1. Preparation and backup from section 0 (dump verified).
2. Change the role password inside Postgres (interactive, not logged by `log_statement`):
   ```bash
   docker compose -p yala exec postgres psql -U yala_user -d yala_db -c '\password yala_user'
   ```
   Existing connections stay open; new connections need the new value.
3. Immediately update `POSTGRES_PASSWORD` in `/opt/yala/.env` (the compose interpolation
   source). If `backend/taxi/.env.production` also contains a `DATABASE_URL` with the old
   password, update or remove it (compose overrides `DATABASE_URL` for every app service).
   `chmod 600` both files.
4. Recreate only the app containers (do **not** touch the `postgres` volume):
   ```bash
   docker compose -p yala up -d --force-recreate django django-replica django-replica-2 celery-worker celery-beat
   ```
   `django` runs `migrate` on start; that is expected.
5. **Verify**: `docker compose -p yala ps` all healthy; `curl -fsS https://api.yalataxi.live/api/health/ready/`;
   a QA login; one ride request and one delivery quote; `docker compose -p yala logs --since 10m celery-worker`
   has no `password authentication failed`.
6. **Expected downtime**: requests that open new DB connections fail between step 2 and step 4
   (target < 5 min). Run steps 2–4 back to back.
7. **Rollback**: `\password yala_user` with the rollback value, restore the two env files from
   `/root/backups`, recreate the same services. Data is untouched by this rotation; the dump is
   for disaster recovery only.

## 3. QA account credentials

Accounts: `qa-rider-profile-fix@test.local`, `qa-driver-final-qa@test.local`,
`qa-driver-profile-fix@test.local` (and any other `@test.local` QA account).

1. Decide whether each QA account still needs to exist in production. Prefer deactivating
   (`is_active=False`) unused ones over rotating them.
2. For kept accounts: `python manage.py changepassword <email>` (interactive), store in the
   password manager, revoke sessions (section 7).
3. Distribute new values to QA through the password manager. Scripts read them from
   `YALA_QA_*` variables (`scripts/qa-credentials.env.example`).
4. **Verify**: `YALA_QA_* python scripts/rc2-mobile-api-smoke.py` (or another read-only smoke) logs in.
5. **Rollback**: set the rollback value again; QA-only impact.

## 4. Shared default password replacement

The shared default was used for demo/seed accounts (e.g. `mariam.ba@yala.mr`,
`amadou.diallo@yala.mr`, couriers) and may exist on real staff accounts.

1. Find accounts still using it **without handling the value in a query**: in a Django shell on
   the server, read the value from an environment variable set for that one command and use
   `check_password`; print only the count and emails:
   ```python
   import os; from django.contrib.auth import get_user_model
   v = os.environ.pop("OLD_SHARED_PASSWORD"); U = get_user_model()
   hits = [u.email for u in U.objects.filter(is_active=True).iterator() if u.check_password(v)]
   print(len(hits)); print("\n".join(hits))
   ```
   (`check_password` is slow by design; run it in the maintenance window.)
2. For each hit: real person → force a reset (`set_unusable_password()` + password-reset flow,
   which also blacklists their tokens); demo account → deactivate or set a unique random value.
3. Revoke sessions for every affected account (section 7).
4. **Verify**: re-run step 1, expect `0`.
5. **Rollback**: none needed for deactivation of demo accounts; real users recover via reset.

## 5. Django `SECRET_KEY` verification / rotation

1. **Verify** (no change): on the server, check that `DJANGO_SECRET_KEY` in
   `backend/taxi/.env.production` is set, ≥ 50 random characters, not `django-insecure…`, and not
   equal to any value in git history (compare SHA-256 fingerprints only; the historical values
   found by the audit look like placeholder text). `settings.py` refuses to start with an empty
   or `django-insecure` key when `DEBUG=False`.
2. **Rotate if** the current value was ever in git, chat, a ticket or a shared file, or if any
   section above found a compromise. Plan for the global logout.
3. Before rotating, set `CARD_QR_TOKEN_SECRET` to its own value if employee ID-card QR tokens
   must survive the rotation.
4. Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` directly into the
   password manager; update `DJANGO_SECRET_KEY` in `.env.production` (`chmod 600`).
5. Recreate app containers (same command as 2.4).
6. **Verify**: health endpoint; fresh logins work for rider, driver, courier, admin; old tokens
   are rejected (401); Django admin login works; push/WebSocket connections re-establish.
7. **Expected impact**: every user signs in again; 1–3 min restart.
8. **Rollback**: restore the previous value from `/root/backups` and recreate. Only if the new key
   breaks startup; the old key remains compromised.

## 6. Payment provider credentials

Settings: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BANKILY_API_KEY`,
`BANKILY_MERCHANT_ID`, `BANKILY_WEBHOOK_SECRET`, `MASRAVI_API_KEY`, `MASRAVI_WEBHOOK_SECRET`,
`SEDAD_API_KEY`, `SEDAD_WEBHOOK_SECRET`, `CARD_GATEWAY_SECRET_KEY`,
`CARD_GATEWAY_WEBHOOK_SECRET`, `BANK_TRANSFER_CLIENT_SECRET`.

1. **Verify** each configured value by fingerprint against git history and the audit inventory
   (the `sk_live_` strings found in commits `0f9a0eb5`/`d383cb82` look like placeholders;
   confirm by checking that their fingerprint differs from the configured key and that Stripe's
   dashboard shows no key with that suffix).
2. In each provider dashboard: review API-key creation dates, last-used dates and recent
   transactions/refunds/payouts for anything unexpected.
3. If a live value was ever exposed: create the new key in the provider dashboard → update
   `.env.production` → recreate app containers → verify a small real or sandbox transaction and a
   webhook delivery (signature check passes) → **then** revoke the old key in the dashboard.
   For webhook secrets, rotate in the dashboard and env together; providers that support
   multiple active secrets allow a zero-downtime overlap.
4. **Expected downtime**: payments for that provider fail between the env update and container
   restart (minutes). Cash rides are unaffected.
5. **Rollback**: until the old key is revoked, restore the old env value and recreate.

## 7. Session revocation

Per user (Django shell on the server):
```python
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from authapp.models import DeviceSession
u = get_user_model().objects.get(email="<email>")
n = 0
for t in OutstandingToken.objects.filter(user=u):
    _, created = BlacklistedToken.objects.get_or_create(token=t); n += created
DeviceSession.objects.filter(user=u).delete()
print("blacklisted", n)
```
(A logged-in user can do the same for themselves with `POST /auth/logout-all-devices/`.)

Global: rotating `DJANGO_SECRET_KEY` (section 5) is the only way to invalidate every access token
at once. Without it, revoked users keep a valid access token for up to
`JWT_ACCESS_TOKEN_MINUTES`.

Also: Django admin sessions (`django_session`) are invalidated by `SECRET_KEY` rotation, or by
`python manage.py shell -c "from django.contrib.sessions.models import Session; Session.objects.all().delete()"`.
Run `python manage.py flushexpiredtokens` afterwards to trim the blacklist tables.

**Verify**: a refresh with an old refresh token returns 401; `GET /auth/devices/` for the user is empty
until they log in again.

## 8. Production access-log review

Window: from the first push of an exposed credential (earliest affected commit date on
`origin/main`) to now.

1. **API logins** (nginx logs captured in 0.4): `POST /auth/login/`, `/auth/token/refresh/`,
   `/auth/2fa/verify/` for the exposed accounts' traffic: unusual IPs/ASNs/countries, bursts,
   user agents that are not the YALA apps or known QA scripts.
2. **Accounts**: `last_login` for the CEO, staff and QA accounts; `DeviceSession` rows
   (`ip_address`, `device_name`, `created_at`, `is_new_device=True`) for those users.
3. **Admin and money actions**: `security.AuditLog` filtered by the exposed accounts as `actor`,
   especially `admin_action`, `payment_change`, `refund`, `approve`/`reactivate`; payouts and
   withdrawals (`payments`) approved in the window; pricing changes (`PricingAuditLog`).
4. **Infrastructure**: SSH logins (`last`, `auth.log`), `docker` events, new users/keys in
   `~/.ssh/authorized_keys`, unexpected containers or cron entries.
5. **Database**: Postgres is not published outside the compose network; confirm with
   `ss -ltnp | grep 5432` on the host (expect nothing on a public interface).
6. Record findings in an incident note (who, what, when, evidence path). If anything suspicious
   is found: stop, preserve evidence, escalate before continuing rotations.

## After rotation

- Re-run the local scanners: `python scripts/secret_scan.py --all --summary` and
  `gitleaks git --redact --config .gitleaks.toml`.
- Decide with the owner whether to rewrite git history (BFG / `git filter-repo`) and force-push.
  That requires coordinating every clone and CI. Rotation is mandatory either way; a history
  rewrite is optional hardening.
- Enable GitHub secret scanning and push protection on the repository (repository settings →
  Code security), after the owner approves.
- Delete rollback values from the password manager once verification has held for 7 days.
