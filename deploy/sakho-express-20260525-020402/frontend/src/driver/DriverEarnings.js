import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

function DriverEarnings() {
  const [earnings, setEarnings] = useState({
    today_earnings: 0,
    week_earnings: 0,
    total_earnings: 0,
    completed_rides: 0,
  });

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      const token = localStorage.getItem("access");

      const response = await axios.get(
        `${API_URL}/rides/driver/earnings/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setEarnings(response.data);
    } catch (error) {
      console.log("Earnings error:", error);
    }
  };

  return (
    <div
      style={{
        background: "#111827",
        padding: "25px",
        borderRadius: "18px",
        marginBottom: "25px",
      }}
    >
      <h2 style={{ marginBottom: "20px" }}>
        💰 Driver Earnings Dashboard
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px",
        }}
      >
        <div
          style={{
            background: "#16a34a",
            padding: "22px",
            borderRadius: "16px",
          }}
        >
          <h3>Today Earnings</h3>
          <h1>{earnings.today_earnings || 0} MRU</h1>
        </div>

        <div
          style={{
            background: "#2563eb",
            padding: "22px",
            borderRadius: "16px",
          }}
        >
          <h3>Week Earnings</h3>
          <h1>{earnings.week_earnings || 0} MRU</h1>
        </div>

        <div
          style={{
            background: "#f59e0b",
            color: "black",
            padding: "22px",
            borderRadius: "16px",
          }}
        >
          <h3>Total Earnings</h3>
          <h1>{earnings.total_earnings || 0} MRU</h1>
        </div>

        <div
          style={{
            background: "#334155",
            padding: "22px",
            borderRadius: "16px",
          }}
        >
          <h3>Completed Rides</h3>
          <h1>{earnings.completed_rides || 0}</h1>
        </div>
      </div>
    </div>
  );
}

export default DriverEarnings;
