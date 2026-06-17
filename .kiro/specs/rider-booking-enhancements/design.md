# Rider Booking Enhancements — Tech Design

## Overview

This design enhances the existing Rider Dashboard (`RiderDashboard.js`) with GPS auto-fill for pickup, a dedicated drop-off search field, conditional ride type pricing, a structured profile menu, and payment method management. The design maintains the current dashboard layout and improves it incrementally — no full redesign.

Key constraint: **Continue improving the current version. Do not redesign the dashboard.**

## Architecture Summary

### Current State
- `RiderDashboard.js` uses simple `<input>` elements with `<datalist>` for pickup/destination
- No GPS auto-fill — pickup defaults to `MARKET.defaultPickup.label`
- Ride types displayed as inline buttons, fares partially hidden when no destination (already has `showFare` guard)
- `LocationInput` component exists (debounced autocomplete) but is NOT used in the dashboard
- `ProfilePages.js` has basic panels but no structured navigation menu
- Payment API endpoints exist (`/payments/methods/`, `/payments/methods/save/`, etc.)
- `AddPaymentMethod.js` and `SavedPaymentMethods.js` components exist

### Target State
- Replace the pickup `<input>` with GPS auto-fill + "Current Location" indicator
- Replace destination `<input>` with a dedicated "Drop-off" search field using `LocationInput` component
- Hide entire ride options section until destination is selected
- Add structured profile menu to the rider's account panel
- Add payment method selector on booking confirmation

---

## Component Design

### 1. GPS Auto-fill for Pickup (Requirement 1)

**File:** `frontend/src/rider/RiderDashboard.js`

**Changes:**
- Add a `useEffect` on component mount that calls `navigator.geolocation.getCurrentPosition()`
- Store GPS result in new state: `gpsPosition` (lat/lng) and `gpsLabel` (reverse-geocoded or "Current Location")
- Auto-fill `pickup` state with GPS label when resolved
- Add `gpsLoading` state to show "Finding your location..." placeholder
- Add `gpsError` state for permission denial fallback

**GPS Flow:**
```
Mount → navigator.geolocation.getCurrentPosition()
  → Success: set gpsPosition, match to nearest MARKET location or use "Current Location"
  → Error: set gpsError, leave pickup empty for manual entry
```

**UI Changes to Pickup Field:**
- When GPS-filled: show 📍 icon + "Current Location" label (or nearest named location)
- When loading: show spinner + "Finding your location..."
- When error: show empty field with placeholder "Enter pickup location"
- Rider can still tap to override (existing behavior preserved)

**Matching GPS to known locations:**
- Use `calculateDistanceKm(gpsPosition, location.position)` to find nearest location within 500m
- If match found: use location label; if not: use "Current Location" with raw coordinates

### 2. Dedicated Drop-off Search Field (Requirement 2)

**File:** `frontend/src/rider/RiderDashboard.js`

**Changes to the route editor section (lines ~1500-1580):**

Replace the existing `<input list="mauritania-locations" ... destination>` with the `LocationInput` component:

```jsx
<LocationInput
  label="Drop-off"
  value={destination}
  city={city}
  savedPlaces={savedPlaces}
  onSelect={(loc) => {
    setDestination(loc.label);
    // Trigger route calculation
  }}
  onFocus={() => { /* expand bottom sheet if needed */ }}
/>
```

**Visual layout (maintain current dots + line design):**
```
● Pickup: [GPS auto-filled / editable input]
│ (dotted vertical line)
◉ Drop-off: [LocationInput with autocomplete]
```

Keep the existing `routeDotsStyle`, `pickupDotStyle`, `routeLineStyle`, `dropoffDotStyle` for visual indicators. Replace the raw `<input>` for destination with `LocationInput`.

The pickup field remains a simpler input (with GPS indicator) since users rarely change it.

### 3. Conditional Ride Type Pricing (Requirement 3)

**File:** `frontend/src/rider/RiderDashboard.js`

**Changes to the ride options section (lines ~1590-1640):**

The current code already has partial logic:
```js
const showFare = destination && destination !== pickup && distance > 0;
```

