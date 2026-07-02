import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import CourierSubpageShell from "./CourierSubpageShell";
import { apiRequest } from "./DeliveryShared";
import "./delivery-courier-flow.css";

const PERIODS = [
  { key: "today", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

function formatOnlineDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function readTodayOnlineMs() {
  try {
    const raw = localStorage.getItem("yala_delivery_online_ms");
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (parsed?.date !== today) return 0;
    return Number(parsed.ms || 0);
  } catch {
    return 0;
  }
}

export default function DeliveryCourierEarnings() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("today");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await apiRequest(`${API_URL}/deliveries/courier/earnings/`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bucket = data?.[period] || { earnings: "0", count: 0, commission: "0" };
  const wallet = data?.wallet || {};
  const earnings = Number(bucket.earnings || 0);
  const count = Number(bucket.count || 0);
  const perDelivery = count > 0 ? earnings / count : 0;
  const onlineMs = period === "today" ? readTodayOnlineMs() : 0;

  const periodLabel = useMemo(() => {
    if (period === "week") return "This week";
    if (period === "month") return "This month";
    return "Today";
  }, [period]);

  return (
    <CourierSubpageShell title="Earnings" activeNav="earnings">
      <div className="ccf-period-tabs" role="tablist">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={period === item.key ? "is-active" : ""}
            onClick={() => setPeriod(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? <p className="delivery-uber__toast is-error">{error}</p> : null}
      {loading ? <p className="ccf-empty">Loading earnings…</p> : null}

      {!loading ? (
        <>
          <div className="ccf-earnings-hero">
            <small>{periodLabel}</small>
            <strong>{earnings.toFixed(0)} MRU</strong>
            <div className="ccf-earnings-stats">
              <div>
                <span>{count}</span>
                <small>Deliveries</small>
              </div>
              <div>
                <span>{period === "today" ? formatOnlineDuration(onlineMs) : "—"}</span>
                <small>Online time</small>
              </div>
              <div>
                <span>{perDelivery.toFixed(0)}</span>
                <small>MRU / delivery</small>
              </div>
            </div>
          </div>

          <div className="delivery-uber__summary-card" style={{ marginBottom: 16 }}>
            <h3>Wallet</h3>
            <div className="delivery-uber__summary-row">
              <span>Available balance</span>
              <strong>{Number(wallet.available_balance || 0).toFixed(0)} MRU</strong>
            </div>
            <div className="delivery-uber__summary-row">
              <span>Pending</span>
              <strong>{Number(wallet.pending_balance || 0).toFixed(0)} MRU</strong>
            </div>
            <div className="delivery-uber__summary-row">
              <span>{periodLabel} commission</span>
              <strong>{Number(bucket.commission || 0).toFixed(0)} MRU</strong>
            </div>
          </div>

          <button
            type="button"
            className="ccf-btn ccf-btn--primary"
            onClick={() => {
              window.location.href = "/delivery/wallet";
            }}
          >
            Request payout
          </button>
        </>
      ) : null}
    </CourierSubpageShell>
  );
}
