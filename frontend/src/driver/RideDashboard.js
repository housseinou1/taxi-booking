import React, { useState } from "react";

import { API_URL } from "../apiConfig";
import RideStatusButtons from "../RideStatusButtons";
import { formatMoney } from "../marketConfig";

const getRidePoint = (ride, target) => {
  const lat = target === "pickup" ? ride.pickup_lat : ride.destination_lat;
  const lng = target === "pickup" ? ride.pickup_lng : ride.destination_lng;

  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }

  return {
    lat: Number(lat),
    lng: Number(lng),
  };
};

const getNavigationUrls = (ride, target) => {
  const point = getRidePoint(ride, target);

  if (!point || Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
    return null;
  }

  const destination = `${point.lat},${point.lng}`;

  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`,
    waze: `https://www.waze.com/ul?ll=${encodeURIComponent(destination)}&navigate=yes&zoom=17`,
  };
};

const getAddress = (ride, key) =>
  ride[key] || ride[`${key}_address`] || (key === "pickup" ? "Pickup unavailable" : "Destination unavailable");

const getDriverEarning = (ride) => {
  const fare = Number(ride.fare || 0);
  const appFee = Number(ride.app_fee || 0);
  const tip = Number(ride.payment_tip_amount || 0);
  return Number(ride.driver_earning ?? fare - appFee + tip);
};

const canCancelBeforeStart = (ride) =>
  ["accepted", "driver_arriving", "driver_arrived"].includes(ride.status);

const NavigationLinks = ({ ride, target }) => {
  const urls = getNavigationUrls(ride, target);

  if (!urls) {
    return null;
  }

  return (
    <div style={navigationBoxStyle}>
      <span style={navigationTitleStyle}>
        {target === "pickup" ? "Navigate to pickup" : "Navigate to drop-off"}
      </span>
      <div style={navigationActionsStyle}>
        <a href={urls.google} target="_blank" rel="noreferrer" style={navigationButtonStyle}>
          Google Maps
        </a>
        <a
          href={urls.waze}
          target="_blank"
          rel="noreferrer"
          style={{ ...navigationButtonStyle, ...wazeButtonStyle }}
        >
          Waze
        </a>
      </div>
    </div>
  );
};

