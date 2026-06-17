# Driver Hamburger Menu — Tech Design

## Overview

The `HamburgerMenu` component already exists at `frontend/src/driver/components/HamburgerMenu.js` with full implementation (slide-out drawer, profile header, level badge, menu items, close behavior). It just needs to be connected to the `DriverDashboard.js`.

## Changes Required

**File:** `frontend/src/driver/DriverDashboard.js`

1. Import `HamburgerMenu` from `./components/HamburgerMenu`
2. Add `menuOpen` state (`useState(false)`)
3. Add a ☰ hamburger button in the top bar (left side, before profile area)
4. Render `<HamburgerMenu>` with `isOpen={menuOpen}`, `onClose`, `driverProfile`, `onNavigate`, `onLogout`
5. Wire `onLogout` to existing `logout` function

**No backend changes.** No new components needed. The `HamburgerMenu.js` and `HamburgerMenu.css` are already complete.

## Existing Component Props

```
HamburgerMenu({
  isOpen,           // boolean — controls drawer visibility
  onClose,          // function — closes the drawer
  driverProfile,    // { first_name, last_name, profile_picture, level, points, nextLevelPoints }
  onNavigate,       // function(path) — navigates to a route
  onLogout,         // function — clears tokens and redirects
})
```

## Menu Items (already configured in component)

1. 👤 Driver Profile → `/driver/profile`
2. 💰 Earnings → `/driver/earnings`
3. 🕒 Ride History → `/driver/history`
4. 📄 Documents → `/driver/documents`
5. 🔑 Driver Code → `/driver/code`
6. ⭐ Driver Level → `/driver/achievements`
7. 💳 Payment / Withdrawals → `/driver/earnings`
8. ⚙️ Settings → `/settings`
9. ❓ Help & Support → `/driver/support`
10. 🚪 Logout → clears tokens, redirects to /login
