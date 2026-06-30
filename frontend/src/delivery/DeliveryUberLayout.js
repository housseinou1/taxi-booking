import React, { useState } from "react";

import DeliveryCourierMenu from "./DeliveryCourierMenu";
import DeliveryMapBackdrop from "./DeliveryMapBackdrop";
import { isDeliveryUberUI } from "../native/platform";
import "./delivery-uber.css";
import "./delivery-premium-ui.css";
import "./delivery-courier-dashboard.css";

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
  courierMode = true,
  onToggleOnline = null,
  onlineToggleLoading = false,
  onlineToggleDisabled = false,
  sheetTitle,
  sheetSubtitle,
  sheetHead,
  children,
  showNav = true,
  activeNav = "home",
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="delivery-uber delivery-uber--courier delivery-uber--dark">
      <DeliveryMapBackdrop activeDelivery={activeDelivery} />
      <DeliveryCourierMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Top Bar: Hamburger + ON/OFF toggle + Refresh */}
      <header className="dcd-top">
        <button type="button" className="dcd-top__menu" onClick={() => setMenuOpen(true)} aria-label="Menu">
          ☰
        </button>
        <button
          type="button"
          className={`dcd-top__toggle ${statusOnline ? "is-on" : ""}`}
          disabled={onlineToggleLoading || onlineToggleDisabled}
          onClick={onToggleOnline}
          aria-label={statusOnline ? "Go offline" : "Go online"}
        >
          <span className="dcd-top__toggle-icon">⏻</span>
          <span>{onlineToggleLoading ? "..." : statusOnline ? "ON" : "OFF"}</span>
        </button>
        <button type="button" className="dcd-top__refresh" onClick={onRefresh} aria-label="Refresh">
          ↻
        </button>
      </header>

      {/* Notices */}
      {notice ? <div className="dcd-toast">{notice}</div> : null}
      {error ? <div className="dcd-toast dcd-toast--error">{error}</div> : null}

      {/* Active delivery sheet (only when there's an active trip) */}
      {activeDelivery ? (
        <section className="dcd-trip-sheet">
          <div className="dcd-trip-sheet__handle" />
          <h2>{sheetTitle}</h2>
          {sheetSubtitle ? <p>{sheetSubtitle}</p> : null}
          <div className="dcd-trip-sheet__body">{children}</div>
        </section>
      ) : (
        <>
          {/* Floating delivery request cards (if online and requests available) */}
          <div className="dcd-floating-content">
            {children}
          </div>

          {/* Bottom Stats Bar */}
          <section className="dcd-bottom-bar">
            <div className="dcd-bottom-bar__row">
              <span className="dcd-bottom-bar__label">Today</span>
              <span className="dcd-bottom-bar__stat">★ {sheetHead?.props?.children?.[2]?.props?.children || "5.0"}</span>
              <span className="dcd-bottom-bar__stat dcd-bottom-bar__stat--accent">AR {sheetHead?.props?.children?.[3]?.props?.children || "100%"}</span>
            </div>
            <div className="dcd-bottom-bar__stats">
              <div className="dcd-bottom-bar__stat-item">
                <strong>{todayEarnings?.count || 0}<span>›</span></strong>
                <small>Trip(s) completed</small>
              </div>
              <div className="dcd-bottom-bar__stat-item">
                <strong>{earningsLabel || "0 MRU"}<span>›</span></strong>
                <small>Earned</small>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Bottom Nav */}
      {showNav ? (
        <nav className="dcd-nav" aria-label="Delivery navigation">
          <button type="button" className={`dcd-nav__btn ${activeNav === "home" ? "is-active" : ""}`} onClick={() => { window.location.href = "/delivery/courier"; }}>
            <span>⌂</span><span>Home</span>
          </button>
          <button type="button" className={`dcd-nav__btn ${activeNav === "orders" ? "is-active" : ""}`} onClick={() => { window.location.href = "/delivery/history"; }}>
            <span>☰</span><span>Orders</span>
          </button>
          <button type="button" className={`dcd-nav__btn ${activeNav === "earnings" ? "is-active" : ""}`} onClick={() => { window.location.href = "/delivery/earnings"; }}>
            <span>$</span><span>Earnings</span>
          </button>
          <button type="button" className={`dcd-nav__btn ${activeNav === "wallet" ? "is-active" : ""}`} onClick={() => { window.location.href = "/delivery/wallet"; }}>
            <span>👛</span><span>Wallet</span>
          </button>
          <button type="button" className={`dcd-nav__btn ${activeNav === "profile" ? "is-active" : ""}`} onClick={() => { window.location.href = "/delivery/account"; }}>
            <span>☺</span><span>Profile</span>
          </button>
        </nav>
      ) : null}
    </main>
  );
}
