# Staging blockers and secure setup (coordinated RC)

**Status:** Staging execution **not completed from dev workspace** — infrastructure and vault items below are required.

---

## Blockers (must be resolved by ops / CEO)

| ID | Blocker | Exact requirement | In git? |
|----|---------|-----------------|--------|
| B1 | **Staging host** | SSH + deploy user; path to Django app and static `build` root; URL for staging www and API | No |
| B2 | **Staging database** | PostgreSQL connection string in vault; **isolated** from production | No |
| B3 | **Celery broker** | Staging Redis (or equivalent); worker/beat compose service names | No |
| B4 | **Moosyl sandbox** | `MOOSYL_API_KEY`, `MOOSYL_SECRET`, webhook signing secret, sandbox base URL — Moosyl dashboard | **Never** |
| B5 | **4-role staging accounts** | CEO, HR, Finance, Ops staff users + passwords OR map to `seed_pilot_uat` on staging only | **Never** |
| B6 | **Sanitized prod-like DB** | Read-only copy for wallet 0022 inventory/migrate dry-run | No prod writes |
| B7 | **QA credential file** | Copy `scripts/qa-credentials.env.example` → `qa-credentials.env` on ops machine; fill from vault | **Never commit** |

---

## Secure setup instructions

### Staging environment file (server vault template)

Create on staging server only (e.g. `/opt/yala/.env.staging`):

```bash
# Django
DATABASE_URL=postgresql://...(staging)
SECRET_KEY=...(rotate per env)
DEBUG=0
ALLOWED_HOSTS=staging-www.example,staging-api.example

# Payments — sandbox only
PAYMENTS_LIVE_MODE=0
MOOSYL_BASE_URL=...(sandbox URL from Moosyl)
MOOSYL_API_KEY=...
MOOSYL_SECRET=...
MOOSYL_WEBHOOK_SECRET=...

# Celery
CELERY_BROKER_URL=redis://127.0.0.1:6379/1
```

Load via your existing Docker Compose or systemd — **do not** paste values into tickets or git.

### Pilot / QA accounts (staging only)

```bash
export YALA_UAT_LOCAL=0   # use real broker on staging if needed
export YALA_PILOT_UAT_PASSWORD='...(vault-generated)'
python manage.py seed_pilot_uat --riders 10 --drivers 5 --couriers 3
```

Map roles in local ops file from [`scripts/qa-credentials.env.example`](../scripts/qa-credentials.env.example):

```bash
YALA_API_URL=https://staging-api.example
YALA_CEO_EMAIL=ceo@pilot.yala.test
YALA_CEO_PASSWORD=...
YALA_HR_EMAIL=hr@pilot.yala.test
# etc.
```

Run QA from operator laptop:

```bash
cd frontend && node qa/admin-routes-auth.cjs https://staging-www.example
```

### Moosyl webhook (staging)

1. Register staging HTTPS webhook URL in Moosyl sandbox (e.g. `https://staging-api.example/payments/webhooks/moosyl/`).
2. Use signing secret in `MOOSYL_WEBHOOK_SECRET` only on staging.
3. Run checklist in `MOOSYL_INTEGRATION_STATUS.md`.

### Wallet 0022

1. Restore **sanitized** dump to `staging-wallet-drill` database.
2. `python manage.py wallet_reference_inventory` → attach JSON to evidence (no PII).
3. `migrate --plan` then `migrate` on **that** DB only.
4. **Do not** run on production until finance sign-off.

---

## What was completed without staging (local evidence)

| Item | Result |
|------|--------|
| Release branch push | See GitHub `release/coordinated-admin-moosyl-rc1` |
| Commits `d30842bc`, `a9eb6141` | On branch ancestry |
| Mock admin 100/100 | `admin-routes-auth-mock.cjs` |
| 4-role critical + RBAC | `admin-routes-auth-roles-mock.cjs` |
| Live pilot CEO 100/100 (local API build) | One session before rate limit |
| Moosyl Django tests | Pass with `MOOSYL_*` cleared |
| Wallet inventory (local DB) | 0 duplicate groups |
| `build:web` + verify gates | PASS |

**Not executed:** staging deploy, Moosyl provider E2E on staging, sanitized prod-like 0022, backup drill on staging host.

---

## Contact for unblock

| Need | Owner |
|------|--------|
| Staging VM / DNS | Ops |
| Vault secrets | CEO / Finance |
| Moosyl sandbox dashboard | Finance |
| DBA sanitized copy | DBA + CEO |
