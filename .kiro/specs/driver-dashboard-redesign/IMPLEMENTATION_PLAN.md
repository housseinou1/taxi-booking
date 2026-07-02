# Yala Driver Redesign — Implementation Plan

## Overview
Replace the current Yala Driver dashboard and profile with Uber-style green-themed premium UI matching the mockup provided.

## Phase 1: Driver Profile Page (DriverProfilePage.js + DriverProfilePage.css)

### Layout:
1. Top bar: ← Back + "Profile" title + ⚙ Settings
2. Hero: 112px photo ring + name + verified badge + "Partenaire de confiance" + ★ rating + vehicle + plate
3. Level card: Green gradient — level name + next level + progress bar + points
4. Wallet section: Balance + Payment methods + Payment history
5. Activity section: Detailed stats + Ride history + Earnings + Ratings (4.9 ★)
6. Documents: 4-card grid (License, Insurance, Registration, Vignette) with status badges
7. Support: Help center + Contact support
8. Logout: Red row
9. Bottom nav: Home | Rides | Online | Earnings | Profile

### API endpoints used:
- GET /drivers/me/ (profile data)
- GET /drivers/me/documents/ (document statuses)
- GET /rides/history/ (ride stats)

### CSS theme:
- --yala-green: #087a45
- --yala-green-dark: #034f2f
- --yala-gold: #f5b719
- Cards: white, 20px radius, professional shadows
- Level card: green gradient
- Wallet card: dark gradient (#17212d → #08121d)

## Phase 2: Driver Dashboard (DriverDashboardNew.js)

### New layout (on top of existing map + ride logic):
1. Header: Yala Driver logo + 🔔 notification + ☰ menu
2. Hero card: Photo + "Bonjour, Name" + ★ rating + Online pill + Vehicle photo
3. Wallet balance card: "12,450 MRU" + 💳 button
4. Earnings grid: Today / This week / This month / Acceptance rate (4 cards)
5. Goal/Bonus card: "Complete 50 rides this week for 5,000 MRU bonus" + progress + CTA
6. Shortcuts grid: 8 icons (My Rides, Earnings, Statistics, Ratings, Documents, Rewards, Support, Invite)
7. Recent activity: List of latest payments/bonuses
8. Bottom nav: Home | Rides | Online | Earnings | Profile

### Preserved from current code:
- Map (DriverMapView)
- WebSocket ride updates
- Go online/offline logic
- Ride request cards
- RideStatusButtons
- Sound alerts

## Phase 3: Hamburger Menu (HamburgerMenu.js)

### Menu items:
- Driver Profile
- Earnings
- Ride History
- Documents (with alert badge)
- Driver Code
- Driver Level
- Payment / Withdrawals
- Settings
- Help & Support
- Logout (danger red)

## Phase 4: Bottom Navigation

5 items across all driver screens:
- Home (⌂) → /driver
- Rides (🚗) → /driver/history
- Online (⏻) → toggle online/offline
- Earnings ($) → /driver/earnings
- Profile (👤) → /driver/profile

## Files to Modify:
1. frontend/src/driver/DriverProfilePage.js — REWRITE UI
2. frontend/src/driver/DriverProfilePage.css — REWRITE STYLES
3. frontend/src/driver/DriverDashboardNew.js — ADD new sections
4. frontend/src/driver/lyft-driver.css — UPDATE dashboard styles
5. frontend/src/driver/components/HamburgerMenu.js — UPDATE menu items
6. frontend/src/driver/components/HamburgerMenu.css — UPDATE styles

## Files NOT to touch:
- DriverDocuments.js (shared with Delivery)
- DriverProfileEditPage.js (shared with Delivery)
- DriverPayoutPanel.js (shared with Delivery)
- DriverMapView.js (shared with Delivery)
- MultiStopProgress.js (shared with Rider)
- rider/tokens.css (imported by driver-tokens.css)

## Design tokens (green theme):
```css
--yala-green: #087a45;
--yala-green-dark: #034f2f;
--yala-green-deep: #012d1c;
--yala-lime: #31d565;
--yala-gold: #f5b719;
--ink: #101827;
--muted: #667085;
--line: #e6ebe8;
--soft: #f6f8f7;
--danger: #d7193f;
```
