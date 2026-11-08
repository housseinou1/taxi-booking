# Coordinated frontend release — YALA website + SEO (frontend-only)

**Branch:** `release/coordinated-admin-moosyl-rc1`  
**Base website commit:** `3dbca421` (marketing site, nav, cities)  
**Production today:** `413b3e58` / `main.8c8a9bcd.js` (no static `sitemap.xml`)  
**GSC:** Verified via DNS TXT — no HTML verification token in build.

## Scope (this release)

| In scope | Out of scope |
|----------|----------------|
| `frontend/build/` → nginx `/usr/share/nginx/html` | Backend, API, Moosyl |
| `sitemap.xml`, `robots.txt`, `index.html` shell SEO | DB migrations |
| `websiteSeo.js` + `WebsiteApp` hook | DigitalOcean resize / new droplets |
| Marketing routes under `/`, `/about`, `/website/*` | Payments config |

## Pre-deploy (CEO GO required)

1. **Snapshot:** `pre-website-deploy-YYYYMMDD-HHMMSS` on server (`BACKUP_VERIFY=OK`).
2. **Build** (release commit on build host):
   ```powershell
   cd frontend
   npm ci
   npm run build
   ```
3. Confirm `build/sitemap.xml` exists and `build/robots.txt` contains `Sitemap:`.
4. Record `build/index.html` and `build/static/js/main.*.js` hashes.

## Deploy (frontend-only)

1. Rsync or copy **only** `frontend/build/*` to production nginx html root (same path as prior homepage deploy).
2. Confirm `sitemap.xml` is a **file** on disk (not SPA fallback).
3. **Smoke:**
   - `curl -sI https://www.yalataxi.live/sitemap.xml` → not `text/html`
   - `curl -sI https://www.yalataxi.live/robots.txt`
   - `/`, `/login`, `/admin`, `/website/rider`, `/privacy` → **200**
   - `https://api.yalataxi.live/health/` → **200** (unchanged)

## Post-deploy SEO (CEO / ops)

See `engineering/SEO_POST_DEPLOY_VERIFICATION_CHECKLIST.md` — submit sitemap in existing GSC property.

## Rollback

1. Restore prior html tree from latest `pre-website-deploy-*` backup (documented in `FRONTEND_PRODUCTION_DEPLOY_READY.md`).
2. Or run: `scripts/rollback-admin-redesign.sh <backup-path>` if applicable to html bundle.
3. Re-smoke `/` and `/sitemap.xml` (old behavior may return HTML for sitemap until re-deploy).

## Preserve production functionality

- No change to Django containers, env, or static admin path.
- Rider/Driver/Delivery **app routes** unchanged; only marketing SEO + static files.
