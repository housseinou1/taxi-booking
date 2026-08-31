import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ConfirmationDialog,
  DashboardSkeleton,
  DataTable,
  ExportMenu,
  FilterBar,
  InlineError,
  KPICard,
  KPITrendCard,
  RetryBlock,
  Select,
  StatusChip,
  useToast,
  formatCurrency,
  formatTimestamp,
} from "../components/library";
import ProtectedActionButton from "../components/guards/ProtectedActionButton";
import { usePermissions } from "../permissions/PermissionContext";
import {
  REPORT_TYPES,
  approveRefund,
  approveWithdrawal,
  exportFinanceReport,
  fetchFinanceOperations,
  fetchRefundQueue,
  markWithdrawalPaid,
  rejectRefund,
  rejectWithdrawal,
} from "./financeOpsApi";
import "./FinanceDashboard.css";

const LARGE_REFUND_MRU = 50000;

function downloadBlob(response, filename) {
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function FinanceDashboard() {
  const { permissions, canApprove } = usePermissions();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("daily");
  const [txType, setTxType] = useState("all");
  const [selectedPayouts, setSelectedPayouts] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState("");
  const [loadMs, setLoadMs] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    const started = performance.now();
    setLoading(true);
    try {
      setError("");
      const [ops, refundQueue] = await Promise.all([
        fetchFinanceOperations({ period }),
        fetchRefundQueue().catch(() => []),
      ]);
      setData(ops);
      setRefunds(Array.isArray(refundQueue) ? refundQueue : refundQueue?.results || []);
      setLoadMs(Math.round(performance.now() - started));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load finance dashboard");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const s = data?.kpi_summary || {};
    return [
      { id: "rev_today", label: "Revenue Today", value: s.revenue_today, format: "currency", tone: "success" },
      { id: "rev_week", label: "Revenue This Week", value: s.revenue_week, format: "currency" },
      { id: "rev_month", label: "Revenue This Month", value: s.revenue_month, format: "currency" },
      { id: "gross", label: "Gross Bookings", value: s.gross_bookings, format: "currency" },
      { id: "net", label: "Net Revenue", value: s.net_revenue, format: "currency" },
      { id: "fees", label: "Platform Fees", value: s.platform_fees, format: "currency" },
      { id: "earnings", label: "Driver Earnings", value: s.driver_earnings, format: "currency" },
      { id: "pending", label: "Pending Payouts", value: s.pending_payouts, format: "currency", tone: "warning", href: "#finance-payouts" },
      { id: "completed", label: "Completed Payouts", value: s.completed_payouts, format: "currency" },
      { id: "refunds", label: "Refunds Today", value: s.refunds_today, href: "#finance-refunds" },
      { id: "failed", label: "Failed Payments", value: s.failed_payments, tone: "danger" },
      { id: "outstanding", label: "Outstanding Balances", value: s.outstanding_balances, format: "currency" },
    ];
  }, [data]);

  const transactions = useMemo(() => {
    const rows = data?.transactions?.transactions || [];
    if (txType === "all") return rows;
    return rows.filter((row) => row.type === txType || row.entity === txType);
  }, [data, txType]);

  const withdrawals = data?.withdrawals?.withdrawals || [];
  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");
  const approvedWithdrawals = withdrawals.filter((w) => w.status === "approved");
  const paidWithdrawals = withdrawals.filter((w) => w.status === "paid");
  const rejectedWithdrawals = withdrawals.filter((w) => w.status === "rejected");

  const refundLimit = permissions?.approval_limits?.refund_mru ?? LARGE_REFUND_MRU;
  const canApproveRefund = canApprove("refund");
  const canApproveWithdrawal = canApprove("withdrawal");

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === "refund_approve") {
        await approveRefund(confirm.id, { admin_note: note });
      } else if (confirm.type === "refund_reject") {
        await rejectRefund(confirm.id, { admin_note: note });
      } else if (confirm.type === "wd_approve") {
        await approveWithdrawal(confirm.id, { admin_note: note });
      } else if (confirm.type === "wd_reject") {
        await rejectWithdrawal(confirm.id, { admin_note: note });
      } else if (confirm.type === "wd_paid") {
        await markWithdrawalPaid(confirm.id, { admin_note: note, payment_reference: note || `paid-${confirm.id}` });
      } else if (confirm.type === "batch_approve") {
        for (const id of confirm.ids) {
          await approveWithdrawal(id, { admin_note: note || "Batch approve" });
        }
      }
      push({ tone: "success", title: "Done", message: confirm.label });
      setConfirm(null);
      setNote("");
      setSelectedPayouts(new Set());
      await load();
    } catch (err) {
      push({
        tone: "danger",
        title: "Action failed",
        message: err?.response?.data?.error || err?.response?.data?.detail || err?.message,
      });
    }
  };

  const exportReport = async (kind, type, format) => {
    try {
      const response = await exportFinanceReport({ kind, type, export_format: format });
      downloadBlob(response, `${type || kind}.${format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv"}`);
      push({ tone: "success", title: "Export ready" });
    } catch (err) {
      push({ tone: "danger", title: "Export failed", message: err?.message });
    }
  };

  if (loading && !data) {
    return (
      <div className="fin-dash">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="fin-dash">
      <header className="fin-dash__header">
        <div>
          <h1 className="fin-dash__title">Finance Dashboard</h1>
          <p className="fin-dash__subtitle">
            Revenue, transactions, refunds, and payouts
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="fin-dash__header-actions">
          <Select
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
            Refresh
          </button>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/finance-ops">
            Legacy Finance Ops
          </a>
        </div>
      </header>

      {error ? (
        <div>
          <InlineError message={error} />
          <RetryBlock onRetry={load} />
        </div>
      ) : null}

      <section className="fin-dash__section">
        <div className="fin-dash__kpi-grid">
          {kpis.map((kpi) => (
            <KPICard
              key={kpi.id}
              label={kpi.label}
              value={kpi.value}
              format={kpi.format || "auto"}
              tone={kpi.tone}
              loading={loading && !data}
              onClick={kpi.href ? () => document.querySelector(kpi.href)?.scrollIntoView({ behavior: "smooth" }) : undefined}
            />
          ))}
        </div>
        <div className="fin-dash__compare">
          <KPITrendCard
            label="Weekly vs daily net"
            value={data?.kpi_summary?.comparisons?.weekly?.net_cash_flow}
            format="currency"
            subtitle="From accounting reports"
          />
          <KPITrendCard
            label="Monthly commission"
            value={data?.kpi_summary?.comparisons?.monthly?.platform_commission || data?.kpi_summary?.platform_fees}
            format="currency"
          />
        </div>
      </section>

      <section className="fin-dash__panel">
        <div className="fin-dash__panel-head">
          <h2>Transactions</h2>
          <ExportMenu
            filename="finance-transactions"
            rows={transactions}
            columns={[
              { id: "id", label: "ID" },
              { id: "type", label: "Type" },
              { id: "amount", label: "Amount" },
              { id: "status", label: "Status" },
              { id: "method", label: "Method" },
              { id: "created_at", label: "Created" },
            ]}
            exportScope="finance"
          />
        </div>
        <FilterBar>
          <Select
            label="Type"
            value={txType}
            onChange={setTxType}
            options={[
              { value: "all", label: "All" },
              { value: "ride", label: "Ride payments" },
              { value: "delivery", label: "Delivery payments" },
              { value: "wallet_top_up", label: "Wallet top-ups" },
              { value: "refund", label: "Refunds" },
              { value: "driver_payout", label: "Driver payouts" },
            ]}
          />
        </FilterBar>
        <DataTable
          searchable
          exportFilename="transactions"
          exportScope="finance"
          columns={[
            { id: "type", label: "Type" },
            { id: "entity_id", label: "Ref" },
            { id: "amount", label: "Amount", render: (row) => formatCurrency(row.amount) },
            { id: "status", label: "Status", render: (row) => <StatusChip label={row.status} /> },
            { id: "method", label: "Method" },
            { id: "created_at", label: "Date", render: (row) => formatTimestamp(row.created_at) },
          ]}
          rows={transactions}
          emptyLabel="No transactions"
        />
        <p className="fin-dash__hint">Corporate invoices remain in Business Hub — linked from reports below.</p>
      </section>

      <section id="finance-refunds" className="fin-dash__panel">
        <div className="fin-dash__panel-head">
          <h2>Refund Center</h2>
          <StatusChip label={`${refunds.length} open`} tone={refunds.length ? "warning" : "success"} />
        </div>
        <DataTable
          searchable
          exportFilename="refunds"
          exportScope="finance"
          columns={[
            { id: "id", label: "ID", render: (r) => `#${r.id}` },
            { id: "customer_email", label: "Customer" },
            { id: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
            { id: "reason", label: "Reason" },
            { id: "ride_id", label: "Ride", render: (r) => (r.ride_id ? `#${r.ride_id}` : "—") },
            {
              id: "dual",
              label: "Dual approval",
              render: (r) =>
                Number(r.amount) > Number(refundLimit) || r.requires_dual_approval || r.status === "awaiting_ceo" ? (
                  <StatusChip label="CEO + Finance" tone="info" />
                ) : (
                  <StatusChip label="Single" tone="success" />
                ),
            },
            { id: "status", label: "Status", render: (r) => <StatusChip label={r.status} /> },
            { id: "note", label: "Evidence", render: (r) => r.note || "—" },
          ]}
          rows={refunds}
          emptyLabel="No pending refunds"
          rowActions={(row) => (
            <div className="fin-dash__row-actions">
              <ProtectedActionButton
                approve="refund"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canApproveRefund}
                onClick={() =>
                  setConfirm({
                    type: "refund_approve",
                    id: row.id,
                    label: `Approve refund #${row.id}`,
                  })
                }
              >
                {row.status === "awaiting_ceo" ? "CEO approve" : "Approve"}
              </ProtectedActionButton>
              <ProtectedActionButton
                approve="refund"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() => setConfirm({ type: "refund_reject", id: row.id, label: `Reject refund #${row.id}` })}
              >
                Reject
              </ProtectedActionButton>
            </div>
          )}
        />
      </section>

      <section id="finance-payouts" className="fin-dash__panel">
        <div className="fin-dash__panel-head">
          <h2>Driver Payouts</h2>
          <div className="fin-dash__row-actions">
            <StatusChip label={`${pendingWithdrawals.length} pending`} tone="warning" />
            <ProtectedActionButton
              approve="withdrawal"
              className="admin-lib-btn"
              disabled={!selectedPayouts.size || !canApproveWithdrawal}
              onClick={() =>
                setConfirm({
                  type: "batch_approve",
                  ids: Array.from(selectedPayouts),
                  label: `Batch approve ${selectedPayouts.size} payouts`,
                })
              }
            >
              Batch approve ({selectedPayouts.size})
            </ProtectedActionButton>
          </div>
        </div>
        <DataTable
          searchable
          exportFilename="payouts"
          exportScope="finance"
          bulkActions={undefined}
          columns={[
            {
              id: "select",
              label: "Batch",
              render: (r) =>
                r.status === "pending" ? (
                  <input
                    type="checkbox"
                    checked={selectedPayouts.has(r.id)}
                    onChange={() =>
                      setSelectedPayouts((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                  />
                ) : null,
            },
            { id: "id", label: "ID" },
            { id: "driver_name", label: "Driver", render: (r) => r.driver_name || r.driver_email },
            { id: "amount", label: "Amount", render: (r) => formatCurrency(r.amount) },
            { id: "status", label: "Status", render: (r) => <StatusChip label={r.status} /> },
            { id: "payout_method", label: "Method", render: (r) => r.payout_display || r.payout_method || "—" },
            { id: "created_at", label: "Created", render: (r) => formatTimestamp(r.created_at) },
          ]}
          rows={withdrawals}
          emptyLabel="No payouts"
          rowActions={(row) => (
            <div className="fin-dash__row-actions">
              {row.status === "pending" ? (
                <>
                  <ProtectedActionButton
                    approve="withdrawal"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => setConfirm({ type: "wd_approve", id: row.id, label: `Approve payout #${row.id}` })}
                  >
                    Approve
                  </ProtectedActionButton>
                  <ProtectedActionButton
                    approve="withdrawal"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => setConfirm({ type: "wd_reject", id: row.id, label: `Reject payout #${row.id}` })}
                  >
                    Reject
                  </ProtectedActionButton>
                </>
              ) : null}
              {row.status === "approved" ? (
                <ProtectedActionButton
                  approve="withdrawal"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() =>
                    setConfirm({
                      type: "wd_paid",
                      id: row.id,
                      label: `Mark paid / retry payout #${row.id}`,
                    })
                  }
                >
                  Mark paid / retry
                </ProtectedActionButton>
              ) : null}
            </div>
          )}
        />
        <p className="fin-dash__hint">
          Queues: pending {pendingWithdrawals.length} · approved {approvedWithdrawals.length} · paid {paidWithdrawals.length} ·
          rejected {rejectedWithdrawals.length}. True “failed” payout status is not modeled — retry uses mark-paid on approved.
        </p>
      </section>

      <section className="fin-dash__panel">
        <h2>Financial Reports</h2>
        <div className="fin-dash__reports">
          {REPORT_TYPES.map((report) => (
            <div key={report.id} className="fin-dash__report-card">
              <strong>{report.label}</strong>
              <div className="fin-dash__row-actions">
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport("accounting", report.id, "csv")}>
                  CSV
                </button>
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport("accounting", report.id, "xlsx")}>
                  Excel
                </button>
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport("accounting", report.id, "pdf")}>
                  PDF
                </button>
              </div>
            </div>
          ))}
          <div className="fin-dash__report-card">
            <strong>Payout reconciliation export</strong>
            <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport("withdrawals", "payouts", "csv")}>
              Export payouts CSV
            </button>
          </div>
          <div className="fin-dash__report-card">
            <strong>Corporate billing</strong>
            <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/business-accounts">
              Open corporate invoices
            </a>
          </div>
        </div>
      </section>

      <ConfirmationDialog
        open={Boolean(confirm)}
        title={confirm?.label || "Confirm"}
        message="This financial action is audited. Confirm only after verifying amounts."
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
      {confirm ? (
        <div className="fin-dash__confirm-fields">
          <label className="admin-field">
            <span className="admin-field__label">Admin note</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
