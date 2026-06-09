import React, { useEffect, useState } from "react";

import { API_URL } from "../apiConfig";


export default function SharedTripPage({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`${API_URL}/safety/shared-trip/${token}/`);
        const next = await response.json();
        if (!response.ok) throw new Error(next.detail || "Live trip is unavailable.");
        if (active) setData(next);
      } catch (requestError) {
        if (active) setError(requestError.message);
      }
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  const trip = data?.trip;
  const driverLocation =
    trip?.driver_latitude && trip?.driver_longitude
      ? `${trip.driver_latitude},${trip.driver_longitude}`
      : "";

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <span style={eyebrowStyle}>Yala secure live trip</span>
        <h1 style={titleStyle}>{error ? "Trip link unavailable" : "Trip in progress"}</h1>
        {error && <p style={errorStyle}>{error}</p>}
        {!trip && !error && <p>Loading the latest trip information...</p>}
        {trip && (
          <>
            <div style={statusStyle}>{String(trip.status || "active").replaceAll("_", " ")}</div>
            <dl style={detailsStyle}>
              <div><dt>Pickup</dt><dd>{trip.pickup}</dd></div>
              <div><dt>Destination</dt><dd>{trip.destination}</dd></div>
              <div><dt>Driver</dt><dd>{trip.driver_name || "Driver assignment pending"}</dd></div>
              <div><dt>City</dt><dd>{trip.city || "Yala service area"}</dd></div>
              <div><dt>Last update</dt><dd>{new Date(data.last_updated).toLocaleString()}</dd></div>
              <div><dt>Link expires</dt><dd>{new Date(data.expires_at).toLocaleString()}</dd></div>
            </dl>
            {driverLocation && (
              <a
                href={`https://www.google.com/maps?q=${driverLocation}`}
                target="_blank"
                rel="noreferrer"
                style={mapLinkStyle}
              >
                View latest driver location
              </a>
            )}
            <p style={privacyStyle}>
              This secure link contains trip safety information only. Personal phone numbers are hidden.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

const pageStyle = { minHeight: "100vh", display: "grid", placeItems: "center", padding: "18px", background: "#07111f", color: "#f8fafc", fontFamily: "Inter, Arial, sans-serif" };
const cardStyle = { width: "min(680px, 100%)", border: "1px solid rgba(255,255,255,.14)", borderRadius: "8px", background: "#0d1929", padding: "22px", boxShadow: "0 24px 70px rgba(0,0,0,.35)" };
const eyebrowStyle = { color: "#facc15", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" };
const titleStyle = { margin: "7px 0 16px", letterSpacing: 0 };
const errorStyle = { color: "#fecaca" };
const statusStyle = { display: "inline-block", borderRadius: "4px", background: "#166534", padding: "6px 9px", fontWeight: 850, textTransform: "capitalize" };
const detailsStyle = { display: "grid", gap: "8px", margin: "18px 0" };
const mapLinkStyle = { display: "block", textAlign: "center", borderRadius: "6px", background: "#facc15", color: "#111827", padding: "12px", textDecoration: "none", fontWeight: 900 };
const privacyStyle = { color: "#94a3b8", fontSize: "13px", lineHeight: 1.5, marginTop: "16px" };
