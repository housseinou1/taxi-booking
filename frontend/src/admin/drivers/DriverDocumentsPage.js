import React, { useCallback, useEffect, useMemo, useState } from "react";

import AdminActionGuard from "../components/guards/AdminActionGuard";
import {
  AlertBanner,
  DataTable,
  FilterBar,
  KPICard,
  Modal,
  Select,
  StatusChip,
  ToastProvider,
  useToast,
} from "../components/library";
import {
  approveDriverDocument,
  daysUntilExpiry,
  documentStatusTone,
  documentTypeLabel,
  expiryBand,
  getDriverApprovalQueue,
  getDriverDirectory,
  rejectDriverDocument,
} from "./driverAdminApi";
import { useOperatingCityOptions } from "../layouts/useOperatingCityOptions";
import "./driverDocuments.css";

/**
 * Driver Documents Management.
 *
 * `mode="documents"`    — the full document register across every driver.
 * `mode="verification"` — the pending review queue. Same component, filtered, so
 *                         "Document Verification" is not a second implementation.
 *
 * Existing admin endpoints only:
 *   GET /admin/approvals/drivers/ → driver + DriverDocument rows. This is the ONLY
 *                                   admin source of document ids, which the
 *                                   approve/reject endpoints require.
 *   GET /drivers/list/            → review_state: missing / expired / expiring /
 *                                   under-review, already computed by the backend.
 *
 * Nothing is computed that the backend does not already provide. A driver whose
 * required document is simply absent appears as a "missing" row with NO actions,
 * because no DriverDocument row exists to approve or reject.
 */