function RideDashboard({ rides = [], availableRides = [], isOnline, fetchRides }) {
  const [cancelRideTarget, setCancelRideTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelNotice, setCancelNotice] = useState(null);

  const activeRides = rides.filter((ride) =>
    ["driver_arriving", "accepted", "driver_arrived", "in_progress"].includes(ride.status)
  );
  const completedRidesNeedingAction = rides.filter(
    (ride) =>
      ride.status === "completed" &&
      (ride.payment_status === "pending_verification" || !ride.driver_rating)
  );
  const cancelledRides = rides.filter((ride) => ride.status === "cancelled");

  const refreshAfterAction = () => {
    if (fetchRides) {
      fetchRides();
    }
  };

  const confirmPaymentReceived = async (rideId) => {
    try {
      const response = await fetch(`${API_URL}/payments/confirm-payment/${rideId}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Could not confirm payment");
        return;
      }

      alert("Payment confirmed");
      refreshAfterAction();
    } catch (error) {
      console.error(error);
      alert("Server error confirming payment");
    }
  };

  const openCancelModal = (ride) => {
    setCancelRideTarget(ride);
    setCancelReason("");
    setCancelNotice(null);
  };

  const submitCancellation = async () => {
    if (!cancelRideTarget || !canCancelBeforeStart(cancelRideTarget)) return;

    if (!cancelReason.trim()) {
      setCancelNotice({
        type: "warning",
        text: "Please choose a cancellation reason before closing this trip.",
      });
      return;
    }

    try {
      setCancelSaving(true);

      const response = await fetch(`${API_URL}/rides/cancel/${cancelRideTarget.id}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
        body: JSON.stringify({
          reason: cancelReason.trim(),
          cancelled_by: "driver",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setCancelNotice({
          type: "error",
          text: data.detail || data.error || "Could not cancel trip.",
        });
        return;
      }

      setCancelNotice({
        type: "success",
        text: `${data.refund_status || "Authorization released or no charge captured"}. Cancellation fee: ${formatMoney(data.cancellation_fee)}.`,
      });
      setCancelRideTarget(null);
      setCancelReason("");
      refreshAfterAction();
    } catch (error) {
      console.error(error);
      setCancelNotice({
        type: "error",
        text: "Server error cancelling trip.",
      });
    } finally {
      setCancelSaving(false);
    }
  };

  return (
    <div style={dashboardStyle}>
      <section style={queuePanelStyle}>
        <SectionHeader
          label="Incoming"
          title="Ride requests"
          count={isOnline ? availableRides.length : 0}
        />

        {!isOnline ? (
          <EmptyState title="You are offline" text="Go online to receive rider requests." />
        ) : availableRides.length === 0 ? (
          <EmptyState title="No requests right now" text="New rider requests will appear here." />
        ) : (
          <div style={cardListStyle}>
            {availableRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                badge="Request"
                badgeStyle={requestBadgeStyle}
                footer={<RideStatusButtons ride={ride} onStatusChange={refreshAfterAction} />}
              >
                <RiderInfo ride={ride} />
                <RouteBlock ride={ride} />
                <TripFacts ride={ride} />
                <NavigationLinks ride={ride} target="pickup" />
              </RideCard>
            ))}
          </div>
        )}
      </section>

      <section style={queuePanelStyle}>
        <SectionHeader label="Now" title="Active trips" count={activeRides.length} />

        {activeRides.length === 0 ? (
          <EmptyState title="No active trip" text="Accepted rides move here until they are completed." />
        ) : (
          <div style={cardListStyle}>
            {activeRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                badge={formatStatus(ride.status)}
                badgeStyle={activeBadgeStyle}
                footer={
                  <div style={activeActionStackStyle}>
                    <RideStatusButtons ride={ride} onStatusChange={refreshAfterAction} />
                    {canCancelBeforeStart(ride) && (
                      <button
                        type="button"
                        onClick={() => openCancelModal(ride)}
                        style={cancelTripButtonStyle}
                      >
                        Cancel before start
                      </button>
                    )}
                  </div>
                }
              >
                <RiderInfo ride={ride} />
                <RouteBlock ride={ride} />
                <TripFacts ride={ride} showEarnings />
                <NavigationLinks
                  ride={ride}
                  target={ride.status === "in_progress" ? "destination" : "pickup"}
                />
              </RideCard>
            ))}
          </div>
        )}
      </section>

      <section style={queuePanelStyle}>
        <SectionHeader
          label="Action needed"
          title="Completed trips"
          count={completedRidesNeedingAction.length}
        />

        {completedRidesNeedingAction.length === 0 ? (
          <EmptyState
            title="No completed trips need action"
            text="Rated and fully paid trips leave this driver work queue."
          />
        ) : (
          <div style={cardListStyle}>
            {completedRidesNeedingAction.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                badge="Completed"
                badgeStyle={completedBadgeStyle}
              >
                <RiderInfo ride={ride} />
                <RouteBlock ride={ride} />
                <TripFacts ride={ride} showEarnings />
                {ride.payment_status === "pending_verification" ? (
                  <button
                    onClick={() => confirmPaymentReceived(ride.id)}
                    style={confirmPaymentButtonStyle}
                  >
                    Confirm cash received
                  </button>
                ) : (
                  <p style={paymentTextStyle}>
                    Payment: {ride.payment_status === "paid" ? "Paid" : "Not paid yet"}
                  </p>
                )}
                <RiderRatingForm ride={ride} onRated={refreshAfterAction} />
              </RideCard>
            ))}
          </div>
        )}
      </section>

      {cancelledRides.length > 0 && (
        <section style={queuePanelStyle}>
          <SectionHeader label="Closed" title="Cancelled trips" count={cancelledRides.length} />
          <div style={cardListStyle}>
            {cancelledRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                badge="Cancelled"
                badgeStyle={cancelledBadgeStyle}
              >
                <RiderInfo ride={ride} />
                <RouteBlock ride={ride} />
                <RefundStatusCard />
              </RideCard>
            ))}
          </div>
        </section>
      )}

      {cancelNotice && !cancelRideTarget && (
        <div
          style={{
            ...cancelNoticeStyle,
            borderColor:
              cancelNotice.type === "error"
                ? "rgba(248, 113, 113, 0.38)"
                : cancelNotice.type === "warning"
                  ? "rgba(245, 158, 11, 0.38)"
                  : "rgba(34, 197, 94, 0.38)",
          }}
        >
          {cancelNotice.text}
        </div>
      )}

      {cancelRideTarget && (
        <CancellationModal
          ride={cancelRideTarget}
          reason={cancelReason}
          saving={cancelSaving}
          notice={cancelNotice}
          onReasonChange={setCancelReason}
          onClose={() => setCancelRideTarget(null)}
          onSubmit={submitCancellation}
        />
      )}
    </div>
  );
}

