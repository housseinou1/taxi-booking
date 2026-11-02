import React, { useMemo, useState } from "react";

import {
  ConfirmationDialog,
  DataTable,
  KPICard,
  Select,
  StatusChip,
} from "../components/library";
import { formatTimestamp } from "../components/library/utils/formatters";
import RiderDetailsDrawer from "./RiderDetailsDrawer";
import {
  computeRiderSummary,
  filterRiders,
  getAccountStatus,
  getCompletedRideCount,
  getVerification,
  isTestAccount,
  sortRidersByDate,
} from "./ridersSelectors";
import { reactivateRider, suspendRider } from "./ridersApi";
import "./riders.css";

const PAGE_SIZE = 25;

const VERIFICATION_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const ACCOUNT_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

function initials(rider) {
  const name = String(rider?.full_name || rider?.email || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function RiderCell({ rider, getFileUrl }) {
  const url = rider.profile_picture ? getFileUrl?.(rider.profile_picture) : null;
  const test = isTestAccount(rider);
  return (
    <div className="riders-rider-cell">
      {url ? (
        <img className="riders-avatar" src={url} alt="" aria-hidden="true" />
      ) : (
        <span className="riders-avatar riders-avatar--fallback" aria-hidden="true">
          {initials(rider)}
        </span>
      )}
      <span className="riders-rider-cell__name">
        <span className="riders-rider-cell__fullname">{rider.full_name || rider.email || "Rider"}</span>
        {test ? (
          <span className="riders-rider-cell__sub">
            <StatusChip label="TEST/QA" tone="neutral" title="Flagged as a QA/test account (display only)" />
          </span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Riders Management container. Holds filter/sort/pagination/selection state,
 * computes summary counts + filtered rows from the loaded riders list, and
 * renders the summary cards, the data table, and the details drawer.
 *
 * Data source and action handlers are injected from AdminDashboard (same
 * authenticated API client, same endpoints, same confirmations/toasts/refetch
 * on success). The module adds a confirmation ONLY for Suspend/Reactivate,
 * which the legacy handler (setUserBlocked) does not confirm; Approve, Reject,
 * and Delete already confirm/prompt inside their injected handlers, so we do
 * NOT add a second layer there. No action ever fires on render.
 */
export default function RidersManagement({
  riders = [],
  rides = [],
  loading = false,
  error = null,
  getFileUrl,
  onApproveRider,
  onRejectRider,
  onBlockUser,
  onRefresh,
}) {
  const [query, setQuery] = useState("");
  const [verification, setVerification] = useState("");
  const [account, setAccount] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [selectedRider, setSelectedRider] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);

  const summary = useMemo(() => computeRiderSummary(riders), [riders]);

  const visibleRows = useMemo(() => {
    const filtered = filterRiders(riders, { query, verification, account });
    return sortRidersByDate(filtered, sortDirection);
  }, [riders, query, verification, account, sortDirection]);

  // Clamp page when the filtered set shrinks.
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  // serverMode DataTable renders `rows` as-is, so slice to the current page here.
  const pagedRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRows, safePage]
  );

  const resetToFirstPage = () => setPage(1);

  const handleApprove = (rider) => onApproveRider?.(rider.id);
  const handleReject = (rider) => onRejectRider?.(rider.id);
  const requestSuspendToggle = (rider) => setSuspendTarget(rider);

  // Actions invoked from WITHIN the details drawer must first close the drawer,
  // so a confirmation surface (the in-module Deactivate dialog, or the injected
  // approve/reject confirm/prompt) is never stacked on top of the drawer's own
  // aria-modal + focus trap. Two modal surfaces at once breaks keyboard focus
  // and confuses assistive tech; closing the drawer leaves a single clean modal
  // and lets focus return correctly afterward.
  const handleDrawerApprove = (rider) => {
    setSelectedRider(null);
    handleApprove(rider);
  };
  const handleDrawerReject = (rider) => {
    setSelectedRider(null);
    handleReject(rider);
  };
  const handleDrawerSuspendToggle = (rider) => {
    setSelectedRider(null);
    requestSuspendToggle(rider);
  };

  // Phase 4: reason-capturing suspend / reactivate through the dedicated admin
  // endpoints (recorded in the audit trail). The legacy block toggle above is
  // kept as a fallback for callers that don't pass these handlers.
  const handleSuspend = async (rider, reason) => {
    await suspendRider(rider.id, reason);
    setSelectedRider(null);
    onRefresh?.();
  };

  const handleReactivate = async (rider, reason) => {
    await reactivateRider(rider.id, reason);
    setSelectedRider(null);
    onRefresh?.();
  };

  const confirmSuspendToggle = () => {
    if (suspendTarget) onBlockUser?.(suspendTarget.id, suspendTarget.is_active);
    setSuspendTarget(null);
  };

  const columns = useMemo(
    () => [
      {
        id: "rider",
        label: "Rider",
        render: (row) => <RiderCell rider={row} getFileUrl={getFileUrl} />,
      },
      {
        id: "contact",
        label: "Email / phone",
        render: (row) => (
          <div className="riders-contact">
            <span>{row.email || "—"}</span>
            <span>
              {row.phone_number || "—"}
              {row.phone_number ? (
                <span className={row.phone_verified ? "riders-contact__verified" : "riders-contact__unverified"}>
                  {" "}
                  {row.phone_verified ? "✓ verified" : "unverified"}
                </span>
              ) : null}
            </span>
          </div>
        ),
      },
      {
        id: "verification",
        label: "Identity verification",
        render: (row) => {
          const v = getVerification(row);
          return (
            <div>
              <StatusChip label={v.label} tone={v.tone} />
              <span className="riders-cell-hint">
                {row.has_national_id_document ? "ID document on file" : "No ID document"}
              </span>
            </div>
          );
        },
      },
      {
        id: "account",
        label: "Account status",
        render: (row) => {
          const a = getAccountStatus(row);
          return <StatusChip label={a.label} tone={a.tone} />;
        },
      },
      {
        id: "rides",
        label: "Completed rides",
        render: (row) => {
          const count = getCompletedRideCount(row, rides);
          if (count == null) {
            return (
              <span className="riders-na" title="Not provided by API (derived count unavailable)">
                N/A
              </span>
            );
          }
          return (
            <span title="Derived from the loaded ride history list (not an authoritative total)">
              {count}
            </span>
          );
        },
      },
      {
        id: "joined",
        label: "Registered",
        sortable: true,
        render: (row) => formatTimestamp(row.date_joined),
      },
    ],
    [getFileUrl, rides]
  );

  const rowActions = (row) => {
    const canApprove = row.rider_status !== "approved";
    const canReject = row.rider_status !== "rejected";
    return (
      <div className="riders-actions">
        <button
          type="button"
          className="admin-lib-btn admin-lib-btn--ghost"
          aria-label={`View details for ${row.full_name || row.email}`}
          onClick={() => setSelectedRider(row)}
        >
          Details
        </button>
        <button
          type="button"
          className="admin-lib-btn admin-lib-btn--ghost"
          disabled={!canApprove}
          aria-label={`Approve verification for ${row.full_name || row.email}`}
          onClick={() => handleApprove(row)}
        >
          Approve
        </button>
        <button
          type="button"
          className="admin-lib-btn admin-lib-btn--ghost"
          disabled={!canReject}
          aria-label={`Reject verification for ${row.full_name || row.email}`}
          onClick={() => handleReject(row)}
        >
          Reject
        </button>
        <button
          type="button"
          className={`admin-lib-btn ${row.is_active ? "admin-lib-btn--danger" : "admin-lib-btn--ghost"}`}
          aria-label={`${row.is_active ? "Deactivate" : "Reactivate"} account for ${row.full_name || row.email}`}
          onClick={() => requestSuspendToggle(row)}
        >
          {row.is_active ? "Deactivate Account" : "Reactivate Account"}
        </button>
      </div>
    );
  };

  const filtersNode = (
    <>
      <Select
        label="Verification"
        value={verification}
        onChange={(v) => {
          setVerification(v);
          resetToFirstPage();
        }}
        options={VERIFICATION_OPTIONS}
        placeholder="All verification"
      />
      <Select
        label="Account"
        value={account}
        onChange={(v) => {
          setAccount(v);
          resetToFirstPage();
        }}
        options={ACCOUNT_OPTIONS}
        placeholder="All accounts"
      />
    </>
  );

  return (
    <section className="riders-management" aria-label="Riders management">
      <header className="riders-management__header">
        <h2>Rider Management</h2>
        <p>Review rider accounts, identity verification, and account access.</p>
      </header>

      <div className="riders-management__summary">
        <KPICard label="Total Riders" value={summary.total} />
        <KPICard label="Active Riders" value={summary.active} tone="success" />
        <KPICard label="Pending Verification" value={summary.pending} tone="warning" />
        <KPICard label="Verified Riders" value={summary.verified} tone="success" />
        <KPICard label="Suspended Riders" value={summary.suspended} tone="danger" />
      </div>

      <DataTable
        title="Riders"
        columns={columns}
        rows={pagedRows}
        rowKey="id"
        loading={loading}
        error={error}
        emptyLabel={
          query || verification || account ? "No riders match your filters" : "No riders found"
        }
        searchPlaceholder="Search name, email, or phone"
        searchValue={query}
        onSearchChange={(value) => {
          setQuery(value);
          resetToFirstPage();
        }}
        serverMode
        sortKey="joined"
        sortDirection={sortDirection}
        onSortChange={(_key, dir) => setSortDirection(dir)}
        page={safePage}
        pageSize={PAGE_SIZE}
        total={visibleRows.length}
        onPageChange={setPage}
        filters={filtersNode}
        rowActions={rowActions}
        exportFilename="riders"
        exportScope="riders"
      />

      <RiderDetailsDrawer
        rider={selectedRider}
        open={Boolean(selectedRider)}
        rides={rides}
        getFileUrl={getFileUrl}
        onClose={() => setSelectedRider(null)}
        onApprove={handleDrawerApprove}
        onReject={handleDrawerReject}
        onSuspendToggle={handleDrawerSuspendToggle}
        onSuspend={handleSuspend}
        onReactivate={handleReactivate}
      />

      <ConfirmationDialog
        open={Boolean(suspendTarget)}
        title={suspendTarget?.is_active ? "Deactivate rider account" : "Reactivate rider account"}
        message={
          suspendTarget?.is_active
            ? `Deactivate the account for ${suspendTarget?.full_name || suspendTarget?.email}? They will be signed out and blocked from logging in until reactivated. Ride history, payments, refunds, and safety records are preserved — the account is NOT deleted.`
            : `Reactivate the account for ${suspendTarget?.full_name || suspendTarget?.email}? They will be able to log in again.`
        }
        confirmLabel={suspendTarget?.is_active ? "Deactivate Account" : "Reactivate Account"}
        tone={suspendTarget?.is_active ? "danger" : "ghost"}
        onConfirm={confirmSuspendToggle}
        onCancel={() => setSuspendTarget(null)}
      />
    </section>
  );
}
