# Staging evidence log (coordinated RC) — template

**Do not store passwords, API keys, or PII in this file.**  
Copy per staging run: `engineering/staging-evidence/YYYYMMDD-coordinated-rc.md`

---

## Release pointer

| Field | Value |
|-------|--------|
| Branch | `release/coordinated-admin-moosyl-rc1` |
| Staging deploy commit | `git rev-parse HEAD` at deploy time |
| Includes `d30842bc` | yes / no |
| Includes `a9eb6141` | yes / no |
| Final RC tag | **pending** staging sign-off |

---

## Deployment

| Step | Status | Notes |
|------|--------|-------|
| Staging DB backup | ☐ | Snapshot ID: |
| Backend deploy | ☐ | |
| `migrate --plan` reviewed | ☐ | |
| `migrate` applied | ☐ | |
| Celery worker | ☐ | |
| Celery beat | ☐ | |
| `build:web` | ☐ | main.*.js sha256: |
| `verify-web-build` | ☐ | |
| Frontend upload | ☐ | |

---

## Admin QA (authenticated)

| Role | Routes/shell | Critical workflows | Notes |
|------|--------------|-------------------|-------|
| CEO | ☐ | ☐ | |
| HR | ☐ | ☐ | |
| Finance | ☐ | ☐ | |
| Ops | ☐ | ☐ | |

Commands: `admin-routes-auth.cjs`, `admin-pilot-functional.cjs` (staging URLs).

---

## Moosyl sandbox (`PAYMENTS_LIVE_MODE=0`)

| Provider | Request → simulate → webhook | Idempotency | Commission check |
|----------|------------------------------|-------------|----------------|
| Bankily | ☐ | ☐ | 70/30 taxi |
| Masrvi | ☐ | ☐ | 80/20 delivery |
| Sedad | ☐ | ☐ | 1% YALA fee |

---

## Wallet 0022 (sanitized DB only)

| Check | Status |
|-------|--------|
| `wallet_reference_inventory` | ☐ duplicate groups: |
| Migrate dry-run on copy | ☐ |
| Prod DB touched | **must be NO** |

---

## Rider / Driver / Delivery

| App | Smoke | Status |
|-----|-------|--------|
| Rider | ☐ | |
| Driver | ☐ | |
| Delivery | ☐ | |

---

## Backup / rollback drill

| Item | Status |
|------|--------|
| Pre-deploy backup verified | ☐ |
| Rollback executed on staging | ☐ |
| Rollback timestamp | |
| Restored to known-good | ☐ |

---

## Sign-off

| Role | Date | GO staging → prod prep |
|------|------|-------------------------|
| Engineering | | |
| CEO (G1/G2 separate) | | |