function CancellationModal({
  ride,
  reason,
  saving,
  notice,
  onReasonChange,
  onClose,
  onSubmit,
}) {
  return (
    <div style={modalBackdropStyle}>
      <section style={modalCardStyle} role="dialog" aria-modal="true" aria-label="Cancel trip">
        <span style={sectionLabelStyle}>Cancel trip #{ride.id}</span>
        <h2 style={modalTitleStyle}>Why are you cancelling?</h2>
        <p style={modalTextStyle}>
          Drivers can cancel before the trip starts. The cancellation fee logic is a placeholder and currently shows 0 MRU.
        </p>
        <select
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          style={modalSelectStyle}
        >
          <option value="">Select a reason</option>
          <option value="Rider did not answer">Rider did not answer</option>
          <option value="Pickup is unsafe">Pickup is unsafe</option>
          <option value="Vehicle issue">Vehicle issue</option>
          <option value="Wrong pickup location">Wrong pickup location</option>
          <option value="Other">Other</option>
        </select>
        {notice && <p style={modalNoticeStyle}>{notice.text}</p>}
        <div style={modalActionsStyle}>
          <button type="button" onClick={onClose} style={modalGhostButtonStyle}>
            Keep trip
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            style={{ ...modalDangerButtonStyle, opacity: saving ? 0.72 : 1 }}
          >
            {saving ? "Cancelling..." : "Cancel trip"}
          </button>
        </div>
      </section>
    </div>
  );
}

function RefundStatusCard() {
  return (
    <div style={refundStatusCardStyle}>
      <span style={navigationTitleStyle}>Refund status</span>
      <strong>Authorization released or no charge captured</strong>
      <small>Cancellation fee placeholder: {formatMoney(0)}</small>
    </div>
  );
}

function RiderRatingForm({ ride, onRated }) {
  const [rating, setRating] = useState(ride.driver_rating || 0);
  const [review, setReview] = useState(ride.driver_review || "");
  const [saving, setSaving] = useState(false);

  const submitRating = async () => {
    if (!rating) {
      alert("Please select a rider rating.");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/rides/rate-rider/${ride.id}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
        body: JSON.stringify({
          rating,
          review,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || data.error || "Could not rate rider");
        return;
      }

      alert("Rider rating submitted");
      if (onRated) onRated();
    } catch (error) {
      console.error(error);
      alert("Server error rating rider");
    } finally {
      setSaving(false);
    }
  };

  if (ride.driver_rating) {
    return (
      <div style={ratingDoneStyle}>
        Rider rating: {"★".repeat(Number(ride.driver_rating || 0))}
        {ride.driver_review ? ` - ${ride.driver_review}` : ""}
      </div>
    );
  }

  return (
    <div style={riderRatingBoxStyle}>
      <span style={navigationTitleStyle}>Rate this rider</span>
      <StarRating value={rating} onChange={setRating} />
      <textarea
        value={review}
        onChange={(event) => setReview(event.target.value)}
        placeholder="Optional note about rider behavior"
        style={ratingTextareaStyle}
      />
      <button
        onClick={submitRating}
        disabled={saving}
        style={{
          ...confirmPaymentButtonStyle,
          background: rating ? "#12b76a" : "#64748b",
          cursor: rating && !saving ? "pointer" : "not-allowed",
        }}
      >
        {saving ? "Saving..." : "Submit rider rating"}
      </button>
    </div>
  );
}

