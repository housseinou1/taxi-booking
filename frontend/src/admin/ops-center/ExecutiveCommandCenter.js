/**
 * Executive Command Center — Security, Audit, Support, Documents, CEO Actions
 * Mission 17 Commit 4 — Final module for the Executive Operations Center.
 *
 * No backend business logic changes. UI integration only.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";

import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";
import "./ExecutiveCommandCenter.css";

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "security", label: "Security", icon: "🔒" },
  { id: "audit", label: "Audit", icon: "📋" },
  { id: "support", label: "Support", icon: "🎧" },
  { id: "documents", label: "Documents", icon: "📄" },
  { id: "actions", label: "CEO Actions", icon: "⚡" },
];

// ─── Shared Sub-components ───────────────────────────────────────────────────

function StatCard({ label, value, icon, tone = "neutral" }) {
  return (
    <div className={`ecc-stat ecc-stat--${tone}`} aria-label={`${label}: ${value}`}>
      <span className="ecc-stat__icon" aria-hidden="true">{icon}</span>
      <div className="ecc-stat__body">
        <span className="ecc-stat__value">{value}</span>
        <span className="ecc-stat__label">{label}</span>
      </div>
    </div>
  );
}

function ActivityRow({ icon, text, time, tone = "" }) {
  return (
    <div className={`ecc-activity-row ${tone ? `ecc-activity-row--${tone}` : ""}`}>
      <span className="ecc-activity-row__icon" aria-hidden="true">{icon}</span>
      <span className="ecc-activity-row__text">{text}</span>
      <time className="ecc-activity-row__time">{time}</time>
    </div>
  );
}

function ActionButton({ icon, label, onClick, tone = "primary" }) {
  return (
    <button
      className={`ecc-action-btn ecc-action-btn--${tone}`}
      onClick={onClick}
      aria-label={label}
    >
      <span className="ecc-action-btn__icon" aria-hidden="true">{icon}</span>
      <span className="ecc-action-btn__label">{label}</span>
    </button>
  );
}

// ─── Security Panel ──────────────────────────────────────────────────────────

function SecurityPanel({ data }) {
  const sec = data?.security || {};
  const logins = sec.recent_logins || [];
  const failed = sec.failed_attempts || [];
  return (
    <div className="ecc-panel">
      <div className="ecc-stat-grid">
        <StatCard icon="👤" label="Admin Logins (24h)" value={sec.admin_logins_24h || 0} tone="blue" />
        <StatCard icon="❌" label="Failed Attempts" value={sec.failed_login_count || 0} tone="red" />
        <StatCard icon="🔐" label="Locked Accounts" value={sec.locked_accounts || 0} tone="amber" />
        <StatCard icon="🖥️" label="Active Sessions" value={sec.active_sessions || 0} tone="green" />
      </div>
      <h3 className="ecc-panel__subtitle">Recent Admin Logins</h3>
      <div className="ecc-activity-list">
        {logins.length === 0 && <p className="ecc-empty">No recent logins</p>}
        {logins.slice(0, 8).map((item, i) => (
          <ActivityRow key={i} icon="🔑" text={item.email || item.user || `Admin #${i+1}`} time={item.time || item.created_at || ""} />
        ))}
      </div>
      {failed.length > 0 && (
        <>
          <h3 className="ecc-panel__subtitle">Failed Login Attempts</h3>
          <div className="ecc-activity-list">
            {failed.slice(0, 5).map((item, i) => (
              <ActivityRow key={i} icon="⚠️" text={item.email || item.ip || "Unknown"} time={item.time || ""} tone="danger" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Audit Panel ─────────────────────────────────────────────────────────────

function AuditPanel({ data }) {
  const audit = data?.audit || {};
  const events = audit.recent_events || audit.events || [];
  return (
    <div className="ecc-panel">
      <div className="ecc-stat-grid">
        <StatCard icon="🚗" label="Ride Events" value={audit.ride_events || 0} tone="green" />
        <StatCard icon="📦" label="Delivery Events" value={audit.delivery_events || 0} tone="orange" />
        <StatCard icon="💰" label="Pricing Changes" value={audit.pricing_changes || 0} tone="blue" />
        <StatCard icon="✅" label="Approvals" value={audit.approvals || 0} tone="neutral" />
      </div>
      <h3 className="ecc-panel__subtitle">Recent System Events</h3>
      <div className="ecc-activity-list">
        {events.length === 0 && <p className="ecc-empty">No recent events</p>}
        {events.slice(0, 10).map((item, i) => (
          <ActivityRow key={i} icon="📝" text={item.description || item.action || `Event #${item.id || i+1}`} time={item.time || item.created_at || ""} />
        ))}
      </div>
    </div>
  );
}

// ─── Support Panel ───────────────────────────────────────────────────────────

function SupportPanel({ data }) {
  const sup = data?.support || {};
  return (
    <div className="ecc-panel">
      <div className="ecc-stat-grid">
        <StatCard icon="📬" label="Open Tickets" value={sup.open || 0} tone="amber" />
        <StatCard icon="⏳" label="Pending" value={sup.pending || 0} tone="orange" />
        <StatCard icon="✅" label="Closed" value={sup.closed || 0} tone="green" />
        <StatCard icon="⏱️" label="Avg Response" value={sup.avg_response_time || "—"} tone="blue" />
        <StatCard icon="🚨" label="SOS Reports" value={sup.sos_reports || 0} tone="red" />
        <StatCard icon="👤" label="Rider Complaints" value={sup.rider_complaints || 0} tone="neutral" />
        <StatCard icon="🚗" label="Driver Complaints" value={sup.driver_complaints || 0} tone="neutral" />
        <StatCard icon="📦" label="Courier Complaints" value={sup.courier_complaints || 0} tone="neutral" />
      </div>
    </div>
  );
}

// ─── Documents Panel ─────────────────────────────────────────────────────────

function DocumentsPanel({ data }) {
  const docs = data?.documents || {};
  const pending = docs.pending_list || [];
  return (
    <div className="ecc-panel">
      <div className="ecc-stat-grid">
        <StatCard icon="⏳" label="Pending Approval" value={docs.pending || 0} tone="amber" />
        <StatCard icon="✅" label="Approved" value={docs.approved || 0} tone="green" />
        <StatCard icon="❌" label="Rejected" value={docs.rejected || 0} tone="red" />
        <StatCard icon="⚠️" label="Expired" value={docs.expired || 0} tone="orange" />
      </div>
      <h3 className="ecc-panel__subtitle">Pending Document Queue</h3>
      <div className="ecc-activity-list">
        {pending.length === 0 && <p className="ecc-empty">No documents pending review</p>}
        {pending.slice(0, 8).map((item, i) => (
          <ActivityRow key={i} icon="📄" text={`${item.driver_name || item.name || "Driver"} — ${item.document_type || item.type || "Document"}`} time={item.submitted_at || item.created_at || ""} />
        ))}
      </div>
    </div>
  );
}

// ─── CEO Actions Panel ───────────────────────────────────────────────────────

function ActionsPanel() {
  const navigate = (path) => { window.location.href = path; };
  return (
    <div className="ecc-panel">
      <h3 className="ecc-panel__subtitle">Quick Actions</h3>
      <div className="ecc-actions-grid">
        <ActionButton icon="🚗" label="Approve Driver" onClick={() => navigate("/admin/drivers")} />
        <ActionButton icon="📦" label="Approve Courier" onClick={() => navigate("/admin/operations")} />
        <ActionButton icon="🚫" label="Suspend Account" onClick={() => navigate("/admin/executive")} tone="danger" />
        <ActionButton icon="🛣️" label="View Rides" onClick={() => navigate("/admin/operations")} />
        <ActionButton icon="📦" label="View Deliveries" onClick={() => navigate("/admin/operations")} />
        <ActionButton icon="💰" label="View Revenue" onClick={() => navigate("/admin/ops-center/finance")} />
        <ActionButton icon="📢" label="Emergency Broadcast" onClick={() => navigate("/admin/executive")} tone="warning" />
        <ActionButton icon="🔧" label="System Maintenance" onClick={() => navigate("/admin/executive")} tone="neutral" />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ExecutiveCommandCenter() {
  const [activeTab, setActiveTab] = useState("security");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedApi.get(
        `${API_URL}/operations/admin/dashboard/`,
        { timeout: 12000 }
      );
      setData(response.data || {});
    } catch {
      setData({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="ecc ecc--loading" role="status">
        <div className="ecc__spinner" />
        <p>Loading Command Center...</p>
      </div>
    );
  }

  return (
    <div className="ecc">
      <header className="ecc__header">
        <h1 className="ecc__title">Executive Command Center</h1>
        <p className="ecc__subtitle">Security · Audit · Support · Documents · Actions</p>
      </header>

      <nav className="ecc__tabs" aria-label="Command center sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`ecc__tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
          >
            <span aria-hidden="true">{tab.icon}</span> {tab.label}
          </button>
        ))}
      </nav>

      <main className="ecc__content">
        {activeTab === "security" && <SecurityPanel data={data} />}
        {activeTab === "audit" && <AuditPanel data={data} />}
        {activeTab === "support" && <SupportPanel data={data} />}
        {activeTab === "documents" && <DocumentsPanel data={data} />}
        {activeTab === "actions" && <ActionsPanel />}
      </main>
    </div>
  );
}
