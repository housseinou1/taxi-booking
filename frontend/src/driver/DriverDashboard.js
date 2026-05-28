import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";
import LiveMap from "../maps/LiveMap";
import RideStatusButtons from "../RideStatusButtons";

const activeStatuses = new Set(["accepted", "driver_arriving", "in_progress"]);
const emptyCharts = { daily: [], weekly: [], monthly: [] };

const normalizeEarningsChart = (items = []) =>
  items.map((item) => ({
    ...item,
    earnings: Number(item.earnings || item.value || 0),
  }));

export default function DriverDashboard() {
  const [earnings, setEarnings] = useState({
    today_earnings: 0,
    week_earnings: 0,
    total_earnings: 0,
    completed_rides: 0,
    today_completed_rides: 0,
    charts: emptyCharts,
  });
  const [profile, setProfile] = useState(null);
  const [availableRides, setAvailableRides] = useState([]);
  const [driverRides, setDriverRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [chartPeriod, setChartPeriod] = useState("daily");

  const token = localStorage.getItem("access");

  const authHeaders = useMemo(
    () => ({
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
    [token]
  );

  const activeRides = useMemo(
    () => driverRides.filter((ride) => activeStatuses.has(ride.status)),
    [driverRides]
  );

  const completedRides = useMemo(
    () => driverRides.filter((ride) => ride.status === "completed"),
    [driverRides]
  );

  const cancelledRides = useMemo(
    () => driverRides.filter((ride) => ride.status === "cancelled"),
    [driverRides]
  );

  const chartData = useMemo(
    () => normalizeEarningsChart(earnings.charts?.[chartPeriod] || []),
    [chartPeriod, earnings.charts]
  );

  const acceptanceRate = useMemo(() => {
    const total = driverRides.length + availableRides.length;
    if (!total) return 100;
    return Math.round((driverRides.length / total) * 100);
  }, [availableRides.length, driverRides.length]);

  const isOnline = Boolean(profile?.is_available);

  const fetchDashboardData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      setNotice("Please log in as a driver to view this dashboard.");
      return;
    }

    try {
      const [profileResponse, availableResponse, ridesResponse, earningsResponse] =
        await Promise.all([
          axios.get(`${API_URL}/drivers/me/`, authHeaders),
          axios.get(`${API_URL}/rides/available/`, authHeaders),
          axios.get(`${API_URL}/rides/driver-rides/`, authHeaders),
          axios.get(`${API_URL}/rides/driver/earnings/`, authHeaders),
        ]);

      setProfile(profileResponse.data);
      setAvailableRides(Array.isArray(availableResponse.data) ? availableResponse.data : []);
      setDriverRides(Array.isArray(ridesResponse.data) ? ridesResponse.data : []);
      setEarnings({
        ...earningsResponse.data,
        charts: earningsResponse.data?.charts || emptyCharts,
      });
      setNotice("");
    } catch (error) {
      console.log("Driver dashboard error:", error.response?.data || error);
      setNotice(error.response?.data?.detail || "Could not load driver dashboard.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 6000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const toggleOnline = async () => {
    try {
      const nextAvailability = !isOnline;
      const response = await axios.post(
        `${API_URL}/drivers/availability/toggle/`,
        { is_available: nextAvailability },
        authHeaders
      );

      setProfile((current) => ({
        ...(current || {}),
        is_available: Boolean(response.data.is_available),
        status: response.data.status || current?.status,
      }));
      setNotice(response.data.message || (nextAvailability ? "You are online." : "You are offline."));
      fetchDashboardData();
    } catch (error) {
      console.log("Availability error:", error.response?.data || error);
      setNotice(error.response?.data?.detail || "Could not change online status.");
    }
  };

  return (
    <main className="driver-pro-page">
      <DriverDashboardStyles />

      <section className="driver-hero">
        <div>
          <span className="driver-kicker">Driver command center</span>
          <h1>Drive, earn, and manage every trip.</h1>
          <p>
            Track requests, control online status, monitor earnings, and review trip
            performance from one professional dashboard.
          </p>
        </div>

        <div className="driver-online-card">
          <div>
            <span>Status</span>
            <strong>{isOnline ? "Online" : "Offline"}</strong>
            <p>{profile?.status ? `Account ${profile.status}` : "Driver profile"}</p>
          </div>
          <button className={isOnline ? "online" : ""} onClick={toggleOnline}>
            <span />
          </button>
        </div>
      </section>

      {notice && <div className="driver-notice">{notice}</div>}

      <section className="driver-earnings-grid">
        <EarningCard label="Today" value={formatMoney(earnings.today_earnings)} tone="green" />
        <EarningCard label="This week" value={formatMoney(earnings.week_earnings)} tone="blue" />
        <EarningCard label="Total" value={formatMoney(earnings.total_earnings)} tone="gold" />
        <EarningCard
          label="Completed"
          value={earnings.completed_rides || completedRides.length}
          tone="dark"
        />
      </section>

      <section className="driver-panel driver-chart-panel">
        <SectionHeader title="Earnings analytics" subtitle="Daily, weekly, and monthly earnings" />
        <div className="driver-chart-toolbar">
          {["daily", "weekly", "monthly"].map((period) => (
            <button
              key={period}
              type="button"
              className={chartPeriod === period ? "active" : ""}
              onClick={() => setChartPeriod(period)}
            >
              {period}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 14, right: 18, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255, 255, 255, 0.1)" vertical={false} />
            <XAxis dataKey="label" stroke="rgba(226, 232, 240, 0.76)" tickLine={false} axisLine={false} />
            <YAxis
              stroke="rgba(226, 232, 240, 0.76)"
              tickFormatter={(value) => formatMoney(value)}
              tickLine={false}
              axisLine={false}
              width={82}
            />
            <Tooltip
              cursor={{ fill: "rgba(255, 255, 255, 0.08)" }}
              formatter={(value) => [formatMoney(value), "Earnings"]}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "14px",
                color: "#fff",
              }}
            />
            <Bar dataKey="earnings" fill="#22d3ee" radius={[12, 12, 4, 4]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="driver-main-grid">
        <div className="driver-left-stack">
          <section className="driver-panel driver-map-panel">
            <SectionHeader
              title="Map"
              subtitle={isOnline ? "Receiving nearby requests" : "Go online to receive trips"}
            />
            <div className="driver-map-wrap">
              <LiveMap />
            </div>
          </section>

          <section className="driver-panel">
            <SectionHeader title="Incoming trip cards" subtitle={`${availableRides.length} request(s)`} />
            <div className="driver-trip-list">
              {loading ? (
                <EmptyState title="Loading requests" text="Checking nearby riders." />
              ) : !isOnline ? (
                <EmptyState title="Offline" text="Turn on online mode to receive requests." />
              ) : availableRides.length === 0 ? (
                <EmptyState title="No incoming trips" text="New requests will appear here." />
              ) : (
                availableRides.slice(0, 4).map((ride) => (
                  <TripCard key={ride.id} ride={ride} badge="New request">
                    <RideFacts ride={ride} />
                    <RideStatusButtons ride={ride} onStatusChange={fetchDashboardData} />
                  </TripCard>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="driver-right-stack">
          <section className="driver-panel">
            <SectionHeader title="Trip analytics" subtitle="Live driver metrics" />
            <div className="driver-analytics-grid">
              <Metric label="Acceptance" value={`${acceptanceRate}%`} />
              <Metric label="Active trips" value={activeRides.length} />
              <Metric label="Cancelled" value={cancelledRides.length} />
              <Metric label="Today rides" value={earnings.today_completed_rides || 0} />
            </div>
          </section>

          <section className="driver-panel">
            <SectionHeader title="Active ride" subtitle="Current trip status" />
            {activeRides.length === 0 ? (
              <EmptyState title="No active ride" text="Accepted trips move here." />
            ) : (
              activeRides.map((ride) => (
                <TripCard key={ride.id} ride={ride} badge={formatStatus(ride.status)}>
                  <RideFacts ride={ride} showDriverEarning />
                  <RideStatusButtons ride={ride} onStatusChange={fetchDashboardData} />
                </TripCard>
              ))
            )}
          </section>

          <section className="driver-panel">
            <SectionHeader title="Ride history" subtitle="Recent completed rides" />
            <div className="driver-history-list">
              {completedRides.length === 0 ? (
                <EmptyState title="No completed rides" text="Finished trips appear here." />
              ) : (
                completedRides.slice(0, 5).map((ride) => (
                  <HistoryRow key={ride.id} ride={ride} />
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function EarningCard({ label, value, tone }) {
  return (
    <article className={`driver-earning-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="driver-section-header">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="driver-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="driver-empty">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function TripCard({ ride, badge, children }) {
  return (
    <article className="driver-trip-card">
      <div className="driver-trip-top">
        <div>
          <span>Ride #{ride.id}</span>
          <strong>{formatMoney(ride.fare)}</strong>
        </div>
        <em>{badge}</em>
      </div>
      <div className="driver-route">
        <p>{ride.pickup || ride.pickup_address || "Pickup"}</p>
        <p>{ride.destination || ride.destination_address || "Destination"}</p>
      </div>
      {children}
    </article>
  );
}

function RideFacts({ ride, showDriverEarning = false }) {
  const earning = Number(ride.driver_earning ?? Number(ride.fare || 0) - Number(ride.app_fee || 0));
  const facts = [
    ["Type", ride.ride_type || "Regular"],
    ["Distance", `${ride.distance_km || 0} km`],
    ["App fee", formatMoney(ride.app_fee)],
  ];

  if (showDriverEarning) {
    facts.push(["You earn", formatMoney(earning)]);
  }

  return (
    <div className="driver-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function HistoryRow({ ride }) {
  return (
    <div className="driver-history-row">
      <div>
        <strong>{ride.pickup || "Pickup"}</strong>
        <span>{ride.destination || "Destination"}</span>
      </div>
      <em>{formatMoney(ride.driver_earning ?? ride.fare)}</em>
    </div>
  );
}

function formatStatus(status) {
  if (!status) return "Ready";
  return status.replace(/_/g, " ");
}

function DriverDashboardStyles() {
  return (
    <style>{`
      .driver-pro-page {
        min-height: 100vh;
        padding: 24px;
        background:
          radial-gradient(circle at 12% 8%, rgba(250, 204, 21, 0.14), transparent 26%),
          radial-gradient(circle at 86% 12%, rgba(22, 163, 74, 0.14), transparent 26%),
          #05070c;
        color: #f8fafc;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .driver-pro-page * {
        box-sizing: border-box;
      }

      .driver-hero,
      .driver-earnings-grid,
      .driver-chart-panel,
      .driver-main-grid,
      .driver-notice {
        width: min(1240px, 100%);
        margin-left: auto;
        margin-right: auto;
      }

      .driver-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 20px;
        align-items: end;
        padding: 28px 0 18px;
      }

      .driver-kicker {
        display: inline-flex;
        margin-bottom: 14px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(250, 204, 21, 0.12);
        color: #facc15;
        font-size: 12px;
        font-weight: 950;
        text-transform: uppercase;
      }

      .driver-hero h1 {
        max-width: 760px;
        margin: 0;
        font-size: clamp(42px, 6vw, 74px);
        line-height: 0.95;
        letter-spacing: 0;
      }

      .driver-hero p {
        max-width: 680px;
        margin: 18px 0 0;
        color: rgba(248, 250, 252, 0.68);
        line-height: 1.6;
      }

      .driver-online-card,
      .driver-panel,
      .driver-earning-card,
      .driver-notice {
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.07);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.22);
        backdrop-filter: blur(18px);
      }

      .driver-online-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 20px;
        border-radius: 28px;
      }

      .driver-online-card span,
      .driver-earning-card span,
      .driver-section-header span,
      .driver-metric span,
      .driver-trip-top span,
      .driver-facts span,
      .driver-history-row span,
      .driver-empty span {
        color: rgba(226, 232, 240, 0.66);
        font-size: 13px;
        font-weight: 800;
      }

      .driver-online-card strong {
        display: block;
        margin: 4px 0;
        font-size: 30px;
      }

      .driver-online-card p {
        margin: 0;
        color: #94a3b8;
      }

      .driver-online-card button {
        position: relative;
        width: 76px;
        height: 42px;
        border: 0;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.35);
        cursor: pointer;
      }

      .driver-online-card button span {
        position: absolute;
        top: 5px;
        left: 5px;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        background: #fff;
        transition: transform 180ms ease;
      }

      .driver-online-card button.online {
        background: #16a34a;
      }

      .driver-online-card button.online span {
        transform: translateX(34px);
      }

      .driver-notice {
        margin-top: 10px;
        padding: 14px 16px;
        border-radius: 18px;
        color: #fde68a;
        font-weight: 850;
      }

      .driver-earnings-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-top: 16px;
      }

      .driver-earning-card {
        min-height: 142px;
        display: grid;
        align-content: space-between;
        padding: 20px;
        border-radius: 26px;
      }

      .driver-earning-card strong {
        font-size: clamp(24px, 3vw, 36px);
      }

      .driver-earning-card.green {
        background: linear-gradient(135deg, rgba(22, 163, 74, 0.25), rgba(255, 255, 255, 0.07));
      }

      .driver-earning-card.blue {
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.25), rgba(255, 255, 255, 0.07));
      }

      .driver-earning-card.gold {
        background: linear-gradient(135deg, rgba(250, 204, 21, 0.24), rgba(255, 255, 255, 0.07));
      }

      .driver-chart-panel {
        margin-top: 16px;
      }

      .driver-chart-toolbar {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-bottom: 12px;
      }

      .driver-chart-toolbar button {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        cursor: pointer;
        font-weight: 900;
        text-transform: capitalize;
      }

      .driver-chart-toolbar button.active {
        background: #facc15;
        color: #111827;
      }

      .driver-main-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.85fr);
        gap: 16px;
        margin-top: 16px;
      }

      .driver-left-stack,
      .driver-right-stack {
        display: grid;
        gap: 16px;
      }

      .driver-panel {
        padding: 18px;
        border-radius: 28px;
      }

      .driver-section-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 14px;
      }

      .driver-section-header strong {
        font-size: 22px;
      }

      .driver-map-wrap {
        min-height: 430px;
        overflow: hidden;
        border-radius: 24px;
        background: #111827;
      }

      .driver-trip-list,
      .driver-history-list {
        display: grid;
        gap: 12px;
      }

      .driver-trip-card,
      .driver-empty,
      .driver-history-row,
      .driver-metric {
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.06);
      }

      .driver-trip-card {
        padding: 16px;
      }

      .driver-trip-top,
      .driver-history-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .driver-trip-top strong {
        display: block;
        margin-top: 4px;
        font-size: 28px;
      }

      .driver-trip-top em {
        padding: 8px 10px;
        border-radius: 999px;
        background: rgba(250, 204, 21, 0.14);
        color: #facc15;
        font-size: 12px;
        font-style: normal;
        font-weight: 950;
        text-transform: capitalize;
      }

      .driver-route {
        display: grid;
        gap: 8px;
        margin: 14px 0;
        padding-left: 14px;
        border-left: 3px solid #facc15;
      }

      .driver-route p {
        margin: 0;
        color: #e2e8f0;
        font-weight: 850;
      }

      .driver-facts,
      .driver-analytics-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .driver-facts div,
      .driver-metric {
        padding: 12px;
        border-radius: 16px;
        background: rgba(15, 23, 42, 0.52);
      }

      .driver-facts strong,
      .driver-metric strong {
        display: block;
        margin-top: 4px;
        color: #fff;
      }

      .driver-empty {
        display: grid;
        gap: 6px;
        padding: 18px;
        color: #fff;
      }

      .driver-history-row {
        padding: 14px;
      }

      .driver-history-row strong,
      .driver-history-row span {
        display: block;
      }

      .driver-history-row strong {
        color: #fff;
      }

      .driver-history-row em {
        color: #facc15;
        font-style: normal;
        font-weight: 950;
      }

      @media (max-width: 980px) {
        .driver-hero,
        .driver-main-grid {
          grid-template-columns: 1fr;
        }

        .driver-earnings-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 560px) {
        .driver-pro-page {
          padding: 14px;
        }

        .driver-earnings-grid,
        .driver-facts,
        .driver-analytics-grid {
          grid-template-columns: 1fr;
        }

        .driver-panel,
        .driver-online-card,
        .driver-earning-card {
          border-radius: 22px;
        }

        .driver-map-wrap {
          min-height: 320px;
        }
      }
    `}</style>
  );
}
