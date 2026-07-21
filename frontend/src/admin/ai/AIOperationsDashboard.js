import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  fetchAIDashboard,
  fetchHotspotMap,
  postRecommendationAction,
  refreshRecommendations,
} from "./aiOperationsApi";
import "./AIOperationsDashboard.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "dispatch", label: "Smart Dispatch" },
  { id: "surge", label: "Surge Monitor" },
  { id: "hotspots", label: "Hotspot Map" },
  { id: "alerts", label: "Predictive Alerts" },
  { id: "performance", label: "Driver Scores" },
  { id: "recommendations", label: "AI Recommendations" },
  { id: "financial", label: "Financial Insights" },
];

const HOTSPOT_PERIODS = [
  { id: "hour", label: "Last hour" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
];

function categoryClass(category) {
  if (category === "Excellent") return "excellent";
  if (category === "Good") return "good";
  if (category === "Needs Attention") return "watch";
  return "risk";
}

function HeatmapGrid({ points }) {
  if (!points?.length) return <div className="ops-ai__disclaimer">No hotspot data</div>;
  return (
    <div className="ops-ai__heatmap">
      {points.slice(0, 120).map((point) => (
        <span
          key={`${point.lat}-${point.lng}-${point.ride_requests}`}
          className="ops-ai__heat-cell"
          title={`${point.label || ""} rides:${point.ride_requests} deliveries:${point.delivery_requests}`}
          style={{
            background: `rgba(139, 92, 246, ${Math.max(point.intensity, 0.08)})`,
          }}
        />
      ))}
    </div>
  );
}

export default function AIOperationsDashboard() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [hotspots, setHotspots] = useState(null);
  const [hotspotPeriod, setHotspotPeriod] = useState("hour");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const payload = await fetchAIDashboard();
      setData(payload);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (tab !== "hotspots") return;
    fetchHotspotMap(hotspotPeriod).then(setHotspots).catch(() => setHotspots(null));
  }, [tab, hotspotPeriod]);

  const canCeo = data?.permissions?.ceo_actions;

  const handleRecAction = async (id, action) => {
    if (!canCeo) {
      setMessage("CEO approval required.");
      return;
    }
    try {
      await postRecommendationAction(id, action);
      setMessage(`Recommendation ${action}d`);
      await load();
    } catch (err) {
      setMessage(err?.response?.data?.error || "Action failed");
    }
  };

  if (loading && !data) {
    return <div className="ops-ai"><div className="ops-ai__disclaimer">Loading AI operations…</div></div>;
  }

  return (
    <div className="ops-ai">
      <header className="ops-ai__header">
        <div>
          <a className="ops-ai__back-link" href="/admin">← Admin</a>
          <h1>AI Operations & Smart Dispatch</h1>
          <p>Explainable recommendations — human approval required for all actions</p>
        </div>
        {canCeo && (
          <button type="button" className="ops-ai__btn primary" onClick={async () => { await refreshRecommendations(); await load(); }}>
            Refresh recommendations
          </button>
        )}
      </header>

      {message && <div className="ops-ai__alert">{message}</div>}

      <div className="ops-ai__tabs">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={`ops-ai__tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ops-ai__grid ops-ai__grid--2">
          <div className="ops-ai__card">
            <h3>Fleet Health</h3>
            <div className="ops-ai__metrics">
              <div className="ops-ai__metric"><div className="ops-ai__metric-label">Online</div><div className="ops-ai__metric-value">{data?.fleet_health?.online_pct || 0}%</div></div>
              <div className="ops-ai__metric"><div className="ops-ai__metric-label">Busy</div><div className="ops-ai__metric-value">{data?.fleet_health?.busy_pct || 0}%</div></div>
              <div className="ops-ai__metric"><div className="ops-ai__metric-label">Idle</div><div className="ops-ai__metric-value">{data?.fleet_health?.idle_pct || 0}%</div></div>
              <div className="ops-ai__metric"><div className="ops-ai__metric-label">Expired docs</div><div className="ops-ai__metric-value">{data?.fleet_health?.expired_documents || 0}</div></div>
            </div>
          </div>
          <div className="ops-ai__card">
            <h3>Pending AI Recommendations</h3>
            {(data?.recommendations || []).slice(0, 5).map((rec) => (
              <div key={rec.id} className="ops-ai__list-item">
                <strong>{rec.title}</strong>
                <div className="ops-ai__disclaimer">{rec.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "dispatch" && (
        <div className="ops-ai__card">
          <h3>Smart Dispatch — Why this driver?</h3>
          {(data?.smart_dispatch?.rides || []).map((ride) => (
            <div key={ride.ride_id} className="ops-ai__list-item">
              <strong>Ride #{ride.ride_id}</strong> — {ride.pickup}
              {ride.selected_driver ? (
                <>
                  <div>Selected: {ride.selected_driver.driver_name} (score {ride.selected_driver.total_score})</div>
                  <ul className="ops-ai__reasons">
                    {(ride.selected_driver.reasons || []).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="ops-ai__disclaimer">No eligible driver in current search radius</div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "surge" && (
        <div className="ops-ai__card">
          <h3>Surge Monitor</h3>
          {(data?.surge_monitor?.zones || []).map((zone) => (
            <div key={`${zone.lat}-${zone.lng}`} className="ops-ai__list-item">
              <strong>{zone.label}</strong> — {zone.severity} demand
              <div className="ops-ai__disclaimer">
                {zone.requests_last_hour} requests · {zone.waiting_riders} waiting · {zone.drivers_nearby} drivers ·
                suggested {zone.suggested_surge_multiplier}x surge · reposition {zone.suggested_reposition_drivers} drivers
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "hotspots" && (
        <div className="ops-ai__card">
          <div className="ops-ai__actions">
            {HOTSPOT_PERIODS.map((p) => (
              <button key={p.id} type="button" className={`ops-ai__btn ${hotspotPeriod === p.id ? "primary" : ""}`} onClick={() => setHotspotPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <HeatmapGrid points={hotspots?.points || data?.hotspot_map?.points} />
          <div className="ops-ai__disclaimer">
            Rides: {(hotspots || data?.hotspot_map)?.summary?.ride_requests || 0} ·
            Deliveries: {(hotspots || data?.hotspot_map)?.summary?.delivery_requests || 0} ·
            Cancelled: {(hotspots || data?.hotspot_map)?.summary?.cancelled || 0}
          </div>
        </div>
      )}

      {tab === "alerts" && (
        <div className="ops-ai__card">
          <h3>Predictive Alerts</h3>
          {(data?.predictive_alerts || []).map((alert) => (
            <div key={alert.id} className="ops-ai__alert">
              <strong>{alert.type}</strong> — {alert.message}
            </div>
          ))}
        </div>
      )}

      {tab === "performance" && (
        <div className="ops-ai__card">
          <h3>Driver Performance Scores</h3>
          {(data?.driver_performance?.drivers || []).slice(0, 30).map((driver) => (
            <div key={driver.user_id} className="ops-ai__list-item">
              <span className={`ops-ai__badge ops-ai__badge--${categoryClass(driver.category)}`}>{driver.category}</span>
              <strong>{driver.driver_name}</strong> — score {driver.score}
              <div className="ops-ai__disclaimer">{driver.recommendation}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "recommendations" && (
        <div className="ops-ai__card">
          <h3>AI Recommendations</h3>
          <p className="ops-ai__disclaimer">Approve, dismiss, or mark completed. No automatic suspensions or financial actions.</p>
          {(data?.recommendations || []).map((rec) => (
            <div key={rec.id} className="ops-ai__list-item">
              <strong>{rec.title}</strong>
              <div>{rec.summary}</div>
              {rec.explanation && (
                <pre className="ops-ai__disclaimer" style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(rec.explanation, null, 2)}
                </pre>
              )}
              {canCeo && (
                <div className="ops-ai__actions">
                  <button type="button" className="ops-ai__btn primary" onClick={() => handleRecAction(rec.id, "approve")}>Approve</button>
                  <button type="button" className="ops-ai__btn muted" onClick={() => handleRecAction(rec.id, "dismiss")}>Dismiss</button>
                  <button type="button" className="ops-ai__btn" onClick={() => handleRecAction(rec.id, "complete")}>Mark completed</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "financial" && (
        <div className="ops-ai__card">
          <h3>Financial Insights</h3>
          <div className="ops-ai__metrics">
            <div className="ops-ai__metric"><div className="ops-ai__metric-label">Forecast daily</div><div className="ops-ai__metric-value">{formatMoney(data?.financial_insights?.forecast?.daily_revenue || 0)}</div></div>
            <div className="ops-ai__metric"><div className="ops-ai__metric-label">Forecast weekly</div><div className="ops-ai__metric-value">{formatMoney(data?.financial_insights?.forecast?.weekly_revenue || 0)}</div></div>
            <div className="ops-ai__metric"><div className="ops-ai__metric-label">Expected withdrawals</div><div className="ops-ai__metric-value">{formatMoney(data?.financial_insights?.forecast?.expected_withdrawals || 0)}</div></div>
            <div className="ops-ai__metric"><div className="ops-ai__metric-label">Expected refunds</div><div className="ops-ai__metric-value">{formatMoney(data?.financial_insights?.forecast?.expected_refunds || 0)}</div></div>
          </div>
          <p className="ops-ai__disclaimer">{data?.financial_insights?.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