Enhancement: **Hide the entire ride options section** until a valid destination is selected.

```jsx
{/* Only show ride types when destination is selected */}
{destination && destination !== pickup && distance > 0 && (
  <section style={rideOptionsStyle}>
    {/* ... ride type buttons with fares ... */}
  </section>
)}
```

When no destination: show only the fare hint message (already exists):
```jsx
{(!destination || destination === pickup) && (
  <div style={fareHintStyle}>
    <span style={fareHintIcon}>📍</span>
    <p>Select your destination to see fare estimates.</p>
  </div>
)}
```

### 4. Structured Profile Menu (Requirement 4)

**File:** `frontend/src/rider/RiderDashboard.js` (account panel section)

The current account panel (`showAccountPanel`) has identity management but no structured navigation menu.

**Add a Profile Menu section** within the account panel:

```jsx
{showAccountPanel && (
  <div className="sx-account-panel">
    {/* Existing identity section */}
    
    {/* NEW: Profile Navigation Menu */}
    <nav style={profileMenuStyle}>
      <ProfileMenuItem icon="👤" label="Personal Information" onClick={() => navigate('/profile')} />
      <ProfileMenuItem icon="💳" label="Payment Methods" onClick={() => navigate('/payment-setup')} />
      <ProfileMenuItem icon="📋" label="Trip History" onClick={() => navigate('/rider-profile')} />
      <ProfileMenuItem icon="📍" label="Saved Places" onClick={() => navigate('/saved-places')} />
      <ProfileMenuItem icon="🔔" label="Notifications" onClick={() => navigate('/notifications')} />
      <ProfileMenuItem icon="❓" label="Support" onClick={() => navigate('/support')} />
      <ProfileMenuItem icon="🚪" label="Logout" onClick={handleLogout} danger />
    </nav>
  </div>
)}
```

**Logout handler:**
```js
const handleLogout = () => {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  window.location.href = "/login";
};
```

### 5. Payment Method Management (Requirement 5)

**Existing infrastructure (no backend changes needed):**
- `POST /payments/methods/save/` — save new method (payment_type, card_last4, is_default, display_name)
- `GET /payments/methods/` — list rider's methods
- `DELETE /payments/methods/<id>/` — delete method
- `RiderPaymentMethod` model supports: Cash, Card, Wallet types

**Frontend changes:**

**File:** `frontend/src/rider/RiderDashboard.js`

Add a payment method indicator on the booking confirmation area (near the "Request Ride" button):

```jsx
{/* Payment method selector before confirming ride */}
<div style={paymentSelectorStyle}>
  <span style={paymentIconStyle}>
    {selectedPaymentMethod?.payment_type === 'cash' ? '💵' : 
     selectedPaymentMethod?.payment_type === 'card' ? '💳' : '👛'}
  </span>
  <span>{selectedPaymentMethod?.display_name || 'Cash'}</span>
  <button onClick={() => setShowPaymentPicker(true)}>Change</button>
</div>
```

**State additions:**
- `paymentMethods` — fetched from `/payments/methods/` on mount
- `selectedPaymentMethod` — the currently selected method (default = first `is_default: true` method)
- `showPaymentPicker` — toggle for payment method selection modal

### 6. Driver Acceptance Info (Requirement 6)

**Already implemented** in the `rider-active-ride-fix` spec. The active ride panel now shows:
- Driver photo (with fallback avatar)
- Driver name, rating, category
- Vehicle make/model/color, plate number
- Live ETA

**No additional changes needed.** The implementation from Tasks 1-8 of `rider-active-ride-fix` satisfies this requirement completely.

---

## Data Fields & API

### GPS Auto-fill
- **Input:** `navigator.geolocation.getCurrentPosition()` → `{ latitude, longitude }`
- **Matching:** Compare against `MARKET.cities[].locations[]` positions using `calculateDistanceKm()`
- **No backend API needed** — GPS resolution is client-side only

### Payment Methods
- **Existing API:** `GET /payments/methods/` returns `[{ id, payment_type, card_last4, is_default, display_name, created_at }]`
- **No new endpoints needed** — all CRUD operations already exist

