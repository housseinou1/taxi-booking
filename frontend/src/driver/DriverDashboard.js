import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";
import LiveMap from "./map/LiveMap";

const periodLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const chartCard = {
  background: "#11203f",
  borderRadius: "18px",
  border: "1px solid rgba(255,255,255,0.08)",
  padding: "18px",
};

const normalizeDateKey = (input) => {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const BarsChart = ({ title, data, color }) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div style={chartCard}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: "10px", alignItems: "end", minHeight: "150px" }}>
        {data.map((item) => (
          <div key={item.label} style={{ textAlign: "center" }}>
            <div style={{ height: `${Math.max(8, (item.value / maxValue) * 110)}px`, background: color, borderRadius: "10px 10px 4px 4px" }} />
            <small>{item.label}</small>
            <div style={{ fontWeight: 700 }}>{formatMoney(item.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function DriverDashboard() {
  const [earnings, setEarnings] = useState({ today_earnings: 0, total_earnings: 0, completed_rides: 0 });
  const [rides, setRides] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("access");
        const [earningsRes, ridesRes] = await Promise.all([
          axios.get(`${API_URL}/rides/driver/earnings/`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_URL}/rides/history/`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setEarnings(earningsRes.data || {});
        setRides(Array.isArray(ridesRes.data) ? ridesRes.data : []);
      } catch (error) {
        console.log("Dashboard analytics error:", error);
      }
    };

    load();
  }, []);

  const analytics = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);

    const daily = periodLabels.map((label, index) => ({ label, value: 0 }));
    const monthlyMap = {};

    rides.forEach((ride) => {
      if (ride.status !== "completed") return;
      const amount = Number(ride.fare || 0);
      const createdAt = ride.completed_at || ride.updated_at || ride.created_at;
      const key = normalizeDateKey(createdAt);
      if (!key) return;

      const date = new Date(key);
      if (date >= weekStart && date <= now) {
        const day = date.getDay();
        const mondayIndex = day === 0 ? 6 : day - 1;
        daily[mondayIndex].value += amount;
      }

      const monthLabel = date.toLocaleString("en-US", { month: "short", year: "2-digit" });
      monthlyMap[monthLabel] = (monthlyMap[monthLabel] || 0) + amount;
    });

    const monthly = Object.entries(monthlyMap)
      .slice(-6)
      .map(([label, value]) => ({ label, value }));

    return {
      weekly: daily,
      monthly,
      completed: rides.filter((ride) => ride.status === "completed").length,
      cancelled: rides.filter((ride) => ride.status === "cancelled").length,
    };
  }, [rides]);

  return (
    <div style={{ background: "#07122b", minHeight: "100vh", color: "white", padding: "24px" }}>
      <h1 style={{ fontSize: "42px", marginBottom: "18px" }}>Driver Analytics Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
        <div style={{ ...chartCard, background: "#14532d" }}><h4>Daily Earnings</h4><h2>{formatMoney(earnings.today_earnings || 0)}</h2></div>
        <div style={{ ...chartCard, background: "#1d4ed8" }}><h4>Total Earnings</h4><h2>{formatMoney(earnings.total_earnings || 0)}</h2></div>
        <div style={{ ...chartCard, background: "#854d0e" }}><h4>Completed Rides</h4><h2>{earnings.completed_rides || analytics.completed}</h2></div>
        <div style={{ ...chartCard, background: "#991b1b" }}><h4>Cancelled Rides</h4><h2>{analytics.cancelled}</h2></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "14px", marginTop: "18px" }}>
        <BarsChart title="Weekly Earnings" data={analytics.weekly} color="#22d3ee" />
        <BarsChart title="Monthly Earnings" data={analytics.monthly.length ? analytics.monthly : [{ label: "No data", value: 0 }]} color="#f97316" />
      </div>

      <div style={{ ...chartCard, marginTop: "18px" }}>
        <h3>Live Map</h3>
        <LiveMap />
      </div>
    </div>
  );
}
