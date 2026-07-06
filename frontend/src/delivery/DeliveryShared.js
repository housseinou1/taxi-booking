import React from "react";

import { API_URL } from "../apiConfig";
import { persistAuthTokens } from "../auth/session";
import { getDeliveryCategoryIcon, getDeliveryCategoryLabel } from "./deliveryCategories";
import { isDeliveryUberUI } from "../native/platform";

export const STATUS_ORDER = [
  "requested",
  "accepted",
  "courier_arriving",
  "picked_up",
  "in_transit",
  "delivering",
  "delivery_exception",
  "delivered",
];

let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  const refresh = localStorage.getItem("refresh");
  if (!refresh || refresh === "null" || refresh === "undefined") {
    throw new Error("Your session expired. Please log in again.");
  }

  refreshPromise = fetch(`${API_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Session expired");
      }
      persistAuthTokens({
        access: data.access,
        refresh: data.refresh,
      });
      return data.access;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function fetchWithAuth(url, options = {}, allowRefresh = true) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(options.body instanceof FormData ? false : true),
      ...(options.headers || {}),
    },
  });

  if (response.status !== 401 || !allowRefresh) {
    return response;
  }

  try {
    await refreshAccessToken();
  } catch (error) {
    return response;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders(options.body instanceof FormData ? false : true),
      ...(options.headers || {}),
    },
  });
}

export const authHeaders = (json = true) => {
  const headers = {
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
};

export const CONNECTION_ERROR_MESSAGE =
  "Connection error. Check your internet and try again.";

export function isConnectionError(message = "") {
  const text = String(message || "");
  return (
    text.includes("Connection error") ||
    text.includes("Check your internet") ||
    text.includes("Failed to fetch") ||
    text.includes("NetworkError")
  );
}

export function isDeliveryStateMismatch(message = "") {
  const text = String(message || "");
  return text.includes("cannot be updated from status") || text.includes("Delivery cannot be");
}

export async function apiRequest(url, options = {}) {
  let response;
  try {
    response = await fetchWithAuth(url, options);
  } catch (error) {
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Object.values(data)
      .flat()
      .filter((value) => typeof value === "string" && value.trim())
      .join(" ");
    throw new Error(
      data.detail ||
        data.error ||
        details ||
        `Request failed (HTTP ${response.status}).`
    );
  }
  return data;
}

export function dataUrlToFile(dataUrl, filename = "upload.jpg") {
  const [header, encoded] = String(dataUrl).split(",");
  const mime = header?.match(/:(.*?);/)?.[1] || "image/jpeg";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mime });
}

export async function confirmDeliveryWithProof(deliveryId, recipientCode, proofFile) {
  const form = new FormData();
  form.append("recipient_code", recipientCode);
  if (proofFile) {
    form.append("proof_of_delivery", proofFile, proofFile.name || "delivery-proof.jpg");
  }
  return apiRequest(`${API_URL}/deliveries/${deliveryId}/confirm/`, { method: "POST", body: form });
}

export async function reportDeliveryException(deliveryId, { reason, exceptionNote, proofFile }) {
  const form = new FormData();
  form.append("reason", reason);
  form.append("exception_note", exceptionNote || "");
  form.append("courier_confirmed", "true");
  if (proofFile) {
    form.append("proof_of_delivery", proofFile, proofFile.name || "delivery-exception-proof.jpg");
  }
  return apiRequest(`${API_URL}/deliveries/${deliveryId}/exception/`, { method: "POST", body: form });
}

export async function confirmStopWithProof(deliveryId, stopId, recipientCode, proofFile) {
  const form = new FormData();
  form.append("recipient_code", recipientCode);
  form.append("proof_photo", proofFile, proofFile.name || "delivery-proof.jpg");
  return apiRequest(`${API_URL}/deliveries/${deliveryId}/stops/${stopId}/confirm/`, { method: "POST", body: form });
}

export function DeliveryHeader({ subtitle, backPath = "/", showBack = true }) {
  return (
    <header className="delivery-header">
      <div>
        <strong>Yala Delivery</strong>
        <span>{subtitle}</span>
      </div>
      <div className="delivery-header-actions">
        {showBack && (
          <button className="delivery-button delivery-button-secondary" onClick={() => (window.location.href = backPath)}>
            Back
          </button>
        )}
        <button className="delivery-button delivery-button-secondary" onClick={() => (window.location.href = "/settings")}>
          Settings
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

export function DeliveryCategoryTag({ category }) {
  if (!category) return null;
  return (
    <span className="delivery-category-tag">
      {getDeliveryCategoryIcon(category)} {getDeliveryCategoryLabel(category)}
    </span>
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

export function DeliveryUberJob({ delivery, children, highlight = false }) {
  const activeIndex = delivery.status === "cancelled" ? -1 : STATUS_ORDER.indexOf(delivery.status);

  return (
    <article className={`delivery-uber__job ${highlight ? "delivery-uber__job--offer" : ""}`}>
      <div className="delivery-uber__job-top">
        <div>
          <div className="delivery-uber__job-fare">{delivery.fare} MRU</div>
          <div className="delivery-uber__job-meta">
            {delivery.distance_km} km · {delivery.package_type}
            {delivery.service_city ? ` · ${delivery.service_city}` : ""}
          </div>
        </div>
        <span className="delivery-uber__tag">{delivery.status.replace("_", " ")}</span>
      </div>

      <div className="delivery-uber__progress" aria-hidden="true">
        {STATUS_ORDER.map((step, index) => (
          <span key={step} className={index <= activeIndex ? "is-done" : ""} />
        ))}
      </div>

      <div className="delivery-uber__job-route">
        <div className="delivery-uber__job-stop">
          <span className="delivery-uber__job-dot" />
          <div>
            <small>Pickup</small>
            <strong>{delivery.pickup}</strong>
          </div>
        </div>
        <div className="delivery-uber__job-stop">
          <span className="delivery-uber__job-dot is-drop" />
          <div>
            <small>Dropoff</small>
            <strong>{delivery.destination}</strong>
          </div>
        </div>
      </div>

      {delivery.service_category ? (
        <div className="delivery-uber__job-tags">
          <span className="delivery-uber__tag">
            {getDeliveryCategoryIcon(delivery.service_category)}{" "}
            {getDeliveryCategoryLabel(delivery.service_category)}
          </span>
          {delivery.is_fragile ? <span className="delivery-uber__tag">Fragile</span> : null}
          {delivery.is_scheduled ? <span className="delivery-uber__tag">Scheduled</span> : null}
        </div>
      ) : null}

      {children}
    </article>
  );
}

export function DeliveryJobCard({ delivery, children, highlight = false }) {
  if (isDeliveryUberUI()) {
    return <DeliveryUberJob delivery={delivery} highlight={highlight}>{children}</DeliveryUberJob>;
  }
  return <DeliveryCard delivery={delivery}>{children}</DeliveryCard>;
}
