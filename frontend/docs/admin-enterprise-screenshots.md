# Admin enterprise UI — screenshot checklist

Run the admin app locally (`npm run start:admin` or your usual flow), sign in with a role that can see the modules below, then capture PNGs from the browser (F12 device toolbar for mobile where noted).

**Suggested filenames** (save under `frontend/docs/screenshots/admin-enterprise/` or attach to the PR):

1. `executive-dashboard.png` — `/admin` executive home (embedded dashboard).
2. `topnav-dropdown-desktop.png` — open any primary nav group (e.g. Fleet) with the dropdown visible.
3. `topnav-mobile.png` — viewport &lt; 1024px, hamburger → full-screen nav with one group expanded.
4. `drivers-management.png` — `/admin/drivers` (table + filters).
5. `fleet-vehicles.png` — `/admin/vehicles` or `/admin/fleet` (whichever your role allows).
6. `riders-management.png` — `/admin/riders`.
7. `delivery-directory.png` — `/admin/delivery/directory` (or main delivery hub).
8. `finance-ops.png` — `/admin/finance-ops`.
9. `hr-employees.png` — `/admin/employees`.
10. `trust-safety.png` — `/admin/trust-safety`.
11. `reports-bi.png` — `/admin/business-intelligence` (or board reports if BI is unavailable).

These files are **not** committed automatically; add them when you have credentials and a running API.
