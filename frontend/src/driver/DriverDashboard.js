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
    <div
      style={{
        background: "#07122b",
        minHeight: "100vh",
        color: "white",
        padding: "20px",
      }}
    >
      <h1 style={{ fontSize: "55px", fontWeight: "bold" }}>
        🚖 Driver Dashboard
      </h1>

      <p>Accept ride → Start ride → Complete ride</p>

      <div
        style={{
          background: "#1e2b45",
          padding: "15px",
          borderRadius: "12px",
          marginTop: "20px",
        }}
      >
        <strong>Current Location:</strong>{" "}
        {currentLocation.lat}, {currentLocation.lng}
      </div>

      {/* DRIVER EARNINGS SECTION */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px",
          marginTop: "25px",
        }}
      >
        <div
          style={{
            background: "#16a34a",
            padding: "25px",
            borderRadius: "15px",
            textAlign: "center",
          }}
        >
          <h2>Today Earnings</h2>

          <h1>{earnings.today_earnings} MRU</h1>
        </div>

        <div
          style={{
            background: "#2563eb",
            padding: "25px",
            borderRadius: "15px",
            textAlign: "center",
          }}
        >
          <h2>Total Earnings</h2>

          <h1>{earnings.total_earnings} MRU</h1>
        </div>

        <div
          style={{
            background: "#f59e0b",
            padding: "25px",
            borderRadius: "15px",
            textAlign: "center",
            color: "black",
          }}
        >
          <h2>Completed Rides</h2>

          <h1>{earnings.completed_rides}</h1>
        </div>
      </div>

      {/* MAP */}

      <div
        style={{
          background: "#1e2b45",
          padding: "20px",
          borderRadius: "15px",
          marginTop: "30px",
        }}
      >
        <h2>🗺️ Driver Live Map</h2>

        <LiveMap />
      </div>

      {/* AVAILABLE RIDES */}

      <div style={{ marginTop: "30px" }}>
        <h2>📞 Available Ride Requests</h2>

        <p>No available ride requests right now.</p>
      </div>

      {/* ACTIVE RIDES */}

      <div style={{ marginTop: "30px" }}>
        <h2>🚘 My Active Rides</h2>

        <p>No active rides.</p>
      </div>

      {/* COMPLETED RIDES */}

      <div style={{ marginTop: "30px" }}>
        <h2>✅ Completed Rides</h2>

        <p>No completed rides yet.</p>
      </div>
    </div>
  );
}
