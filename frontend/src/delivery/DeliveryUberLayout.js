import React, { useEffect, useState } from "react";

import NotificationCenter from "../components/NotificationCenter";
import DeliveryCourierMenu from "./DeliveryCourierMenu";
import DeliveryMapBackdrop from "./DeliveryMapBackdrop";
import CourierBottomNav from "./components/CourierBottomNav";
import CourierBottomSheet from "./components/CourierBottomSheet";
import CourierTopSummary from "./components/CourierTopSummary";
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
  incomingOfferActive = false,
  earningsLabel = "",
  todayEarnings = null,
  courierStats = null,
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
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyCount, setNotifyCount] = useState(0);
  const [internalSheet, setInternalSheet] = useState(sheetState);
  const [autoAccept, setAutoAccept] = useState(false);
  const [mapRecenterToken, setMapRecenterToken] = useState(0);

  useEffect(() => {
    setInternalSheet(sheetState);
  }, [sheetState]);

  useEffect(() => {
    if (!statusOnline) {
      setAutoAccept(false);
    }
  }, [statusOnline]);

  const handleSheetChange = (next) => {
    setInternalSheet(next);
    onSheetStateChange?.(next);
  };

  const resolvedSheet = onSheetStateChange ? sheetState : internalSheet;

  return (
    <main
      className={`delivery-uber delivery-uber--courier delivery-uber--dark delivery-uber--eats${
        activeDelivery ? " delivery-uber--trip-active" : ""
      }${incomingOfferActive ? " delivery-uber--offer-active" : ""}`}
    >
      <DeliveryMapBackdrop activeDelivery={activeDelivery} recenterToken={mapRecenterToken} />
      <DeliveryCourierMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenNotifications={() => {
          setMenuOpen(false);
          setNotifyOpen(true);
        }}
        notificationCount={notifyCount}
      />

      <div className="cce-map-controls" aria-label="Map controls">
        <button
          type="button"
          className="cce-glass-btn cce-map-controls__btn"
          aria-label="Recenter map on your location"
          onClick={() => setMapRecenterToken((value) => value + 1)}
        >
          ⌖
        </button>
      </div>

      <header className="cce-topbar">
        <button type="button" className="cce-glass-btn cce-menu-btn" onClick={() => setMenuOpen(true)} aria-label="Menu">
          ☰
          {notifyCount > 0 ? (
            <span className="cce-menu-btn__badge" aria-label={`${notifyCount} unread notifications`}>
              {notifyCount > 9 ? "9+" : notifyCount}
            </span>
          ) : null}
        </button>

        <div className="cce-topbar__notify cce-topbar__notify--menu-anchor">
          <NotificationCenter
            mode="delivery"
            variant="inline"
            hideTrigger
            open={notifyOpen}
            onOpenChange={setNotifyOpen}
            onUnreadCountChange={setNotifyCount}
          />
        </div>

        <button
          type="button"
          className={`cce-online-toggle ${statusOnline ? "is-online" : "is-offline"}${
            onlineToggleLoading ? " is-loading" : ""
          }`}
          disabled={onlineToggleLoading || onlineToggleDisabled}
          onClick={onToggleOnline}
          aria-label={statusOnline ? "Go offline" : "Go online"}
          aria-pressed={statusOnline}
        >
          <span className="cce-online-toggle__shell">
            <span className="cce-online-toggle__slider" aria-hidden="true" />
            {onlineToggleLoading ? (
              <span className="cce-online-toggle__loading">Updating…</span>
            ) : (
              <>
                <span className="cce-online-toggle__option">Offline</span>
                <span className="cce-online-toggle__option">Online</span>
              </>
            )}
          </span>
        </button>

        <div className="cce-topbar__actions">
          <button type="button" className="cce-glass-btn cce-refresh-btn" onClick={onRefresh} aria-label="Refresh delivery dashboard">
            ↻
          </button>
          <button
            type="button"
            className={`cce-auto-btn cce-auto-btn--secondary ${autoAccept ? "is-on" : ""}${!statusOnline ? " is-disabled" : ""}`}
            aria-pressed={autoAccept}
            disabled={!statusOnline}
            aria-label={
              !statusOnline
                ? "Auto accept unavailable while offline"
                : autoAccept
                  ? "Auto accept enabled"
                  : "Auto accept disabled"
            }
            onClick={() => {
              if (statusOnline) {
                setAutoAccept((value) => !value);
              }
            }}
          >
            <span>Auto Accept</span>
            <i aria-hidden />
          </button>
        </div>
      </header>

      {!activeDelivery ? (
        <CourierTopSummary
          todayEarnings={todayEarnings}
          rating={courierStats?.rating}
          acceptanceRate={courierStats?.acceptanceRate}
          statusOnline={statusOnline}
        />
      ) : null}

      {notice ? <div className="cce-toast">{notice}</div> : null}
      {error ? <div className="cce-toast cce-toast--error">{error}</div> : null}

      {!activeDelivery && !incomingOfferActive && todayEarnings ? (
        <div style={{
          position: "absolute",
          top: 72,
          left: 12,
          right: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderRadius: 14,
          background: "rgba(11, 18, 32, 0.85)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid rgba(255, 107, 0, 0.2)",
          zIndex: 4,
          pointerEvents: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18 }}>💰</span>
            <div>
              <strong style={{ fontSize: 15, color: "#ff6b00", fontWeight: 800 }}>
                {todayEarnings.amount || "0"} MRU
              </strong>
              <span style={{ fontSize: 11, color: "#9ca3af", display: "block", marginTop: 1 }}>
                Today · {todayEarnings.count || 0} deliveries
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#d1d5db" }}>
            <span>★ 5.0</span>
            <span>100%</span>
          </div>
        </div>
      ) : null}

      {activeDelivery ? (
        <div className="cce-sheet-panel cce-sheet-panel--trip">
          <div className="bottom-sheet bottom-sheet--half bottom-sheet--trip-active">
            <div className="bottom-sheet__handle" aria-hidden>
              <div className="bottom-sheet__handle-bar" />
            </div>
            <div className="bottom-sheet__content cce-sheet__content cce-sheet__content--trip">{children}</div>
          </div>
        </div>
      ) : (
        <CourierBottomSheet
          state={resolvedSheet}
          onStateChange={handleSheetChange}
          contentClassName={resolvedSheet === "collapsed" ? "cce-sheet__content--peek" : ""}
        >
          {children}
        </CourierBottomSheet>
      )}

      {showNav ? <CourierBottomNav activeNav={activeNav} /> : null}
    </main>
  );
}
