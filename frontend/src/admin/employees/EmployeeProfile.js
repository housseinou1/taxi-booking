import React, { useCallback, useEffect, useState } from "react";

import {
  StatusChip,
  Select,
  AlertBanner,
  InlineError,
  RetryBlock,
  CardSkeleton,
  formatTimestamp,
} from "../components/library";
import {
  fetchEmployee,
  fetchEmployeeAuditTrail,
  updateEmployee,
  changeEmploymentStatus,
  EMPLOYMENT_STATUS_TONES,
  EMPLOYMENT_STATUS_OPTIONS,
} from "./employeesApi";
import EmployeePhotoPanel from "./EmployeePhotoPanel";
import EmployeeSignaturePanel from "./EmployeeSignaturePanel";
import EmployeeCardPanel from "./EmployeeCardPanel";

function dateOnly(iso) {
  if (!iso) return "—";
  const formatted = formatTimestamp(iso);
  return formatted.split(",")[0] || formatted;
}

export default function EmployeeProfile({
  employeeNumber,
  canManage,
  canAdminister,
  canViewDob = false,
  notify,
  onBack,
}) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const [statusValue, setStatusValue] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);

  // Administrator-tier audit trail (loaded only for administrators).
  const [audit, setAudit] = useState({ loading: false, error: "", data: null });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchEmployee(employeeNumber);
      const data = response.data || {};
      setEmployee(data);
      setStatusValue(data.employment_status || "");
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("You are not authorized to view this employee.");
      } else {
        setError(err?.response?.data?.detail || err?.message || "Failed to load employee");
      }
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  }, [employeeNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const loadAudit = useCallback(async () => {
    setAudit({ loading: true, error: "", data: null });
    try {
      const response = await fetchEmployeeAuditTrail(employeeNumber);
      setAudit({ loading: false, error: "", data: response.data || null });
    } catch (err) {
      setAudit({
        loading: false,
        error: err?.response?.data?.detail || "Failed to load account activity.",
        data: null,
      });
    }
  }, [employeeNumber]);

  useEffect(() => {
    // Administrator tier only — the backend enforces this too (403 for others),
    // so non-administrators never trigger the request at all.
    if (!canAdminister || !employeeNumber) return;
    loadAudit();
  }, [canAdminister, employeeNumber, loadAudit]);

  const beginEdit = () => {
    setFieldErrors({});
    setForm({
      full_name: employee.full_name || "",
      // DOB is collected write-only. It is pre-filled ONLY for viewers who hold
      // the backend field-level permission (employees.view_dob, Administrator
      // tier) — everyone else edits it blind, because the API omits the field
      // from their responses.
      date_of_birth: canViewDob ? employee.date_of_birth || "" : "",
      department: employee.department || "",
      job_title: employee.job_title || "",
      employment_start_date: employee.employment_start_date || "",
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm(null);
    setFieldErrors({});
  };

  const setFormField = (name) => (event) => {
    setForm((prev) => ({ ...prev, [name]: event.target.value }));
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!form.full_name.trim()) {
      setFieldErrors({ full_name: "Full name is required." });
      return;
    }
    setSaving(true);
    try {
      // employee_number and employment_status are read-only — never PATCHed.
      const response = await updateEmployee(employeeNumber, {
        full_name: form.full_name.trim(),
        date_of_birth: form.date_of_birth || null,
        department: form.department.trim(),
        job_title: form.job_title.trim(),
        employment_start_date: form.employment_start_date || null,
      });
      setEmployee(response.data || employee);
      setEditing(false);
      setForm(null);
      notify?.({ tone: "success", message: "Employee record updated." });
    } catch (err) {
      const status = err?.response?.status;
      const payload = err?.response?.data;
      if (status === 403) {
        notify?.("danger", "You are not authorized to edit this employee.");
      } else if (status === 400 && payload && typeof payload === "object") {
        const nextErrors = {};
        Object.entries(payload).forEach(([key, value]) => {
          if (key === "detail") return;
          nextErrors[key] = Array.isArray(value) ? value.join(" ") : String(value);
        });
        setFieldErrors(nextErrors);
        if (payload.detail) notify?.("danger", String(payload.detail));
      } else {
        notify?.("danger", payload?.detail || err?.message || "Update failed.");
      }
    } finally {
      setSaving(false);
    }
  };

  const saveStatus = async () => {
    if (!statusValue) return;
    setStatusSaving(true);
    try {
      const response = await changeEmploymentStatus(employeeNumber, {
        employment_status: statusValue,
        note: statusNote || undefined,
      });
      setEmployee((prev) => ({ ...prev, ...(response.data || {}), employment_status: statusValue }));
      setStatusNote("");
      notify?.({ tone: "success", message: "Employment status updated." });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 403) {
        notify?.("danger", "You are not authorized to change employment status.");
      } else {
        notify?.("danger", err?.response?.data?.detail || "Status change failed.");
      }
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="beta__back" onClick={onBack}>
        ← Back to directory
      </button>

      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <RetryBlock message={error} onRetry={load} />
      ) : !employee ? (
        <AlertBanner tone="warning">Employee not found.</AlertBanner>
      ) : (
        <div className="emp-profile">
          <div className="emp-profile__head">
            <EmployeePhotoPanel employeeNumber={employeeNumber} notify={notify} />
            <EmployeeSignaturePanel
              employeeNumber={employeeNumber}
              canManage={canManage}
              canAdminister={canAdminister}
              notify={notify}
            />
            <div className="emp-profile__identity">
              <StatusChip
                label={employee.employment_status || "—"}
                tone={EMPLOYMENT_STATUS_TONES[employee.employment_status] || "neutral"}
              />
              <h2 className="beta__title">{employee.full_name}</h2>
              <div className="emp-profile__number" title="Permanent employee number">
                {employee.employee_number}
              </div>
            </div>
          </div>

          {!editing ? (
            <section>
              <div className="emp-detail-grid">
                <div>
                  <div className="emp-detail__label">Department</div>
                  <div className="emp-detail__value">{employee.department || "—"}</div>
                </div>
                <div>
                  <div className="emp-detail__label">Job title</div>
                  <div className="emp-detail__value">{employee.job_title || "—"}</div>
                </div>
                <div>
                  <div className="emp-detail__label">Employment start date</div>
                  <div className="emp-detail__value">{dateOnly(employee.employment_start_date)}</div>
                </div>
                {/* DOB is sensitive HR data with a backend field-level permission
                    (employees.view_dob, Administrator tier). The API omits the
                    field entirely for everyone else, so it is rendered only when
                    the capability is granted — never as a fabricated value. */}
                <div>
                  <div className="emp-detail__label">Date of birth</div>
                  {canViewDob ? (
                    <div className="emp-detail__value">
                      {employee.date_of_birth
                        ? dateOnly(employee.date_of_birth)
                        : "Not recorded"}
                    </div>
                  ) : (
                    <div className="emp-detail__value emp-detail__value--restricted">
                      Restricted — Administrator tier only
                    </div>
                  )}
                </div>
              </div>
              <div className="emp-form__actions" style={{ marginTop: 16 }}>
                <button type="button" className="admin-lib-btn" onClick={beginEdit}>
                  Edit record
                </button>
              </div>
            </section>
          ) : (
            <form className="emp-form" onSubmit={saveEdit} noValidate>
              <div className="emp-field-grid">
                <div className={`emp-field ${fieldErrors.full_name ? "emp-field--error" : ""}`.trim()}>
                  <label htmlFor="emp-edit-full-name">Full name *</label>
                  <input
                    id="emp-edit-full-name"
                    type="text"
                    value={form.full_name}
                    onChange={setFormField("full_name")}
                    aria-required="true"
                  />
                  {fieldErrors.full_name ? <InlineError message={fieldErrors.full_name} /> : null}
                </div>
                <div className="emp-field">
                  {/* DOB is write-only on the wire. Pre-filled only when the
                      viewer holds employees.view_dob; otherwise the stored value
                      is unknown to the client and the field starts empty. */}
                  <label htmlFor="emp-edit-dob">Date of birth</label>
                  <input
                    id="emp-edit-dob"
                    type="date"
                    value={form.date_of_birth}
                    onChange={setFormField("date_of_birth")}
                  />
                </div>
                <div className="emp-field">
                  <label htmlFor="emp-edit-department">Department</label>
                  <input
                    id="emp-edit-department"
                    type="text"
                    value={form.department}
                    onChange={setFormField("department")}
                  />
                </div>
                <div className="emp-field">
                  <label htmlFor="emp-edit-job-title">Job title</label>
                  <input
                    id="emp-edit-job-title"
                    type="text"
                    value={form.job_title}
                    onChange={setFormField("job_title")}
                  />
                </div>
                <div className="emp-field">
                  <label htmlFor="emp-edit-start-date">Employment start date</label>
                  <input
                    id="emp-edit-start-date"
                    type="date"
                    value={form.employment_start_date}
                    onChange={setFormField("employment_start_date")}
                  />
                </div>
              </div>
              <div className="emp-form__actions">
                <button type="submit" className="admin-lib-btn admin-lib-btn--primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={cancelEdit}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Employment status change — HR Manager tier. */}
          {canManage ? (
            <section>
              <h3 className="beta__section-title">Change employment status</h3>
              <div className="emp-field-grid">
                <Select
                  label="Employment status"
                  value={statusValue}
                  onChange={setStatusValue}
                  options={EMPLOYMENT_STATUS_OPTIONS}
                />
                <div className="emp-field">
                  <label htmlFor="emp-status-note">Note (optional)</label>
                  <input
                    id="emp-status-note"
                    type="text"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                  />
                </div>
              </div>
              <div className="emp-form__actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="admin-lib-btn"
                  onClick={saveStatus}
                  disabled={statusSaving}
                >
                  {statusSaving ? "Updating…" : "Update status"}
                </button>
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="beta__section-title">ID card management</h3>
            <EmployeeCardPanel
              employeeNumber={employeeNumber}
              canManage={canManage}
              canAdminister={canAdminister}
              canViewDob={canViewDob}
              notify={notify}
            />
          </section>

          {canAdminister ? (
            <section>
              <h3 className="beta__section-title">Account activity</h3>
              <p className="emp-detail__label">
                Read-only audit trail for this employee and their ID cards
                (Administrator tier).
              </p>
              {audit.loading ? (
                <CardSkeleton />
              ) : audit.error ? (
                <RetryBlock message={audit.error} onRetry={loadAudit} />
              ) : (audit.data?.results || []).length === 0 ? (
                <AlertBanner tone="info">No activity recorded for this employee yet.</AlertBanner>
              ) : (
                <ul className="emp-audit">
                  {audit.data.results.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.summary}</strong>
                      <span className="emp-audit__meta">
                        {entry.event || entry.action} · {formatTimestamp(entry.created_at)}
                        {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
