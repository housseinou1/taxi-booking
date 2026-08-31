import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ConfirmationDialog,
  DashboardSkeleton,
  DataTable,
  ExportMenu,
  InlineError,
  KPICard,
  PercentageIndicator,
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
  BADGE_LABELS,
  REPORT_TYPES,
  approveFleetDocument,
  bulkNotifyFleetDrivers,
  exportFleetReport,
  fetchDisciplinaryActions,
  fetchFleetDashboard,
  notifyFleetDriver,
  postDisciplinaryAction,
  reactivateFleetDriver,
  rejectFleetDocument,
  suspendFleetDriver,
} from "../fleet/fleetApi";
import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import "../finance/FinanceDashboard.css";

function downloadBlob(response, filename) {
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function DriverOpsDashboard() {
  const { cityId, canEdit } = usePermissions();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [disciplinary, setDisciplinary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadMs, setLoadMs] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [docBucket, setDocBucket] = useState("pending_review");
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState("");
  const [bulkForm, setBulkForm] = useState({
    audience: "all",
    title: "YALA Driver Operations",
    message: "",
    vehicle_type: "",
  });

  const canManage = canEdit("drivers") || canEdit("driver") || canEdit("fleet");

  const load = useCallback(async () => {
    const started = performance.now();
    setLoading(true);
    try {
      setError("");
      const params = cityId ? { city_id: cityId } : {};
      const [dash, actions] = await Promise.all([
        fetchFleetDashboard(params),
        fetchDisciplinaryActions().catch(() => ({ actions: [] })),
      ]);
      setData(dash.data || dash);
      setDisciplinary(actions.data?.actions || actions.actions || []);
      setLoadMs(Math.round(performance.now() - started));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load driver operations");
    } finally {
      setLoading(false);
    }
  }, [cityId]);

  useEffect(() => {
    load();
  }, [load]);

  const approvals = data?.approvals || {};
  const documents = data?.documents || {};
  const drivers = data?.drivers || [];
  const overview = data?.overview || {};

  const docRows = useMemo(() => {
    const buckets = documents.buckets || {};
    if (docBucket === "expiring") {
      return [
        ...(buckets.expiring_7d || []),
        ...(buckets.expiring_15d || []),
        ...(buckets.expiring_30d || []),
      ];
    }
    return buckets[docBucket] || [];
  }, [documents, docBucket]);

  const runConfirm = async () => {
    if (!confirm) return;
    if ((confirm.needsReason !== false) && reason.trim().length < 10 && confirm.type !== "approve_driver" && confirm.type !== "approve_doc") {
      push({ tone: "warning", title: "Reason required", message: "Enter at least 10 characters." });
      return;
    }
    try {
      if (confirm.type === "approve_driver") {
        await authenticatedApi.post(`${API_URL}/drivers/approve/${confirm.id}/`);
      } else if (confirm.type === "approve_doc") {
        await approveFleetDocument(confirm.id);
      } else if (confirm.type === "reject_doc") {
        await rejectFleetDocument(confirm.id, reason);
      } else if (confirm.type === "warn") {
        await suspendFleetDriver(confirm.userId, { reason, action_type: "warning" });
      } else if (confirm.type === "suspend_temp") {
        await suspendFleetDriver(confirm.userId, {
          reason,
          action_type: "temporary_suspension",
          duration_days: confirm.days || 7,
        });
      } else if (confirm.type === "suspend_perm") {
        await suspendFleetDriver(confirm.userId, { reason, action_type: "permanent_suspension" });
      } else if (confirm.type === "reactivate") {
        await reactivateFleetDriver(confirm.userId, { reason });
      } else if (confirm.type === "appeal") {
        await postDisciplinaryAction({
          driver_id: confirm.userId,
          action_type: "appeal_note",
          reason,
          status: "appealed",
        });
      } else if (confirm.type === "notify_one") {
        await notifyFleetDriver(confirm.userId, { title: "Driver Operations", message: reason });
      }
      push({ tone: "success", title: "Done", message: confirm.label });
      setConfirm(null);
      setReason("");
      await load();
    } catch (err) {
      push({
        tone: "danger",
        title: "Action failed",
        message: err?.response?.data?.detail || err?.response?.data?.error || err?.message,
      });
    }
  };

  const sendBulk = async () => {
    try {
      const response = await bulkNotifyFleetDrivers({
        ...bulkForm,
        city_id: cityId || undefined,
      });
      push({
        tone: "success",
        title: "Bulk message sent",
        message: `Delivered to ${response.data?.sent ?? response.sent ?? 0} drivers`,
      });
      setBulkForm((prev) => ({ ...prev, message: "" }));
    } catch (err) {
      push({ tone: "danger", title: "Bulk send failed", message: err?.response?.data?.detail || err?.message });
    }
  };

  const exportReport = async (type, format = "csv") => {
    try {
      const response = await exportFleetReport(type, format);
      downloadBlob(response, `${type}.${format}`);
    } catch (err) {
      push({ tone: "danger", title: "Export failed", message: err?.message });
    }
  };

  if (loading && !data) {
    return (
      <div className="drv-dash">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="drv-dash">
      <header className="drv-dash__header">
        <div>
          <h1 className="drv-dash__title">Driver Operations</h1>
          <p className="drv-dash__subtitle">
            Approvals, documents, performance, and compliance
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="drv-dash__header-actions">
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
            Refresh
          </button>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/fleet">
            Fleet Center
          </a>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/legacy">
            Legacy verification
          </a>
        </div>
      </header>

      {error ? (
        <div>
          <InlineError message={error} />
          <RetryBlock onRetry={load} />
        </div>
      ) : null}

      <section className="drv-dash__kpi-grid">
        <KPICard label="Pending approvals" value={approvals.counts?.pending} tone="warning" />
        <KPICard label="Approved drivers" value={approvals.counts?.approved} tone="success" />
        <KPICard label="Suspended" value={approvals.counts?.suspended} tone="danger" />
        <KPICard label="Docs pending review" value={documents.summary?.pending_review} tone="warning" />
        <KPICard label="Expired docs" value={documents.summary?.expired} tone="danger" />
        <KPICard label="Online drivers" value={overview.online_drivers || overview.drivers_online} />
      </section>

      <section className="drv-dash__panel">
        <div className="drv-dash__panel-head">
          <h2>Driver Approvals</h2>
          <StatusChip label={`${approvals.counts?.pending || 0} pending`} tone="warning" />
        </div>
        <DataTable
          searchable
          exportFilename="driver-approvals"
          exportScope="reports"
          columns={[
            { id: "id", label: "Profile ID" },
            { id: "name", label: "Name" },
            { id: "email", label: "Email" },
            { id: "status", label: "Status", render: (r) => <StatusChip label={r.status} /> },
            { id: "vehicle_plate", label: "Plate" },
            { id: "created_at", label: "Applied", render: (r) => formatTimestamp(r.created_at) },
          ]}
          rows={approvals.pending || []}
          emptyLabel="No pending applicants"
          rowActions={(row) => (
            <ProtectedActionButton
              action="drivers.verify_documents"
              className="admin-lib-btn admin-lib-btn--ghost"
              disabled={!canManage}
              onClick={() =>
                setConfirm({
                  type: "approve_driver",
                  id: row.id,
                  label: `Approve driver profile #${row.id}`,
                  needsReason: false,
                })
              }
            >
              Approve
            </ProtectedActionButton>
          )}
        />
        <div className="drv-dash__grid" style={{ marginTop: 12 }}>
          <DataTable title="Suspended" searchable={false} columns={[{ id: "name", label: "Name" }, { id: "email", label: "Email" }]} rows={approvals.suspended || []} emptyLabel="None" />
          <DataTable title="Rejected" searchable={false} columns={[{ id: "name", label: "Name" }, { id: "email", label: "Email" }]} rows={approvals.rejected || []} emptyLabel="None" />
        </div>
      </section>

      <section className="drv-dash__panel">
        <div className="drv-dash__panel-head">
          <h2>Document Management</h2>
          <Select
            label="Queue"
            value={docBucket}
            onChange={setDocBucket}
            options={[
              { value: "pending_review", label: "Pending review" },
              { value: "rejected", label: "Rejected" },
              { value: "expired", label: "Expired" },
              { value: "expiring", label: "Expiring soon" },
              { value: "valid", label: "Valid" },
            ]}
          />
        </div>
        <DataTable
          searchable
          exportFilename="driver-documents"
          exportScope="reports"
          columns={[
            { id: "document_label", label: "Document" },
            { id: "driver_email", label: "Driver" },
            { id: "status", label: "Status", render: (r) => <StatusChip label={r.status} /> },
            { id: "expires_at", label: "Expires", render: (r) => r.expires_at || "—" },
            { id: "days_remaining", label: "Days left" },
            { id: "rejection_reason", label: "History / reason", render: (r) => r.rejection_reason || r.reviewed_at || "—" },
          ]}
          rows={docRows}
          emptyLabel="No documents in this queue"
          rowActions={(row) => (
            <div className="drv-dash__row-actions">
              {row.status === "pending_review" || docBucket === "pending_review" ? (
                <>
                  <ProtectedActionButton
                    action="drivers.verify_documents"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => setConfirm({ type: "approve_doc", id: row.id, label: `Approve document #${row.id}`, needsReason: false })}
                  >
                    Approve
                  </ProtectedActionButton>
                  <ProtectedActionButton
                    action="drivers.verify_documents"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => setConfirm({ type: "reject_doc", id: row.id, label: `Reject document #${row.id}` })}
                  >
                    Reject
                  </ProtectedActionButton>
                </>
              ) : null}
              <ProtectedActionButton
                action="drivers.edit"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  setConfirm({
                    type: "notify_one",
                    userId: row.driver_id,
                    label: `Remind driver #${row.driver_id}`,
                  })
                }
              >
                Remind
              </ProtectedActionButton>
            </div>
          )}
        />
        <p className="drv-dash__hint">Automated expiry reminders run via Celery (`notify_expiring_driver_documents`). Bulk reminders use Communication below.</p>
      </section>

      <section className="drv-dash__panel">
        <h2>Driver Performance</h2>
        <div className="drv-dash__kpi-grid" style={{ marginBottom: 12 }}>
          <PercentageIndicator label="Fleet acceptance (sample)" value={Number(drivers[0]?.acceptance_rate || 0)} target={85} />
          <PercentageIndicator label="Fleet cancellation (sample)" value={Number(drivers[0]?.cancellation_rate || 0)} target={10} tone="danger" />
        </div>
        <DataTable
          searchable
          exportFilename="driver-performance"
          exportScope="reports"
          columns={[
            { id: "driver_name", label: "Driver", render: (r) => r.driver_name || r.email || r.name || "—" },
            { id: "acceptance_rate", label: "Acceptance %" },
            { id: "cancellation_rate", label: "Cancel %" },
            { id: "completion_rate", label: "Completion %", render: (r) => r.completion_rate ?? "—" },
            { id: "rating", label: "Rating", render: (r) => r.rating ?? r.average_rating ?? "—" },
            { id: "trips_today", label: "Trips/day", render: (r) => r.trips_today ?? r.completed_rides_today ?? "—" },
            { id: "trips_week", label: "Trips/week", render: (r) => r.trips_week ?? "—" },
            { id: "trips_month", label: "Trips/month", render: (r) => r.total_trips ?? r.completed_rides ?? "—" },
            { id: "revenue_month", label: "Revenue", render: (r) => formatCurrency(r.revenue_month) },
            { id: "online_hours", label: "Online hrs", render: (r) => r.online_hours ?? r.last_online ?? "—" },
            {
              id: "badges",
              label: "Flags",
              render: (r) => (r.badges || []).map((b) => BADGE_LABELS[b] || b).join(", ") || "—",
            },
          ]}
          rows={drivers.slice(0, 100)}
          emptyLabel="No performance rows"
          rowActions={(row) => (
            <div className="drv-dash__row-actions">
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() => setConfirm({ type: "warn", userId: row.user_id || row.driver_id, label: `Warn ${row.driver_name}` })}
              >
                Warn
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  setConfirm({
                    type: "suspend_temp",
                    userId: row.user_id || row.driver_id,
                    days: 7,
                    label: `Temp suspend ${row.driver_name}`,
                  })
                }
              >
                Temp suspend
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  setConfirm({
                    type: "suspend_perm",
                    userId: row.user_id || row.driver_id,
                    label: `Permanent suspend ${row.driver_name}`,
                  })
                }
              >
                Permanent
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  setConfirm({
                    type: "reactivate",
                    userId: row.user_id || row.driver_id,
                    label: `Reactivate ${row.driver_name}`,
                  })
                }
              >
                Reactivate
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  setConfirm({
                    type: "appeal",
                    userId: row.user_id || row.driver_id,
                    label: `Appeal note for ${row.driver_name}`,
                  })
                }
              >
                Appeal note
              </button>
            </div>
          )}
        />
      </section>

      <div className="drv-dash__grid">
        <section className="drv-dash__panel">
          <h2>Disciplinary Log</h2>
          <DataTable
            searchable
            exportFilename="disciplinary"
            exportScope="reports"
            columns={[
              { id: "driver_email", label: "Driver" },
              { id: "action_type", label: "Action" },
              { id: "status", label: "Status" },
              { id: "reason", label: "Reason" },
              { id: "actor", label: "Actor" },
              { id: "created_at", label: "When", render: (r) => formatTimestamp(r.created_at) },
            ]}
            rows={disciplinary}
            emptyLabel="No disciplinary actions yet"
          />
        </section>

        <section className="drv-dash__panel">
          <h2>Communication</h2>
          <div className="drv-dash__form">
            <Select
              label="Audience"
              value={bulkForm.audience}
              onChange={(value) => setBulkForm((prev) => ({ ...prev, audience: value }))}
              options={[
                { value: "all", label: "All drivers" },
                { value: "pending_documents", label: "Pending documents" },
                { value: "low_rated", label: "Low-rated drivers" },
                { value: "top_performers", label: "Top performers" },
              ]}
            />
            <label className="admin-field">
              <span className="admin-field__label">Vehicle type (optional)</span>
              <input
                value={bulkForm.vehicle_type}
                onChange={(e) => setBulkForm((prev) => ({ ...prev, vehicle_type: e.target.value }))}
                placeholder="e.g. Comfort"
              />
            </label>
            <label className="admin-field">
              <span className="admin-field__label">Title</span>
              <input value={bulkForm.title} onChange={(e) => setBulkForm((prev) => ({ ...prev, title: e.target.value }))} />
            </label>
            <label className="admin-field" style={{ gridColumn: "1 / -1" }}>
              <span className="admin-field__label">Message</span>
              <textarea
                rows={3}
                value={bulkForm.message}
                onChange={(e) => setBulkForm((prev) => ({ ...prev, message: e.target.value }))}
              />
            </label>
          </div>
          <ProtectedActionButton action="drivers.edit" className="admin-lib-btn" onClick={sendBulk} disabled={!canManage}>
            Send bulk message
          </ProtectedActionButton>
        </section>
      </div>

      <section className="drv-dash__panel">
        <h2>Exports</h2>
        <div className="drv-dash__reports">
          {REPORT_TYPES.map((report) => (
            <div key={report.id} className="drv-dash__report-card">
              <strong>{report.label}</strong>
              <div className="drv-dash__row-actions">
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport(report.id, "csv")}>
                  CSV
                </button>
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport(report.id, "pdf")}>
                  PDF
                </button>
              </div>
            </div>
          ))}
          <div className="drv-dash__report-card">
            <strong>Driver roster / compliance snapshot</strong>
            <ExportMenu
              filename="driver-roster"
              rows={drivers}
              columns={[
                { id: "driver_name", label: "Name" },
                { id: "rating", label: "Rating" },
                { id: "acceptance_rate", label: "Acceptance" },
                { id: "cancellation_rate", label: "Cancellation" },
              ]}
              exportScope="reports"
            />
          </div>
        </div>
      </section>

      <ConfirmationDialog
        open={Boolean(confirm)}
        title={confirm?.label || "Confirm"}
        message="This Driver Operations action is permission-checked and audited."
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
      {confirm ? (
        <div className="drv-dash__confirm-fields">
          <label className="admin-field">
            <span className="admin-field__label">Reason / message</span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
