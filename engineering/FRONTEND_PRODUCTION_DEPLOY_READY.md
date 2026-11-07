# Frontend production deploy — completed 2026-11-07

**Status:** **EXECUTED** (frontend-only, CEO GO).

---

# Archive — authorization package (pre-deploy)

## 1. GitHub push (completed)

| Ref | Remote peeled commit |
|-----|----------------------|
| `release/coordinated-admin-moosyl-rc1` | `3d15e9b8` |
| `coordinated-admin-moosyl-rc1.4` | `3af1b7d1` |
| `coordinated-admin-moosyl-rc1.5` | `69be7f60` |
| `coordinated-admin-moosyl-rc1.6` | `1c3bd8c7` |

`main` **not** merged.

## 2. Production frontend commit

| Item | Value |
|------|--------|
| **Code baseline** | `69be7f60` (`rc1.5`) + **prod-legacy UI gates** (commit after push) |
| **Build command** | `REACT_APP_PROD_LEGACY_BACKEND=1 npm run build:web` |
| **Gates** | Hides Moosyl Admin tab, ID-card nav/actions; rider checkout shows cash/card only |

## 3. Verified artifact (legacy-gated)

| Field | Value |
|-------|--------|
| Bundle | `main.82b6aa37.js` |
| SHA-256 | `F9CBBEB9CFC7265181D86C2E4A26231589797E3C5FB98C592B30B500006A9F29` |
| `verify-web-build.ps1` | **PASS** |
| Live (pre-deploy) | `main.42271995.js` |

## Deploy record (2026-11-07)

| Field | Value |
|-------|--------|
| Commit | `78ccffa46fa862b56dd84f6154d1b69861cb9bd8` |
| Bundle | `main.82b6aa37.js` |
| index.html SHA256 | `650DF94D83CFA1952A5C78DF7940787E97825E0148A14F9E6BF8A8502639496B` |
| Backup | `/home/yala/pre-website-deploy-20261107-080137` |
| Pre-deploy index SHA | `c99367923e9995f9f41dba12a1c6df56425c667eac8e7f07a95989233ed19ece` |
| Rollback | `scripts/rollback-admin-redesign.sh /home/yala/pre-website-deploy-20261107-080137` |

Smoke: www/api health **200**; `/login` `/admin` `/rider` `/driver` `/delivery/courier` `/privacy` **200**; live bundle verified; `REACT_APP_MOOSYL_UI_ENABLED=0` in bundle.

## 4. Execute (CEO explicit GO only)

```powershell
cd frontend
$env:REACT_APP_PROD_LEGACY_BACKEND='1'
npm run build:web
..\scripts\verify-web-build.ps1 -BuildDir .\build
..\scripts\deploy-admin-redesign.ps1 -BuildDir .\build
```

Rollback: `scripts/rollback-admin-redesign.sh /home/yala/pre-website-deploy-<STAMP>`
