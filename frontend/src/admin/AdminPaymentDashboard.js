import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminShellPage } from "./layouts/AdminShell";
import {
  KPICard,
  StatusChip,
  DataTable,
  ExportMenu,
  formatMoneyOrDash,
} from "./components/library";
import { apiErrorMessage } from "./layouts/errors/apiErrorMessage";
import {
  fetchAdminPaymentDashboard,
  fetchPaymentsOversight,
} from "../payments/paymentApi";
import MoosylPaymentPanel from "./finance/MoosylPaymentPanel";
import { moosylUiEnabled } from "../config/backendFeatureGates";
import "./AdminPaymentCenter.css";

/**
 * Payment Management Center (/admin/payments).
 *
 * Enterprise-grade financial dashboard for the Founder/CEO.
 * Real-time visibility into transactions, payouts, refunds, and provider status.
 */

const PERIODS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "Last 7 days" },
  { value: "monthly", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const BASE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "transactions", label: "Transactions" },
  { id: "payouts", label: "Payouts" },
  { id: "refunds", label: "Refunds" },
  { id: "providers", label: "Payment Providers" },
  { id: "moosyl", label: "Moosyl" },
];

function paymentDashboardTabs() {
  return BASE_TABS.filter((tab) => tab.id !== "moosyl" || moosylUiEnabled());
}

const PAYOUT_STATUSES = ["pending", "approved", "paid", "rejected"];
const REFUND_STATUSES = ["requested", "awaiting_ceo", "approved", "rejected", "refunded"];

/**
 * Reads the initial tab from `?tab=` so sections are deep-linkable
 * (e.g. /admin/payments?tab=transactions). Unknown values fall back to Overview.
 */
function readInitialTab() {
  try {
    const requested = new URLSearchParams(window.location.search).get("tab");
    const tabIds = paymentDashboardTabs().map((tab) => tab.id);
    if (requested && tabIds.includes(requested)) return requested;
  } catch (error) {
    /* malformed query string — use the default */
  }
  return "overview";
}

function money(value) {
  return formatMoneyOrDash(value);
}

function countAndAmount(block) {
  const count = block?.count ?? 0;
  const amount = block?.amount ?? 0;
  return `${count} · ${money(amount)}`;
}

function statusTone(status) {
  if (status === "paid" || status === "approved" || status === "refunded") return "success";
  if (status === "rejected" || status === "failed") return "danger";
  if (status === "pending" || status === "requested" || status === "awaiting_ceo") return "warning";
  return "neutral";
}

