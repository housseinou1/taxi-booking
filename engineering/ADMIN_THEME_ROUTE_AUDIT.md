# YALA Admin — Mauritanian theme route audit

**Branch:** `feature/admin-enterprise-top-nav`  
**Palette (flag):** Green `#006233`, Gold `#FFC400`, Red `#D01C1F` — `yalaAdminDesignTokens.css` + `yalaAdminTricolor.css`  
**Layers:** `mauritaniaAdminTheme.css` → `adminThemeEnforcement.css` → `yalaAdminTricolor.css` (last in `AdminShell.js`)  
**KPI:** `admin-kpi` / `fleet-kpi` — emerald gradient, gold label/value, gold top + red right accent (no white cards)  
**Default theme:** `dark` (`AdminThemeContext.js`)

## Design system (completed in repo)

| Item | Status |
|------|--------|
| Central CSS tokens (`yalaAdminDesignTokens.css`) | Done (flag hex) |
| Tricolor shell + KPI frame (`yalaAdminTricolor.css`) | Done |
| Top nav + tables (`mauritaniaAdminTheme.css`) | Done |
| Legacy module sweep (`adminThemeEnforcement.css`) | Done |
| Header icons → SVG (`AdminHeader.js` + `AdminTopNavIcons.js`) | Done |
| No left sidebar restore | Confirmed (top nav only) |
| Business logic / RBAC untouched | Confirmed (visual layer only) |

## Per-page tricolor checklist (CEO visual sign-off)

For each route, confirm in browser (not code-only):

| Check | Pass criteria |
|-------|----------------|
| Green | Page background + cards clearly `#006233` family |
| Gold | Nav active tab, KPI values, section titles, primary buttons `#FFC400` |
| Red | Header/nav hairline, KPI right edge, flag stripe, badges — visible but not “error only” |
| KPI | No large white metric cards; emerald + gold/red accents |
| Readability | Ivory text on green; gold on green meets contrast |

## Browser verification legend

| Code | Meaning |
|------|---------|
| **AUTO** | Wired via AdminShell tricolor layers; not visually checked this session |
| **MANUAL** | CEO/staff must open route and tick checklist above |
| **VERIFIED** | Screenshot saved + all five checks passed |

**Honest completion:** **NOT 100%** until every row is **VERIFIED** with screenshots (Executive, Approval, Fleet, Cities, Finance minimum set).

## Admin routes (from `frontend/src/App.js`)

