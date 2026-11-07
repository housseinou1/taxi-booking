import React, { useCallback, useEffect, useMemo, useState } from "react";

import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import { usePermissions } from "../permissions/PermissionContext";

const API = `${API_URL}/operations/operating-city-transfers`;

export default function CityTransferApprovalsCenter() {
  const { canView } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [notesById, setNotesById] = useState({});
  const [busyId, setBusyId] = useState(null);

  const allowed = canView("ceo");

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await authenticatedApi.get(`${API}/`, { params });
      setRows(res.data?.results || []);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Failed to load transfers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const statusOptions = useMemo(
    () => [
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" },
      { value: "", label: "All statuses" },
    ],
    []
  );

  const decide = async (id, action) => {
    setBusyId(id);
    setError(null);
    try {
      await authenticatedApi.post(`${API}/${id}/decide/`, {
        action,
        notes: notesById[id] || "",
      });
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  if (!allowed) {
    return (
      <div className="beta__section">
        <h1 className="beta__title">City transfer approvals</h1>
        <p className="beta__muted">Executive (CEO) access is required.</p>
      </div>
    );
  }

  return (
    <div className="beta__section">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 className="beta__title">City transfer approvals</h1>
        <p className="beta__muted">
          Pending driver and courier requests to change authorized operating city. Approve or reject with notes;
          approval updates registry city and courier delivery zones.
        </p>
      </header>

      <div className="beta__toolbar" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <label className="beta__field">
          <span className="beta__label">Status</span>
          <select
            className="beta__input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {statusOptions.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="beta__btn" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <div className="beta__alert beta__alert--error">{error}</div> : null}
      {loading ? <p className="beta__muted">Loading…</p> : null}

      {!loading && rows.length === 0 ? <p className="beta__muted">No transfer requests for this filter.</p> : null}

      {rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="beta__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Kind</th>
                <th>User</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.kind}</td>
                  <td>
                    <div>{r.user_name}</div>
                    <div className="beta__muted" style={{ fontSize: "0.85em" }}>
                      {r.user_email}
                    </div>
                  </td>
                  <td>{r.from_city_name || "—"}</td>
                  <td>{r.to_city_name || "—"}</td>
                  <td style={{ maxWidth: 220 }}>{r.reason || "—"}</td>
                  <td>{r.status}</td>
                  <td style={{ minWidth: 220 }}>
                    {r.status === "pending" ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          type="text"
                          className="beta__input"
                          placeholder="Decision notes (optional)"
                          value={notesById[r.id] || ""}
                          onChange={(e) => setNotesById((m) => ({ ...m, [r.id]: e.target.value }))}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="beta__btn beta__btn--primary"
                            disabled={busyId === r.id}
                            onClick={() => decide(r.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="beta__btn"
                            disabled={busyId === r.id}
                            onClick={() => decide(r.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="beta__muted">{r.ceo_notes || "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
