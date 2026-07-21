import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  approveWithdrawal as approveWithdrawalApi,
  exportExecutiveReport,
  fetchExecutiveDashboard,
  fetchPendingWithdrawals,
  postAccountAction,
  postExecutiveBroadcast,
  rejectWithdrawal as rejectWithdrawalApi,
  setMaintenanceMode,
} from "./executiveApi";
import "./ExecutiveDashboard.css";

const PERIODS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function MetricCard({ label, value, tone = "" }) {
  return (
    <div className="executive__card">
      <div className="executive__metric-label">{label}</div>
      <div className={`executive__metric-value executive__metric-value--${tone}`}>{value}</div>
    </div>
  );
}

function QueueTable({ title, rows, columns }) {
  return (
    <div className="executive__card">
      <h3>{title}</h3>
      <table className="executive__table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>No records</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MapPanel({ mapData }) {
  const markers = useMemo(() => {
    const payload = mapData?.markers || {};
    const all = [
      ...(payload.drivers || []).map((item) => ({ ...item, kind: "driver" })),
      ...(payload.couriers || []).map((item) => ({ ...item, kind: "courier" })),
      ...(payload.trips || []).map((item) => ({ ...item, kind: "trip" })),
      ...(payload.deliveries || []).map((item) => ({ ...item, kind: "delivery" })),
      ...(payload.sos || []).map((item) => ({ ...item, kind: "sos" })),
    ];
    if (!all.length) return [];
    const lats = all.map((item) => item.lat);
    const lngs = all.map((item) => item.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return all.map((item) => {
      const x = maxLng === minLng ? 50 : ((item.lng - minLng) / (maxLng - minLng)) * 100;
      const y = maxLat === minLat ? 50 : (1 - (item.lat - minLat) / (maxLat - minLat)) * 100;
      return { ...item, left: `${x}%`, top: `${y}%` };
    });
  }, [mapData]);

  return (
    <div className="executive__card">
      <h2>Real-Time Map</h2>
      <div className="executive__map">
        {markers.map((marker) => (
          <span
            key={`${marker.kind}-${marker.id}-${marker.delivery_id || ""}`}
            className={`executive__marker executive__marker--${marker.kind}`}
            style={{ left: marker.left, top: marker.top }}
            title={`${marker.kind} ${marker.id}`}
          />
        ))}
      </div>
      <div className="executive__legend">
        <span className="driver">Drivers</span>
        <span className="courier">Couriers</span>
        <span className="trip">Active trips</span>
        <span className="delivery">Deliveries</span>
        <span className="sos">Emergency SOS</span>
      </div>
    </div>
  );
}

function FinanceChart({ chart = [] }) {
  const max = Math.max(...chart.map((item) => item.gross_revenue || 0), 1);
  return (
    <div className="executive__card">
      <h3>Revenue Trend</h3>
      <div className="executive__chart">
        {chart.slice(-14).map((point) => (
          <div key={point.date} style={{ flex: 1, minWidth: 0 }}>
            <div
              className="executive__bar"
              style={{ height: `${Math.max(8, (point.gross_revenue / max) * 120)}px` }}
              title={`${point.label}: ${formatMoney(point.gross_revenue)}`}
            />
            <div className="executive__bar-label">{point.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [period, setPeriod] = useState("daily");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [actionLoading, setActionLoading] = useState({});

  const [broadcastForm, setBroadcastForm] = useState({ title: "", message: "", audience: "drivers" });
  const [broadcastResult, setBroadcastResult] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);

  const [maintenanceForm, setMaintenanceForm] = useState({ enabled: false, message: "" });
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const [accountForm, setAccountForm] = useState({ email: "", action: "suspend" });
  const [accountLoading, setAccountLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [payload, withdrawals] = await Promise.all([
        fetchExecutiveDashboard({ period }),
        fetchPendingWithdrawals().catch(() => []),
      ]);
      setData(payload);
      setPendingWithdrawals(withdrawals.slice(0, 20));
      if (payload.maintenance_mode) {
        setMaintenanceForm({
          enabled: payload.maintenance_mode.enabled,
          message: payload.maintenance_mode.message || "",
        });
      }
    } catch {
      setError("Unable to load executive dashboard.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadDashboard();
    const timer = window.setInterval(loadDashboard, 30000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const response = await exportExecutiveReport({ export_format: format, period });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `yala-executive-report.${format === "xlsx" ? "xlsx" : format}`;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleBroadcast = async (event) => {
    event.preventDefault();
    if (!broadcastForm.message.trim()) return;
    setBroadcastLoading(true);
    setBroadcastResult("");
    try {
      const result = await postExecutiveBroadcast(broadcastForm);
      setBroadcastResult(`Broadcast queued to ${result.sent ?? 0} users.`);
      setBroadcastForm({ title: "", message: "", audience: "drivers" });
    } catch (err) {
      setBroadcastResult(err?.response?.data?.error || "Broadcast failed.");
    } finally {
      setBroadcastLoading(false);
    }
  };

  const handleMaintenance = async (event) => {
    event.preventDefault();
    setMaintenanceLoading(true);
    try {
      await setMaintenanceMode(maintenanceForm);
      await loadDashboard();
    } catch (err) {
      alert(err?.response?.data?.error || "Could not update maintenance mode.");
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleAccountAction = async (event) => {
    event.preventDefault();
    if (!accountForm.email.trim()) return;
    setAccountLoading(true);
    try {
      await postAccountAction(accountForm);
      setAccountForm({ email: "", action: "suspend" });
      alert("Account action applied.");
    } catch (err) {
      alert(err?.response?.data?.error || "Could not apply account action.");
    } finally {
      setAccountLoading(false);
    }
  };

  const handleWithdrawalAction = async (id, approve) => {
    setActionLoading((s) => ({ ...s, [id]: true }));
    try {
      if (approve) {
        await approveWithdrawalApi(id);
      } else {
        await rejectWithdrawalApi(id);
      }
      await loadDashboard();
    } catch (err) {
      alert(err?.response?.data?.error || "Action failed.");
    } finally {
      setActionLoading((s) => ({ ...s, [id]: false }));
    }
  };

  if (loading && !data) {
    return <div className="executive">Loading executive dashboard…</div>;
  }

  if (error && !data) {
    return (
      <div className="executive">
        <div className="executive__error">{error}</div>
      </div>
    );
  }

  const live = data?.live?.live || {};
  const today = data?.live?.today || {};
  const finance = data?.finance?.summary || {};
  const operations = data?.operations || {};
  const security = data?.security || {};
  const support = data?.support || {};
  const qa = data?.qa || {};
  const canCeo = data?.permissions?.ceo_actions;
  const qaPass = Boolean(qa.revenue_matches_payments);

  return (
    <div className="executive">
      <div className="executive__header">
        <div>
          <a href="/admin" className="executive__back-link">← Back to Admin</a>
          <h1>Yala Executive Operations</h1>
          <p>CEO · Finance · Operations — live platform monitoring</p>
        </div>
        <div className="executive__toolbar">
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIODS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => handleExport("csv")} disabled={exporting}>
            Export CSV
          </button>
          <button type="button" onClick={() => handleExport("xlsx")} disabled={exporting}>
            Export Excel
          </button>
          <button type="button" onClick={() => handleExport("pdf")} disabled={exporting}>
            Export PDF
          </button>
          <button type="button" onClick={loadDashboard} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="executive__section-title">Live Metrics</div>
      <div className="executive__grid executive__grid--metrics">
        <MetricCard label="Active Drivers" value={live.active_drivers ?? 0} tone="green" />
        <MetricCard label="Active Couriers" value={live.active_couriers ?? 0} tone="orange" />
        <MetricCard label="Active Riders" value={live.active_riders ?? 0} tone="blue" />
        <MetricCard label="Active Deliveries" value={live.active_deliveries ?? 0} tone="purple" />
        <MetricCard label="Active Trips" value={live.active_trips ?? 0} tone="blue" />
      </div>

      <div className="executive__section-title">Today</div>
      <div className="executive__grid executive__grid--metrics">
        <MetricCard label="Trips" value={today.trips ?? 0} />
        <MetricCard label="Deliveries" value={today.deliveries ?? 0} />
        <MetricCard label="Revenue" value={formatMoney(today.revenue)} tone="gold" />
        <MetricCard label="Driver Earnings" value={formatMoney(today.driver_earnings)} tone="green" />
        <MetricCard label="Platform Commission" value={formatMoney(today.platform_commission)} tone="gold" />
        <MetricCard label="Withdrawal Requests" value={today.withdrawal_requests ?? 0} />
        <MetricCard label="Refund Requests" value={today.refund_requests ?? 0} tone="red" />
      </div>

      <div className="executive__section-title">Financial Dashboard</div>
      <div className="executive__grid executive__grid--metrics">
        <MetricCard label="Gross Revenue" value={formatMoney(finance.gross_revenue)} tone="gold" />
        <MetricCard label="Platform Commission" value={formatMoney(finance.platform_commission)} tone="gold" />
        <MetricCard label="Driver Earnings" value={formatMoney(finance.driver_earnings)} tone="green" />
        <MetricCard label="Courier Earnings" value={formatMoney(finance.courier_earnings)} tone="orange" />
        <MetricCard label="Withdrawal Total" value={formatMoney(finance.withdrawal_total)} />
        <MetricCard label="Refund Total" value={formatMoney(finance.refund_total)} tone="red" />
        <MetricCard label="Wallet Balance" value={formatMoney(finance.wallet_balance)} />
        <MetricCard label="Pending Withdrawals" value={formatMoney(finance.pending_withdrawals)} tone="orange" />
      </div>

      <div className="executive__grid executive__grid--two">
        <FinanceChart chart={data?.finance?.chart || []} />
        <MapPanel mapData={data?.map} />
      </div>

      <div className="executive__section-title">Operations</div>
      <div className="executive__grid executive__grid--two">
        <QueueTable
          title="Live Ride Queue"
          rows={operations?.rides?.queue || []}
          columns={[
            { key: "id", label: "ID" },
            { key: "status", label: "Status", render: (row) => <span className="executive__pill">{row.status}</span> },
            { key: "pickup", label: "Pickup" },
            { key: "created_at", label: "Created", render: (row) => formatDate(row.created_at) },
          ]}
        />
        <QueueTable
          title="Delivery Queue"
          rows={operations?.deliveries?.queue || []}
          columns={[
            { key: "id", label: "ID" },
            { key: "status", label: "Status", render: (row) => <span className="executive__pill">{row.status}</span> },
            { key: "pickup", label: "Pickup" },
            { key: "created_at", label: "Created", render: (row) => formatDate(row.created_at) },
          ]}
        />
      </div>

      <div className="executive__section-title">Fraud & Security</div>
      <div className="executive__grid executive__grid--metrics">
        <MetricCard label="Blocked Accounts" value={security.blocked_accounts ?? 0} tone="red" />
        <MetricCard label="Suspended Drivers" value={security.suspended_drivers ?? 0} tone="orange" />
        <MetricCard label="Expired Documents" value={security.expired_documents ?? 0} />
        <MetricCard label="High Cancellation Drivers" value={security.high_cancellation_drivers ?? 0} />
        <MetricCard label="Duplicate Accounts" value={security.duplicate_accounts ?? 0} />
        <MetricCard label="Failed Logins (24h)" value={security.failed_logins_24h ?? 0} />
        <MetricCard
          label="2FA Enabled"
          value={`${security.admin_2fa?.enabled ?? 0}/${security.admin_2fa?.total ?? 0}`}
        />
        <MetricCard label="Open Fraud Flags" value={security.open_fraud_flags ?? 0} tone="red" />
      </div>

      <div className="executive__section-title">Customer Support</div>
      <div className="executive__grid executive__grid--metrics">
        <MetricCard label="Open Tickets" value={support.open_tickets ?? 0} />
        <MetricCard label="Urgent Tickets" value={support.urgent_tickets ?? 0} tone="red" />
        <MetricCard label="Refund Requests" value={support.refund_requests ?? 0} />
        <MetricCard label="Disputes" value={support.disputes ?? 0} />
        <MetricCard
          label="Avg Response Time"
          value={support.average_response_minutes ? `${support.average_response_minutes} min` : "—"}
        />
      </div>

      {canCeo && (
        <>
          <div className="executive__section-title">CEO Actions</div>
          <div className="executive__grid executive__grid--three">
            <div className="executive__card">
              <h3>Broadcast Notification</h3>
              <form onSubmit={handleBroadcast} className="executive__form">
                <input
                  placeholder="Title"
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                />
                <textarea
                  placeholder="Message"
                  rows={3}
                  value={broadcastForm.message}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                />
                <select
                  value={broadcastForm.audience}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, audience: e.target.value })}
                >
                  <option value="drivers">Drivers</option>
                  <option value="riders">Riders</option>
                  <option value="all">All Users</option>
                </select>
                <button type="submit" disabled={broadcastLoading} className="primary">
                  {broadcastLoading ? "Sending…" : "Broadcast"}
                </button>
                {broadcastResult && <p className="executive__hint">{broadcastResult}</p>}
              </form>
            </div>

            <div className="executive__card">
              <h3>Emergency Maintenance Mode</h3>
              <form onSubmit={handleMaintenance} className="executive__form">
                <label className="executive__checkbox">
                  <input
                    type="checkbox"
                    checked={maintenanceForm.enabled}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, enabled: e.target.checked })}
                  />
                  Enable maintenance mode
                </label>
                <input
                  placeholder="Maintenance message (optional)"
                  value={maintenanceForm.message}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, message: e.target.value })}
                />
                <button type="submit" disabled={maintenanceLoading}>
                  {maintenanceLoading ? "Saving…" : "Update Maintenance Mode"}
                </button>
              </form>
            </div>

            <div className="executive__card">
              <h3>Account Actions</h3>
              <form onSubmit={handleAccountAction} className="executive__form">
                <input
                  placeholder="User email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                />
                <select
                  value={accountForm.action}
                  onChange={(e) => setAccountForm({ ...accountForm, action: e.target.value })}
                >
                  <option value="suspend">Suspend</option>
                  <option value="block">Block</option>
                  <option value="reactivate">Reactivate</option>
                </select>
                <button type="submit" disabled={accountLoading} className="danger">
                  {accountLoading ? "Applying…" : "Apply Account Action"}
                </button>
              </form>
            </div>

            <div className="executive__card executive__card--wide">
              <h3>Approve Withdrawals</h3>
              {pendingWithdrawals.length === 0 ? (
                <p className="executive__muted">No pending withdrawals.</p>
              ) : (
                <div className="executive__withdrawal-list">
                  {pendingWithdrawals.map((w) => (
                    <div key={w.id} className="executive__withdrawal-row">
                      <div>
                        <div className="executive__withdrawal-amount">{formatMoney(w.amount)}</div>
                        <div className="executive__muted">#{w.id} — {w.driver_email || w.driver}</div>
                      </div>
                      <div className="executive__withdrawal-actions">
                        <button
                          className="success"
                          disabled={actionLoading[w.id]}
                          onClick={() => handleWithdrawalAction(w.id, true)}
                        >
                          Approve
                        </button>
                        <button
                          className="danger"
                          disabled={actionLoading[w.id]}
                          onClick={() => handleWithdrawalAction(w.id, false)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="executive__section-title">QA Reconciliation</div>
      <div className="executive__grid executive__grid--metrics">
        <MetricCard label="Overall QA" value={qaPass ? "PASS" : "FAIL"} tone={qaPass ? "green" : "red"} />
        <MetricCard label="Gross (Payments)" value={formatMoney(qa.gross_revenue_payments)} />
        <MetricCard label="Gross (Operations)" value={formatMoney(qa.gross_revenue_operations)} />
        <MetricCard label="Wallet Balance" value={formatMoney(qa.wallet_balance)} />
        <MetricCard label="Pending Withdrawals" value={formatMoney(qa.pending_withdrawals)} />
        <MetricCard label="Driver Trips Today" value={qa.driver_trips_today ?? 0} />
        <MetricCard label="Deliveries Today" value={qa.deliveries_today ?? 0} />
      </div>
      <div className="executive__card">
        <p className={qaPass ? "executive__qa-ok" : "executive__qa-fail"}>
          {qaPass
            ? "All automated reconciliation checks passed."
            : "Revenue mismatch detected between payments and operations. Review financial data."}
        </p>
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString();
}
