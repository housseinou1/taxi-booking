import React, { useEffect, useState } from "react";

import NotificationCenter from "../components/NotificationCenter";
import DeliveryCourierMenu from "./DeliveryCourierMenu";
import DeliveryMapBackdrop from "./DeliveryMapBackdrop";
import CourierBottomSheet from "./components/CourierBottomSheet";
import { isDeliveryUberUI } from "../native/platform";
import "./delivery-uber.css";
import "./delivery-premium-ui.css";
import "./delivery-courier-dashboard.css";
import "./delivery-courier-flow.css";
import "./delivery-courier-eats.css";
import "./delivery-instructions.css";

export function DeliveryUberPage({ title, onBack, children }) {
  if (!isDeliveryUberUI()) {
    return <div className="delivery-page">{children}</div>;
  }

  return (
    <div className="delivery-uber-page">
      <header className="delivery-uber-page__header">
        {onBack ? (
          <button type="button" className="delivery-uber__icon-btn" onClick={onBack} aria-label="Back">
            ←
          </button>
        ) : (
          <span className="delivery-uber-page__header-spacer" />
        )}
        <h1>{title}</h1>
      </header>
      <div className="delivery-uber-page__content">{children}</div>
    </div>
  );
}

export function DeliveryCourierShell({
  statusOnline,
  notice,
  error,
  onRefresh,
  activeDelivery = null,
  earningsLabel = "",
  todayEarnings = null,
  onToggleOnline = null,
  onlineToggleLoading = false,
  onlineToggleDisabled = false,
  children,
  showNav = true,
  activeNav = "home",
  onlineTimeLabel = "0h 0m",
  sheetState = "half",
  onSheetStateChange,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [internalSheet, setInternalSheet] = useState(sheetState);

  useEffect(() => {
    setInternalSheet(sheetState);
  }, [sheetState]);

  const handleSheetChange = (next) => {
    setInternalSheet(next);
    onSheetStateChange?.(next);
  };

  const resolvedSheet = onSheetStateChange ? sheetState : internalSheet;

  return (
    <main
      className={`delivery-uber delivery-uber--courier delivery-uber--dark delivery-uber--eats${
        activeDelivery ? " delivery-uber--trip-active" : ""
      }`}
    >
      <DeliveryMapBackdrop activeDelivery={activeDelivery} />
      <DeliveryCourierMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <header className="cce-topbar">
        <button type="button" className="cce-glass-btn" onClick={() => setMenuOpen(true)} aria-label="Menu">
          ☰
        </button>

        <button
          type="button"
          className={`cce-online-pill ${statusOnline ? "is-online" : ""}`}
          disabled={onlineToggleLoading || onlineToggleDisabled}
          onClick={onToggleOnline}
          aria-label={statusOnline ? "Go offline" : "Go online"}
        >
          <span className="cce-online-pill__dot" aria-hidden />
          <span>{onlineToggleLoading ? "…" : statusOnline ? "Online" : "Offline"}</span>
          <span className="cce-online-pill__chevron" aria-hidden>▾</span>
        </button>

        <div className="cce-topbar__notify">
          <NotificationCenter mode="delivery" variant="inline" />
        </div>
      </header>

      {notice ? <div className="cce-toast">{notice}</div> : null}
      {error ? <div className="cce-toast cce-toast--error">{error}</div> : null}

      {activeDelivery ? (
        <div className="cce-sheet-panel cce-sheet-panel--trip">
          <div className="bottom-sheet bottom-sheet--half">
            <div className="bottom-sheet__handle" aria-hidden>
              <div className="bottom-sheet__handle-bar" />
            </div>
            <div className="bottom-sheet__content cce-sheet__content cce-sheet__content--trip">{children}</div>
          </div>
        </div>
      ) : (
        <CourierBottomSheet state={resolvedSheet} onStateChange={handleSheetChange}>
          {resolvedSheet === "collapsed" ? (
            <div className="cce-today-peek">
              <div className="cce-today-peek__item">
                <strong>{todayEarnings?.count || 0}</strong>
                <small>Deliveries</small>
              </div>
              <div className="cce-today-peek__item is-accent">
                <strong>{earningsLabel || "0 MRU"}</strong>
                <small>Earnings</small>
              </div>
              <div className="cce-today-peek__item">
                <strong>{onlineTimeLabel}</strong>
                <small>Online</small>
              </div>
            </div>
          ) : (
            children
          )}
        </CourierBottomSheet>
      )}

      {showNav ? (
        <nav className="cce-nav" aria-label="Delivery navigation">
          <button
            type="button"
            className={`cce-nav__btn ${activeNav === "home" ? "is-active" : ""}`}
            onClick={() => {
              window.location.href = "/delivery/courier";
            }}
          >
            <span>⌂</span>
            <span>Home</span>
          </button>
          <button
            type="button"
            className={`cce-nav__btn ${activeNav === "orders" ? "is-active" : ""}`}
            onClick={() => {
              window.location.href = "/delivery/history";
            }}
          >
            <span>☰</span>
            <span>Orders</span>
          </button>
          <button
            type="button"
            className={`cce-nav__btn ${activeNav === "earnings" ? "is-active" : ""}`}
            onClick={() => {
              window.location.href = "/delivery/earnings";
            }}
          >
            <span>$</span>
            <span>Earnings</span>
          </button>
          <button
            type="button"
            className={`cce-nav__btn ${activeNav === "wallet" ? "is-active" : ""}`}
            onClick={() => {
              window.location.href = "/delivery/wallet";
            }}
          >
            <span>👛</span>
            <span>Wallet</span>
          </button>
          <button
            type="button"
            className={`cce-nav__btn ${activeNav === "profile" ? "is-active" : ""}`}
            onClick={() => {
              window.location.href = "/delivery/account";
            }}
          >
            <span>☺</span>
            <span>Profile</span>
          </button>
        </nav>
      ) : null}

      <button
        type="button"
        className="cce-glass-btn"
        style={{
          position: "fixed",
          right: 14,
          bottom: "calc(var(--cce-nav-height) + 12px)",
          zIndex: 17,
          width: 44,
          height: 44,
          fontSize: 18,
        }}
        onClick={onRefresh}
        aria-label="Refresh"
      >
        ↻
      </button>
    </main>
  );
}