/** Human-readable label for a backend status key (e.g. awaiting_ceo -> Awaiting CEO). */
function statusLabel(status) {
  if (status === "awaiting_ceo") return "Awaiting CEO";
  if (!status) return "Unknown";
  return String(status)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Safe numeric parse for backend aggregates that arrive as strings (Decimal). */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Renders a status badge using the shared design-system chip. */
function StatusBadge({ status }) {
  return <StatusChip label={statusLabel(status)} tone={statusTone(status)} />;
}

/** Proportion of `part` within `total`, as a percentage (0 when total is 0). */
function sharePercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

const ALL_CITIES = "__all__";

export default function AdminPaymentDashboard() {
  const [data, setData] = useState(null);
  const [oversight, setOversight] = useState(null);
  const [period, setPeriod] = useState("weekly");
  const [city, setCity] = useState(ALL_CITIES);
  const [activeTab, setActiveTab] = useState(readInitialTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [oversightError, setOversightError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [failedStatusFilter, setFailedStatusFilter] = useState("all");
  const tabRefs = useRef([]);
  const tabs = useMemo(() => paymentDashboardTabs(), []);

  useEffect(() => {
    if (activeTab === "moosyl" && !moosylUiEnabled()) {
      setActiveTab("overview");
    }
  }, [activeTab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setOversightError("");

    const [dash, over] = await Promise.allSettled([
      fetchAdminPaymentDashboard(),
      fetchPaymentsOversight(period),
    ]);

    if (dash.status === "fulfilled") {
      setData(dash.value);
    } else {
      setError(apiErrorMessage(dash.reason, { resource: "the payment dashboard" }));
      setData(null);
    }

    if (over.status === "fulfilled") {
      setOversight(over.value);
    } else {
      setOversightError(
        apiErrorMessage(over.reason, { resource: "the payment management center" })
      );
      setOversight(null);
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const periodLabel = PERIODS.find((p) => p.value === period)?.label || period;

  const payouts = oversight?.payouts;
  const refunds = oversight?.refunds;
  const failed = oversight?.failed_transactions;
  const capabilities = oversight?.action_capabilities;
  const providers = oversight?.providers;

  // ── City scope ────────────────────────────────────────────────────────────
  // `cities` is real backend output (one block per city plus a "Combined"
  // block). The selector only re-scopes the aggregates that the backend already
  // computes per city — no extra request and no client-side money maths.
  const cityBlocks = oversight?.cities || [];
  const cityOptions = cityBlocks.filter((block) => block?.city && block.city !== "Combined");
  const selectedCityBlock =
    city === ALL_CITIES
      ? cityBlocks.find((block) => block?.city === "Combined") || null
      : cityBlocks.find((block) => block?.city === city) || null;
  const cityPayments = selectedCityBlock?.payments || null;
  const cityScopeLabel = city === ALL_CITIES ? "All cities" : city;

  // ── Payment performance (derived strictly from backend aggregates) ────────
  const performanceMetrics = [
    { label: "Payment records", value: (cityPayments?.count ?? 0).toLocaleString() },
    { label: "Gross processed", value: money(cityPayments?.amount ?? 0) },
    { label: "Platform commission", value: money(cityPayments?.platform_commission ?? 0) },
    { label: "Driver earnings", value: money(cityPayments?.driver_earnings ?? 0) },
    { label: "Tips", value: money(cityPayments?.tips ?? 0) },
    {
      label: "Failed share",
      value: `${sharePercent(failed?.total ?? 0, cityPayments?.count ?? 0)}%`,
    },
  ];

  const methodMix = useMemo(() => {
    const byMethod = cityPayments?.by_method || {};
    const rows = Object.entries(byMethod).map(([key, block]) => ({
      key,
      label: statusLabel(key),
      count: block?.count ?? 0,
      amount: toNumber(block?.amount),
    }));
    const max = rows.reduce((acc, row) => Math.max(acc, row.amount), 0);
    return rows
      .sort((a, b) => b.amount - a.amount)
      .map((row) => ({ ...row, percent: sharePercent(row.amount, max) }));
  }, [cityPayments]);

  const statusMix = useMemo(() => {
    const byStatus = cityPayments?.by_status || {};
    const rows = Object.entries(byStatus).map(([key, block]) => ({
      key,
      label: statusLabel(key),
      count: block?.count ?? 0,
      amount: toNumber(block?.amount),
    }));
    const max = rows.reduce((acc, row) => Math.max(acc, row.amount), 0);
    return rows
      .sort((a, b) => b.amount - a.amount)
      .map((row) => ({ ...row, percent: sharePercent(row.amount, max) }));
  }, [cityPayments]);

  // ── Tab keyboard navigation (WAI-ARIA tabs pattern) ───────────────────────
  const handleTabKeyDown = useCallback(
    (event, index) => {
      const lastIndex = tabs.length - 1;
      let nextIndex = null;

      if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1;
      else if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = lastIndex;

      if (nextIndex === null) return;

      event.preventDefault();
      const nextTab = tabs[nextIndex];
      setActiveTab(nextTab.id);
      tabRefs.current[nextIndex]?.focus();
    },
    [tabs]
  );

  // Financial summary cards. Values reuse the existing backend fields verbatim.
  const summaryCards = [
    {
      label: "Total Transactions",
      value: (data?.total_transactions ?? 0).toLocaleString(),
      icon: "🧾",
      tone: "info",
      subtitle: `All payment records · ${periodLabel}`,
    },
    {
      label: "Gross Transaction Value",
      value: money(data?.gross_volume),
      icon: "💰",
      tone: "success",
      subtitle: `Collected through digital providers · ${periodLabel}`,
    },
    {
      label: "Platform Revenue",
      value: money(data?.total_revenue),
      icon: "🏦",
      tone: "success",
      subtitle: `Commission retained by Yala · ${periodLabel}`,
    },
    {
      label: "Pending Payouts",
      value: (payouts?.pending?.count ?? data?.pending_payouts ?? 0).toLocaleString(),
      icon: "⏳",
      tone: "warning",
      subtitle: `Awaiting review · ${money(payouts?.pending?.amount ?? 0)}`,
    },
    {
      label: "Completed Payouts",
      value: (payouts?.paid?.count ?? data?.completed_payouts ?? 0).toLocaleString(),
      icon: "✅",
      tone: "success",
      subtitle: `Settled · ${money(payouts?.paid?.amount ?? 0)}`,
    },
    {
      label: "Pending Refunds",
      value: (refunds?.awaiting_ceo?.count ?? 0).toLocaleString(),
      icon: "↩️",
      tone: "warning",
      subtitle: `To authorize · ${money(refunds?.awaiting_ceo?.amount ?? 0)}`,
    },
    {
      label: "Failed Transactions",
      value: (failed?.total ?? data?.failed_payments ?? 0).toLocaleString(),
      icon: "⚠️",
      tone: "danger",
      subtitle: "Recorded as failed by the provider flow",
    },
    {
      label: "Wallet Transactions",
      value: (data?.wallet_transactions ?? 0).toLocaleString(),
      icon: "👛",
      tone: "info",
      subtitle: "Ledger entries recorded",
    },
  ];

  // Failed transactions table
  const failedRows = React.useMemo(() => {
    const rows = [
      ...(failed?.ride_payments || []).map((row) => ({ ...row, kind: "Ride payment" })),
      ...(failed?.ledger_records || []).map((row) => ({ ...row, kind: "Ledger record" })),
    ];
    return rows.map((row) => ({
      id: `${row.kind}-${row.id}`,
      kind: row.kind,
      reference: row.ride_id ? `Ride #${row.ride_id}` : `#${row.id}`,
      amount: money(row.amount),
      method: row.method,
      status: row.status,
      reason: row.reason,
      created_at: row.created_at
        ? String(row.created_at).slice(0, 19).replace("T", " ")
        : "",
    }));
  }, [failed]);

  // Status filter for the Transactions tab (client-side over loaded records).
  const failedStatusOptions = useMemo(
    () => Array.from(new Set(failedRows.map((row) => row.status).filter(Boolean))).sort(),
    [failedRows]
  );

  const filteredFailedRows = useMemo(() => {
    if (failedStatusFilter === "all") return failedRows;
    return failedRows.filter((row) => row.status === failedStatusFilter);
  }, [failedRows, failedStatusFilter]);

  const failedColumns = [
    { id: "kind", label: "Type" },
    { id: "reference", label: "Reference" },
    { id: "amount", label: "Amount", align: "right" },
    { id: "method", label: "Method" },
    {
      id: "status",
      label: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    { id: "reason", label: "Reason" },
    { id: "created_at", label: "When" },
  ];

  // Payouts table
  const payoutRows = React.useMemo(() => {
    return PAYOUT_STATUSES.map((status) => ({
      id: status,
      status,
      drivers: countAndAmount(payouts?.by_role?.driver?.[status]),
      couriers: countAndAmount(payouts?.by_role?.courier?.[status]),
      total: countAndAmount(payouts?.by_status?.[status]),
    }));
  }, [payouts]);

  const payoutColumns = [
    {
      id: "status",
      label: "Payout Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    { id: "drivers", label: "Drivers", align: "right" },
    { id: "couriers", label: "Couriers", align: "right" },
    { id: "total", label: "Total", align: "right" },
  ];

  // Refunds table
  const refundRows = React.useMemo(() => {
    return REFUND_STATUSES.map((status) => ({
      id: status,
      status,
      count: refunds?.by_status?.[status]?.count ?? 0,
      amount: money(refunds?.by_status?.[status]?.amount ?? 0),
    }));
  }, [refunds]);

  const refundColumns = [
    {
      id: "status",
      label: "Refund Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    { id: "count", label: "Requests", align: "right" },
    { id: "amount", label: "Value", align: "right" },
  ];

  // Providers table
  const providerRows = React.useMemo(() => {
    return (providers?.providers || []).map((row) => ({
      id: row.code || row.label,
      provider: row.label || row.code,
      mode: row.active_mode || row.mode || "unknown",
      status: row.activation_allowed ? "active" : "inactive",
      reason: row.reason_not_active || "",
    }));
  }, [providers]);

  const providerColumns = [
    { id: "provider", label: "Provider" },
    { id: "mode", label: "Active Mode" },
    {
      id: "status",
      label: "Connection Status",
      render: (row) => (
        <StatusChip
          label={row.status === "active" ? "Active" : "Inactive"}
          tone={row.status === "active" ? "success" : "neutral"}
        />
      ),
    },
    { id: "reason", label: "Details" },
  ];

  // Render functions for each tab
  const renderOverview = () => (
    <div className="payment-center__overview admin-payment-center__panel">
      {/* SECTION A — Financial Summary */}
      <section className="payment-center__section" aria-labelledby="payment-section-summary">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-summary">
            Financial Summary
          </h3>
          <p className="payment-center__section-hint">
            {periodLabel} · {cityScopeLabel}
          </p>
        </div>
        <div className="payment-center__kpi-grid">
          {summaryCards.map((card) => (
            <KPICard
              key={card.label}
              label={card.label}
              value={card.value}
              subtitle={card.subtitle}
              icon={card.icon}
              tone={card.tone}
              loading={loading}
              error={error}
              onRefresh={load}
            />
          ))}
        </div>
      </section>

      {/* SECTION B — Recent Payout Activity */}
      <section className="payment-center__section" aria-labelledby="payment-section-payouts">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-payouts">
            Recent Payout Activity
          </h3>
          <p className="payment-center__section-hint">
            Pending, approved, paid and rejected driver/courier payouts
          </p>
        </div>
        <div className="payment-center__section-content">
          <DataTable
            title="Payout activity"
            columns={payoutColumns}
            rows={payoutRows}
            loading={loading}
            emptyMessage="No payout activity recorded for this period."
            exportFilename={`yala-payout-activity-${period}`}
            onRefresh={load}
          />
        </div>
      </section>

      {/* SECTION C — Failed Transactions */}
      <section className="payment-center__section" aria-labelledby="payment-section-failed">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-failed">
            Failed Transactions
          </h3>
          <p className="payment-center__section-hint">
            {oversight?.failed_transactions?.total ?? 0} recorded as failed by the provider flow
          </p>
        </div>
        <div className="payment-center__section-content">
          <DataTable
            title="Failed payments"
            columns={failedColumns}
            rows={failedRows}
            loading={loading}
            emptyMessage="No failed transactions recorded for this period."
            exportFilename={`yala-failed-transactions-${period}`}
            onRefresh={load}
          />
        </div>
      </section>

      {/* SECTION D — Payment Performance (backend aggregates only) */}
      <section className="payment-center__section" aria-labelledby="payment-section-performance">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-performance">
            Payment Performance
          </h3>
          <p className="payment-center__section-hint">
            Recorded aggregates for {cityScopeLabel} · {periodLabel}
          </p>
        </div>

        <div className="payment-center__metrics">
          {performanceMetrics.map((metric) => (
            <div className="payment-center__metric" key={metric.label}>
              <span className="payment-center__metric-label">{metric.label}</span>
              <span className="payment-center__metric-value">{metric.value}</span>
            </div>
          ))}
        </div>

        {[
          { key: "method", label: "Payment method mix (by amount)", rows: methodMix },
          { key: "status", label: "Payment status mix (by amount)", rows: statusMix },
        ].map((group) => (
          <div className="payment-center__bars" key={group.key}>
            <span className="payment-center__metric-label">{group.label}</span>
            {group.rows.length === 0 ? (
              <p className="payment-center__muted">No records for this period.</p>
            ) : (
              group.rows.map((row) => (
                <div className="payment-center__bar-row" key={`${group.key}-${row.key}`}>
                  <span className="payment-center__bar-label" title={row.label}>
                    {row.label}
                  </span>
                  <span className="payment-center__bar-track">
                    <span className="payment-center__bar-fill" style={{ width: `${row.percent}%` }} />
                  </span>
                  <span className="payment-center__bar-value">
                    {money(row.amount)} · {row.count}
                  </span>
                </div>
              ))
            )}
          </div>
        ))}

        <p className="payment-center__notice">
          <strong>Reconciliation:</strong>{" "}
          {oversight?.reconciliation?.note ||
            "Reconciliation figures are computed from stored records only."}
          {oversight?.suspicious
            ? ` · Advisory review sampled ${oversight.suspicious.sampled} recent payments and flagged ${oversight.suspicious.flagged}.`
            : ""}
        </p>
      </section>
    </div>
  );

  const renderTransactions = () => (
    <div className="payment-center__transactions admin-payment-center__panel">
      <section className="payment-center__section" aria-labelledby="payment-section-transactions">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-transactions">
            Transaction History
          </h3>
          <p className="payment-center__section-hint">
            Failed transactions recorded by payment providers · {periodLabel}
          </p>
        </div>
        <div className="payment-center__section-content">
          <DataTable
            title="Transactions"
            columns={failedColumns}
            rows={filteredFailedRows}
            loading={loading}
            emptyMessage="No transactions recorded for this period."
            exportFilename={`yala-transactions-${period}`}
            onRefresh={load}
            searchPlaceholder="Search transactions…"
            filters={
              <label className="admin-payment-center__control">
                <span className="admin-payment-center__control-label">Status</span>
                <select
                  className="admin-payment-center__select"
                  value={failedStatusFilter}
                  onChange={(event) => setFailedStatusFilter(event.target.value)}
                  aria-label="Filter transactions by status"
                >
                  <option value="all">All statuses</option>
                  {failedStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
        </div>
      </section>
    </div>
  );

  const renderPayouts = () => (
    <div className="payment-center__payouts admin-payment-center__panel">
      <section className="payment-center__section" aria-labelledby="payment-section-payout-tab">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-payout-tab">
            Driver &amp; Courier Payouts
          </h3>
          <p className="payment-center__section-hint">
            Approvals are managed in Withdrawals Monitoring
          </p>
        </div>
        <div className="payment-center__section-content">
          <DataTable
            title="Payouts by status and role"
            columns={payoutColumns}
            rows={payoutRows}
            loading={loading}
            emptyMessage="No payouts recorded for this period."
            exportFilename={`yala-payouts-${period}`}
            onRefresh={load}
            searchPlaceholder="Search payouts…"
          />
        </div>
      </section>
    </div>
  );

  const renderRefunds = () => (
    <div className="payment-center__refunds admin-payment-center__panel">
      <section className="payment-center__section" aria-labelledby="payment-section-refund-tab">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-refund-tab">
            Refunds
          </h3>
          <p className="payment-center__section-hint">
            Authorizations are managed in Finance Operations
          </p>
        </div>
        <div className="payment-center__section-content">
          <DataTable
            title="Refunds by status"
            columns={refundColumns}
            rows={refundRows}
            loading={loading}
            emptyMessage="No refunds recorded for this period."
            exportFilename={`yala-refunds-${period}`}
            onRefresh={load}
            searchPlaceholder="Search refunds…"
          />
        </div>
      </section>
    </div>
  );

  const renderProviders = () => (
    <div className="payment-center__providers admin-payment-center__panel">
      <section className="payment-center__section" aria-labelledby="payment-section-providers">
        <div className="payment-center__section-head">
          <h3 className="payment-center__section-title" id="payment-section-providers">
            Payment Providers
          </h3>
          <p className="payment-center__section-hint">
            Connection status for Bankily, Sedad, Masravi and Bank Card
          </p>
        </div>
        <div className="payment-center__section-content">
          <DataTable
            title="Provider readiness"
            columns={providerColumns}
            rows={providerRows}
            loading={loading}
            emptyMessage="No provider configuration reported."
            exportFilename={`yala-providers-${period}`}
            onRefresh={load}
            searchPlaceholder="Search providers…"
          />
        </div>
      </section>
    </div>
  );

  return (
    <AdminShellPage pathname="/admin/payments" title="Payment Management Center">
      <div className="admin-payment-center">
        {/* Page Header — the shell already renders the single page title, so this
            block adds the subtitle and the page-level controls only. */}
        <div className="admin-payment-center__header">
          <div className="admin-payment-center__heading">
            <p className="admin-payment-center__subtitle">
              Monitor transactions, manage payouts, track refunds, and oversee payment
              providers.
            </p>
            <p className="payment-center__section-hint">
              {loading
                ? "Refreshing financial data…"
                : lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()} · ${cityScopeLabel}`
                : "Read-only oversight"}
            </p>
          </div>

          <div className="admin-payment-center__actions">
            <label className="admin-payment-center__control">
              <span className="admin-payment-center__control-label">Date range</span>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="admin-payment-center__select"
                aria-label="Select date range"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-payment-center__control">
              <span className="admin-payment-center__control-label">City</span>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="admin-payment-center__select"
                aria-label="Select city"
                disabled={cityOptions.length === 0}
              >
                <option value={ALL_CITIES}>All cities</option>
                {cityOptions.map((block) => (
                  <option key={block.city} value={block.city}>
                    {block.city}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={load}
              disabled={loading}
              aria-label="Refresh payment data"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <ExportMenu
              filename={`yala-payment-center-${period}`}
              rows={filteredFailedRows}
              columns={failedColumns}
              exportScope="reports"
            />
          </div>
        </div>

        {/* Tabs Navigation (WAI-ARIA tabs pattern with arrow-key support) */}
        <div className="admin-payment-center__tabs" role="tablist" aria-label="Payment management sections">
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                id={`payment-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`payment-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                className={`admin-payment-center__tab${
                  selected ? " admin-payment-center__tab--active" : ""
                }`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div
          className="admin-payment-center__content"
          id={`payment-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={-1}
          aria-labelledby={`payment-tab-${activeTab}`}
        >
          {activeTab === "overview" && renderOverview()}
          {activeTab === "transactions" && renderTransactions()}
          {activeTab === "payouts" && renderPayouts()}
          {activeTab === "refunds" && renderRefunds()}
          {activeTab === "providers" && renderProviders()}
          {activeTab === "moosyl" && <MoosylPaymentPanel />}
        </div>
      </div>
    </AdminShellPage>
  );
}