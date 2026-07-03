import React from "react";

import DeliveryCourierActiveCard from "./DeliveryCourierActiveCard";
import DeliveryCourierRequestCard from "./DeliveryCourierRequestCard";
import DeliveryCourierTypePicker from "./DeliveryCourierTypePicker";
import DeliveryCourierTodayPeek from "./DeliveryCourierTodayPeek";
import DeliveryCourierHomeIdle from "./DeliveryCourierHomeIdle";

export default function DeliveryCourierHomeSheet({
  deliveryMode,
  loading,
  tab,
  onTabChange,
  available,
  active,
  actionBusy,
  expiredDocAlerts,
  deliveryVehicleType,
  vehicleSaving,
  modeLoading,
  onVehicleChange,
  onAccept,
  onDecline,
  showInlineRequests,
  todayEarnings,
  onlineTimeLabel,
  sheetState = "half",
  onSheetStateChange,
}) {
  return (
    <div className="cce-home">
      <DeliveryCourierTodayPeek
        todayEarnings={todayEarnings}
        onlineTimeLabel={onlineTimeLabel}
        statusOnline={deliveryMode}
        sheetState={sheetState}
        onExpand={onSheetStateChange}
      />

      <div className="cce-home-body">
      {expiredDocAlerts.length > 0 ? (
        <div className="ccf-alert" role="alert">
          {expiredDocAlerts.map((alert) => (
            <p key={alert.key}>
              <strong>{alert.label}</strong> expired — update before going online.
            </p>
          ))}
          <button type="button" onClick={() => { window.location.href = "/delivery/documents"; }}>
            Update documents
          </button>
        </div>
      ) : null}

      <DeliveryCourierTypePicker
        value={deliveryVehicleType}
        onChange={onVehicleChange}
        disabled={vehicleSaving || modeLoading}
        compact
      />

      <section className="cce-summary-grid" aria-label="Today summary">
        <div>
          <strong>{todayEarnings?.count || 0}</strong>
          <span>Deliveries</span>
        </div>
        <div>
          <strong>{todayEarnings?.amount || "0"} MRU</strong>
          <span>Earnings</span>
        </div>
        <div>
          <strong>{onlineTimeLabel || "0h 0m"}</strong>
          <span>Online</span>
        </div>
        <div>
          <strong>5.0</strong>
          <span>Rating</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>Accept rate</span>
        </div>
      </section>

      <div className="cce-home-tabs" role="tablist" aria-label="Delivery tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "requests"}
          className={tab === "requests" ? "is-active" : ""}
          onClick={() => onTabChange("requests")}
        >
          Requests
          {available.length > 0 ? <em>{available.length}</em> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          className={tab === "active" ? "is-active" : ""}
          onClick={() => onTabChange("active")}
        >
          Active
          {active.length > 0 ? <em>{active.length}</em> : null}
        </button>
      </div>

      {loading ? <p className="cce-empty cce-empty--loading">Loading deliveries…</p> : null}

      {!loading && tab === "requests" ? (
        <>
          {deliveryMode && available.length === 0 ? (
            <DeliveryCourierHomeIdle statusOnline={deliveryMode} tab="requests" />
          ) : null}
          {!deliveryMode && available.length === 0 ? (
            <DeliveryCourierHomeIdle statusOnline={false} tab="requests" />
          ) : null}
          {deliveryMode && showInlineRequests
            ? available.map((delivery) => (
                <DeliveryCourierRequestCard
                  key={delivery.id}
                  delivery={delivery}
                  busy={actionBusy}
                  disabled={active.length > 0}
                  onAccept={onAccept}
                  onDecline={onDecline}
                />
              ))
            : null}
        </>
      ) : null}

      {!loading && tab === "active" ? (
        <>
          {active.length === 0 ? (
            <DeliveryCourierHomeIdle statusOnline={deliveryMode} tab="active" />
          ) : (
            active.map((delivery) => <DeliveryCourierActiveCard key={delivery.id} delivery={delivery} />)
          )}
        </>
      ) : null}
      </div>
    </div>
  );
}