### Ride Request (unchanged)
- Already sends `pickup_address`, `destination_address`, `pickup_lat`, `pickup_lng`, `destination_lat`, `destination_lng`
- GPS auto-fill will populate these coordinates automatically

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/rider/RiderDashboard.js` | GPS auto-fill, LocationInput for drop-off, hide ride types, profile menu, payment selector |
| `frontend/src/rider/components/LocationInput.js` | No changes — already exists with autocomplete |
| `frontend/src/profile/ProfilePages.js` | Minor — ensure menu items link correctly (optional) |

**No backend changes.** All required API endpoints already exist.

---

## UI Layout Changes

### Booking Form (Before Destination)
```
┌─────────────────────────────────────────┐
│ 📍 Pickup: Current Location        [✓] │
│ │                                       │
│ ◉ Drop-off: [Search destination...]     │
│                                         │
│ 📍 Select destination to see fares      │
│                                         │
│ [Add Another Stop]                      │
└─────────────────────────────────────────┘
```

### Booking Form (After Destination Selected)
```
┌─────────────────────────────────────────┐
│ 📍 Pickup: Tevragh Zeina          [✓]  │
│ │                                       │
│ ◉ Drop-off: Ksar, Centre Ville         │
│                                         │
│ Choose Ride:                            │
│ [Regular 800 MRU] [XL 1200] [Comfort]  │
│                                         │
│ 💵 Cash [Change]                        │
│                                         │
│ [Request Ride]                          │
└─────────────────────────────────────────┘
```

### Profile Menu (Account Panel)
```
┌─────────────────────────────────────────┐
│ Profile                                 │
├─────────────────────────────────────────┤
│ 👤 Personal Information            →    │
│ 💳 Payment Methods                 →    │
│ 📋 Trip History                    →    │
│ 📍 Saved Places                    →    │
│ 🔔 Notifications                   →    │
│ ❓ Support                         →    │
│ 🚪 Logout                              │
└─────────────────────────────────────────┘
```

---

## WebSocket / Real-time

No new WebSocket handling needed. The existing infrastructure handles:
- Ride status updates via `subscribeRideUpdates`
- Driver position via `location_update` messages
- 2-second polling fallback via `fetchCurrentRide()`

GPS auto-fill is a one-time client-side operation on mount.

---

## Regression Risks

| Risk | Mitigation |
|------|-----------|
| GPS blocks page load | Use `useEffect` with async — don't block rendering. Show loading state while resolving. |
| LocationInput CSS conflicts with existing styles | LocationInput has its own CSS class names (`location-input__*`) that won't conflict with inline styles |
| Hiding ride types breaks fare calculation | Fare calculation already exists — just hide the display. Fare state still computed for the request. |
| Profile menu breaks account panel | Menu is additive — existing identity section preserved above the menu |
| Payment methods API failure | Graceful fallback to "Cash" as default when API fails |
| Existing tests break | No test framework currently exists — manual QA recommended |

---

## Testing Plan

### Manual QA Checklist
1. **GPS Auto-fill**: Open app → verify pickup shows "Finding your location..." → resolves to location
2. **GPS Denied**: Block location permission → verify pickup is empty with manual entry prompt
3. **Drop-off Search**: Type in drop-off field → verify autocomplete suggestions appear
4. **Fare Hidden**: Before selecting destination → verify no fares shown on dashboard
5. **Fare Shown**: After selecting destination → verify all ride type fares appear
6. **Profile Menu**: Open account panel → verify 7 menu items in correct order
7. **Profile Navigation**: Tap each menu item → verify correct page opens
8. **Logout**: Tap logout → verify tokens cleared, redirected to login
9. **Payment Methods**: Verify Cash/Card/Wallet options available
10. **Payment Default**: Set a default → verify it shows on booking confirmation
11. **Driver Info**: After acceptance → verify photo, name, rating, vehicle, plate, ETA all visible

### Preservation Tests
- Booking form still works when GPS fails
- Active ride panel unchanged (from rider-active-ride-fix)
- Cancel, SOS, Chat buttons still functional
- WebSocket updates still working
- Map markers/routes unchanged
