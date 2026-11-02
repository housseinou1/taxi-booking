import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { AdminPageTitle } from "../layouts/AdminPageHeading";

const CHECK_LABELS = {
  api: "API",
  database: "Database",
  redis: "Redis",
  celery: "Celery",
  websocket: "WebSocket (Channels)",
};

// Statuses that are honest but not failures in a local environment. They must not be painted
// the same red as a real outage, or operators will chase non-problems — but they must also not
// be painted green, because they are genuinely not production-ready.
const AMBER = new Set(["degraded", "unknown", "not_configured", "local_only", "no_workers"]);
const GREEN = new Set(["ok"]);
const RED = new Set(["error", "critical", "unreachable"]);

function statusColor(value) {
  if (GREEN.has(value)) return "#22c55e";
  if (AMBER.has(value)) return "#f97316";
  if (RED.has(value)) return "#ef4444";
  return "#94a3b8";
}

function statusMeaning(key, value) {
  const meanings = {
    "redis:not_configured": "No Redis is configured here; the cache is in-process memory.",
    "redis:error": "Redis is configured but unreachable.",
    "celery:unreachable": "The broker is unreachable, so no worker can connect.",
    "celery:no_workers": "The broker is up but no worker has registered.",
    "celery:ok": "A worker answered the ping.",
    "websocket:local_only": "In-memory channel layer — single process only.",
    "websocket:not_configured": "No channel layer configured.",
  };
  return meanings[`${key}:${value}`] || "";
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
      <h1 style={{ marginTop: 8 }}><AdminPageTitle>Production Status</AdminPageTitle></h1>
      <p style={{ color: "#94a3b8" }}>Live infrastructure health for launch certification</p>

      {loading && !data && <p>Loading…</p>}
      {error && <p style={{ color: "#fca5a5" }}>{error}</p>}

      {data && (
        <>
          {data.environment?.is_local_development && (
            <div
              style={{
                background: "#3f2d0b",
                border: "1px solid #a16207",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 20,
              }}
            >
              <strong style={{ color: "#fbbf24" }}>Local development</strong>
              <div style={{ color: "#fcd34d", fontSize: 13, marginTop: 4 }}>
                These figures describe <strong>this local machine only</strong> — not production.
                {data.environment?.broker_transport
                  ? ` Broker transport: ${data.environment.broker_transport}.`
                  : ""}
                {data.environment?.cache_backend
                  ? ` Cache backend: ${data.environment.cache_backend}.`
                  : ""}
              </div>
            </div>
          )}

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

          <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
            {Object.entries(CHECK_LABELS).map(([key, label]) => {
              const value = data.checks?.[key];
              const meaning = statusMeaning(key, value);
              return (
                <div key={key} style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{label}</span>
                    <span style={{ color: statusColor(value), fontWeight: 600 }}>{value || "—"}</span>
                  </div>
                  {meaning && (
                    <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{meaning}</div>
                  )}
                </div>
              );
            })}
          </div>

          {data.celery_broker && (
            <p style={{ color: "#64748b", fontSize: 12, marginTop: 20 }}>
              Celery broker: <code style={{ color: "#cbd5e1" }}>{data.celery_broker}</code>
            </p>
          )}

          {Array.isArray(data.notes) && data.notes.length > 0 && (
            <div style={{ maxWidth: 720, marginTop: 12 }}>
              <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>Notes</div>
              <ul style={{ color: "#cbd5e1", fontSize: 13, margin: 0, paddingLeft: 18 }}>
                {data.notes.map((note) => (
                  <li key={note} style={{ marginBottom: 4 }}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ color: "#64748b", fontSize: 12, marginTop: 24 }}>
            Public health: <a href="https://api.yalataxi.live/health/" style={{ color: "#93c5fd" }}>https://api.yalataxi.live/health/</a>
          </p>
        </>
      )}

    </div>
  );
}