function StarRating({ value, onChange }) {
  return (
    <div style={ratingButtonRowStyle} aria-label="Choose rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          style={{
            ...ratingButtonStyle,
            color: value >= star ? "#f59e0b" : "#6b7280",
            transform: value >= star ? "scale(1.05)" : "scale(1)",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function SectionHeader({ label, title, count }) {
  return (
    <div style={sectionHeaderStyle}>
      <div>
        <p style={sectionLabelStyle}>{label}</p>
        <h2 style={sectionTitleStyle}>{title}</h2>
      </div>
      <span style={countPillStyle}>{count}</span>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div style={emptyStyle}>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function RideCard({ ride, badge, badgeStyle, children, footer }) {
  return (
    <article style={rideCardStyle}>
      <div style={cardHeaderStyle}>
        <div>
          <p style={rideIdStyle}>Ride #{ride.id}</p>
          <h3 style={rideTitleStyle}>{formatMoney(ride.fare)}</h3>
        </div>
        <span style={{ ...badgeBaseStyle, ...badgeStyle }}>{badge}</span>
      </div>
      {children}
      {footer && <div style={footerStyle}>{footer}</div>}
    </article>
  );
}

function RiderInfo({ ride }) {
  const riderName = ride.rider_name || "Rider";
  const initial = riderName.slice(0, 1).toUpperCase();
  const phone = ride.private_call_number || ride.rider_phone || "";
  const yearsUsingApp = Number(ride.rider_years_using_app || 0);

  return (
    <div style={riderInfoStyle}>
      {ride.rider_picture ? (
        <img src={ride.rider_picture} alt={riderName} style={riderPhotoStyle} />
      ) : (
        <div style={riderFallbackStyle}>{initial}</div>
      )}
      <div style={riderTextStyle}>
        <span style={routeLabelStyle}>Rider</span>
        <strong>{riderName}</strong>
        <span>
          {phone ? `Private call: ${phone}` : "Private call not ready"}
          {ride.rider_member_since_year ? ` · Since ${ride.rider_member_since_year}` : ""}
          {yearsUsingApp ? ` · ${yearsUsingApp} years` : ""}
        </span>
      </div>
      {phone && (
        <a href={`tel:${phone}`} style={riderCallStyle}>
          Private call
        </a>
      )}
    </div>
  );
}

function RouteBlock({ ride }) {
  return (
    <div style={routeBoxStyle}>
      <div style={routeRowStyle}>
        <span style={pickupDotStyle} />
        <div>
          <span style={routeLabelStyle}>Pickup</span>
          <p style={routeTextStyle}>{getAddress(ride, "pickup")}</p>
        </div>
      </div>
      <div style={routeConnectorStyle} />
      <div style={routeRowStyle}>
        <span style={dropoffDotStyle} />
        <div>
          <span style={routeLabelStyle}>Drop-off</span>
          <p style={routeTextStyle}>{getAddress(ride, "destination")}</p>
        </div>
      </div>
    </div>
  );
}

function TripFacts({ ride, showEarnings = false }) {
  const facts = [
    ["Type", ride.ride_type || "Regular"],
    ["Distance", `${ride.distance_km || 0} km`],
    ["App fee", formatMoney(ride.app_fee)],
  ];

  if (Number(ride.payment_tip_amount || 0) > 0) {
    facts.push(["Tip", formatMoney(ride.payment_tip_amount)]);
  }

  if (showEarnings) {
    facts.push(["You earn", formatMoney(getDriverEarning(ride))]);
  }

  return (
    <div style={factsGridStyle}>
      {facts.map(([label, value]) => (
        <div key={label} style={factStyle}>
          <span style={factLabelStyle}>{label}</span>
          <strong style={factValueStyle}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function formatStatus(status) {
  return String(status || "Active")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const dashboardStyle = {
  display: "grid",
  gap: "16px",
};

const queuePanelStyle = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "18px",
  padding: "16px",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.08)",
};

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  marginBottom: "12px",
};

const sectionLabelStyle = {
  margin: "0 0 3px",
  color: "#64748b",
  fontSize: "0.72rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const sectionTitleStyle = {
  margin: 0,
  color: "#111827",
  fontSize: "1.15rem",
};

const countPillStyle = {
  minWidth: "38px",
  height: "38px",
  borderRadius: "999px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111827",
  color: "white",
  fontWeight: 900,
};

const cardListStyle = {
  display: "grid",
  gap: "12px",
};

const rideCardStyle = {
  background: "#111827",
  color: "white",
  borderRadius: "16px",
  padding: "16px",
  boxShadow: "0 18px 32px rgba(17, 24, 39, 0.18)",
};

const cardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "14px",
};

const rideIdStyle = {
  margin: "0 0 4px",
  color: "#9ca3af",
  fontWeight: 800,
  fontSize: "0.78rem",
};

const rideTitleStyle = {
  margin: 0,
  fontSize: "1.4rem",
  color: "white",
};

const badgeBaseStyle = {
  borderRadius: "999px",
  padding: "7px 10px",
  fontWeight: 900,
  fontSize: "0.76rem",
  whiteSpace: "nowrap",
};

const requestBadgeStyle = {
  background: "#ecfdf5",
  color: "#047857",
};

const activeBadgeStyle = {
  background: "#fff7ed",
  color: "#c2410c",
};

const completedBadgeStyle = {
  background: "#dbeafe",
  color: "#1d4ed8",
};

const cancelledBadgeStyle = {
  background: "#fee2e2",
  color: "#b91c1c",
};

const routeBoxStyle = {
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "14px",
  padding: "12px",
  background: "rgba(255, 255, 255, 0.04)",
};

const riderInfoStyle = {
  display: "grid",
  gridTemplateColumns: "52px minmax(0, 1fr) auto",
  gap: "12px",
  alignItems: "center",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "14px",
  padding: "12px",
  background: "rgba(255, 255, 255, 0.06)",
  marginBottom: "12px",
};

const riderPhotoStyle = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  objectFit: "cover",
};

const riderFallbackStyle = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#f59e0b",
  color: "#111827",
  fontWeight: 950,
};

const riderTextStyle = {
  display: "grid",
  gap: "3px",
  minWidth: 0,
};

const riderCallStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "38px",
  borderRadius: "999px",
  padding: "0 12px",
  background: "#12b76a",
  color: "white",
  fontWeight: 900,
  textDecoration: "none",
};

const routeRowStyle = {
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: "10px",
  alignItems: "start",
};

const routeConnectorStyle = {
  width: "2px",
  height: "18px",
  background: "rgba(255, 255, 255, 0.16)",
  margin: "3px 0 3px 5px",
};

const pickupDotStyle = {
  width: "11px",
  height: "11px",
  borderRadius: "999px",
  background: "#22c55e",
  marginTop: "5px",
};

const dropoffDotStyle = {
  ...pickupDotStyle,
  background: "#f97316",
};

const routeLabelStyle = {
  display: "block",
  color: "#9ca3af",
  fontSize: "0.72rem",
  fontWeight: 900,
  textTransform: "uppercase",
};

const routeTextStyle = {
  margin: "3px 0 0",
  color: "white",
  fontWeight: 800,
  overflowWrap: "anywhere",
};

const factsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
  marginTop: "12px",
};

const factStyle = {
  background: "rgba(255, 255, 255, 0.07)",
  borderRadius: "12px",
  padding: "10px",
  minWidth: 0,
};

const factLabelStyle = {
  display: "block",
  color: "#9ca3af",
  fontSize: "0.72rem",
  fontWeight: 900,
  marginBottom: "4px",
};

const factValueStyle = {
  display: "block",
  color: "white",
  fontSize: "0.92rem",
  overflowWrap: "anywhere",
};

const navigationBoxStyle = {
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "14px",
  padding: "12px",
  marginTop: "12px",
};

const navigationTitleStyle = {
  display: "block",
  color: "#d1d5db",
  fontSize: "0.8rem",
  fontWeight: 900,
  marginBottom: "10px",
};

const navigationActionsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "8px",
};

const navigationButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "42px",
  borderRadius: "12px",
  border: "1px solid rgba(96, 165, 250, 0.5)",
  background: "rgba(37, 99, 235, 0.22)",
  color: "#bfdbfe",
  fontWeight: 900,
  textDecoration: "none",
  fontSize: "0.88rem",
  textAlign: "center",
};

