import React from "react";

import { DeliveryJobCard } from "../DeliveryShared";
import DeliveryCourierTypePicker from "./DeliveryCourierTypePicker";
import { CourierActionButton } from "./CourierActionButton";

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
  showInlineRequests,
}) {
  return (
    <div className="cce-home">
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

      <div className="cce-home-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === "requests" ? "is-active" : ""}
          onClick={() => onTabChange("requests")}
        >
          Requests
          {available.length > 0 ? <em>{available.length}</em> : null}
        </button>
        <button
          type="button"
          role="tab"
          className={tab === "active" ? "is-active" : ""}
          onClick={() => onTabChange("active")}
        >
          Active
          {active.length > 0 ? <em>{active.length}</em> : null}
        </button>
      </div>

      {loading ? <p className="cce-empty">Loading…</p> : null}

      {!loading && tab === "requests" ? (
        <>
          {!deliveryMode ? (
            <div className="cce-empty">
              <span className="ccf-empty-state__icon" aria-hidden="true">📍</span>
              <strong>You're offline</strong>
              <p>Go online to receive delivery requests near you.</p>
            </div>
          ) : null}
          {deliveryMode && available.length === 0 ? (
            <div className="cce-empty">
              <strong>No requests yet</strong>
              <p>Stay online — new deliveries appear here automatically.</p>
            </div>
          ) : null}
          {deliveryMode && showInlineRequests
            ? available.map((delivery) => (
                <DeliveryJobCard key={delivery.id} delivery={delivery} highlight>
                  <div className="ccf-home-accept">
                    <CourierActionButton
                      variant="accept"
                      iconName="check"
                      fullWidth
                      loading={actionBusy}
                      disabled={active.length > 0}
                      onClick={() => onAccept(delivery)}
                    >
                      Accept · {delivery.fare} MRU
                    </CourierActionButton>
                  </div>
                </DeliveryJobCard>
              ))
            : null}
        </>
      ) : null}

      {!loading && tab === "active" ? (
        <>
          {active.length === 0 ? (
            <div className="cce-empty">
              <strong>No active deliveries</strong>
              <p>Accepted jobs show up here while you're on a trip.</p>
            </div>
          ) : (
            active.map((delivery) => (
              <DeliveryJobCard key={delivery.id} delivery={delivery}>
                <p className="ccf-home-contact">
                  {delivery.recipient_name || delivery.customer_name || "Customer"}
                  {delivery.recipient_phone ? ` · ${delivery.recipient_phone}` : ""}
                </p>
              </DeliveryJobCard>
            ))
          )}
        </>
      ) : null}
    </div>
  );
}
