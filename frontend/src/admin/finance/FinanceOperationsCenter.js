import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatMoney } from "../../marketConfig";
import { DataTable, KPICard, StatusChip } from "../components/library";
import {
  approveWithdrawal,
  exportFinanceReport,
  fetchFinanceOperations,
  markWithdrawalPaid,
  rejectWithdrawal,
  REPORT_TYPES,
} from "./financeOpsApi";
import "./FinanceOperationsCenter.css";
import { ChangeSummary } from "../components/library/data/StructuredValue";
import useUrlTab from "../layouts/useUrlTab";

/**
 * Finance Operations Center (/admin/finance-ops).
 *
 * Enterprise financial administration view: reconciliation status, revenue,
 * earnings, wallet and payment health, provider readiness, withdrawal queue,
 * revenue analytics, accounting reports and the finance audit trail.
 *
 * Every value is rendered from the existing `/operations/business/finance/
 * operations/` payload — nothing is calculated or invented client-side.
 */

const TABS = [
  { id: "reconciliation", label: "Daily Reconciliation" },
  { id: "providers", label: "Payment Providers" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "revenue", label: "Revenue Analytics" },
  { id: "accounting", label: "Accounting" },
  { id: "audit", label: "Audit" },
];

const WITHDRAWAL_STATUSES = ["", "pending", "approved", "paid", "rejected"];

const PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Human-readable label for a backend status key. */
function statusLabel(status) {
  if (!status) return "Unknown";
  return String(status)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function withdrawalTone(status) {
  if (status === "paid" || status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

/** Reconciliation status pill. */
function ReconciliationPill({ status }) {
  const balanced = status === "balanced";
  return (
    <span
      className={`finance-status ${
        balanced ? "finance-status--balanced" : "finance-status--difference"
      }`}
    >
      <span aria-hidden="true">{balanced ? "✓" : "⚠"}</span>
      {balanced ? "Balanced" : "Difference detected"}
    </span>
  );
}

/** A titled group of financial KPI cards. */
function MetricSection({ id, title, hint, cards, loading, error, onRefresh }) {
  return (
    <section className="finance-ops__section" aria-labelledby={`finance-section-${id}`}>
      <div className="finance-ops__section-head">
        <h3 className="finance-ops__section-title" id={`finance-section-${id}`}>
          {title}
        </h3>
        {hint ? <p className="finance-ops__section-hint">{hint}</p> : null}
      </div>
      <div className="finance-ops__kpi-grid">
        {cards.map((card) => (
          <KPICard
            key={card.label}
            label={card.label}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            tone={card.tone}
            loading={loading}
            error={error}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </section>
  );
}

function MiniBarChart({ items, valueKey = "revenue" }) {
  const max = useMemo(() => {
    const values = (items || []).map((item) => Number(item[valueKey] || 0));
    return Math.max(...values, 1);
  }, [items, valueKey]);

  if (!items?.length) {
    return <div className="finance-ops__muted">No chart data</div>;
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
  const [tab, setTab] = useUrlTab(TABS.map((item) => item.id), "reconciliation");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState("daily");
  const [withdrawalStatus, setWithdrawalStatus] = useState("");
  const [withdrawalMethod, setWithdrawalMethod] = useState("");
  const [reportType, setReportType] = useState("daily");
  const [actionLoading, setActionLoading] = useState(null);
  const [auditFilters, setAuditFilters] = useState({
    date_from: "",
    date_to: "",
    user: "",
    action: "",
  });
  const tabRefs = useRef([]);

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
      setError(
        err?.response?.data?.error || err?.response?.data?.detail || err?.message || "Action failed"
      );
    } finally {
      setActionLoading(null);
    }
  };

  // WAI-ARIA tab keyboard navigation.
  const handleTabKeyDown = useCallback((event, index) => {
    const lastIndex = TABS.length - 1;
    let nextIndex = null;

    if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1;
    else if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = lastIndex;

    if (nextIndex === null) return;

    event.preventDefault();
    setTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  }, [setTab]);

  const reconciliation = data?.reconciliation;
  const totals = reconciliation?.totals || {};
  const reconStatus = reconciliation?.reconciliation || {};
  const providers = data?.payment_providers?.providers || [];
  const withdrawals = data?.withdrawals?.withdrawals || [];
  const withdrawalSummary = data?.withdrawals?.summary || {};
  const charts = data?.revenue_analytics?.charts || {};
  const auditEntries = useMemo(() => data?.audit?.entries || [], [data]);

  // ── Audit filtering ───────────────────────────────────────────────────────
  // The dashboard endpoint returns the audit trail as a COMPLETE array (the
  // backend's latest 100 entries for its 30-day window) — it is not paginated,
  // so filtering/sorting here covers the whole returned set rather than a single
  // page. There is no server-side audit filter/pagination to delegate to.
  const auditUserOptions = useMemo(
    () => Array.from(new Set(auditEntries.map((entry) => entry.user).filter(Boolean))).sort(),
    [auditEntries]
  );

  const auditActionOptions = useMemo(
    () => Array.from(new Set(auditEntries.map((entry) => entry.action).filter(Boolean))).sort(),
    [auditEntries]
  );

  const filteredAuditEntries = useMemo(
    () =>
      auditEntries.filter((entry) => {
        if (auditFilters.user && entry.user !== auditFilters.user) return false;
        if (auditFilters.action && entry.action !== auditFilters.action) return false;
        const day = entry.timestamp ? String(entry.timestamp).slice(0, 10) : "";
        if (auditFilters.date_from && day && day < auditFilters.date_from) return false;
        if (auditFilters.date_to && day && day > auditFilters.date_to) return false;
        return true;
      }),
    [auditEntries, auditFilters]
  );

  const setAuditFilter = (key, value) =>
    setAuditFilters((current) => ({ ...current, [key]: value }));

  const periodLabel = PERIODS.find((item) => item.value === period)?.label || period;
  const reportingPeriod = data?.period
    ? `${periodLabel} · ${data?.date || selectedDate}`
    : `${periodLabel} · ${selectedDate}`;
  const lastUpdated = data?.generated_at ? new Date(data.generated_at) : null;

  if (loading && !data) {
    return (
      <div className="finance-ops">
        <p className="finance-ops__muted" role="status">
          Loading finance operations…
        </p>
      </div>
    );
  }

  const renderReconciliation = () => (
    <div className="finance-ops__panel">
      <MetricSection
        id="revenue"
        title="Revenue"
        hint={`${periodLabel} · ${selectedDate}`}
        loading={loading}
        error={error}
        onRefresh={load}
        cards={[
          { label: "Ride revenue", value: formatMoney(totals.ride_revenue), icon: "🚗", tone: "info" },
          { label: "Delivery revenue", value: formatMoney(totals.delivery_revenue), icon: "📦", tone: "info" },
          {
            label: "Platform commission",
            value: formatMoney(totals.platform_commission),
            icon: "🏦",
            tone: "success",
            subtitle: "Commission retained by Yala",
          },
        ]}
      />

      <MetricSection
        id="earnings"
        title="Earnings"
        hint="Paid out to driver and courier partners"
        loading={loading}
        error={error}
        onRefresh={load}
        cards={[
          { label: "Driver earnings", value: formatMoney(totals.driver_earnings), icon: "🧑‍✈️", tone: "success" },
          { label: "Courier earnings", value: formatMoney(totals.courier_earnings), icon: "🛵", tone: "success" },
        ]}
      />

      <MetricSection
        id="wallets"
        title="Wallets"
        hint="Customer wallet movements and balance"
        loading={loading}
        error={error}
        onRefresh={load}
        cards={[
          { label: "Wallet deposits", value: formatMoney(totals.wallet_deposits), icon: "⬇️", tone: "info" },
          { label: "Wallet withdrawals", value: formatMoney(totals.wallet_withdrawals), icon: "⬆️", tone: "info" },
          { label: "Wallet balance", value: formatMoney(totals.wallet_balance), icon: "👛", tone: "neutral" },
        ]}
      />

      <MetricSection
        id="payments"
        title="Payments"
        hint="Payment health, refunds and open obligations"
        loading={loading}
        error={error}
        onRefresh={load}
        cards={[
          {
            label: "Failed payments",
            value: formatMoney(totals.failed_payments),
            icon: "⚠️",
            tone: "danger",
            subtitle: `${totals.failed_payments_count || 0} transactions`,
          },
          { label: "Refunds", value: formatMoney(totals.refunds), icon: "↩️", tone: "warning" },
          {
            label: "Pending settlements",
            value: formatMoney(totals.pending_settlements),
            icon: "⏳",
            tone: "warning",
            subtitle: `${totals.pending_settlements_count || 0} open`,
          },
          {
            label: "Pending withdrawals",
            value: formatMoney(totals.pending_withdrawals),
            icon: "⏳",
            tone: "warning",
            subtitle: `${totals.pending_withdrawals_count || 0} requests`,
          },
        ]}
      />

      <section className="finance-ops__section" aria-labelledby="finance-section-recon">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-recon">
            Reconciliation Detail
          </h3>
          <p className="finance-ops__section-hint">
            Operations totals vs payments totals for the selected period
          </p>
        </div>
        <div className="finance-ops__metrics">
          <div className="finance-ops__metric">
            <span className="finance-ops__metric-label">Operations total</span>
            <span className="finance-ops__metric-value">
              {formatMoney(reconStatus.operations_total)}
            </span>
          </div>
          <div className="finance-ops__metric">
            <span className="finance-ops__metric-label">Payments total</span>
            <span className="finance-ops__metric-value">
              {formatMoney(reconStatus.payments_total)}
            </span>
          </div>
          <div className="finance-ops__metric">
            <span className="finance-ops__metric-label">Difference</span>
            <span className="finance-ops__metric-value">
              {formatMoney(reconStatus.difference_amount)}
            </span>
          </div>
          <div className="finance-ops__metric">
            <span className="finance-ops__metric-label">Reconciliation date</span>
            <span className="finance-ops__metric-value">{reconciliation?.date || selectedDate}</span>
          </div>
        </div>
      </section>
    </div>
  );

  const renderProviders = () => (
    <div className="finance-ops__panel">
      {/* ── Provider Overview ─────────────────────────────────────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-providers">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-providers">
            Provider Overview
          </h3>
          <p className="finance-ops__section-hint">
            Configured providers, mapped payment methods and activity for this period
          </p>
        </div>
        {providers.length === 0 ? (
          <p className="finance-ops__notice">No provider activity recorded for this period.</p>
        ) : (
          <div className="finance-provider-grid">
            {providers.map((provider) => {
              const activity =
                (provider.successful?.count || 0) +
                (provider.failed?.count || 0) +
                (provider.pending?.count || 0) +
                (provider.reversed?.count || 0);
              return (
                <div key={provider.key} className="finance-provider-card">
                  <div className="finance-provider-card__head">
                    <h4>{provider.label}</h4>
                    <StatusChip
                      label={activity > 0 ? "Activity recorded" : "No activity"}
                      tone={activity > 0 ? "success" : "neutral"}
                    />
                  </div>
                  <p className="finance-ops__muted">
                    {Array.isArray(provider.methods) && provider.methods.length
                      ? `Methods: ${provider.methods.join(", ")}`
                      : "No payment methods mapped"}
                  </p>
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
              );
            })}
          </div>
        )}
      </section>

      {/* ── Transaction Performance ───────────────────────────────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-provider-perf">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-provider-perf">
            Transaction Performance
          </h3>
          <p className="finance-ops__section-hint">
            Counts and amounts by outcome, per provider
          </p>
        </div>
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col" className="finance-table__cell--right">
                  Successful
                </th>
                <th scope="col" className="finance-table__cell--right">
                  Failed
                </th>
                <th scope="col" className="finance-table__cell--right">
                  Pending
                </th>
                <th scope="col" className="finance-table__cell--right">
                  Reversed
                </th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr>
                  <td className="finance-table__empty" colSpan={5}>
                    No provider transactions recorded for this period.
                  </td>
                </tr>
              ) : (
                providers.map((provider) => (
                  <tr key={`perf-${provider.key}`}>
                    <td>{provider.label}</td>
                    <td className="finance-table__cell--right">
                      {provider.successful.count} · {formatMoney(provider.successful.amount)}
                    </td>
                    <td className="finance-table__cell--right">
                      {provider.failed.count} · {formatMoney(provider.failed.amount)}
                    </td>
                    <td className="finance-table__cell--right">
                      {provider.pending.count} · {formatMoney(provider.pending.amount)}
                    </td>
                    <td className="finance-table__cell--right">
                      {provider.reversed.count} · {formatMoney(provider.reversed.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Settlement Information ────────────────────────────────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-provider-settle">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-provider-settle">
            Settlement Information
          </h3>
        </div>
        <p className="finance-ops__notice">
          Provider-side settlement files are <strong>not available</strong> from this endpoint —
          it reports stored transaction outcomes only. Settlement destinations are shown read-only
          under <strong>Settlement Accounts</strong>; reconciliation figures come from{" "}
          <strong>Daily Reconciliation</strong>.
        </p>
      </section>
    </div>
  );

  const renderWithdrawals = () => {
    const withdrawalColumns = [
      {
        id: "driver",
        label: "Driver",
        render: (row) => (
          <div>
            <div>{row.driver}</div>
            <div className="finance-ops__muted">{row.email}</div>
          </div>
        ),
      },
      {
        id: "amount",
        label: "Amount",
        align: "right",
        render: (row) => `${row.amount} ${row.currency || ""}`.trim(),
      },
      { id: "method", label: "Method" },
      {
        id: "status",
        label: "Status",
        render: (row) => (
          <StatusChip label={statusLabel(row.status)} tone={withdrawalTone(row.status)} />
        ),
      },
      { id: "created_at", label: "Created" },
    ];

    const withdrawalRows = withdrawals.map((item) => ({
      id: item.id,
      driver: item.driver_name || item.driver_email || "—",
      email: item.driver_email || "",
      amount: formatMoney(item.amount),
      currency: item.currency,
      method: item.payout_display || item.payout_method || "—",
      status: item.status,
      created_at: item.created_at ? new Date(item.created_at).toLocaleString() : "—",
    }));

    return (
      <div className="finance-ops__panel">
        <section className="finance-ops__section" aria-labelledby="finance-section-withdrawals">
          <div className="finance-ops__section-head">
            <h3 className="finance-ops__section-title" id="finance-section-withdrawals">
              Withdrawal Queue
            </h3>
            <p className="finance-ops__section-hint">
              Approvals and payouts are recorded in the finance audit trail
            </p>
          </div>

          <div className="finance-toolbar">
            <label className="finance-ops__control">
              <span className="finance-ops__control-label">Status</span>
              <select
                className="finance-ops__select"
                value={withdrawalStatus}
                onChange={(e) => setWithdrawalStatus(e.target.value)}
                aria-label="Filter withdrawals by status"
              >
                {WITHDRAWAL_STATUSES.map((status) => (
                  <option key={status || "all"} value={status}>
                    {status ? statusLabel(status) : "All statuses"}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-ops__control">
              <span className="finance-ops__control-label">Payout method</span>
              <input
                className="finance-ops__date"
                placeholder="bankily, seddad…"
                value={withdrawalMethod}
                onChange={(e) => setWithdrawalMethod(e.target.value)}
                aria-label="Filter withdrawals by payout method"
              />
            </label>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => handleExport("withdrawals", "csv")}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => handleExport("withdrawals", "xlsx")}
            >
              Export Excel
            </button>
          </div>

          <div className="finance-ops__metrics">
            <div className="finance-ops__metric">
              <span className="finance-ops__metric-label">Pending</span>
              <span className="finance-ops__metric-value">
                {formatMoney(withdrawalSummary.pending?.amount)}
              </span>
              <span className="finance-ops__muted">
                {withdrawalSummary.pending?.count || 0} requests
              </span>
            </div>
            <div className="finance-ops__metric">
              <span className="finance-ops__metric-label">Approved</span>
              <span className="finance-ops__metric-value">
                {formatMoney(withdrawalSummary.approved?.amount)}
              </span>
              <span className="finance-ops__muted">
                {withdrawalSummary.approved?.count || 0} requests
              </span>
            </div>
            <div className="finance-ops__metric">
              <span className="finance-ops__metric-label">Paid</span>
              <span className="finance-ops__metric-value">
                {formatMoney(withdrawalSummary.paid?.amount)}
              </span>
              <span className="finance-ops__muted">
                {withdrawalSummary.paid?.count || 0} requests
              </span>
            </div>
            <div className="finance-ops__metric">
              <span className="finance-ops__metric-label">Total filtered</span>
              <span className="finance-ops__metric-value">
                {formatMoney(withdrawalSummary.total_amount)}
              </span>
            </div>
          </div>

          <DataTable
            title="Withdrawals"
            columns={withdrawalColumns}
            rows={withdrawalRows}
            loading={loading}
            error={error}
            emptyMessage="No withdrawal requests match the current filters."
            searchPlaceholder="Search withdrawals…"
            exportFilename="yala-withdrawals"
            onRefresh={load}
            rowActions={(row) => (
              <div className="finance-actions">
                {row.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--ghost"
                      disabled={actionLoading === row.id}
                      onClick={() => handleWithdrawalAction("approve", row.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--ghost"
                      disabled={actionLoading === row.id}
                      onClick={() => handleWithdrawalAction("reject", row.id)}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
                {row.status === "approved" ? (
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    disabled={actionLoading === row.id}
                    onClick={() => handleWithdrawalAction("paid", row.id)}
                  >
                    Mark paid
                  </button>
                ) : null}
              </div>
            )}
          />
        </section>
      </div>
    );
  };

  const renderRevenue = () => (
    <div className="finance-ops__panel">
      {/* ── Revenue Overview (from the reconciliation totals) ─────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-rev-overview">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-rev-overview">
            Revenue Overview
          </h3>
          <p className="finance-ops__section-hint">
            {periodLabel} · {selectedDate}
          </p>
        </div>
        <div className="finance-ops__kpi-grid">
          <KPICard
            label="Gross revenue"
            value={formatMoney(totals.gross_revenue)}
            icon="💰"
            tone="success"
            subtitle="Recorded for the selected period"
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Ride revenue"
            value={formatMoney(totals.ride_revenue)}
            icon="🚗"
            tone="info"
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Delivery revenue"
            value={formatMoney(totals.delivery_revenue)}
            icon="📦"
            tone="info"
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Platform commission"
            value={formatMoney(totals.platform_commission)}
            icon="🏦"
            tone="success"
            subtitle="Retained by Yala"
            loading={loading}
            error={error}
            onRefresh={load}
          />
        </div>
      </section>

      {/* ── Revenue by Reporting Period ───────────────────────────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-trends">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-trends">
            Revenue by Reporting Period
          </h3>
          <p className="finance-ops__section-hint">
            Recorded revenue series from the revenue analytics service
          </p>
        </div>
        <div className="finance-ops__split">
          <div className="finance-ops__card">
            <h4>Daily revenue</h4>
            <MiniBarChart items={charts.daily} valueKey="revenue" />
          </div>
          <div className="finance-ops__card">
            <h4>Weekly revenue</h4>
            <MiniBarChart items={charts.weekly} valueKey="revenue" />
          </div>
          <div className="finance-ops__card">
            <h4>Monthly revenue</h4>
            <MiniBarChart items={charts.monthly} valueKey="revenue" />
          </div>
          <div className="finance-ops__card">
            <h4>Monthly platform commission</h4>
            <MiniBarChart items={charts.monthly} valueKey="commission" />
          </div>
        </div>
      </section>

      <section className="finance-ops__section" aria-labelledby="finance-section-breakdown">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-breakdown">
            Revenue Breakdown
          </h3>
          <p className="finance-ops__section-hint">By service, payment method and city</p>
        </div>

        <div className="finance-ops__split">
          <div className="finance-table-wrap">
            <table className="finance-table">
              <caption className="finance-ops__muted">Revenue by service</caption>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col" className="finance-table__cell--right">
                    Revenue
                  </th>
                  <th scope="col" className="finance-table__cell--right">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {(charts.by_service || []).length === 0 ? (
                  <tr>
                    <td className="finance-table__empty" colSpan={3}>
                      No revenue recorded for this period.
                    </td>
                  </tr>
                ) : (
                  (charts.by_service || []).map((row) => (
                    <tr key={row.service}>
                      <td>{row.label}</td>
                      <td className="finance-table__cell--right">{formatMoney(row.revenue)}</td>
                      <td className="finance-table__cell--right">{row.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="finance-table-wrap">
            <table className="finance-table">
              <caption className="finance-ops__muted">Revenue by payment method</caption>
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col" className="finance-table__cell--right">
                    Revenue
                  </th>
                  <th scope="col" className="finance-table__cell--right">
                    Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {(charts.by_payment_method || []).length === 0 ? (
                  <tr>
                    <td className="finance-table__empty" colSpan={3}>
                      No payment methods recorded for this period.
                    </td>
                  </tr>
                ) : (
                  (charts.by_payment_method || []).map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td className="finance-table__cell--right">{formatMoney(row.revenue)}</td>
                      <td className="finance-table__cell--right">{row.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="finance-table-wrap">
          <table className="finance-table">
            <caption className="finance-ops__muted">Revenue by city</caption>
            <thead>
              <tr>
                <th scope="col">City</th>
                <th scope="col" className="finance-table__cell--right">
                  Revenue
                </th>
                <th scope="col" className="finance-table__cell--right">
                  Volume
                </th>
              </tr>
            </thead>
            <tbody>
              {(charts.by_city || []).length === 0 ? (
                <tr>
                  <td className="finance-table__empty" colSpan={3}>
                    No city revenue recorded for this period.
                  </td>
                </tr>
              ) : (
                (charts.by_city || []).map((row, index) => (
                  <tr key={`${row.city}-${index}`}>
                    <td>{row.city}</td>
                    <td className="finance-table__cell--right">{formatMoney(row.revenue)}</td>
                    <td className="finance-table__cell--right">
                      {row.trips || row.deliveries || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderAccounting = () => (
    <div className="finance-ops__panel">
      <section className="finance-ops__section" aria-labelledby="finance-section-accounting">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-accounting">
            Financial Summary
          </h3>
          <p className="finance-ops__section-hint">
            Period summaries generated by the finance operations service
          </p>
        </div>

        <div className="finance-toolbar">
          <label className="finance-ops__control">
            <span className="finance-ops__control-label">Report</span>
            <select
              className="finance-ops__select"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              aria-label="Select accounting report"
            >
              {REPORT_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={() => handleExport("accounting", "csv")}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={() => handleExport("accounting", "xlsx")}
          >
            Export Excel
          </button>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={() => handleExport("accounting", "pdf")}
          >
            Export PDF
          </button>
        </div>

        {Object.keys(data?.accounting || {}).length === 0 ? (
          <p className="finance-ops__notice">No accounting reports available for this period.</p>
        ) : (
          <div className="finance-ops__split">
            {Object.entries(data?.accounting || {}).map(([key, report]) => (
              <div key={key} className="finance-ops__card">
                <h4>{report.title || key}</h4>
                <p className="finance-ops__muted">
                  {report.start_date} → {report.end_date}
                </p>
                <div className="finance-ops__metrics">
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Gross revenue</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.gross_revenue)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Platform commission</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.platform_commission)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Cash in</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.cash_in)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Cash out</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.cash_out)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Refunds</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.refunds)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Net cash flow</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.net_cash_flow)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Wallet balance</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.wallet_balance)}
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Outstanding withdrawals</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.outstanding_withdrawals)}
                    </span>
                    <span className="finance-ops__muted">
                      {report.metrics?.outstanding_withdrawals_count ?? 0} requests
                    </span>
                  </div>
                  <div className="finance-ops__metric">
                    <span className="finance-ops__metric-label">Pending refunds</span>
                    <span className="finance-ops__metric-value">
                      {formatMoney(report.metrics?.pending_refunds)}
                    </span>
                    <span className="finance-ops__muted">
                      {report.metrics?.pending_refunds_count ?? 0} requests
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Reconciliation Records (per report) ───────────────────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-acct-recon">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-acct-recon">
            Reconciliation Records
          </h3>
          <p className="finance-ops__section-hint">
            Reconciliation snapshot stored with each accounting report
          </p>
        </div>
        <div className="finance-table-wrap">
          <table className="finance-table">
            <thead>
              <tr>
                <th scope="col">Report</th>
                <th scope="col">Reconciliation date</th>
                <th scope="col">Status</th>
                <th scope="col" className="finance-table__cell--right">
                  Operations total
                </th>
                <th scope="col" className="finance-table__cell--right">
                  Payments total
                </th>
                <th scope="col" className="finance-table__cell--right">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data?.accounting || {}).length === 0 ? (
                <tr>
                  <td className="finance-table__empty" colSpan={6}>
                    No reconciliation records available for this period.
                  </td>
                </tr>
              ) : (
                Object.entries(data?.accounting || {}).map(([key, report]) => {
                  const recon = report?.reconciliation?.reconciliation || {};
                  return (
                    <tr key={`recon-${key}`}>
                      <td>{report?.title || key}</td>
                      <td>{report?.reconciliation?.date || report?.end_date || "—"}</td>
                      <td>
                        <ReconciliationPill status={recon.status} />
                      </td>
                      <td className="finance-table__cell--right">
                        {formatMoney(recon.operations_total)}
                      </td>
                      <td className="finance-table__cell--right">
                        {formatMoney(recon.payments_total)}
                      </td>
                      <td className="finance-table__cell--right">
                        {formatMoney(recon.difference_amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Unavailable sections (stated, never fabricated) ───────────────── */}
      <section className="finance-ops__section" aria-labelledby="finance-section-acct-gaps">
        <div className="finance-ops__section-head">
          <h3 className="finance-ops__section-title" id="finance-section-acct-gaps">
            Not Available From This Endpoint
          </h3>
        </div>
        <p className="finance-ops__notice">
          <strong>Accounting Entries:</strong> no journal or double-entry ledger is exposed — this
          endpoint returns period summaries only, so no entries are shown or inferred.
          <br />
          <strong>Settlement Records:</strong> provider settlement files are not available (see
          Payment Providers → Settlement Information). Settlement destinations are shown read-only
          under <strong>Settlement Accounts</strong>.
        </p>
      </section>
    </div>
  );

  const renderAudit = () => {
    const auditColumns = [
      {
        id: "timestamp",
        label: "Timestamp",
        render: (row) => (row.timestamp ? new Date(row.timestamp).toLocaleString() : "—"),
      },
      { id: "user", label: "User" },
      { id: "action", label: "Action" },
      {
        id: "amount",
        label: "Amount",
        align: "right",
        render: (row) => (row.amount ? formatMoney(row.amount) : "—"),
      },
      {
        id: "change",
        label: "Change",
        render: (row) => <ChangeSummary before={row.before} after={row.after} />,
      },
      { id: "summary", label: "Summary" },
    ];

    return (
      <div className="finance-ops__panel">
        <section className="finance-ops__section" aria-labelledby="finance-section-audit">
          <div className="finance-ops__section-head">
            <h3 className="finance-ops__section-title" id="finance-section-audit">
              Finance Audit Trail
            </h3>
            <p className="finance-ops__section-hint">
              Immutable record of finance actions over the last 30 days
            </p>
          </div>
          <div className="finance-toolbar">
            <label className="finance-ops__control">
              <span className="finance-ops__control-label">From</span>
              <input
                type="date"
                className="finance-ops__date"
                value={auditFilters.date_from}
                onChange={(e) => setAuditFilter("date_from", e.target.value)}
                aria-label="Audit entries from date"
              />
            </label>
            <label className="finance-ops__control">
              <span className="finance-ops__control-label">To</span>
              <input
                type="date"
                className="finance-ops__date"
                value={auditFilters.date_to}
                onChange={(e) => setAuditFilter("date_to", e.target.value)}
                aria-label="Audit entries to date"
              />
            </label>
            <label className="finance-ops__control">
              <span className="finance-ops__control-label">User</span>
              <select
                className="finance-ops__select"
                value={auditFilters.user}
                onChange={(e) => setAuditFilter("user", e.target.value)}
                aria-label="Filter audit entries by user"
              >
                <option value="">All users</option>
                {auditUserOptions.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-ops__control">
              <span className="finance-ops__control-label">Action</span>
              <select
                className="finance-ops__select"
                value={auditFilters.action}
                onChange={(e) => setAuditFilter("action", e.target.value)}
                aria-label="Filter audit entries by action"
              >
                <option value="">All actions</option>
                {auditActionOptions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() =>
                setAuditFilters({ date_from: "", date_to: "", user: "", action: "" })
              }
            >
              Clear filters
            </button>
          </div>

          <DataTable
            title="Audit entries"
            columns={auditColumns}
            rows={filteredAuditEntries}
            loading={loading}
            error={error}
            emptyMessage="No finance audit entries match the current filters."
            searchPlaceholder="Search audit entries…"
            exportFilename="yala-finance-audit"
            onRefresh={load}
          />

          <p className="finance-ops__notice">
            Showing <strong>{filteredAuditEntries.length}</strong> of{" "}
            <strong>{auditEntries.length}</strong> returned entries. The audit trail is delivered as
            a complete array (the backend&apos;s latest {auditEntries.length} entries for{" "}
            {data?.audit?.start_date || "—"} → {data?.audit?.end_date || "—"}), so the filters,
            search, sorting and pagination above operate on the <strong>entire returned set</strong>{" "}
            — not just one page. This endpoint exposes no server-side audit filtering or
            pagination; a longer trail needs a dedicated endpoint.
          </p>
        </section>
      </div>
    );
  };

  return (
    <div className="finance-ops">
      {/* Header — the shell owns the single page title, so this block adds the
          subtitle and the reporting controls only (no duplicate heading). */}
      <div className="finance-ops__header">
        <div className="finance-ops__heading">
          <p className="finance-ops__subtitle">
            Accounting, reconciliation and CEO financial oversight across rides, deliveries,
            wallets and payouts.
          </p>
          <p className="finance-ops__section-hint">
            {loading ? "Refreshing financial data…" : `Reporting period: ${reportingPeriod}`}
          </p>
        </div>

        <div className="finance-ops__actions">
          <label className="finance-ops__control">
            <span className="finance-ops__control-label">Date</span>
            <input
              type="date"
              className="finance-ops__date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              aria-label="Select reporting date"
            />
          </label>

          <label className="finance-ops__control">
            <span className="finance-ops__control-label">Period</span>
            <select
              className="finance-ops__select"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Select reporting period"
            >
              {PERIODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={load}
            disabled={loading}
            aria-label="Refresh finance operations"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="finance-ops__notice" role="alert">
          {error}
        </div>
      ) : null}

      {/* RECONCILIATION — displayed prominently and independent of the active tab */}
      <section
        className={`finance-ops__recon${
          reconStatus.status === "balanced" ? "" : " finance-ops__recon--difference"
        }`}
        aria-label="Reconciliation status"
      >
        <div className="finance-ops__recon-main">
          <h2 className="finance-ops__recon-title">Reconciliation</h2>
          <div className="finance-ops__recon-facts">
            <div className="finance-ops__recon-fact">
              <span className="finance-ops__recon-label">Status</span>
              <ReconciliationPill status={reconStatus.status} />
            </div>
            <div className="finance-ops__recon-fact">
              <span className="finance-ops__recon-label">Difference</span>
              <span className="finance-ops__recon-value">
                {formatMoney(reconStatus.difference_amount)}
              </span>
            </div>
            <div className="finance-ops__recon-fact">
              <span className="finance-ops__recon-label">Reporting period</span>
              <span className="finance-ops__recon-value">{reportingPeriod}</span>
            </div>
            <div className="finance-ops__recon-fact">
              <span className="finance-ops__recon-label">Last updated</span>
              <span className="finance-ops__recon-value">
                {lastUpdated ? lastUpdated.toLocaleString() : "—"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Navigation tabs (WAI-ARIA tabs pattern with arrow-key support) */}
      <div className="finance-tabs" role="tablist" aria-label="Finance operations sections">
        {TABS.map((item, index) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={`finance-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`finance-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={`finance-tab${selected ? " finance-tab--active" : ""}`}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div
        className="finance-ops__panel"
        id={`finance-panel-${tab}`}
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`finance-tab-${tab}`}
      >
        {tab === "reconciliation" ? renderReconciliation() : null}
        {tab === "providers" ? renderProviders() : null}
        {tab === "withdrawals" ? renderWithdrawals() : null}
        {tab === "revenue" ? renderRevenue() : null}
        {tab === "accounting" ? renderAccounting() : null}
        {tab === "audit" ? renderAudit() : null}
      </div>
    </div>
  );
}

