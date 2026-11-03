import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import { DataTable, KPICard, StatusChip, formatMoneyOrDash } from "../components/library";
import AdminModuleHub from "../modules/AdminModuleHub";
import { usePermissions } from "../permissions/PermissionContext";
import WithdrawalDetailsDrawer from "./WithdrawalDetailsDrawer";
import {
  canReviewWithdrawals,
  fetchAdminWithdrawals,
  fetchFinanceOverview,
  PAYOUT_TYPE_OPTIONS,
  WITHDRAWAL_ORDERING_OPTIONS,
  WITHDRAWAL_STATUS_OPTIONS,
} from "./withdrawalsApi";

const PAGE_SIZE = 25;

function statusTone(status) {
  // Amber for pending per the finance design system (was "info").
  if (status === "pending") return "warning";
  if (status === "approved" || status === "paid") return "success";
  if (status === "rejected") return "danger";
  return "neutral";
}

export const WITHDRAWAL_COLUMNS = [
  { id: "id", label: "Request", sortable: true },
  {
    id: "status",
    label: "Status",
    sortable: true,
    render: (row) => <StatusChip label={row.status} tone={statusTone(row.status)} />,
  },
  { id: "requester", label: "Requester", render: (row) => row.requester?.name || "N/A" },
  {
    // Driver vs Courier comes from the backend `requester.is_courier` flag.
    id: "role",
    label: "Role",
    render: (row) => (
      <StatusChip
        label={row.requester?.is_courier ? "Courier" : "Driver"}
        tone={row.requester?.is_courier ? "info" : "neutral"}
      />
    ),
  },
  {
    id: "amount",
    label: "Amount",
    sortable: true,
    align: "right",
    render: (row) => `${row.amount} ${row.currency || "MRU"}`,
  },
  { id: "payout_method_label", label: "Payout destination" },
  {
    id: "created_at",
    label: "Requested",
    sortable: true,
    render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "N/A"),
  },
  {
    id: "paid_at",
    label: "Paid",
    render: (row) => (row.paid_at ? new Date(row.paid_at).toLocaleString() : "N/A"),
  },
];

