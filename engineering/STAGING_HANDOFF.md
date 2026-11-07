# Staging handoff — coordinated Admin + Moosyl RC

**Primary doc:** [`STAGING_RUNBOOK.md`](STAGING_RUNBOOK.md)  
**Blockers:** [`STAGING_BLOCKERS_AND_SETUP.md`](STAGING_BLOCKERS_AND_SETUP.md)  
**Branch (GitHub):** `release/coordinated-admin-moosyl-rc1`  
**Baseline:** `d30842bc` + `a9eb6141` on branch ancestry  
**Not authorized:** production (G1), live Moosyl (G2), final RC tag until staging PASS

Quick path:

1. `git fetch && git checkout release/coordinated-admin-moosyl-rc1`
2. Backend migrate + Celery on **staging** only
3. `npm run build:web` + `verify-web-build.ps1` → staging static upload
4. QA: `admin-routes-auth.cjs` with vault credentials (see `qa-credentials.env.example`)
5. Moosyl: `MOOSYL_INTEGRATION_STATUS.md` staging checklist
6. Evidence table in runbook §10 — then CEO approves final RC tag
