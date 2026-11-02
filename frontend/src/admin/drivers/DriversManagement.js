import React, { useMemo, useState } from "react";

import {
  ConfirmationDialog,
  DataTable,
  KPICard,
  Select,
  StatusChip,
} from "../components/library";
import AdminActionGuard from "../components/guards/AdminActionGuard";
import { formatTimestamp } from "../components/library/utils/formatters";
import DriverDetailsDrawer from "./DriverDetailsDrawer";
import {
  computeDriverSummary,
  filterDrivers,
  getAccountStatus,
  getOnlineStatus,
  getVerificationStatus,
  sortDrivers,
} from "./driversSelectors";
import "./drivers.css";
import { AdminPageTitle } from "../layouts/AdminPageHeading";

const PAGE_SIZE = 25;

const VERIFICATION_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

const ACCOUNT_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

const ONLINE_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

function initials(driver) {
  const name = String(driver?.driver_name || driver?.email || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

function docTone(status) {
  if (status === "valid") return "success";
  if (status === "expiring_soon") return "warning";
  if (status === "expired") return "danger";
  return "neutral";
}

function DriverCell({ driver, getFileUrl }) {
  const url = driver.driver_photo ? getFileUrl?.(driver.driver_photo) : null;
  return (
    <div className="drivers-driver-cell">
      {url ? (
        <img className="drivers-avatar" src={url} alt="" aria-hidden="true" />
      ) : (
        <span className="drivers-avatar drivers-avatar--fallback" aria-hidden="true">
          {initials(driver)}
        </span>
      )}
      <span className="drivers-driver-cell__name">
        <span className="drivers-driver-cell__fullname">{driver.driver_name || driver.email || "Driver"}</span>
      </span>
    </div>
  );
}

/**
 * Drivers Management container. Holds filter/sort/pagination/selection state,
 * computes Phase-1 summary counts + filtered rows from the loaded taxi-driver
 * list, and renders the summary cards, the data table, and the details drawer.
 *
 * Data source and action handlers are injected from AdminDashboard (same
 * authenticated API client, same endpoints, same confirmations/toasts/refetch
 * on success). The module adds a confirmation ONLY for Suspend/Reactivate,
 * which the legacy handler (setUserBlocked) does not confirm; Approve and
 * Reject already confirm/prompt inside their injected handlers, so we do NOT
 * add a second layer there. No action ever fires on render. There is NO delete
 * action anywhere — permanent deletion is intentionally not surfaced.
 *
 * Every MUTATING control (Approve / Reject / Suspend) is RBAC-gated via
 * AdminActionGuard (action key "drivers.edit", mode="disable"); Details is a
 * plain button. CSV export is RBAC-gated through the DataTable export toolbar.
 */
export default function DriversManagement({
  drivers = [],
  loading = false,
  error = null,
  getFileUrl,
  onApproveDriver,
  onRejectDriver,
  onBlockUser,
  // Note: AdminDashboard also passes onReintegrate for parity with the legacy
  // handlers, but Stage 1 routes Suspend/Reactivate through the block/unblock
  // account workflow (onBlockUser), so it is intentionally not destructured.
}) {
  const [query, setQuery] = useState("");
  const [verification, setVerification] = useState("");
  const [account, setAccount] = useState("");
  const [online, setOnline] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [page, setPage] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);

  const summary = useMemo(() => computeDriverSummary(drivers), [drivers]);

  const visibleRows = useMemo(() => {
    const filtered = filterDrivers(drivers, { query, verification, account, online });
    return sortDrivers(filtered, sortDirection);
  }, [drivers, query, verification, account, online, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () => visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRows, safePage]
  );

  const resetToFirstPage = () => setPage(1);

  const handleApprove = (driver) => onApproveDriver?.(driver.id);
  const handleReject = (driver) => onRejectDriver?.(driver.id);
  const requestSuspendToggle = (driver) => setSuspendTarget(driver);

  // Actions invoked from WITHIN the details drawer must first close the drawer,
  // so a confirmation surface (the in-module Suspend dialog, or the injected
  // approve/reject prompt) is never stacked on top of the drawer's own
  // aria-modal + focus trap. Two modal surfaces at once breaks keyboard focus
  // and confuses assistive tech; closing the drawer leaves a single clean modal
  // and lets focus return correctly afterward.
  const handleDrawerApprove = (driver) => {
    setSelectedDriver(null);
    handleApprove(driver);
  };
  const handleDrawerReject = (driver) => {
    setSelectedDriver(null);
    handleReject(driver);
  };
  const handleDrawerSuspendToggle = (driver) => {
    setSelectedDriver(null);
    requestSuspendToggle(driver);
  };

  const confirmSuspendToggle = () => {
    if (suspendTarget) {
      const isActive = suspendTarget.is_active !== false;
      // shouldBlock = currently active -> block; currently suspended -> unblock.
      onBlockUser?.(suspendTarget.user_id, isActive);
    }
    setSuspendTarget(null);
  };

  const columns = useMemo(
    () => [
      {
        id: "driver",
        label: "Driver",
        render: (row) => <DriverCell driver={row} getFileUrl={getFileUrl} />,
      },
      {
        id: "contact",
        label: "Phone / email",
        render: (row) => (
          <div className="drivers-contact">
            <span>{row.phone_number || "—"}</span>
            <span>{row.email || "—"}</span>
          </div>
        ),
      },
      {
        id: "driver_id",
        label: "Driver ID",
        render: (row) => row.driver_code || row.id || "—",
      },
      {
        id: "vehicle",
        label: "Vehicle",
        render: (row) => (
          <div className="drivers-contact">
            <span>{row.driver_category_label || row.car_type || "—"}</span>
            <span className="drivers-cell-hint">{row.vehicle_plate || row.plate_number || "No plate"}</span>
          </div>
        ),
      },
      {
        id: "city",
        label: "City",
        render: (row) => row.city_name || "—",
      },
      {
        id: "verification",
        label: "Identity verification",
        render: (row) => {
          const v = getVerificationStatus(row);
          return (
            <div>
              <StatusChip label={v.label} tone={v.tone} />
              <div className="drivers-doc-badges">
                <StatusChip label="License" tone={docTone(row.license_status)} />
                <StatusChip label="Registration" tone={docTone(row.vehicle_registration_status)} />
                <StatusChip label="Insurance" tone={docTone(row.insurance_status)} />
              </div>
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
        id: "online",
        label: "Availability",
        render: (row) => {
          const o = getOnlineStatus(row);
          return <StatusChip label={o.label} tone={o.tone} />;
        },
      },
      {
        id: "rides",
        label: "Completed rides",
        render: (row) => {
          const count = row.total_rides_completed;
          if (count === null || count === undefined) {
            return (
              <span className="drivers-na" title="Not provided by API">
                N/A
              </span>
            );
          }
          return <span>{count}</span>;
        },
      },
      {
        id: "rating",
        label: "Average rating",
        render: (row) => {
          const value = row.average_rating;
          if (value === null || value === undefined || value === "") {
            return <span className="drivers-na">N/A</span>;
          }
          const num = Number(value);
          return <span>{Number.isNaN(num) ? "N/A" : num.toFixed(2)}</span>;
        },
      },
      {
        id: "joined",
        label: "Registered",
        sortable: true,
        render: (row) => formatTimestamp(row.date_joined),
      },
    ],
    [getFileUrl]
  );

  const rowActions = (row) => {
    // Mirror the backend approve gate (driver_has_complete_signature): a driver
    // whose electronic signature is incomplete cannot be approved. The backend
    // remains authoritative; this only disables the UI action and explains why,
    // consistent with the Driver Agreement / Legal section in the details drawer.
    const signatureIncomplete = !row.legal_signature?.signature_complete;
    const canApprove = row.status !== "approved" && !signatureIncomplete;
    const approveDisabledReason =
      row.status !== "approved" && signatureIncomplete
        ? "Driver must complete the electronic signature in the Yala Driver app before approval."
        : undefined;
    const canReject = row.status !== "rejected";
    const label = row.driver_name || row.email;
    return (
      <div className="drivers-actions">
        <button
          type="button"
          className="admin-lib-btn drivers-details-btn"
          aria-label={`View details for ${label}`}
          onClick={() => setSelectedDriver(row)}
        >
          Details
        </button>
        <AdminActionGuard action="drivers.edit" mode="disable">
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            disabled={!canApprove}
            title={approveDisabledReason}
            aria-label={`Approve ${label}`}
            onClick={() => handleApprove(row)}
          >
            Approve
          </button>
        </AdminActionGuard>
        <AdminActionGuard action="drivers.edit" mode="disable">
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            disabled={!canReject}
            aria-label={`Reject ${label}`}
            onClick={() => handleReject(row)}
          >
            Reject
          </button>
        </AdminActionGuard>
        <AdminActionGuard action="drivers.edit" mode="disable">
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            aria-label={`${row.is_active === false ? "Reactivate" : "Suspend"} account for ${label}`}
            onClick={() => requestSuspendToggle(row)}
          >
            {row.is_active === false ? "Reactivate" : "Suspend"}
          </button>
        </AdminActionGuard>
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
      <Select
        label="Availability"
        value={online}
        onChange={(v) => {
          setOnline(v);
          resetToFirstPage();
        }}
        options={ONLINE_OPTIONS}
        placeholder="All availability"
      />
    </>
  );

  return (
    <section className="drivers-management" aria-label="Drivers management">
      <header className="drivers-management__header">
        <h1><AdminPageTitle>Driver Management</AdminPageTitle></h1>
        <p>Review driver accounts, identity verification, vehicle documents, and account access.</p>
      </header>

      <div className="drivers-management__summary">
        <KPICard label="Total Drivers" value={summary.total} />
        <KPICard label="Approved" value={summary.approved} tone="success" />
        <KPICard label="Pending" value={summary.pending} tone="warning" />
        <KPICard label="Rejected" value={summary.rejected} tone="danger" />
        <KPICard label="Suspended" value={summary.suspended} tone="danger" />
        <KPICard label="Online" value={summary.online} tone="success" />
        <KPICard label="Offline" value={summary.offline} />
        <KPICard label="New This Month" value={summary.newThisMonth} />
        <KPICard
          label="Completed Rides"
          value={summary.totalCompletedRides == null ? "N/A" : summary.totalCompletedRides}
        />
      </div>

      <DataTable
        title="Drivers"
        columns={columns}
        rows={pagedRows}
        rowKey="id"
        loading={loading}
        error={error}
        emptyLabel={
          query || verification || account || online
            ? "No drivers match your filters"
            : "No drivers found"
        }
        searchPlaceholder="Search name, email, phone, ID, or plate"
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
        exportFilename="drivers"
        exportScope="drivers"
      />

      <DriverDetailsDrawer
        driver={selectedDriver}
        open={Boolean(selectedDriver)}
        getFileUrl={getFileUrl}
        onClose={() => setSelectedDriver(null)}
        onApprove={handleDrawerApprove}
        onReject={handleDrawerReject}
        onSuspendToggle={handleDrawerSuspendToggle}
      />

      <ConfirmationDialog
        open={Boolean(suspendTarget)}
        title={
          suspendTarget && suspendTarget.is_active !== false
            ? "Suspend driver account"
            : "Reactivate driver account"
        }
        message={
          suspendTarget && suspendTarget.is_active !== false
            ? `Suspend the account for ${suspendTarget?.driver_name || suspendTarget?.email}? They will lose access until reactivated.`
            : `Reactivate the account for ${suspendTarget?.driver_name || suspendTarget?.email}?`
        }
        confirmLabel={suspendTarget && suspendTarget.is_active !== false ? "Suspend" : "Reactivate"}
        tone={suspendTarget && suspendTarget.is_active !== false ? "danger" : "ghost"}
        onConfirm={confirmSuspendToggle}
        onCancel={() => setSuspendTarget(null)}
      />
    </section>
  );
}
