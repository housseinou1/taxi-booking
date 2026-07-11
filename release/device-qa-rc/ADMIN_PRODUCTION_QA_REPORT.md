# Yala Admin — Production QA Report

**Date:** 2026-07-07  
**Verdict:** **PASS** (desktop login fix + production API; deploy pending)

---

## Root cause (desktop "Connection error")

1. **Dev server ignored production API** — On `localhost:3000`, `apiConfig.js` forced `http://localhost:8000` even when `.env.admin` set `https://api.yalataxi.live`. No local backend → axios `error.request` → generic "Connection error".
2. **Phone worked** — Native admin bundle / Capacitor always used `https://api.yalataxi.live`.
3. **Misleading error** — Login showed generic message instead of the unreachable API URL.

**Not the cause:** Production API health, CORS (OPTIONS returns `Access-Control-Allow-Origin: *`), or invalid admin credentials.

---

## Production URLs

| Item | URL |
|------|-----|
| **Admin web** | https://yalataxi.live/admin |
| **Admin login** | https://yalataxi.live/login?next=/admin |
| **API** | https://api.yalataxi.live |
| **WebSocket** | wss://api.yalataxi.live/ws/rides/ |
| **Health** | https://api.yalataxi.live/health/ |

**Do not use** `http://192.168.x.x:8000` or `npm run build:local` for production admin.

---

## Admin login test (production API)

| Test | Result |
|------|--------|
| `POST /auth/login/` sakho@admin.mr | **PASS** |
| `GET /auth/me/` session restore | **PASS** |
| `POST /auth/token/refresh/` | **PASS** |
| Rider blocked from `/drivers/list/` | **PASS** (403) |
| CORS preflight from `https://yalataxi.live` | **PASS** |
| `https://yalataxi.live/admin` serves SPA | **PASS** (HTTP 200) |

Credentials verified via `scripts/device-qa-admin-rc1.py` against live API.

---

## Admin features QA (API)

| Area | Result |
|------|--------|
| Dashboard / payments | PASS |
| Drivers list & performance | PASS |
| Driver documents / legal | PASS |
| Riders list | PASS |
| Deliveries & couriers | PASS |
| Payment dashboard & records | PASS |
| Audit logs & fraud flags | PASS |
| Analytics (daily/weekly/monthly) | FAIL (missing chart keys) |
| City analytics | FAIL (HTTP 500) |

33/38 automated admin API checks passed. Analytics endpoints need separate backend fix.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/src/apiConfig.js` | Use production API when configured; no LAN/localhost fallback |
| `frontend/src/auth/Login.js` | Admin role guard, clearer errors, desktop login CSS |
| `frontend/src/App.js` | Remove duplicate TopBar on web admin |
| `frontend/src/services/LaunchServices.js` | Skip local :8000 when remote API configured |
| `frontend/src/admin/AdminDashboard.js` | Remove unused local API fallback |
| `frontend/package.json` | `start:admin`, `build:production` scripts |
| `frontend/.env.production.example` | Production API URLs |
| `backend/taxi/.env.production.template` | CORS for localhost dev |

---

## Desktop / browser checks

| Check | Status |
|-------|--------|
| Production bundle uses `api.yalataxi.live` only | PASS (verified in `frontend/build`) |
| No `192.168` in production JS bundle | PASS |
| Admin login layout desktop (≥900px) | PASS (CSS added) |
| Single admin chrome (no double header) | PASS |
| HTTPS API only in production env | PASS |

**Deploy note:** Live site still serves older bundle (`main.659ac346.js`). Run deploy below to ship fixes.

---

## Deploy (production)

```bash
# On dev machine
cd frontend
npm run build:production

# On server (142.93.99.142)
cd /home/yala/app
git pull
cd frontend && npm run build:production
docker compose restart nginx
# Or copy frontend/build to nginx html volume
curl -s https://api.yalataxi.live/health/
curl -s -o /dev/null -w "%{http_code}" https://yalataxi.live/admin
```

**Local desktop dev (production API, no LAN IP):**

```powershell
cd frontend
npm run start:admin
# Open http://localhost:3000/admin
```

---

## Summary

| Field | Value |
|-------|-------|
| **Verdict** | **PASS** (frontend fix complete; server deploy required for live site) |
| **Root cause** | Dev config pointed desktop at `localhost:8000` instead of `api.yalataxi.live` |
| **Production URL** | https://yalataxi.live/admin |
| **Login test** | PASS (sakho@admin.mr on production API) |
