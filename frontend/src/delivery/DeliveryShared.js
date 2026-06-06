import React from "react";

export const STATUS_ORDER = ["requested", "accepted", "picked_up", "delivering", "delivered"];

export const authHeaders = (json = true) => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
};

export async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(options.body instanceof FormData ? false : true),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Object.values(data).flat().join(" ");
    throw new Error(data.detail || data.error || details || "Request failed.");
  }
  return data;
}

export function DeliveryHeader({ subtitle, backPath = "/" }) {
  return (
    <header className="delivery-header">
      <div>
        <strong>Yala Delivery</strong>
        <span>{subtitle}</span>
      </div>
      <div className="delivery-header-actions">
        <button className="delivery-button delivery-button-secondary" onClick={() => (window.location.href = backPath)}>
          Back
        </button>
        <button className="delivery-button" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    </header>
  );
}

export function DeliveryStatus({ status }) {
  const activeIndex = status === "cancelled" ? -1 : STATUS_ORDER.indexOf(status);
  return (
    <div className="delivery-status" aria-label={`Delivery status: ${status}`}>
      {STATUS_ORDER.map((item, index) => (
        <span key={item} className={`delivery-status-step ${index <= activeIndex ? "active" : ""}`} />
      ))}
    </div>
  );
}

export function DeliveryRoute({ delivery }) {
  return (
    <div className="delivery-route">
      <div className="delivery-route-line" />
      <div className="delivery-route-points">
        <div>
          <span>Pickup</span>
          <strong>{delivery.pickup}</strong>
        </div>
        <div>
          <span>Destination</span>
          <strong>{delivery.destination}</strong>
        </div>
      </div>
    </div>
  );
}

export function DeliveryCard({ delivery, children }) {
  return (
    <article className="delivery-card">
      <div className="delivery-card-top">
        <div>
          <h3>Delivery #{delivery.id}</h3>
          <span className="delivery-muted">{delivery.package_type} package</span>
        </div>
        <span className="delivery-badge">{delivery.status.replace("_", " ")}</span>
      </div>
      <DeliveryStatus status={delivery.status} />
      <DeliveryRoute delivery={delivery} />
      <div className="delivery-metrics">
        <span><strong>{delivery.fare} MRU</strong> fare</span>
        <span><strong>{delivery.distance_km} km</strong> distance</span>
        <span><strong>{delivery.recipient_name}</strong> recipient</span>
      </div>
      {delivery.package_description && <p className="delivery-panel-copy">{delivery.package_description}</p>}
      {children}
    </article>
  );
}
