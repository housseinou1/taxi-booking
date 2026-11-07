import React, { useCallback, useEffect, useState } from "react";
import { InlineError, TableSkeleton } from "../components/library";
import { fetchIdCardDashboard } from "./employeesApi";
import CeoIdCardSignaturePanel from "./CeoIdCardSignaturePanel";
import "./EmployeeIdCardDashboard.css";

const KPI_ORDER = [
  { key: "total_employees", label: "Total employees" },
  { key: "employees_with_active_card", label: "Active ID cards (employees)" },
  { key: "employees_without_active_card", label: "Without active card" },
  { key: "pending_hr_verification", label: "Pending HR verification" },
  { key: "pending_ceo_approval", label: "Pending CEO approval" },
  { key: "active_cards", label: "Active cards" },
  { key: "expired_cards", label: "Expired cards" },
  { key: "suspended_cards", label: "Suspended employees" },
  { key: "lost_cards", label: "Lost / revoked" },
  { key: "replacement_requests", label: "Replacement chain" },
];

export default function EmployeeIdCardDashboard({ canAdminister, notify, onOpenDirectory }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchIdCardDashboard();
      setStats(res.data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load ID card dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <TableSkeleton rows={4} />;
  }

  if (error) {
    return <InlineError message={error} onRetry={load} />;
  }

  return (
    <div className="emp-id-dash emp-id-dash--cards">
      <div className="emp-id-dash__kpis" role="list">
        {KPI_ORDER.map((item) => (
          <div key={item.key} className="emp-id-dash__kpi" role="listitem">
            <span className="emp-id-dash__kpi-value">{stats?.[item.key] ?? "—"}</span>
            <span className="emp-id-dash__kpi-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="emp-id-dash__actions">
        <button type="button" className="emp-id-dash__btn" onClick={onOpenDirectory}>
          Open employee directory
        </button>
        <button type="button" className="emp-id-dash__btn emp-id-dash__btn--ghost" onClick={load}>
          Refresh statistics
        </button>
      </div>

      {Array.isArray(stats?.by_department) && stats.by_department.length > 0 ? (
        <div className="emp-id-dash__dept">
          <h2 className="emp-id-dash__section-title">By department</h2>
          <table className="emp-id-dash__table">
            <thead>
              <tr>
                <th scope="col">Department</th>
                <th scope="col">Employees</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_department.map((row) => (
                <tr key={row.department || "—"}>
                  <td>{row.department || "Unassigned"}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {canAdminister ? <CeoIdCardSignaturePanel notify={notify} /> : null}
    </div>
  );
}
