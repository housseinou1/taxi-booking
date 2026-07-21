import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const CHECK_LABELS = {
  api: "API",
  database: "Database",
  redis: "Redis",
  celery: "Celery",
  websocket: "WebSocket (Channels)",
};

function statusColor(value) {
  if (value === "ok") return "#22c55e";
  if (value === "degraded" || value === "unknown") return "#f97316";
  return "#ef4444";
}

export default function ProductionStatus() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await authenticatedApi.get(`${API_URL}/api/health/status/`);
      setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f14", color: "#f8fafc", padding: 24, fontFamily: "Plus Jakarta Sans, Inter, sans-serif" }}>
      <a href="/admin" style={{ color: "#94a3b8", fontSize: 13 }}>← Admin</a>
      <h1 style={{ marginTop: 8 }}>Production Status</h1>
      <p style={{ color: "#94a3b8" }}>Live infrastructure health for launch certification</p>

      {loading && !data && <p>Loading…</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16, minWidth: 180 }}>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>Overall</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: statusColor(data.status) }}>{data.status}</div>
            </div>
            <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16, minWidth: 180 }}>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>Response time</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.response_time_ms} ms</div>
            </div>
            <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 16, minWidth: 180 }}>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>Celery workers</div>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.checks?.celery_workers ?? 0}</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 12, maxWidth: 640 }}>
            {Object.entries(CHECK_LABELS).map(([key, label]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "12px 16px" }}>
                <span>{label}</span>
                <span style={{ color: statusColor(data.checks?.[key]), fontWeight: 600 }}>{data.checks?.[key] || "—"}</span>
              </div>
            ))}
          </div>

          <p style={{ color: "#64748b", fontSize: 12, marginTop: 24 }}>
            Public health: <a href="https://api.yalataxi.live/health/" style={{ color: "#93c5fd" }}>https://api.yalataxi.live/health/</a>
          </p>
        </>
      )}
    </div>
  );
}