function Filters({ filters, onChange, onClear }) {
  return (
    <div className="admin-filters">
      <label className="admin-filters__field">
        Status
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => onChange("status", e.target.value)}
        >
          {WITHDRAWAL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-filters__field">
        Payout type
        <select
          aria-label="Filter by payout type"
          value={filters.payout_type}
          onChange={(e) => onChange("payout_type", e.target.value)}
        >
          {PAYOUT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-filters__field">
        Order
        <select
          aria-label="Order withdrawals"
          value={filters.ordering}
          onChange={(e) => onChange("ordering", e.target.value)}
        >
          {WITHDRAWAL_ORDERING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-filters__field">
        From
        <input
          type="date"
          aria-label="Filter from date"
          value={filters.date_from}
          onChange={(e) => onChange("date_from", e.target.value)}
        />
      </label>
      <label className="admin-filters__field">
        To
        <input
          type="date"
          aria-label="Filter to date"
          value={filters.date_to}
          onChange={(e) => onChange("date_to", e.target.value)}
        />
      </label>
      <label className="admin-filters__field">
        Min amount
        <input
          type="number"
          min="0"
          aria-label="Minimum amount"
          value={filters.min_amount}
          onChange={(e) => onChange("min_amount", e.target.value)}
        />
      </label>
      <label className="admin-filters__field">
        Max amount
        <input
          type="number"
          min="0"
          aria-label="Maximum amount"
          value={filters.max_amount}
          onChange={(e) => onChange("max_amount", e.target.value)}
        />
      </label>
      <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

/**
 * Finance & Withdrawals monitoring page (`/admin/withdrawals`) — READ-ONLY.
 *
 * Shows the queue KPIs, the filterable withdrawal queue and a review drawer. It
 * deliberately offers no approve / reject / mark-paid controls: the finance
 * surface is frozen, so no wallet balance, payout state or transfer can change
 * from this UI.
 */
function WithdrawalsMonitoringContent({ pathname = "/admin/withdrawals" } = {}) {
  const { permissions } = usePermissions();
  const canReview = useMemo(() => canReviewWithdrawals(permissions), [permissions]);

  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    status: "",
    payout_type: "",
    ordering: "newest",
    date_from: "",
    date_to: "",
    min_amount: "",
    max_amount: "",
  });
  const [drawer, setDrawer] = useState({
    open: false,
    withdrawal: null,
    loading: false,
    error: "",
    id: null,
  });

  const loadOverview = useCallback(async () => {
    setOverviewError("");
    try {
      const data = await fetchFinanceOverview();
      setOverview(data);
    } catch (err) {
      setOverviewError(err?.response?.data?.detail || "Could not load finance KPIs.");
      setOverview(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminWithdrawals({
        page,
        page_size: PAGE_SIZE,
        search,
        status: filters.status,
        payout_type: filters.payout_type,
        ordering: filters.ordering,
        date_from: filters.date_from,
        date_to: filters.date_to,
        min_amount: filters.min_amount,
        max_amount: filters.max_amount,
      });
      setRows(data.results || []);
      setSummary(data.summary || null);
      setMeta({
        count: data.count || 0,
        page: data.page || 1,
        total_pages: data.total_pages || 1,
        page_size: data.page_size || PAGE_SIZE,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load withdrawal requests.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    load();
  }, [load]);

  const openWithdrawal = useCallback(async (row) => {
    setDrawer({ open: true, withdrawal: row, loading: false, error: "", id: row.id });
  }, []);

  const closeDrawer = () =>
    setDrawer({ open: false, withdrawal: null, loading: false, error: "", id: null });

  const onFilterChange = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filtersNode = useMemo(
    () => (
      <Filters
        filters={filters}
        onChange={onFilterChange}
        onClear={() => {
          setPage(1);
          setFilters({
            status: "",
            payout_type: "",
            ordering: "newest",
            date_from: "",
            date_to: "",
            min_amount: "",
            max_amount: "",
          });
          setSearch("");
        }}
      />
    ),
    [filters]
  );

  const queue = summary || overview?.withdrawals || null;


  return (
      <div className="admin-withdrawals">
        <section className="withdrawals-group" aria-labelledby="wd-group-open">
          <h3 className="withdrawals-group__title" id="wd-group-open">
            Open payout queue
          </h3>
          <div className="admin-kpi-row">
            <KPICard
              label="Total requests"
              value={queue?.total}
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Pending"
              value={queue?.pending}
              subtitle={formatMoneyOrDash(queue?.pending_amount)}
              tone="warning"
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Approved (unpaid)"
              value={queue?.approved}
              subtitle={formatMoneyOrDash(queue?.approved_amount)}
              tone="info"
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Open amount"
              value={overview?.withdrawals?.open_amount}
              subtitle="Pending + approved requests (read-only)"
              loading={loading}
              error={overviewError}
              onRefresh={loadOverview}
            />
          </div>
        </section>

        <section className="withdrawals-group" aria-labelledby="wd-group-completed">
          <h3 className="withdrawals-group__title" id="wd-group-completed">
            Completed &amp; rejected payouts
          </h3>
          <div className="admin-kpi-row">
            <KPICard
              label="Paid"
              value={queue?.paid}
              subtitle={formatMoneyOrDash(queue?.paid_amount)}
              tone="success"
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Rejected"
              value={queue?.rejected}
              tone="danger"
              loading={loading}
              error={error}
              onRefresh={load}
            />
            <KPICard
              label="Paid last 30 days"
              value={overview?.withdrawals?.paid_last_30d_amount}
              subtitle={`${overview?.withdrawals?.paid_last_30d_count ?? 0} payouts`}
              loading={loading}
              error={overviewError}
              onRefresh={loadOverview}
            />
          </div>
        </section>

        <section className="withdrawals-group" aria-labelledby="wd-group-wallets">
          <h3 className="withdrawals-group__title" id="wd-group-wallets">
            Wallet exposure
          </h3>
          <div className="admin-kpi-row">
            <KPICard
              label="Wallet balances"
              value={overview?.wallets?.total_balance}
              subtitle={`${overview?.wallets?.wallets ?? "N/A"} wallets (stored balances)`}
              loading={loading}
              error={overviewError}
              onRefresh={loadOverview}
            />
          </div>
        </section>

        <p className="withdrawals-notice" role="note">
          Read-only monitoring. Withdrawal approvals, rejections and mark-paid actions are
          frozen — no wallet balance, payout state or transfer can be changed from this UI.
        </p>

        <DataTable
          title="Withdrawal requests"
          columns={WITHDRAWAL_COLUMNS}
          rows={rows}
          rowKey="id"
          loading={loading}
          error={error}
          emptyLabel="No withdrawal requests match these filters."
          serverMode
          searchValue={search}
          onSearchChange={(value) => {
            setPage(1);
            setSearch(value);
          }}
          searchPlaceholder="Search requester, reference or payment reference…"
          page={meta.page}
          pageSize={meta.page_size}
          total={meta.count}
          onPageChange={setPage}
          onRefresh={load}
          filters={filtersNode}
          rowActions={(row) => (
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => openWithdrawal(row)}
            >
              Review
            </button>
          )}
        />

        <AdminModuleHub hubKey="withdrawals" />

        {drawer.open ? (
          <WithdrawalDetailsDrawer
            withdrawal={drawer.withdrawal}
            loading={drawer.loading}
            error={drawer.error}
            canReview={canReview}
            onClose={closeDrawer}
            onRetry={() => load()}
          />
        ) : null}
      </div>
  );
}

/**
 * Withdrawals monitoring (read-only finance surface).
 *
 * `AdminShellPage` supplies `PermissionProvider`, and the withdrawal content consumes
 * `usePermissions()`. React context only flows downwards, so the hook **must** run
 * inside the shell — hence the content lives in its own component rendered as a child
 * of `AdminShellPage`. Calling the hook in the outer component (as this page used to)
 * threw "usePermissions must be used within PermissionProvider" and crashed
 * /admin/withdrawals.
 */
export default function WithdrawalsMonitoring({ pathname = "/admin/withdrawals" } = {}) {
  return (
    <AdminShellPage pathname={pathname} title="Finance & Withdrawals">
      <WithdrawalsMonitoringContent pathname={pathname} />
    </AdminShellPage>
  );
}

