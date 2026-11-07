# Staging handoff — coordinated Admin + Moosyl RC

**Deploy artifact:** tag `coordinated-admin-moosyl-rc1.2` (after final commit)  
**Not authorized:** production deploy (G1), `PAYMENTS_LIVE_MODE` (G2)

## Deploy steps (staging only)

1. Checkout release branch `release/coordinated-admin-moosyl-rc1` at RC tag.
2. Backend: `migrate`, workers, `YALA_UAT_LOCAL` off; Moosyl sandbox keys from vault only.
3. Frontend: `npm run build:web` (not `build:admin`); run `scripts/verify-web-build.ps1`.
4. Upload `frontend/build` via `scripts/deploy-coordinated-frontend.ps1`.

## Execute on staging

| Test | Command / checklist |
|------|---------------------|
| Admin mock-equivalent | Spaced pilot logins; `admin-routes-auth.cjs` with staging creds |
| Moosyl sandbox | Items in `MOOSYL_INTEGRATION_STATUS.md` staging checklist |
| Wallet 0022 | Inventory on **sanitized prod copy** only |
| Rollback | `scripts/rollback-admin-redesign.sh` drill + backup timestamp |
| Rider / Driver / Delivery smoke | Existing regression scripts / manual smoke |

## Credentials

Load `scripts/qa-credentials.env` from vault — never commit.
