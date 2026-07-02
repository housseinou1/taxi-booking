import React from "react";

import BottomSheet from "../rider/components/BottomSheet";
import DeliveryCustomerMap from "./DeliveryCustomerMap";
import "./delivery-uber.css";
import "./delivery-premium-ui.css";
import "./delivery-customer-dashboard.css";
import "../rider/components/BottomSheet.css";

export default function DeliveryCustomerShell({
  children,
  sheetState = "half",
  onSheetStateChange,
  sheetContentClassName = "",
  variant = "home",
  onMenu,
  onProfile,
  onNotification,
  notificationSlot = null,
  profileInitial = "Y",
  onLocate,
  onWhereTo,
  whereToLabel = "Where to deliver?",
  showFloatingSearch = false,
  showLocate = true,
  pickup = null,
  destination = null,
  courierPosition = null,
  deliveryStatus = null,
}) {
  const contentClass = [
    sheetContentClassName,
    variant === "home" ? "bottom-sheet__content--idle" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main
      className={`delivery-uber delivery-uber--customer delivery-uber--v2 delivery-dash delivery-uber--${variant} ${
        variant === "home" ? "delivery-uber--dash-home" : ""
      } ${variant === "tracking" ? "delivery-uber--tracking" : ""}`}
    >
      <DeliveryCustomerMap
        pickup={pickup}
        destination={destination}
        courierPosition={courierPosition}
        deliveryStatus={deliveryStatus}
        showNearbyCouriers={false}
      />

      <div className="delivery-uber__map-vignette delivery-uber__map-vignette--light" aria-hidden />

      <header className="delivery-dash__top">
        <button type="button" className="delivery-dash__icon-btn" onClick={onMenu} aria-label="Menu">
          <span className="delivery-dash__menu-icon" aria-hidden />
        </button>
        <div className="delivery-dash__top-right">
          {notificationSlot || (onNotification ? (
            <button
              type="button"
              className="delivery-dash__icon-btn delivery-dash__icon-btn--notify"
              onClick={onNotification}
              aria-label="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null)}
          <button
            type="button"
            className="delivery-dash__icon-btn delivery-dash__avatar"
            onClick={onProfile}
            aria-label="Profile"
          >
            {profileInitial}
          </button>
        </div>
      </header>

      {showFloatingSearch ? (
        <button type="button" className="delivery-dash__search" onClick={onWhereTo}>
          <span aria-hidden>⌕</span>
          <strong>{whereToLabel}</strong>
        </button>
      ) : null}

      {showLocate ? (
        <button
          type="button"
          className="delivery-dash__locate"
          onClick={onLocate}
          aria-label="Current location"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}

      <div className="delivery-uber__sheet-panel">
        <BottomSheet state={sheetState} onStateChange={onSheetStateChange} contentClassName={contentClass}>
          {children}
        </BottomSheet>
      </div>
    </main>
  );
}