| Route | Module | Theme wiring | Browser |
|-------|--------|--------------|---------|
| `/admin` | Operations Console (home) | AUTO | MANUAL |
| `/admin/classic` | Legacy admin dashboard | AUTO | MANUAL |
| `/admin/share-analytics` | Share analytics | AUTO | MANUAL |
| `/admin/payments` | Payments | AUTO | MANUAL |
| `/admin/executive` | Executive Dashboard | AUTO | MANUAL |
| `/admin/ops-center` | Ops Center Home | AUTO | MANUAL |
| `/admin/ops-center/live` | Live Operations | AUTO | MANUAL |
| `/admin/ops-center/finance` | Financial Overview | AUTO | MANUAL |
| `/admin/ops-center/command` | Executive Command | AUTO | MANUAL |
| `/admin/launch` | Launch Command | AUTO | MANUAL |
| `/admin/operations` | Operations hub | AUTO | MANUAL |
| `/admin/ai-operations` | AI Operations | AUTO | MANUAL |
| `/admin/status` | Production Status | AUTO | MANUAL |
| `/admin/business` | Business Hub | AUTO | MANUAL |
| `/admin/beta` | Beta Dashboard | AUTO | MANUAL |
| `/admin/business-accounts` | Business Accounts | AUTO | MANUAL |
| `/admin/fleet` | Fleet Performance | AUTO | MANUAL |
| `/admin/vehicles` | Vehicle Management | AUTO | MANUAL |
| `/admin/cities` | City Management | AUTO | MANUAL |
| `/admin/administration/city-transfers` | City transfer approvals | AUTO | MANUAL |
| `/admin/employees` | Employees | AUTO | MANUAL |
| `/admin/attendance` | Attendance | AUTO | MANUAL |
| `/admin/hr` | HR Management | AUTO | MANUAL |
| `/admin/verification` | Employee verification | AUTO | MANUAL |
| `/admin/break-notifications` | Break notifications | AUTO | MANUAL |
| `/admin/finance-ops` | Finance Operations | AUTO | MANUAL |
| `/admin/finance-approvals` | Refund & payout approvals | AUTO | MANUAL |
| `/admin/operations-control` | Operations Control | AUTO | MANUAL |
| `/admin/ops-control` | Alias → operations control | AUTO | MANUAL |
| `/admin/command` | Command (alias) | AUTO | MANUAL |
| `/admin/operations-command` | Launch command (dup route) | AUTO | MANUAL |
| `/admin/growth` | Growth expansion | AUTO | MANUAL |
| `/admin/multi-city` | Multi-city ops | AUTO | MANUAL |
| `/admin/smart-pricing` | Smart pricing (alias) | AUTO | MANUAL |
| `/admin/pricing-dispatch` | Smart pricing dispatch | AUTO | MANUAL |
| `/admin/trust-safety` | Trust & Safety (alias) | AUTO | MANUAL |
| `/admin/safety` | Trust & Safety | AUTO | MANUAL |
| `/admin/driver-safety` | Driver safety (alias) | AUTO | MANUAL |
| `/admin/approvals` | Approval Center | AUTO | MANUAL |
| `/admin/incentives` | Driver incentives | AUTO | MANUAL |
| `/admin/incentive-engine` | Incentives (alias) | AUTO | MANUAL |
| `/admin/merchant-platform` | Merchants (alias) | AUTO | MANUAL |
| `/admin/merchants` | Merchant platform | AUTO | MANUAL |
| `/admin/partner-platform` | Partners (alias) | AUTO | MANUAL |
| `/admin/partners` | Partner platform | AUTO | MANUAL |
| `/admin/customer-growth` | Customer growth (alias) | AUTO | MANUAL |
| `/admin/loyalty` | Customer growth | AUTO | MANUAL |
| `/admin/ceo` | Executive overview | AUTO | MANUAL |
| `/admin/ceo-master` | CEO Command Center | AUTO | MANUAL |
| `/admin/ceo-control` | CEO control | AUTO | MANUAL |
| `/admin/ceo-reports` | CEO reporting | AUTO | MANUAL |
| `/admin/board-reports` | Board reporting | AUTO | MANUAL |
| `/admin/compliance-governance` | Compliance & governance | AUTO | MANUAL |
| `/admin/bi` | BI (alias) | AUTO | MANUAL |
| `/admin/business-intelligence` | BI Analytics | AUTO | MANUAL |
| `/admin/api-gateway` | API gateway (alias) | AUTO | MANUAL |
| `/admin/integration` | API gateway | AUTO | MANUAL |
| `/admin/academy` | Academy | AUTO | MANUAL |
| `/admin/beta-feedback` | Support (alias) | AUTO | MANUAL |
| `/admin/support` | Beta feedback / support | AUTO | MANUAL |
| `/admin/rides` | Ride management | AUTO | MANUAL |
| `/admin/rides/live` | Rides live (alias) | AUTO | MANUAL |
| `/admin/rides/reports` | Ride reports | AUTO | MANUAL |
| `/admin/drivers` | Drivers management | AUTO | MANUAL |
| `/admin/drivers/dashboard` | Drivers dashboard | AUTO | MANUAL |
| `/admin/driver-documents` | Driver documents | AUTO | MANUAL |
| `/admin/driver-verification` | Driver verification | AUTO | MANUAL |
| `/admin/driver-performance` | Driver performance | AUTO | MANUAL |
| `/admin/driver-ratings` | Driver ratings | AUTO | MANUAL |
| `/admin/driver-activity` | Driver activity | AUTO | MANUAL |
| `/admin/riders` | Riders management | AUTO | MANUAL |
| `/admin/riders/dashboard` | Riders dashboard | AUTO | MANUAL |
| `/admin/delivery` | Delivery management | AUTO | MANUAL |
| `/admin/deliveries` | Deliveries alias | AUTO | MANUAL |
| `/admin/delivery/support` | Delivery support | AUTO | MANUAL |
| `/admin/delivery/directory` | Deliveries directory | AUTO | MANUAL |
| `/admin/delivery/cities` | Delivery city analytics | AUTO | MANUAL |
| `/admin/delivery/couriers` | Couriers | AUTO | MANUAL |
| `/admin/delivery/merchants` | Delivery merchants | AUTO | MANUAL |
| `/admin/security` | Security operations | AUTO | MANUAL |
| `/admin/security/audit` | Security audit | AUTO | MANUAL |
| `/admin/security/fraud` | Fraud | AUTO | MANUAL |
| `/admin/withdrawals` | Withdrawals monitoring | AUTO | MANUAL |
| `/admin/withdrawal-accounts` | Withdrawal accounts | AUTO | MANUAL |
| `/admin/hall-of-fame` | Hall of fame | AUTO | MANUAL |
| `/admin/roles` | Roles & permissions | AUTO | MANUAL |

## Local visual QA checklist

1. `frontend/.env.local`: `REACT_APP_TYPE=admin`
2. Clear stale theme: `localStorage.removeItem('yala_admin_theme')` (or set dark in header)
3. `npm start` in `frontend/` + Django on `:8000`
4. Sign in with staff user; walk each route above
5. Capture PNGs: `frontend/qa/_regress-smoke.cjs` or manual saves to `frontend/docs/screenshots/runtime/`

## Build / test (record on each release candidate)

```bash
cd frontend
npm run build:admin
CI=true npm test -- --watchAll=false --testPathPattern=admin/home
```

## Known follow-ups (not blocking theme wiring)

- Replace remaining emoji KPI/nav icons in individual modules (header done)
- Gradually refactor module CSS `background: #fff` to tokens (enforcement covers display until refactored)
- Per-route **VERIFIED** column after CEO review pass

## Deploy policy

No merge or production deploy without explicit CEO approval.
