import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";
import LiveMap from "./map/LiveMap";

export default function DriverDashboard() {
  const [earnings, setEarnings] = useState({
    today_earnings: 0,
    total_earnings: 0,
    completed_rides: 0,
  });

  const [currentLocation, setCurrentLocation] = useState({
    lat: 18.075,
    lng: -15.956,
  });
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    fetchDriverEarnings();
  }, []);

  const fetchDriverEarnings = async () => {
    try {
      const token = localStorage.getItem("access");

      const res = await axios.get(
        `${API_URL}/rides/driver/earnings/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setEarnings(res.data);
    } catch (error) {
      console.log("Earnings error:", error);
    }
  };

  return (
    <main style={pageStyle}>
      <section style={navStyle}>
        <div>
          <h1 style={titleStyle}>Driver</h1>
          <p style={subtitleStyle}>Accept requests, navigate, and earn.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOnline((current) => !current)}
          style={{
            ...onlineToggleStyle,
            background: isOnline ? "#16a34a" : "#334155",
          }}
        >
          <span style={onlineDotStyle} />
          {isOnline ? "Online" : "Offline"}
        </button>
      </section>

      <section style={earningsGridStyle}>
        <article style={earningCardStyle}>
          <span style={earningLabelStyle}>Today</span>
          <strong style={earningValueStyle}>{earnings.today_earnings} MRU</strong>
        </article>
        <article style={earningCardStyle}>
          <span style={earningLabelStyle}>Total</span>
          <strong style={earningValueStyle}>{earnings.total_earnings} MRU</strong>
        </article>
        <article style={earningCardStyle}>
          <span style={earningLabelStyle}>Completed</span>
          <strong style={earningValueStyle}>{earnings.completed_rides}</strong>
        </article>
      </section>

      <section style={contentGridStyle}>
        <div style={mapCardStyle}>
          <header style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>Live navigation map</h2>
            <span style={metaTextStyle}>
              {currentLocation.lat}, {currentLocation.lng}
            </span>
          </header>
          <LiveMap />
        </div>

        <div style={sideRailStyle}>
          <section style={requestCardStyle}>
            <h3 style={sectionTitleStyle}>Trip requests</h3>
            <div style={tripRequestStyle}>
              <div>
                <strong>Tevragh Zeina → Ksar</strong>
                <p style={requestMetaStyle}>4.2 km • est. 11 min • 92 MRU</p>
              </div>
              <div style={requestActionRowStyle}>
                <button type="button" style={ghostButtonStyle}>Skip</button>
                <button type="button" style={acceptButtonStyle}>Accept</button>
              </div>
            </div>
            <div style={tripRequestStyle}>
              <div>
                <strong>Sebkha → Nouadhibou Center</strong>
                <p style={requestMetaStyle}>2.6 km • est. 8 min • 63 MRU</p>
              </div>
              <div style={requestActionRowStyle}>
                <button type="button" style={ghostButtonStyle}>Skip</button>
                <button type="button" style={acceptButtonStyle}>Accept</button>
              </div>
            </div>
          </section>

          <section style={requestCardStyle}>
            <h3 style={sectionTitleStyle}>Today performance</h3>
            <p style={requestMetaStyle}>Acceptance rate 94% · Cancellation rate 2% · Online 7h 14m</p>
          </section>
        </div>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#0b0b0f",
  color: "#f8fafc",
  padding: "28px",
  fontFamily: 'Inter, "SF Pro Display", "Segoe UI", sans-serif',
};

const navStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
};

const titleStyle = { margin: 0, fontSize: "2.25rem" };
const subtitleStyle = { margin: "6px 0 0", color: "#94a3b8" };

const onlineToggleStyle = {
  border: "none",
  color: "white",
  minHeight: "50px",
  padding: "0 16px",
  borderRadius: "999px",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontWeight: 900,
  cursor: "pointer",
};

const onlineDotStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "#ffffff",
};

const earningsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "14px",
  marginTop: "22px",
};

const earningCardStyle = {
  background: "linear-gradient(145deg, #10101a 0%, #1b1b2b 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "20px",
  padding: "18px",
  display: "grid",
  gap: "6px",
};
const earningLabelStyle = { color: "#94a3b8", fontWeight: 800 };
const earningValueStyle = { fontSize: "1.45rem" };

const contentGridStyle = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr",
  gap: "16px",
  marginTop: "20px",
};

const mapCardStyle = {
  background: "#101018",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "22px",
  padding: "16px",
};

const sectionHeaderStyle = { display: "flex", justifyContent: "space-between", marginBottom: "10px" };
const sectionTitleStyle = { margin: 0, fontSize: "1rem" };
const metaTextStyle = { color: "#94a3b8", fontWeight: 700, fontSize: "0.85rem" };

const sideRailStyle = { display: "grid", gap: "12px" };
const requestCardStyle = {
  background: "#101018",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "22px",
  padding: "16px",
};
const tripRequestStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "12px",
  marginTop: "10px",
};
const requestMetaStyle = { margin: "5px 0 0", color: "#94a3b8", fontSize: "0.88rem" };
const requestActionRowStyle = { display: "flex", gap: "8px", marginTop: "10px" };
const ghostButtonStyle = { flex: 1, minHeight: "40px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#f8fafc", fontWeight: 800 };
const acceptButtonStyle = { flex: 1, minHeight: "40px", borderRadius: "10px", border: "none", background: "#16a34a", color: "white", fontWeight: 900 };