const wazeButtonStyle = {
  borderColor: "rgba(34, 211, 238, 0.5)",
  background: "rgba(8, 145, 178, 0.22)",
  color: "#a5f3fc",
};

const footerStyle = {
  marginTop: "12px",
};

const activeActionStackStyle = {
  display: "grid",
  gap: "10px",
};

const cancelTripButtonStyle = {
  width: "100%",
  minHeight: "46px",
  border: "1px solid rgba(248, 113, 113, 0.36)",
  borderRadius: "14px",
  background: "rgba(127, 29, 29, 0.36)",
  color: "#fecaca",
  fontWeight: 950,
  cursor: "pointer",
};

const confirmPaymentButtonStyle = {
  width: "100%",
  marginTop: "12px",
  padding: "13px",
  background: "#12b76a",
  color: "white",
  border: "none",
  borderRadius: "12px",
  fontWeight: 900,
  cursor: "pointer",
};

const paymentTextStyle = {
  margin: "12px 0 0",
  color: "#d1d5db",
  fontWeight: 800,
};

const refundStatusCardStyle = {
  display: "grid",
  gap: "5px",
  marginTop: "12px",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid rgba(34, 197, 94, 0.24)",
  background: "rgba(34, 197, 94, 0.1)",
  color: "#dcfce7",
};

