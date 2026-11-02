# PR #19 ↔ Driver Documents/Performance — Navigation Coordination

Audience: Devin (owner of PR #19 `devin/yala-admin-dashboard-redesign`).
Status: **PR #19 was not modified.** This is a hand-off note so the two branches
merge without either design being overwritten.

---

## 1. What each branch owns

| | PR #19 (`devin/yala-admin-dashboard-redesign`) | PR #24 / #25 (this work) |
|---|---|---|
| Navigation | **Rewrites** `sidebarNavConfig.js` (275 lines): `nav()` helper, `GROUP_MODULE`, **string icon names** (`"taxi"`, `"user-check"`, `"file"`, `"chart"`) replacing emoji | **Does not redesign navigation.** Adds driver-module entries only |
| Route guard | `adminRouteAccess.js`: renames 3 `MODULE_LABELS` values | `adminRouteAccess.js`: adds **6 new paths** to `PATH_MODULE_MAP` |
| App routes | `App.js`: title strings + one helper. **Does not touch** the `currentPath ===` chain or the `page ===` render chain | `App.js`: adds 2 imports, 5 path→page mappings, 2 render blocks — different regions |
| Pages | Shell/sidebar/header/icons/theme (`AdminShell.css` +847, `AdminIcon.js`, …) | 5 new driver pages + their tests |

**Conflict assessment:** no file is edited in the same region by both branches.
`App.js` and `adminRouteAccess.js` should auto-merge. `sidebarNavConfig.js` is
rewritten by PR #19, so PR #19's version should win there — see §3.

---

## 2. New routes this work registers

These are real, tested pages. `PATH_MODULE_MAP` (in `adminRouteAccess.js`) now maps
them, and an unmapped admin path is **default-denied** — it falls through to the
landing page. So if PR #19's nav does not point at them, the pages exist but are
unreachable.

| Path | Page | Module | Source of truth for access |
|---|---|---|---|
| `/admin/driver-documents` | Driver Documents register | `drivers` | `PATH_MODULE_MAP` |
| `/admin/driver-verification` | Document Verification queue | `drivers` | `PATH_MODULE_MAP` |
| `/admin/driver-performance` | Driver Performance console | `drivers` | `PATH_MODULE_MAP` |
| `/admin/driver-ratings` | Driver Ratings view | `drivers` | `PATH_MODULE_MAP` |
| `/admin/driver-activity` | Driver Activity view | `drivers` | `PATH_MODULE_MAP` |
| `/admin/driver-safety` | Reuses the **existing** Trust & Safety Center | `trust_safety` | `PATH_MODULE_MAP` |

`/admin/driver-safety` is deliberately in the `trust_safety` module because it
renders the existing Trust & Safety Center, not a second implementation.

---

## 3. Requested change in PR #19's `sidebarNavConfig.js`

PR #19's `drivers-fleet` group currently contains:

```js
nav("driver-documents", "Driver Documents", "/admin/approvals?tab=drivers", "file"),
nav("drivers-dashboard", "Performance Monitoring", "/admin/drivers/dashboard", "chart"),
```

Those two point at **existing** pages. To reach the new modules instead, the
suggested edit (2 lines, PR #19's own helper and icon vocabulary preserved):

```diff
-      nav("driver-documents", "Driver Documents", "/admin/approvals?tab=drivers", "file"),
-      nav("drivers-dashboard", "Performance Monitoring", "/admin/drivers/dashboard", "chart"),
+      nav("driver-documents", "Driver Documents", "/admin/driver-documents", "file"),
+      nav("driver-verification", "Document Verification", "/admin/driver-verification", "check-square"),
+      nav("driver-performance", "Driver Performance", "/admin/driver-performance", "chart"),
+      nav("driver-ratings", "Driver Ratings", "/admin/driver-ratings", "star"),
+      nav("driver-activity", "Driver Activity", "/admin/driver-activity", "activity"),
+      nav("driver-safety", "Driver Safety", "/admin/driver-safety", "shield"),
```

**Notes / decisions for Devin:**

1. The paths use `/admin/driver-*` (singular `driver`) on purpose: `/admin/drivers`
   and `/admin/drivers/dashboard` are already taken by the Driver Management hub and
   Drivers Dashboard, and the nav test forbids two entries sharing a path.
2. If you prefer to keep "Performance Monitoring" pointing at
   `/admin/drivers/dashboard`, that is fine — but then
   `/admin/driver-performance` is unreachable from the sidebar. The path is still
   valid and mapped, so a deep link works.
3. `Driver Safety` needs a `shield` (or similar) icon; add it to `AdminIcon.js` if it
   does not exist yet.
4. **Keep `nav("drivers", "Driver Management", "/admin/drivers", ...)`** — the
   directory page. The driver list is not renamed by this work.
5. This work does **not** assert your group label or section taxonomy. The nav tests
   added here pin the group by `id: "drivers-fleet"` and its children by
   `label`/`path`/`module`, so renaming "Drivers & Fleet" does not break them.

---

## 4. What this work deliberately did NOT do

* Did not edit PR #19's branch, `AdminSidebar.js`, `AdminShell.js`, `AdminShell.css`,
  `AdminIcon.js`, `AdminHeader.js`, `AdminBreadcrumbs.js` or the theme.
* Did not introduce emoji icons into PR #19's string-icon vocabulary.
* Did not move, rename or restyle any existing sidebar entry.
* Did not change any `MODULE_LABELS` value (PR #19 owns those renames).

## 5. Pre-existing navigation work removed from PR #24

PR #24 initially also committed an **unrelated 12-section navigation restructure**
that was already sitting uncommitted in the shared working tree (it renames sections
such as "Operations" → "Operations Management" and "Drivers & Fleet" →
"Drivers & Fleet Management"). That is **not** part of this work and has been
separated out of PR #24: the committed `sidebarNavConfig.js` is now the baseline
file plus only the Driver Management dropdown entries above. The 12-section work
remains in the working tree, untouched, so it can land through whichever branch owns
it.

## 6. Remaining conflict: the nav TEST file (needs a decision)

This is the one conflict that cannot auto-resolve, and it needs Devin's awareness.

Both branches modify
`frontend/src/admin/layouts/permissions/__tests__/sidebarNavConfig.test.js`:

* **PR #19** changes `REQUIRED_GROUPS` (`"CEO Command Center"` → `"CEO Dashboard"`),
  changes `REQUIRED_PAGES` (`"Support Dashboard"` → `"Support Tickets"`,
  `"Payment Management"` → `"Transactions"`), strips query strings from nav paths
  (`leaf.path.split("?")[0]`, needed because his nav uses
  `/admin/approvals?tab=drivers`), and adds a `resolveActiveNav` suite.
* **PR #24** appends one `describe("Driver Management dropdown")` block.

These are different regions, so git will likely auto-merge. **The problem is
semantic, not textual:** my block asserts that the `drivers-fleet` group contains
these children:

| Label | Path | Module |
|---|---|---|
| Driver Overview | `/admin/drivers/dashboard` | `drivers` |
| Driver Management | `/admin/drivers` | `drivers` |
| Driver Applications | `/admin/approvals` | `drivers` |
| Driver Documents | `/admin/driver-documents` | `drivers` |
| Document Verification | `/admin/driver-verification` | `drivers` |
| Driver Performance | `/admin/driver-performance` | `drivers` |
| Driver Ratings | `/admin/driver-ratings` | `drivers` |
| Driver Activity | `/admin/driver-activity` | `drivers` |
| Driver Safety | `/admin/driver-safety` | `trust_safety` |

PR #19's group currently has `"Driver Management"`, `"Driver Approvals"`,
`"Vehicle Management"`, `"Fleet Management"`, `"Driver Documents"` →
`/admin/approvals?tab=drivers`, `"Performance Monitoring"` →
`/admin/drivers/dashboard`, `"Driver Academy"`, `"Hall of Fame"`.

**Consequence if PR #19 merges without applying §3:** 7 of my 9 assertions fail.
That failure is **intentional and useful** — it is the guard that stops the new
Driver Documents / Performance / Ratings / Activity pages from silently becoming
unreachable (an unmapped path is default-denied and falls through to the landing
page). It is better for CI to fail loudly than for the modules to quietly disappear.

**Two acceptable resolutions:**

1. **Preferred — apply §3.** Devin adds the six `nav(...)` lines and keeps
   `"Driver Documents"` and `"Driver Performance"` as labels. My tests then pass
   unchanged.
2. **If Devin keeps his own labels/paths**, then either
   (a) he also updates my `DRIVER_MANAGEMENT_ENTRIES` table in the test to match his
   labels, or (b) we agree which of the six new routes are exposed in the sidebar,
   and my block is trimmed to that agreed set. Either way the *routes* stay registered
   in `PATH_MODULE_MAP`, so deep links keep working.

**What I will not do:** weaken my assertions to pass vacuously. A nav test that does
not check the nav is worse than no test.

## 7. Merge-order recommendation

1. Land PR #19 (it rewrites the shell, sidebar, icons and nav config).
2. Then rebase this work and apply §3 (6 lines) plus the label reconciliation in §6.
3. Re-run `sidebarNavConfig.test.js`; it is the acceptance check for the integration.

Nothing here blocks PR #19 — it can merge exactly as designed. This work is the
follower.