const EXPIRY_OPTIONS = [
  { value: "", label: "All expiry states" },
  { value: "expired", label: "Expired" },
  { value: "critical", label: "Expiring in 7 days" },
  { value: "soon", label: "Expiring in 30 days" },
  { value: "valid", label: "Valid" },
  { value: "none", label: "No expiry recorded" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All verification states" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "missing", label: "Missing" },
];

const asArray = (value) => (Array.isArray(value) ? value : []);

const PENDING_STATUSES = ["pending", "uploaded", "pending_review"];

export default function DriverDocumentsPage({ mode = "documents" }) {
  return (
    <ToastProvider>
      <DriverDocumentsInner mode={mode} />
    </ToastProvider>
  );
}

/** Merge the approvals queue (document rows) with the directory (review state). */
export function buildDocumentRows(queueDrivers, directoryRows) {
  const byProfile = new Map();
  const byUser = new Map();
  directoryRows.forEach((row) => {
    byProfile.set(row.id, row);
    byUser.set(row.user_id, row);
  });

  const rows = [];

  queueDrivers.forEach((driver) => {
    const profile = byProfile.get(driver.profile_id) || byUser.get(driver.id) || {};
    const base = {
      driver_id: driver.profile_id ?? driver.id,
      driver_name: driver.full_name || profile.driver_name || driver.email || "",
      driver_photo: driver.profile_picture || profile.driver_photo || "",
      phone_number: driver.phone_number || profile.phone_number || "",
      city: driver.city_name || profile.city_name || "",
      vehicle_type:
        driver.car_type || profile.car_type || profile.driver_category_label || "",
      driver_category: profile.driver_category_label || profile.driver_category || "",
      driver_status: driver.status || profile.status || "",
    };

    asArray(driver.documents).forEach((doc) => {
      rows.push({
        ...base,
        id: `doc-${doc.id}`,
        document_id: doc.id,
        document_type: doc.document_type,
        document_type_display:
          doc.document_type_display || documentTypeLabel(doc.document_type),
        submitted_at: driver.date_joined || driver.created_at || null,
        expires_at: doc.expires_at || null,
        status: doc.status || "pending",
        rejection_reason: doc.rejection_reason || "",
        file_url: doc.file_url || "",
        approval_history: asArray(driver.approval_history),
        actionable: PENDING_STATUSES.includes(String(doc.status || "").toLowerCase()),
      });
    });

    // Required documents the backend reports as missing for this driver.
    asArray(profile.missing_document_types).forEach((type) => {
      rows.push({
        ...base,
        id: `missing-${base.driver_id}-${type}`,
        document_id: null,
        document_type: type,
        document_type_display: documentTypeLabel(type),
        submitted_at: null,
        expires_at: null,
        status: "missing",
        rejection_reason: "",
        file_url: "",
        approval_history: asArray(driver.approval_history),
        actionable: false,
      });
    });
  });

  return rows;
}

/**
 * Document KPIs, computed only from backend-provided review state.
 *
 * `directoryRows` are `/drivers/list/` rows; each already carries
 * `all_required_documents_uploaded`, `documents_under_review`,
 * `missing_document_types`, `expired_document_types` and `expiring_soon_documents`.
 * No threshold or category is invented here.
 */
export function computeDocumentKpis(directoryRows, rows) {
  const drivers = asArray(directoryRows);
  const rejectedDriverIds = new Set(
    asArray(rows)
      .filter((row) => String(row.status).toLowerCase() === "rejected")
      .map((row) => row.driver_id)
  );

  return {
    totalDrivers: drivers.length,
    verifiedDrivers: drivers.filter(
      (row) => row.all_required_documents_uploaded && !asArray(row.expired_document_types).length
    ).length,
    awaitingApproval: drivers.filter((row) => row.documents_under_review).length,
    rejectedDrivers: rejectedDriverIds.size,
    expiredDrivers: drivers.filter((row) => asArray(row.expired_document_types).length).length,
    expiringSoon: drivers.filter((row) => asArray(row.expiring_soon_documents).length).length,
    missingDrivers: drivers.filter((row) => asArray(row.missing_document_types).length).length,
  };
}

function DriverDocumentsInner({ mode }) {
  const { push } = useToast();

  const [queue, setQueue] = useState({ loading: true, error: "", drivers: [] });
  const [directory, setDirectory] = useState({ loading: true, error: "", rows: [] });
  const [filters, setFilters] = useState({
    city: "",
    category: "",
    documentType: "",
    status: "",
    expiry: "",
  });
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("driver_name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setQueue((prev) => ({ ...prev, loading: true, error: "" }));
    setDirectory((prev) => ({ ...prev, loading: true, error: "" }));

    const [queueResult, directoryResult] = await Promise.allSettled([
      getDriverApprovalQueue(),
      getDriverDirectory(),
    ]);

    if (queueResult.status === "fulfilled") {
      const payload = queueResult.value;
      setQueue({ loading: false, error: "", drivers: asArray(payload?.results || payload) });
    } else {
      setQueue({
        loading: false,
        error: queueResult.reason?.message || "Could not load driver documents.",
        drivers: [],
      });
    }

    if (directoryResult.status === "fulfilled") {
      const payload = directoryResult.value;
      setDirectory({ loading: false, error: "", rows: asArray(payload?.results || payload) });
    } else {
      setDirectory({
        loading: false,
        error: directoryResult.reason?.message || "Could not load driver review state.",
        rows: [],
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allRows = useMemo(
    () => buildDocumentRows(queue.drivers, directory.rows),
    [queue.drivers, directory.rows]
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (mode === "verification" && row.status === "approved") return false;
      if (filters.city && row.city !== filters.city) return false;
      if (filters.category && row.driver_category !== filters.category) return false;
      if (filters.documentType && row.document_type !== filters.documentType) return false;
      if (filters.status) {
        const status = String(row.status || "").toLowerCase();
        if (filters.status === "pending") {
          if (!PENDING_STATUSES.includes(status)) return false;
        } else if (status !== filters.status) {
          return false;
        }
      }
      if (filters.expiry && expiryBand(row.expires_at) !== filters.expiry) return false;
      if (!query) return true;
      return [row.driver_name, row.phone_number, row.city, row.document_type_display, row.driver_id]
        .map((value) => String(value ?? "").toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [allRows, filters, mode, search]);

  const kpis = useMemo(
    () => computeDocumentKpis(directory.rows, allRows),
    [directory.rows, allRows]
  );

  const { nameFilterOptions: cityOptions } = useOperatingCityOptions();

  const categoryOptions = useMemo(() => {
    const categories = new Set();
    directory.rows.forEach((row) => {
      const label = row.driver_category_label || row.driver_category;
      if (label) categories.add(label);
    });
    return [
      { value: "", label: "All driver categories" },
      ...[...categories].sort().map((category) => ({ value: category, label: category })),
    ];
  }, [directory.rows]);

  const documentTypeOptions = useMemo(() => {
    const types = new Map();
    allRows.forEach((row) => {
      if (row.document_type) types.set(row.document_type, row.document_type_display);
    });
    return [
      { value: "", label: "All document types" },
      ...[...types.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [allRows]);

  const loading = queue.loading || directory.loading;

  return (
    <div className="driver-docs">
      <header className="driver-docs__head">
        <div>
          <h2>{mode === "verification" ? "Document Verification" : "Driver Documents"}</h2>
          <p>
            {mode === "verification"
              ? "Review queue for documents awaiting a decision. Every approval and rejection is audited."
              : "Central register of every driver document on file, with expiry monitoring."}
          </p>
        </div>
        <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
          Refresh
        </button>
      </header>

      {queue.error ? (
        <AlertBanner tone="danger">{`Document queue: ${queue.error}`}</AlertBanner>
      ) : null}
      {directory.error ? (
        <AlertBanner tone="warning">{`Driver review state: ${directory.error}`}</AlertBanner>
      ) : null}

      <div className="admin-kpi-row driver-docs__kpis">
        <KPICard label="Registered drivers" value={kpis.totalDrivers} icon="🚕" loading={directory.loading} />
        <KPICard label="Documents verified" value={kpis.verifiedDrivers} tone="success" icon="✅" loading={directory.loading} />
        <KPICard label="Awaiting approval" value={kpis.awaitingApproval} tone="warning" icon="⏳" loading={directory.loading} />
        <KPICard label="With rejected documents" value={kpis.rejectedDrivers} tone="danger" icon="⛔" loading={directory.loading} />
        <KPICard label="With expired documents" value={kpis.expiredDrivers} tone="danger" icon="📛" loading={directory.loading} />
        <KPICard label="Expiring soon (30 days)" value={kpis.expiringSoon} tone="warning" icon="🔔" loading={directory.loading} />
        <KPICard label="Missing required documents" value={kpis.missingDrivers} tone="danger" icon="📄" loading={directory.loading} />
      </div>

      <DataTable
        title={mode === "verification" ? "Pending document review" : "Document register"}
        columns={[
          { id: "driver_id", label: "Driver ID", sortable: true },
          {
            id: "driver_name",
            label: "Driver",
            sortable: true,
            render: (row) => (
              <span className="driver-docs__driver">
                {row.driver_photo ? (
                  <img src={row.driver_photo} alt="" className="driver-docs__avatar" />
                ) : (
                  <span className="driver-docs__avatar driver-docs__avatar--fallback" aria-hidden="true">
                    {String(row.driver_name || "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span>{row.driver_name || "—"}</span>
              </span>
            ),
          },
          { id: "phone_number", label: "Phone", sortable: true },
          { id: "city", label: "City", sortable: true },
          { id: "vehicle_type", label: "Vehicle", sortable: true },
          { id: "document_type_display", label: "Document", sortable: true },
          {
            id: "submitted_at",
            label: "Submitted",
            sortable: true,
            render: (row) => (row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "—"),
          },
          {
            id: "expires_at",
            label: "Expires",
            sortable: true,
            render: (row) => {
              if (!row.expires_at) return "—";
              const days = daysUntilExpiry(row.expires_at);
              return (
                <span>
                  {new Date(row.expires_at).toLocaleDateString()}
                  {days !== null ? <small className="driver-docs__days"> ({days}d)</small> : null}
                </span>
              );
            },
          },
          {
            id: "status",
            label: "Verification",
            sortable: true,
            render: (row) => (
              <StatusChip
                label={String(row.status || "").replace(/_/g, " ")}
                tone={documentStatusTone(row.status)}
              />
            ),
          },

          {
            id: "actions",
            label: "Actions",
            render: (row) => (
              <span className="driver-docs__actions">
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setDetail(row)}>
                  View
                </button>
                {row.actionable ? (
                  <AdminActionGuard
                    module="drivers"
                    action="drivers.verify_documents"
                    fallback={<small className="driver-docs__na">Document verification permission required</small>}
                  >
                    <button
                      type="button"
                      className="admin-lib-btn"
                      disabled={busyId === row.document_id}
                      onClick={() => handleApprove(row)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--danger"
                      disabled={busyId === row.document_id}
                      onClick={() => {
                        setRejectTarget(row);
                        setRejectReason("");
                        setActionError("");
                      }}
                    >
                      Reject
                    </button>
                  </AdminActionGuard>
                ) : (
                  <small className="driver-docs__na">
                    {row.status === "missing" ? "No uploaded file to review" : "Already decided"}
                  </small>
                )}
              </span>
            ),
          },
        ]}
        rows={filteredRows}
        rowKey="id"
        loading={loading}
        emptyLabel={
          mode === "verification"
            ? "No documents are waiting for review."
            : "No driver documents found."
        }
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search driver, phone, document…"
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={(key, direction) => {
          setSortKey(key);
          setSortDirection(direction);
        }}
        page={page}
        pageSize={pageSize}
        total={filteredRows.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        onRefresh={load}
        exportFilename={`yala-driver-${mode}`}
        filters={
          <FilterBar
            onReset={() =>
              setFilters({ city: "", category: "", documentType: "", status: "", expiry: "" })
            }
          >
            <Select label="City" value={filters.city} onChange={(value) => setFilters((f) => ({ ...f, city: value }))} options={cityOptions} />
            <Select label="Driver category" value={filters.category} onChange={(value) => setFilters((f) => ({ ...f, category: value }))} options={categoryOptions} />
            <Select label="Document type" value={filters.documentType} onChange={(value) => setFilters((f) => ({ ...f, documentType: value }))} options={documentTypeOptions} />
            <Select label="Verification status" value={filters.status} onChange={(value) => setFilters((f) => ({ ...f, status: value }))} options={STATUS_OPTIONS} />
            <Select label="Expiration" value={filters.expiry} onChange={(value) => setFilters((f) => ({ ...f, expiry: value }))} options={EXPIRY_OPTIONS} />
          </FilterBar>
        }
      />

      <DriverDocumentDetail row={detail} onClose={() => setDetail(null)} />

      <Modal
        open={Boolean(rejectTarget)}
        title="Reject document"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => setRejectTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--danger"
              disabled={!rejectReason.trim() || busyId === rejectTarget?.document_id}
              onClick={handleReject}
            >
              Reject document
            </button>
          </>
        }
      >
        <p>
          Rejecting <strong>{rejectTarget?.document_type_display}</strong> for{" "}
          <strong>{rejectTarget?.driver_name}</strong>.
        </p>
        <label className="driver-docs__field">
          <span>Reason (required — recorded in the audit trail)</span>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="e.g. Document is blurred and unreadable"
          />
        </label>
        {actionError ? (
          <p className="driver-docs__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </Modal>
    </div>
  );

  async function handleApprove(row) {
    setBusyId(row.document_id);
    setActionError("");
    try {
      await approveDriverDocument(row.document_id);
      push?.({ tone: "success", message: `${row.document_type_display} approved.` });
      await load();
    } catch (error) {
      const message = error?.message || "Could not approve this document.";
      setActionError(message);
      push?.({ tone: "error", message });
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget?.document_id || !rejectReason.trim()) return;
    setBusyId(rejectTarget.document_id);
    setActionError("");
    try {
      await rejectDriverDocument(rejectTarget.document_id, rejectReason.trim());
      push?.({ tone: "success", message: `${rejectTarget.document_type_display} rejected.` });
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (error) {
      setActionError(error?.message || "Could not reject this document.");
    } finally {
      setBusyId(null);
    }
  }
}

/** Read-only document detail: file, expiry, rejection reason and verification history. */
export function DriverDocumentDetail({ row, onClose }) {
  if (!row) return null;
  const band = expiryBand(row.expires_at);
  return (
    <Modal open title={`${row.document_type_display} — ${row.driver_name}`} onClose={onClose}>
      <dl className="driver-docs__detail">
        <div>
          <dt>Driver ID</dt>
          <dd>{row.driver_id}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{row.phone_number || "—"}</dd>
        </div>
        <div>
          <dt>City</dt>
          <dd>{row.city || "—"}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{row.vehicle_type || "—"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusChip label={String(row.status).replace(/_/g, " ")} tone={documentStatusTone(row.status)} />
          </dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd>
            {row.expires_at ? new Date(row.expires_at).toLocaleDateString() : "—"}
            {band !== "none" ? <small className="driver-docs__days"> ({band})</small> : null}
          </dd>
        </div>
      </dl>

      {row.rejection_reason ? (
        <p className="driver-docs__reject-reason">
          <strong>Rejection reason:</strong> {row.rejection_reason}
        </p>
      ) : null}

      {row.file_url ? (
        <p>
          <a href={row.file_url} target="_blank" rel="noopener noreferrer" className="admin-lib-btn admin-lib-btn--ghost">
            Open uploaded file
          </a>
        </p>
      ) : (
        <p className="driver-docs__na">No file is on record for this document.</p>
      )}

      {asArray(row.approval_history).length ? (
        <>
          <h4>Verification history</h4>
          <ul className="driver-docs__history">
            {asArray(row.approval_history).map((entry, index) => (
              <li key={`${entry.action}-${index}`}>
                <strong>{String(entry.action || "").replace(/_/g, " ")}</strong>
                {entry.admin_name ? <span> by {entry.admin_name}</span> : null}
                {entry.reason ? <em> — {entry.reason}</em> : null}
                {entry.timestamp ? (
                  <small> · {new Date(entry.timestamp).toLocaleString()}</small>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Modal>
  );
}