const cancelNoticeStyle = {
  padding: "13px",
  borderRadius: "14px",
  border: "1px solid rgba(34, 197, 94, 0.38)",
  background: "#111827",
  color: "#ffffff",
  fontWeight: 900,
  boxShadow: "0 18px 32px rgba(17, 24, 39, 0.14)",
};

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  display: "grid",
  placeItems: "center",
  padding: "18px",
  background: "rgba(3, 7, 18, 0.72)",
  backdropFilter: "blur(10px)",
};

const modalCardStyle = {
  width: "min(440px, 100%)",
  borderRadius: "22px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "linear-gradient(180deg, #111827 0%, #030712 100%)",
  color: "#ffffff",
  padding: "20px",
  boxShadow: "0 26px 70px rgba(0, 0, 0, 0.42)",
};

const modalTitleStyle = {
  margin: "4px 0 8px",
  color: "#ffffff",
  fontSize: "1.45rem",
};

const modalTextStyle = {
  margin: "0 0 14px",
  color: "rgba(255,255,255,0.68)",
  lineHeight: 1.5,
};

const modalSelectStyle = {
  width: "100%",
  minHeight: "48px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0b1220",
  color: "#ffffff",
  padding: "0 12px",
  fontWeight: 850,
};

const modalNoticeStyle = {
  margin: "12px 0 0",
  color: "#fecaca",
  fontWeight: 850,
};

const modalActionsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginTop: "16px",
};

const modalGhostButtonStyle = {
  minHeight: "46px",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const modalDangerButtonStyle = {
  minHeight: "46px",
  border: "none",
  borderRadius: "999px",
  background: "#dc2626",
  color: "#ffffff",
  fontWeight: 950,
  cursor: "pointer",
};

const riderRatingBoxStyle = {
  marginTop: "12px",
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "14px",
  padding: "12px",
};

const ratingButtonRowStyle = {
  display: "flex",
  gap: "8px",
  marginTop: "10px",
  marginBottom: "10px",
};

const ratingButtonStyle = {
  width: "42px",
  height: "42px",
  border: "none",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.1)",
  fontSize: "1.45rem",
  lineHeight: 1,
  fontWeight: 900,
  cursor: "pointer",
  transition: "transform 120ms ease, color 120ms ease",
};

const ratingTextareaStyle = {
  width: "100%",
  minHeight: "72px",
  marginTop: "10px",
  borderRadius: "12px",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "white",
  padding: "10px",
  boxSizing: "border-box",
  resize: "vertical",
};

const ratingDoneStyle = {
  marginTop: "12px",
  background: "rgba(245, 158, 11, 0.16)",
  color: "#fde68a",
  border: "1px solid rgba(245, 158, 11, 0.28)",
  borderRadius: "12px",
  padding: "12px",
  fontWeight: 900,
};

const emptyStyle = {
  display: "grid",
  gap: "6px",
  color: "#64748b",
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  borderRadius: "14px",
  padding: "18px",
};

export default RideDashboard;
