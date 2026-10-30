import React, { useEffect, useMemo, useRef, useState } from "react";

import { AlertBanner, Drawer, StatusChip, formatCurrency, formatTimestamp } from "../components/library";
import DeliveryMapView from "../../delivery/DeliveryMapView";
import { fetchAdminDeliveryDetail, fetchAdminDeliveryTracking } from "./deliveryApi";

const TIMELINE_FIELDS = [
  ["created_at", "Created"],
  ["accepted_at", "Accepted"],
  ["courier_arriving_at", "Courier arriving"],
  ["picked_up_at", "Picked up"],
  ["in_transit_at", "In transit"],
  ["delivered_at", "Delivered"],
  ["exception_reported_at", "Exception reported"],
  ["exception_resolved_at", "Exception resolved"],
];

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function statusTone(status) {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "delivery_exception") return "danger";
  if (status === "in_transit" || status === "picked_up" || status === "accepted") return "info";
  return "neutral";
}

function coordinatesOf(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

function Field({ label, children }) {
  return (
    <div className="dlvops-stats__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Read-only administrative delivery detail + live tracking (Task 7).
 *
 * Uses only the read-only admin endpoints. Courier GPS is plotted only when the API reports
 * `courier_location.available`; otherwise the position is reported as unknown — coordinates
 * are never invented and no ETA is shown (the admin payload does not provide one).
 */
export default function DeliveryDetailsDrawer({ deliveryId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!deliveryId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    setForbidden(false);

    Promise.all([
      fetchAdminDeliveryDetail(deliveryId),
      fetchAdminDeliveryTracking(deliveryId).catch(() => null),
    ])
      .then(([detailPayload, trackingPayload]) => {
        if (cancelled) return;
        setDetail(detailPayload || null);
        setTracking(trackingPayload || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetail(null);
        setTracking(null);
        if (err?.response?.status === 403) {
          setForbidden(true);
        } else {
          setError(err?.response?.data?.detail || "Could not load this delivery.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deliveryId]);

  const courierPosition = useMemo(() => {
    const location = tracking?.courier_location;
    if (!location?.available) return null;
    return coordinatesOf(location.lat, location.lng);
  }, [tracking]);

  /** The shared map component reads `pickup_lat` / `destination_lat`; adapt the payload. */
  const mapDelivery = useMemo(() => {
    if (!detail) return null;
    return {
      ...detail,
      pickup_lat: detail.pickup_location?.lat ?? null,
      pickup_lng: detail.pickup_location?.lng ?? null,
      destination_lat: detail.destination_location?.lat ?? null,
      destination_lng: detail.destination_location?.lng ?? null,
    };
  }, [detail]);

  const hasMapCoordinates = Boolean(
    courierPosition ||
      coordinatesOf(detail?.pickup_location?.lat, detail?.pickup_location?.lng) ||
      coordinatesOf(detail?.destination_location?.lat, detail?.destination_location?.lng)
  );

  const timeline = useMemo(() => {
    const stamps = detail?.status_timestamps || {};
    return TIMELINE_FIELDS.map(([key, label]) => [label, stamps[key]]).filter(([, value]) =>
      Boolean(value)
    );
  }, [detail]);

  const title = detail ? `Delivery #${detail.id}` : `Delivery #${deliveryId}`;

  return (
    <Drawer open title={title} onClose={onClose}>
      {forbidden ? (
        <AlertBanner tone="warning" title="City access denied">
          Your account is not authorised for this delivery&apos;s city scope (HTTP 403).
        </AlertBanner>
      ) : null}

      {error ? (
        <AlertBanner tone="danger" title="Delivery unavailable">
          {error}
        </AlertBanner>
      ) : null}

      {loading ? <p className="delivery-detail__empty">Loading delivery{"\u2026"}</p> : null}

      {!loading && detail ? (
        <>
          <dl className="dlvops-stats">
            <Field label="Status">
              <StatusChip
                label={detail.status_label || detail.status}
                tone={statusTone(detail.status)}
              />
            </Field>
            <Field label="Category">{detail.service_category || "\u2014"}</Field>
            <Field label="City">{detail.service_city || "\u2014"}</Field>
            <Field label="Customer">{detail.customer_name || "\u2014"}</Field>
            <Field label="Courier">{detail.courier_name || "Unassigned"}</Field>
            <Field label="Pickup">{detail.pickup || "\u2014"}</Field>
            <Field label="Drop-off">{detail.destination || "\u2014"}</Field>
            <Field label="Fare">
              {hasValue(detail.fare) ? formatCurrency(detail.fare) : "\u2014"}
            </Field>
            <Field label="Driver earning">
              {hasValue(detail.driver_earning) ? formatCurrency(detail.driver_earning) : "\u2014"}
            </Field>
            <Field label="Tip">
              {hasValue(detail.tip_amount) ? formatCurrency(detail.tip_amount) : "\u2014"}
            </Field>
            <Field label="Discount">
              {hasValue(detail.discount_amount)
                ? formatCurrency(detail.discount_amount)
                : "\u2014"}
            </Field>
            <Field label="Payment">
              {detail.payment_status || "\u2014"}
              {detail.payment_method ? ` \u00b7 ${detail.payment_method}` : ""}
            </Field>
            <Field label="Distance">
              {hasValue(detail.distance_km) ? `${detail.distance_km} km` : "\u2014"}
            </Field>
            <Field label="Estimated duration">
              {hasValue(detail.estimated_duration_minutes)
                ? `${detail.estimated_duration_minutes} min`
                : "\u2014"}
            </Field>
            <Field label="Scheduled">
              {detail.is_scheduled ? formatTimestamp(detail.scheduled_pickup_at) : "No"}
            </Field>
            {detail.exception_reason ? (
              <Field label="Exception reason">{detail.exception_reason}</Field>
            ) : null}
            {detail.exception_resolution ? (
              <Field label="Exception resolution">{detail.exception_resolution}</Field>
            ) : null}
          </dl>

          <h4 className="dlvops-section__title">Live tracking</h4>
          <p className="delivery-cell-hint">
            {courierPosition
              ? `Courier position ${courierPosition[0].toFixed(5)}, ${courierPosition[1].toFixed(5)}`
              : "Position unknown"}
            {courierPosition && tracking?.courier_location?.updated_at === null
              ? " (the platform stores no position timestamp)"
              : ""}
          </p>
          {hasMapCoordinates ? (
            <div className="dlvops-live__map">
              <DeliveryMapView activeDelivery={mapDelivery} courierPosition={courierPosition} />
            </div>
          ) : (
            <p className="delivery-detail__empty">
              No coordinates are available for this delivery.
            </p>
          )}

          <h4 className="dlvops-section__title">Timeline</h4>
          {timeline.length ? (
            <ul className="delivery-detail__steps">
              {timeline.map(([label, value]) => (
                <li key={label}>
                  <span className="delivery-detail__step delivery-detail__step--done">{label}</span>
                  <span>{formatTimestamp(value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="delivery-detail__empty">No status timestamps recorded.</p>
          )}
        </>
      ) : null}
    </Drawer>
  );
}
