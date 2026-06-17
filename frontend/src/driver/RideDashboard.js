import React, { useState } from "react";
import { API_URL } from "../apiConfig";
import RideStatusButtons from "../RideStatusButtons";
import { formatMoney } from "../marketConfig";
import MultiStopProgress, { getNavigationDestination } from "./components/MultiStopProgress";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getRidePoint = (ride, target) => {
  if (target && typeof target === "object") {
    const latValue = target.latitude != null ? target.latitude : target.lat;
    const lngValue = target.longitude != null ? target.longitude : target.lng;
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  const lat = target === "pickup" ? ride.pickup_lat : ride.destination_lat;
  const lng = target === "pickup" ? ride.pickup_lng : ride.destination_lng;
  if (lat == null || lng == null) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

const getNavigationUrls = (ride, target) => {
  const point = getRidePoint(ride, target);
  if (!point || Number.isNaN(point.lat) || Number.isNaN(point.lng)) return null;
  const dest = `${point.lat},${point.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`,
    waze: `https://www.waze.com/ul?ll=${encodeURIComponent(dest)}&navigate=yes&zoom=17`,
  };
};

const getAddress = (ride, key) =>
  ride[key] || ride[`${key}_address`] || (key === "pickup" ? "Pickup" : "Destination");

const normalizeRideStops = (ride) => {
  const rawStops = Array.isArray(ride && ride.stops)
    ? ride.stops
    : Array.isArray(ride && ride.intermediate_stops)
      ? ride.intermediate_stops
      : [];

  return rawStops
    .map((stop, index) => {
      if (!stop) return null;
      const latitudeSource =
        stop.latitude != null
          ? stop.latitude
          : stop.lat != null
            ? stop.lat
            : Array.isArray(stop.position)
              ? stop.position[0]
              : null;
      const longitudeSource =
        stop.longitude != null
          ? stop.longitude
          : stop.lng != null
            ? stop.lng
            : Array.isArray(stop.position)
              ? stop.position[1]
              : null;
      const latitude = Number(latitudeSource);
      const longitude = Number(longitudeSource);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return {
        ...stop,
        stop_order: Number(stop.stop_order != null ? stop.stop_order : index + 1),
        location_name:
          stop.location_name ||
          stop.label ||
          stop.address ||
          `Stop ${index + 1}`,
        latitude,
        longitude,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.stop_order - b.stop_order);
};

const getNavigationTarget = (ride) => {
  if (!ride || ride.status !== "in_progress") return "pickup";
  const nextStop = getNavigationDestination(normalizeRideStops(ride), ride.status);
  if (!nextStop) return "destination";
  return {
    latitude: nextStop.latitude,
    longitude: nextStop.longitude,
  };
};

const getDriverEarning = (ride) => {
  const fare = Number(ride.fare || 0);
  const appFee = Number(ride.app_fee || 0);
  const tip = Number(ride.payment_tip_amount || 0);
  return Number(ride.driver_earning ?? fare - appFee + tip);
};

const canCancelBeforeStart = (ride) =>
  ["accepted", "driver_arriving", "driver_arrived"].includes(ride.status);

const formatStatus = (status) =>
  String(status || "Active").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

const formatReceiptDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "Today";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const escapeReceiptText = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const buildDriverReceiptText = (ride) => {
  const riderName = ride.rider_name || "Rider";
  const riderPhone = ride.private_call_number || ride.rider_phone || "Not available";
  const pickup = getAddress(ride, "pickup");
  const destination = getAddress(ride, "destination");
  const fare = Number(ride.fare || 0);
  const tip = Number(ride.payment_tip_amount || 0);
  const total = fare + tip;
  const paymentStatus = ride.payment_status || "pending";
  const paidAt = formatReceiptDate(ride.completed_at || ride.updated_at || ride.created_at);

  return [
    `Yala Ride Receipt #${ride.id}`,
    `Rider: ${riderName}`,
    `Phone: ${riderPhone}`,
    `Route: ${pickup} -> ${destination}`,
    `Fare: ${formatMoney(fare)}`,
    `Tip: ${formatMoney(tip)}`,
    `Total: ${formatMoney(total)}`,
    `Payment: ${paymentStatus.replace(/_/g, " ")}`,
    `Completed: ${paidAt}`,
  ].join("\n");
};

const buildDriverReceiptHtml = (ride) => {
  const riderName = ride.rider_name || "Rider";
  const riderPhone = ride.private_call_number || ride.rider_phone || "Not available";
  const pickup = getAddress(ride, "pickup");
  const destination = getAddress(ride, "destination");
  const fare = Number(ride.fare || 0);
  const tip = Number(ride.payment_tip_amount || 0);
  const total = fare + tip;
  const paymentStatus = ride.payment_status || "pending";
  const paidAt = formatReceiptDate(ride.completed_at || ride.updated_at || ride.created_at);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Yala Driver Receipt #${escapeReceiptText(ride.id)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 28px; font-family: Inter, Arial, sans-serif; color: #0f172a; }
      .receipt { max-width: 480px; margin: 0 auto; border: 1px solid #dbe4ef; border-radius: 14px; padding: 22px; }
      .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 14px; }
      .brand { font-size: 24px; font-weight: 800; color: #00a651; }
      .meta { text-align: right; font-size: 12px; color: #64748b; font-weight: 700; }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
      .row span { color: #475569; }
      .row strong { text-align: right; }
      .total { margin-top: 14px; border-radius: 10px; background: #0f172a; color: #fff; display: flex; justify-content: space-between; padding: 12px 14px; font-size: 17px; font-weight: 800; }
      .note { margin-top: 14px; color: #64748b; font-size: 12px; font-weight: 600; text-align: center; }
    </style>
  </head>
  <body>
    <main class="receipt">
      <div class="head">
        <div>
          <div class="brand">YALA</div>
          <strong>Driver receipt</strong>
        </div>
        <div class="meta">
          <div>#${escapeReceiptText(ride.id)}</div>
          <div>${escapeReceiptText(paidAt)}</div>
        </div>
      </div>
      <div class="row"><span>Rider</span><strong>${escapeReceiptText(riderName)}</strong></div>
      <div class="row"><span>Phone</span><strong>${escapeReceiptText(riderPhone)}</strong></div>
      <div class="row"><span>Pickup</span><strong>${escapeReceiptText(pickup)}</strong></div>
      <div class="row"><span>Destination</span><strong>${escapeReceiptText(destination)}</strong></div>
      <div class="row"><span>Fare</span><strong>${escapeReceiptText(formatMoney(fare))}</strong></div>
      <div class="row"><span>Tip</span><strong>${escapeReceiptText(formatMoney(tip))}</strong></div>
      <div class="row"><span>Payment</span><strong>${escapeReceiptText(paymentStatus.replace(/_/g, " "))}</strong></div>
      <div class="total"><span>Total</span><strong>${escapeReceiptText(formatMoney(total))}</strong></div>
      <p class="note">Shared by Yala Driver App</p>
    </main>
  </body>
</html>`;
};

const printDriverReceipt = (ride) => {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    window.print();
    return;
  }

  printDocument.open();
  printDocument.write(buildDriverReceiptHtml(ride));
  printDocument.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  }, 220);
};

// ─── Main Component ──────────────────────────────────────────────────────────
function RideDashboard({ rides = [], availableRides = [], isOnline, fetchRides }) {
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelNotice, setCancelNotice] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  const activeRides = rides.filter((r) =>
    ["driver_arriving", "accepted", "driver_arrived", "in_progress"].includes(r.status)
  );
  const completedNeedAction = rides.filter(
    (r) => r.status === "completed" && (r.payment_status === "pending_verification" || !r.driver_rating)
  );
  const cancelledRides = rides.filter((r) => r.status === "cancelled");

  const refresh = () => fetchRides && fetchRides();

  const confirmPayment = async (rideId) => {
    try {
      const res = await fetch(`${API_URL}/payments/confirm-payment/${rideId}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access")}` },
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Could not confirm"); return; }
      refresh();
    } catch (e) { alert("Server error"); }
  };

  const shareReceiptToRider = async (ride) => {
    const receiptText = buildDriverReceiptText(ride);
    const shareTitle = `Yala Receipt #${ride.id}`;
    const riderPhone = ride.private_call_number || ride.rider_phone || "";
    const riderPhoneDigits = String(riderPhone).replace(/\D/g, "");

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: receiptText,
        });
        setActionNotice({ type: "success", text: "Receipt shared successfully." });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(receiptText);
      }

      if (riderPhoneDigits.length >= 8) {
        const message = encodeURIComponent(receiptText);
        window.open(`https://wa.me/${riderPhoneDigits}?text=${message}`, "_blank", "noopener,noreferrer");
        setActionNotice({ type: "success", text: "Receipt copied and WhatsApp opened for rider sharing." });
      } else {
        setActionNotice({ type: "success", text: "Receipt copied. Paste it in SMS or WhatsApp for the rider." });
      }
    } catch (error) {
      setActionNotice({ type: "error", text: "Could not share receipt right now." });
    }
  };

  const submitCancel = async () => {
    if (!cancelTarget || !canCancelBeforeStart(cancelTarget)) return;
    if (!cancelReason.trim()) { setCancelNotice({ type: "warning", text: "Select a reason" }); return; }
    try {
      setCancelSaving(true);
      const res = await fetch(`${API_URL}/rides/cancel/${cancelTarget.id}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access")}` },
        body: JSON.stringify({ reason: cancelReason.trim(), cancelled_by: "driver" }),
      });
      const data = await res.json();
      if (!res.ok) { setCancelNotice({ type: "error", text: data.detail || "Failed" }); return; }
      setCancelNotice({ type: "success", text: data.refund_status || "Cancelled" });
      setCancelTarget(null); setCancelReason(""); refresh();
    } catch (e) { setCancelNotice({ type: "error", text: "Server error" }); }
    finally { setCancelSaving(false); }
  };

  return (
    <div style={S.root}>
      {/* ── Incoming Requests ── */}
      <Section icon="📍" title="Ride Requests" count={isOnline ? availableRides.length : 0}>
        {!isOnline ? <Empty text="Go online to receive requests" /> :
         availableRides.length === 0 ? <Empty text="No requests right now" /> :
         availableRides.map((ride) => (
          <Card key={ride.id} ride={ride} tag="New" tagColor="#06c167">
            <RiderRow ride={ride} />
            <Route ride={ride} />
            <Facts ride={ride} />
            <NavLinks ride={ride} target="pickup" />
            <div style={S.footer}><RideStatusButtons ride={ride} onStatusChange={refresh} /></div>
          </Card>
        ))}
      </Section>

      {/* ── Active Trips ── */}
      <Section icon="🚗" title="Active Trip" count={activeRides.length}>
        {activeRides.length === 0 ? <Empty text="No active trip" /> :
         activeRides.map((ride) => (
          <Card key={ride.id} ride={ride} tag={formatStatus(ride.status)} tagColor="#f59e0b">
            <RiderRow ride={ride} />
            <Route ride={ride} />
            <MultiStopProgress
              stops={normalizeRideStops(ride)}
              rideStatus={ride.status}
              onNavigateToStop={(stop) => {
                const destination = encodeURIComponent(`${stop.latitude},${stop.longitude}`);
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
            />
            <Facts ride={ride} showEarnings />
            <NavLinks ride={ride} target={getNavigationTarget(ride)} />
            <div style={S.footer}>
              <RideStatusButtons ride={ride} onStatusChange={refresh} />
              {canCancelBeforeStart(ride) && (
                <button onClick={() => { setCancelTarget(ride); setCancelNotice(null); }} style={S.cancelBtn}>
                  Cancel trip
                </button>
              )}
            </div>
          </Card>
        ))}
      </Section>

      {/* ── Completed needing action ── */}
      {completedNeedAction.length > 0 && (
        <Section icon="✅" title="Needs Action" count={completedNeedAction.length}>
          {completedNeedAction.map((ride) => (
            <Card key={ride.id} ride={ride} tag="Done" tagColor="#3b82f6">
              <RiderRow ride={ride} />
              <Route ride={ride} />
              <Facts ride={ride} showEarnings />
              <div style={S.receiptActions}>
                <button onClick={() => printDriverReceipt(ride)} style={S.receiptPrintBtn}>
                  Print receipt
                </button>
                <button onClick={() => shareReceiptToRider(ride)} style={S.receiptShareBtn}>
                  Share with rider
                </button>
              </div>
              {ride.payment_status === "pending_verification" && (
                <button onClick={() => confirmPayment(ride.id)} style={S.confirmBtn}>Confirm payment received</button>
              )}
              <RiderRating ride={ride} onRated={refresh} />
            </Card>
          ))}
        </Section>
      )}

      {/* ── Cancelled ── */}
      {cancelledRides.length > 0 && (
        <Section icon="❌" title="Cancelled" count={cancelledRides.length}>
          {cancelledRides.slice(0, 3).map((ride) => (
            <Card key={ride.id} ride={ride} tag="Cancelled" tagColor="#ef4444">
              <Route ride={ride} />
              <div style={S.refund}>Authorization released · No charge</div>
            </Card>
          ))}
        </Section>
      )}

      {/* ── Cancel Modal ── */}
      {cancelTarget && (
        <div style={S.backdrop}>
          <div style={S.modal}>
            <h3 style={S.modalTitle}>Cancel trip #{cancelTarget.id}?</h3>
            <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={S.select}>
              <option value="">Select reason</option>
              <option value="Rider not responding">Rider not responding</option>
              <option value="Unsafe pickup">Unsafe pickup</option>
              <option value="Vehicle issue">Vehicle issue</option>
              <option value="Wrong location">Wrong location</option>
              <option value="Other">Other</option>
            </select>
            {cancelNotice && <p style={{ ...S.notice, color: cancelNotice.type === "error" ? "#ef4444" : "#f59e0b" }}>{cancelNotice.text}</p>}
            <div style={S.modalActions}>
              <button onClick={() => setCancelTarget(null)} style={S.ghostBtn}>Keep trip</button>
              <button onClick={submitCancel} disabled={cancelSaving} style={S.dangerBtn}>
                {cancelSaving ? "Cancelling..." : "Cancel trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelNotice && !cancelTarget && (
        <div style={{ ...S.toast, borderColor: cancelNotice.type === "success" ? "#06c167" : "#ef4444" }}>
          {cancelNotice.text}
        </div>
      )}
      {actionNotice && (
        <div style={{ ...S.toast, borderColor: actionNotice.type === "success" ? "#06c167" : "#ef4444" }}>
          {actionNotice.text}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Section({ icon, title, count, children }) {
  return (
    <section style={S.section}>
      <div style={S.sectionHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <h2 style={S.sectionTitle}>{title}</h2>
        </div>
        <span style={S.badge}>{count}</span>
      </div>
      <div style={S.cardList}>{children}</div>
    </section>
  );
}

function Empty({ text }) {
  return <div style={S.empty}>{text}</div>;
}

function Card({ ride, tag, tagColor, children }) {
  return (
    <article style={S.card}>
      <div style={S.cardHead}>
        <div>
          <span style={S.rideId}>#{ride.id}</span>
          <span style={S.fare}>{formatMoney(ride.fare)}</span>
        </div>
        <span style={{ ...S.tag, background: tagColor + "18", color: tagColor }}>{tag}</span>
      </div>
      {children}
    </article>
  );
}

function RiderRow({ ride }) {
  const name = ride.rider_name || "Rider";
  const phone = ride.private_call_number || ride.rider_phone || "";
  return (
    <div style={S.riderRow}>
      {ride.rider_picture ? (
        <img src={ride.rider_picture} alt={name} style={S.avatar} />
      ) : (
        <div style={S.avatarFallback}>{name[0]}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={S.riderName}>{name}</div>
        {phone && <div style={S.riderPhone}>{phone}</div>}
      </div>
      {phone && <a href={`tel:${phone}`} style={S.callBtn}>Call</a>}
    </div>
  );
}

function Route({ ride }) {
  const stops = normalizeRideStops(ride);
  return (
    <div style={S.route}>
      <div style={S.routeRow}>
        <span style={{ ...S.dot, background: "#06c167" }} />
        <div style={S.routeText}>{getAddress(ride, "pickup")}</div>
      </div>
      {stops.map((stop) => (
        <React.Fragment key={`route-stop-${ride.id}-${stop.stop_order}`}>
          <div style={S.routeLine} />
          <div style={S.routeRow}>
            <span style={{ ...S.dot, background: "#d4af37" }} />
            <div style={S.routeText}>{stop.location_name}</div>
          </div>
        </React.Fragment>
      ))}
      <div style={S.routeLine} />
      <div style={S.routeRow}>
        <span style={{ ...S.dot, background: "#f59e0b" }} />
        <div style={S.routeText}>{getAddress(ride, "destination")}</div>
      </div>
    </div>
  );
}

function Facts({ ride, showEarnings = false }) {
  const items = [
    ["Type", ride.ride_type || "Regular"],
    ["Distance", `${ride.distance_km || 0} km`],
    ["Fee", formatMoney(ride.app_fee)],
  ];
  if (showEarnings) items.push(["You earn", formatMoney(getDriverEarning(ride))]);
  return (
    <div style={S.facts}>
      {items.map(([l, v]) => (
        <div key={l} style={S.fact}>
          <span style={S.factLabel}>{l}</span>
          <span style={S.factValue}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function NavLinks({ ride, target }) {
  const urls = getNavigationUrls(ride, target);
  if (!urls) return null;
  return (
    <div style={S.navBox}>
      <a href={urls.google} target="_blank" rel="noreferrer" style={S.navBtn}>Google Maps</a>
      <a href={urls.waze} target="_blank" rel="noreferrer" style={{ ...S.navBtn, background: "#0891b2", borderColor: "#0891b2" }}>Waze</a>
    </div>
  );
}

function RiderRating({ ride, onRated }) {
  const [rating, setRating] = useState(ride.driver_rating || 0);
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);

  if (ride.driver_rating) {
    return <div style={S.ratedDone}>Rated: {"★".repeat(ride.driver_rating)}</div>;
  }

  const submit = async () => {
    if (!rating) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/rides/rate-rider/${ride.id}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access")}` },
        body: JSON.stringify({ rating, review }),
      });
      if (res.ok && onRated) onRated();
    } catch (e) { /* */ }
    finally { setSaving(false); }
  };

  return (
    <div style={S.ratingBox}>
      <div style={S.stars}>
        {[1,2,3,4,5].map((s) => (
          <button key={s} onClick={() => setRating(s)} style={{ ...S.star, color: rating >= s ? "#f59e0b" : "#404040" }}>★</button>
        ))}
      </div>
      <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Note (optional)" style={S.textarea} />
      <button onClick={submit} disabled={saving || !rating} style={{ ...S.confirmBtn, opacity: rating ? 1 : 0.5 }}>
        {saving ? "Saving..." : "Rate rider"}
      </button>
    </div>
  );
}

// ─── Styles (Uber/Lyft inspired) ────────────────────────────────────────────
const S = {
  root: { display: "flex", flexDirection: "column", gap: 16, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },

  section: { background: "#141414", borderRadius: 20, padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.3)" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  sectionTitle: { margin: 0, fontSize: 17, fontWeight: 700, color: "#fff" },
  badge: { minWidth: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#262626", color: "#fff", fontSize: 13, fontWeight: 700 },

  cardList: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "#1a1a1a", borderRadius: 16, padding: 18, border: "1px solid #262626", transition: "border-color 0.2s" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  rideId: { color: "#737373", fontSize: 12, fontWeight: 600, marginRight: 8 },
  fare: { color: "#fff", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" },
  tag: { padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" },

  riderRow: { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#222", borderRadius: 12, marginBottom: 12 },
  avatar: { width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 },
  avatarFallback: { width: 44, height: 44, borderRadius: "50%", background: "#f59e0b", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 },
  riderName: { color: "#fff", fontWeight: 600, fontSize: 14 },
  riderPhone: { color: "#737373", fontSize: 12, marginTop: 2 },
  callBtn: { padding: "8px 14px", borderRadius: 999, background: "#06c167", color: "#fff", fontWeight: 700, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" },

  route: { padding: "14px 16px", background: "#222", borderRadius: 12, marginBottom: 12 },
  routeRow: { display: "flex", alignItems: "center", gap: 10 },
  routeLine: { width: 2, height: 16, background: "#404040", marginLeft: 5, marginTop: 4, marginBottom: 4 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  routeText: { color: "#e5e5e5", fontSize: 14, fontWeight: 500 },

  facts: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 },
  fact: { background: "#262626", borderRadius: 10, padding: "10px 12px" },
  factLabel: { display: "block", color: "#737373", fontSize: 11, fontWeight: 600, marginBottom: 3 },
  factValue: { display: "block", color: "#fff", fontSize: 14, fontWeight: 700 },

  navBox: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 },
  navBtn: { display: "flex", alignItems: "center", justifyContent: "center", height: 42, borderRadius: 10, background: "#276ef1", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none", border: "1px solid #276ef1" },

  footer: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  cancelBtn: { width: "100%", height: 44, border: "1px solid #7f1d1d", borderRadius: 10, background: "rgba(127,29,29,0.3)", color: "#fca5a5", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  confirmBtn: { width: "100%", height: 44, border: 0, borderRadius: 10, background: "#06c167", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 8 },
  receiptActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 },
  receiptPrintBtn: {
    height: 42,
    border: "1px solid #334155",
    borderRadius: 10,
    background: "#1f2937",
    color: "#e2e8f0",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  receiptShareBtn: {
    height: 42,
    border: "1px solid #166534",
    borderRadius: 10,
    background: "rgba(22, 163, 74, 0.18)",
    color: "#86efac",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },

  refund: { padding: "12px 14px", borderRadius: 10, background: "rgba(6,193,103,0.08)", border: "1px solid rgba(6,193,103,0.2)", color: "#86efac", fontSize: 13, fontWeight: 600 },
  ratedDone: { padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.1)", color: "#fde68a", fontWeight: 700, fontSize: 13, marginTop: 8 },

  ratingBox: { marginTop: 12, padding: "14px", background: "#222", borderRadius: 12 },
  stars: { display: "flex", gap: 6, marginBottom: 10 },
  star: { width: 36, height: 36, border: 0, borderRadius: "50%", background: "#262626", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.15s" },
  textarea: { width: "100%", minHeight: 60, borderRadius: 10, border: "1px solid #333", background: "#1a1a1a", color: "#fff", padding: 10, boxSizing: "border-box", resize: "vertical", fontSize: 13 },

  empty: { padding: "24px 16px", textAlign: "center", color: "#737373", fontSize: 14, background: "#1a1a1a", borderRadius: 12, border: "1px dashed #333" },

  backdrop: { position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" },
  modal: { width: "min(400px, 100%)", background: "#1a1a1a", borderRadius: 20, padding: 24, border: "1px solid #333" },
  modalTitle: { margin: "0 0 16px", color: "#fff", fontSize: 18, fontWeight: 700 },
  select: { width: "100%", height: 46, borderRadius: 10, border: "1px solid #333", background: "#262626", color: "#fff", padding: "0 12px", fontSize: 14, fontWeight: 600 },
  notice: { margin: "12px 0 0", fontSize: 13, fontWeight: 600 },
  modalActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 },
  ghostBtn: { height: 44, borderRadius: 10, border: "1px solid #404040", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer" },
  dangerBtn: { height: 44, borderRadius: 10, border: 0, background: "#e11900", color: "#fff", fontWeight: 700, cursor: "pointer" },

  toast: { padding: "14px 18px", borderRadius: 12, border: "1px solid #06c167", background: "#141414", color: "#fff", fontWeight: 600, fontSize: 13 },
};

export default RideDashboard;
