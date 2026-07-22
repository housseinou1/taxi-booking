import React, { useCallback, useEffect, useMemo, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  approveWithdrawal,
  exportFinanceReport,
  fetchFinanceOperations,
  markWithdrawalPaid,
  rejectWithdrawal,
  REPORT_TYPES,
} from "./financeOpsApi";
import "../beta/BetaDashboard.css";
import "./FinanceOperationsCenter.css";

const TABS = [
  { id: "reconciliation", label: "Daily Reconciliation" },
  { id: "providers", label: "Payment Providers" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "revenue", label: "Revenue Analytics" },
  { id: "accounting", label: "Accounting" },
  { id: "audit", label: "Audit" },
];

const WITHDRAWAL_STATUSES = ["", "pending", "approved", "paid", "rejected"];

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function MiniBarChart({ items, valueKey = "revenue" }) {
  const max = useMemo(() => {
    const values = (items || []).map((item) => Number(item[valueKey] || 0));
    return Math.max(...values, 1);
  }, [items, valueKey]);

  if (!items?.length) {
    return <div className="beta__muted">No chart data</div>;
  }

  return (
    <div className="finance-chart">
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const height = Math.max(8, (value / max) * 100);
        return (
          <div
            key={item.date || item.label || item.start}
            className="finance-chart__bar"
            style={{ height: `${height}%` }}
            title={`${item.label || item.date}: ${formatMoney(value)}`}
          />
        );
      })}
    </div>
  );
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function FinanceOperationsCenter() {
  const [tab, setTab] = useState("reconciliation");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState("daily");
  const [withdrawalStatus, setWithdrawalStatus] = useState("");
  const [withdrawalMethod, setWithdrawalMethod] = useState("");
  const [reportType, setReportType] = useState("daily");
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const payload = await fetchFinanceOperations({
        date: selectedDate,
        period,
        withdrawal_status: withdrawalStatus || undefined,
        withdrawal_method: withdrawalMethod || undefined,
      });
      setData(payload);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load finance operations");
    } finally {
      setLoading(false);
    }
  }, [selectedDate, period, withdrawalStatus, withdrawalMethod]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 45000);
    return () => clearInterval(timer);
  }, [load]);

  const handleExport = async (kind, format, extra = {}) => {
    const response = await exportFinanceReport({
      kind,
      type: reportType,
      export_format: format,
      date_from: selectedDate,
      date_to: selectedDate,
      status: withdrawalStatus || undefined,
      payment_method: withdrawalMethod || undefined,
      ...extra,
    });
    const ext = format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv";
    downloadBlob(response, `${kind || reportType}-report.${ext}`);
    await load();
  };

  const handleWithdrawalAction = async (action, id) => {
    setActionLoading(id);
    try {
      if (action === "approve") await approveWithdrawal(id);
      else if (action === "reject") await rejectWithdrawal(id);
      else if (action === "paid") await markWithdrawalPaid(id, { payment_reference: `FIN-${id}` });
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || err?.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !data) {
    return <div className="beta">Loading finance operations…</div>;
  }

  const reconciliation = data?.reconciliation;
  const totals = reconciliation?.totals || {};
  const reconStatus = reconciliation?.reconciliation || {};
  const providers = data?.payment_providers?.providers || [];
  const withdrawals = data?.withdrawals?.withdrawals || [];
  const withdrawalSummary = data?.withdrawals?.summary || {};
  const charts = data?.revenue_analytics?.charts || {};
  const auditEntries = data?.audit?.entries || [];

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <h1>Finance Operations Center</h1>
          <p className="beta__subtitle">Accounting, reconciliation, and CEO financial oversight</p>
        </div>
        <div className="finance-toolbar">
          <label>
            Date{" "}
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          <label>
            Period{" "}
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <button type="button" className="beta__btn" onClick={load}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="beta__error">{error}</div> : null}

      <div className="finance-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`finance-tab ${tab === item.id ? "finance-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "reconciliation" ? (
        <section>
          <div style={{ marginBottom: "1rem" }}>
            <span
              className={`finance-status ${
                reconStatus.status === "balanced" ? "finance-status--balanced" : "finance-status--difference"
              }`}
            >
              {reconStatus.status === "balanced" ? "✓ Balanced" : "⚠ Difference detected"}
            </span>
            {reconStatus.difference_amount ? (
              <span className="beta__muted" style={{ marginLeft: "0.75rem" }}>
                Difference: {formatMoney(reconStatus.difference_amount)} MRU
              </span>
            ) : null}
          </div>
          <div className="beta__grid beta__grid--4">
            <MetricCard label="Ride revenue" value={formatMoney(totals.ride_revenue)} />
            <MetricCard label="Delivery revenue" value={formatMoney(totals.delivery_revenue)} />
            <MetricCard label="Platform commission" value={formatMoney(totals.platform_commission)} />
            <MetricCard label="Driver earnings" value={formatMoney(totals.driver_earnings)} />
            <MetricCard label="Courier earnings" value={formatMoney(totals.courier_earnings)} />
            <MetricCard label="Wallet deposits" value={formatMoney(totals.wallet_deposits)} />
            <MetricCard label="Wallet withdrawals" value={formatMoney(totals.wallet_withdrawals)} />
            <MetricCard label="Failed payments" value={formatMoney(totals.failed_payments)} sub={`${totals.failed_payments_count || 0} txns`} />
            <MetricCard label="Refunds" value={formatMoney(totals.refunds)} />
            <MetricCard label="Pending settlements" value={formatMoney(totals.pending_settlements)} sub={`${totals.pending_settlements_count || 0} open`} />
            <MetricCard label="Pending withdrawals" value={formatMoney(totals.pending_withdrawals)} sub={`${totals.pending_withdrawals_count || 0} requests`} />
            <MetricCard label="Wallet balance" value={formatMoney(totals.wallet_balance)} />
          </div>
        </section>
      ) : null}

      {tab === "providers" ? (
        <section className="finance-provider-grid">
          {providers.map((provider) => (
            <div key={provider.key} className="finance-provider-card">
              <h4>{provider.label}</h4>
              <div className="finance-provider-stat">
                <span>Successful</span>
                <span>
                  {provider.successful.count} · {formatMoney(provider.successful.amount)}
                </span>
              </div>
              <div className="finance-provider-stat">
                <span>Failed</span>
                <span>
                  {provider.failed.count} · {formatMoney(provider.failed.amount)}
                </span>
              </div>
              <div className="finance-provider-stat">
                <span>Pending</span>
                <span>
                  {provider.pending.count} · {formatMoney(provider.pending.amount)}
                </span>
              </div>
              <div className="finance-provider-stat">
                <span>Reversed</span>
                <span>
                  {provider.reversed.count} · {formatMoney(provider.reversed.amount)}
                </span>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "withdrawals" ? (
        <section>
          <div className="finance-toolbar">
            <label>
              Status{" "}
              <select value={withdrawalStatus} onChange={(e) => setWithdrawalStatus(e.target.value)}>
                {WITHDRAWAL_STATUSES.map((status) => (
                  <option key={status || "all"} value={status}>
                    {status || "All"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payout method{" "}
              <input
                placeholder="bankily, seddad…"
                value={withdrawalMethod}
                onChange={(e) => setWithdrawalMethod(e.target.value)}
              />
            </label>
            <button type="button" className="beta__btn" onClick={() => handleExport("withdrawals", "csv")}>
              Export payout report (CSV)
            </button>
            <button type="button" className="beta__btn" onClick={() => handleExport("withdrawals", "xlsx")}>
              Export Excel
            </button>
          </div>
          <div className="beta__grid beta__grid--4" style={{ marginBottom: "1rem" }}>
            <MetricCard label="Pending" value={formatMoney(withdrawalSummary.pending?.amount)} sub={`${withdrawalSummary.pending?.count || 0} requests`} />
            <MetricCard label="Approved" value={formatMoney(withdrawalSummary.approved?.amount)} sub={`${withdrawalSummary.approved?.count || 0} requests`} />
            <MetricCard label="Paid" value={formatMoney(withdrawalSummary.paid?.amount)} sub={`${withdrawalSummary.paid?.count || 0} requests`} />
            <MetricCard label="Total filtered" value={formatMoney(withdrawalSummary.total_amount)} />
          </div>
          <div className="beta__panel finance-table-wrap">
            <table className="beta__table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>{item.driver_name || item.driver_email}</div>
                      <div className="beta__muted">{item.driver_email}</div>
                    </td>
                    <td>{formatMoney(item.amount)} {item.currency}</td>
                    <td>{item.payout_display || item.payout_method || "—"}</td>
                    <td>{item.status}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td className="finance-actions">
                      {item.status === "pending" ? (
                        <>
                          <button type="button" disabled={actionLoading === item.id} onClick={() => handleWithdrawalAction("approve", item.id)}>
                            Approve
                          </button>
                          <button type="button" disabled={actionLoading === item.id} onClick={() => handleWithdrawalAction("reject", item.id)}>
                            Reject
                          </button>
                        </>
                      ) : null}
                      {item.status === "approved" ? (
                        <button type="button" disabled={actionLoading === item.id} onClick={() => handleWithdrawalAction("paid", item.id)}>
                          Mark paid
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "revenue" ? (
        <section>
          <div className="beta__grid beta__grid--2">
            <div className="beta__panel">
              <h3>Daily revenue</h3>
              <MiniBarChart items={charts.daily} valueKey="revenue" />
            </div>
            <div className="beta__panel">
              <h3>Weekly revenue</h3>
              <MiniBarChart items={charts.weekly} valueKey="revenue" />
            </div>
          </div>
          <div className="beta__grid beta__grid--2" style={{ marginTop: "1rem" }}>
            <div className="beta__panel finance-table-wrap">
              <h3>Revenue by service</h3>
              <table className="beta__table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Revenue</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(charts.by_service || []).map((row) => (
                    <tr key={row.service}>
                      <td>{row.label}</td>
                      <td>{formatMoney(row.revenue)}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="beta__panel finance-table-wrap">
              <h3>Revenue by payment method</h3>
              <table className="beta__table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Revenue</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(charts.by_payment_method || []).map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{formatMoney(row.revenue)}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="beta__panel finance-table-wrap" style={{ marginTop: "1rem" }}>
            <h3>Revenue by city</h3>
            <table className="beta__table">
              <thead>
                <tr>
                  <th>City</th>
                  <th>Revenue</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {(charts.by_city || []).map((row, index) => (
                  <tr key={`${row.city}-${index}`}>
                    <td>{row.city}</td>
                    <td>{formatMoney(row.revenue)}</td>
                    <td>{row.trips || row.deliveries || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "accounting" ? (
        <section>
          <div className="finance-toolbar">
            <label>
              Report{" "}
              <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                {REPORT_TYPES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="beta__btn" onClick={() => handleExport("accounting", "csv")}>
              Export CSV
            </button>
            <button type="button" className="beta__btn" onClick={() => handleExport("accounting", "xlsx")}>
              Export Excel
            </button>
            <button type="button" className="beta__btn" onClick={() => handleExport("accounting", "pdf")}>
              Export PDF
            </button>
          </div>
          <div className="beta__grid beta__grid--3">
            {Object.entries(data?.accounting || {}).map(([key, report]) => (
              <div key={key} className="beta__panel">
                <h3>{report.title || key}</h3>
                <div className="beta__muted">
                  {report.start_date} → {report.end_date}
                </div>
                <div style={{ marginTop: "0.75rem" }}>
                  <div>Gross revenue: {formatMoney(report.metrics?.gross_revenue)}</div>
                  <div>Commission: {formatMoney(report.metrics?.platform_commission)}</div>
                  <div>Net cash flow: {formatMoney(report.metrics?.net_cash_flow)}</div>
                  <div>Outstanding withdrawals: {formatMoney(report.metrics?.outstanding_withdrawals)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "audit" ? (
        <section className="beta__panel finance-table-wrap">
          <table className="beta__table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Amount</th>
                <th>Before</th>
                <th>After</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.timestamp).toLocaleString()}</td>
                  <td>{entry.user}</td>
                  <td>{entry.action}</td>
                  <td>{entry.amount ? formatMoney(entry.amount) : "—"}</td>
                  <td className="finance-audit-before">{JSON.stringify(entry.before ?? "—")}</td>
                  <td className="finance-audit-after">{JSON.stringify(entry.after ?? "—")}</td>
                  <td>{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
