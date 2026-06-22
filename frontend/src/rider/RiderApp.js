import React from "react";
import { useTranslation } from "react-i18next";

import "./tokens.css";
import "./lyft-rider.css";

import { RideProvider } from "./context/RideContext";
import RiderHome from "./components/RiderHome";

/**
 * RiderApp — entry point for the rider experience.
 *
 * Wraps the app with RideContext provider for shared booking/ride state,
 * and renders the RiderHome component which composes:
 *   - MapView (full-screen background)
 *   - BottomSheet (foreground overlay)
 *   - ServiceHub (idle/collapsed state)
 *   - LocationInput, RideTypeSelector, BookingConfirmation, RideTracker
 *     (based on bookingStep state transitions)
 *
 * Existing navigation paths (/delivery, /intercity, /settings, etc.)
 * are handled at the App.js level via window.location routing.
 */
function RiderApp() {
  const { t } = useTranslation();

  return (
    <RideProvider>
      <main
        className="rider-app"
        aria-label={t('riderApp.mainLabel', 'Rider application')}
      >
        <RiderHome />
      </main>
    </RideProvider>
  );
}

export default RiderApp;
