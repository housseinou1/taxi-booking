import React, { useCallback, useEffect, useState } from "react";

import {
  exportComplianceReport,
  fetchComplianceAuditCenter,
  fetchComplianceCalendar,
  fetchComplianceDashboard,
  fetchComplianceGovernanceSuite,
  fetchCompliancePolicies,
  fetchComplianceRiskRegister,
  fetchCeoGovernanceDashboard,
  postComplianceAuditAction,
  postComplianceCalendarAction,
  postCompliancePolicyAction,
  postComplianceRiskAction,
} from "./complianceGovernanceApi";
import "../beta/BetaDashboard.css";
import "./ComplianceGovernanceCenter.css";

const TABS = [
  { id: "dashboard", label: "Compliance Dashboard" },
  { id: "audits", label: "Audit Center" },
  { id: "policies", label: "Policy Management" },
  { id: "risks", label: "Risk Register" },
  { id: "calendar", label: "Compliance Calendar" },
  { id: "ceo", label: "CEO Governance" },
  { id: "reports", label: "Reports" },
];

const REPORTS = [
  { id: "monthly_compliance", label: "Monthly Compliance Report" },
  { id: "quarterly_governance", label: "Quarterly Governance Report" },
  { id: "annual_audit_summary", label: "Annual Audit Summary" },
  { id: "risk_register", label: "Risk Register Export" },
  { id: "board_compliance", label: "Board Compliance Report" },
];

const FORMATS = ["csv", "excel", "pdf"];

const STATUS_OPTIONS = {
  audits: ["planned", "in_progress", "pending_findings", "closed", "overdue"],
  risks: ["open", "mitigated", "accepted", "closed"],
  calendar: ["upcoming", "due_soon", "overdue", "completed"],
  policies: ["draft", "approved", "review_pending", "expired"],
};

function MetricCard({ label, value, sub, critical = false }) {
  return (
    <div className={`beta__card ${critical ? "compliance-critical" : ""}`}>
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="compliance-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function ComplianceGovernanceCenter() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const suite = await fetchComplianceGovernanceSuite();
      setData(suite);

      if (tab === "dashboard") setDetail(await fetchComplianceDashboard());
      if (tab === "audits") setDetail(await fetchComplianceAuditCenter());
      if (tab === "policies") setDetail(await fetchCompliancePolicies());
      if (tab === "risks") setDetail(await fetchComplianceRiskRegister());
      if (tab === "calendar") setDetail(await fetchComplianceCalendar());
      if (tab === "ceo") setDetail(await fetchCeoGovernanceDashboard());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (apiCall, id, status, note = "") => {
    try {
      const payload = note ? { status, note } : { status };
      await apiCall(id, payload);
      setMessage("Action saved.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleExport = async (reportType, fmt) => {
    try {
      setError("");
      const response = await exportComplianceReport(reportType, fmt);
      const ext = fmt === "excel" ? "xlsx" : fmt;
      downloadBlob(response, `yala-compliance-${reportType}.${ext}`);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Export failed");
    }
  };

  const renderDashboard = () => {
    const d = detail || {};
    return (
      <>
        <div className="compliance-grid">
          <MetricCard label="Overall Compliance Score" value={`${d.overall_compliance_score}%`} critical={d.overall_compliance_score < 70} />
          <MetricCard label="Open Compliance Issues" value={d.open_compliance_issues} critical={d.open_compliance_issues > 0} />
          <MetricCard label="Expiring Licenses" value={d.expiring_licenses} critical />
          <MetricCard label="Expiring Insurance" value={d.expiring_insurance} critical />
          <MetricCard label="Expiring Driver Documents" value={d.expiring_driver_documents} critical />
          <MetricCard label="Policies Needing Review" value={d.policies_needing_review} critical />
          <MetricCard label="Upcoming Deadlines" value={d.upcoming_compliance_deadlines} />
          <MetricCard label="Outstanding Policy Acknowledgements" value={d.outstanding_policy_acknowledgements} critical />
          <MetricCard label="Vehicle Maintenance Due" value={d.vehicle_maintenance_due} critical={d.vehicle_maintenance_due > 0} />
        </div>
        {d.merchant_compliance && (
          <Section title="Merchant Compliance">
            <div className="compliance-grid">
              <MetricCard label="Pending Approval" value={d.merchant_compliance.pending_approval} />
              <MetricCard label="Rejected" value={d.merchant_compliance.rejected} />
              <MetricCard label="Incomplete Terms" value={d.merchant_compliance.incomplete_terms} />
            </div>
          </Section>
        )}
        {d.partner_compliance && (
          <Section title="Partner Compliance">
            <div className="compliance-grid">
              <MetricCard label="Pending Contract" value={d.partner_compliance.pending_contract} />
              <MetricCard label="Suspended" value={d.partner_compliance.suspended} critical={d.partner_compliance.suspended > 0} />
            </div>
          </Section>
        )}
      </>
    );
  };

  const renderAudits = () => {
    const d = detail || {};
    const summary = d.summary || {};
    return (
      <>
        <div className="compliance-grid">
          <MetricCard label="Total Audits" value={summary.total} />
          {Object.entries(summary.by_status || {}).map(([key, val]) => (
            <MetricCard key={key} label={key.replace(/_/g, " ")} value={val} />
          ))}
        </div>
        <Section title="Audits">
          <table className="compliance-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Title</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Due Date</th>
                <th>Findings</th>
                <th>Actions</th>
                <th>Update</th>
              </tr>
            </thead>
            <tbody>
              {(d.audits || []).map((a) => (
                <tr key={a.id}>
                  <td>{a.reference}</td>
                  <td>{a.audit_type}</td>
                  <td>{a.title}</td>
                  <td>{a.status}</td>
                  <td>{a.owner}</td>
                  <td>{a.due_date}</td>
                  <td>{a.findings_count ?? (a.findings || []).length}</td>
                  <td>{a.corrective_actions_count ?? (a.corrective_actions || []).length}</td>
                  <td>
                    <select
                      defaultValue={a.status}
                      onChange={(e) => handleAction(postComplianceAuditAction, a.id, e.target.value, "Status updated")}
                    >
                      {STATUS_OPTIONS.audits.map((s) => (
                        <option key={s} value={s}>{s.replace("_", " ")}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </>
    );
  };

  const renderPolicies = () => {
    const d = detail || {};
    return (
      <Section title="Policies">
        <table className="compliance-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Title</th>
              <th>Version</th>
              <th>Status</th>
              <th>Review Date</th>
              <th>Acknowledgement Count</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(d.policies || []).map((p) => (
              <tr key={p.id}>
                <td>{p.category}</td>
                <td>{p.title}</td>
                <td>{p.version}</td>
                <td>{p.status}</td>
                <td>{p.review_date}</td>
                <td>{p.acknowledgement_count}</td>
                <td>
                  <select
                    defaultValue={p.status}
                    onChange={(e) => handleAction(postCompliancePolicyAction, p.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.policies.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    );
  };

  const renderRisks = () => {
    const d = detail || {};
    const summary = d.summary || {};
    return (
      <>
        <div className="compliance-grid">
          <MetricCard label="Total Risks" value={summary.total} critical={summary.critical_open > 0} sub={`${summary.critical_open || 0} critical open`} />
        </div>
        <Section title="Risk Register">
          <table className="compliance-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Category</th>
                <th>Title</th>
                <th>Likelihood</th>
                <th>Impact</th>
                <th>Score</th>
                <th>Mitigation</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(d.risks || []).map((r) => (
                <tr key={r.id}>
                  <td>{r.reference}</td>
                  <td>{r.category}</td>
                  <td>{r.title}</td>
                  <td>{r.likelihood}</td>
                  <td>{r.impact}</td>
                  <td>{r.score}</td>
                  <td>{r.mitigation ? `${r.mitigation.slice(0, 60)}${r.mitigation.length > 60 ? "…" : ""}` : "—"}</td>
                  <td>{r.status}</td>
                  <td>
                    <select
                      defaultValue={r.status}
                      onChange={(e) => handleAction(postComplianceRiskAction, r.id, e.target.value)}
                    >
                      {STATUS_OPTIONS.risks.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </>
    );
  };

  const renderCalendar = () => {
    const d = detail || {};
    return (
      <Section title="Compliance Calendar">
        <table className="compliance-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(d.events || []).map((e) => (
              <tr key={e.id}>
                <td>{e.title}</td>
                <td>{e.event_type}</td>
                <td>{e.due_date}</td>
                <td>{e.status}</td>
                <td>{e.owner}</td>
                <td>
                  <select
                    defaultValue={e.status}
                    onChange={(ev) => handleAction(postComplianceCalendarAction, e.id, ev.target.value)}
                  >
                    {STATUS_OPTIONS.calendar.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    );
  };

  const renderCeo = () => {
    const d = detail || {};
    const auditProgress = d.audit_progress || {};
    const policyReview = d.policy_review_status || {};
    return (
      <>
        <div className="compliance-grid">
          <MetricCard label="Compliance Score" value={`${d.compliance_score}%`} critical={d.compliance_score < 70} />
          <MetricCard label="Critical Risks" value={d.critical_risks} critical={d.critical_risks > 0} />
          <MetricCard label="Pending Merchants" value={d.outstanding_approvals?.pending_merchants} />
          <MetricCard label="Pending Drivers" value={d.outstanding_approvals?.pending_drivers} />
          <MetricCard label="Pending Partners" value={d.outstanding_approvals?.pending_partners} />
          <MetricCard label="Outstanding Policy Acknowledgements" value={d.outstanding_approvals?.outstanding_policy_acknowledgements} critical />
          <MetricCard label="Total Audits" value={auditProgress.total} />
          <MetricCard label="Policies Needing Review" value={policyReview.requiring_review_soon} critical={policyReview.requiring_review_soon > 0} />
        </div>
        <Section title="Audit Progress">
          <ul className="compliance-list">
            {Object.entries(auditProgress.by_status || {}).map(([key, val]) => (
              <li key={key}>{key.replace(/_/g, " ")}: {val}</li>
            ))}
          </ul>
        </Section>
        <Section title="Upcoming Deadlines">
          <ul className="compliance-list">
            {(d.upcoming_deadlines || []).map((event) => (
              <li key={event.id}>{event.due_date} — {event.title} ({event.event_type})</li>
            ))}
          </ul>
        </Section>
        <Section title="Legal Action Items">
          <ul className="compliance-list">
            {(d.legal_action_items || []).map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </Section>
      </>
    );
  };

  const renderReports = () => (
    <Section title="Governance Reports">
      <div className="compliance-report-grid">
        {REPORTS.map((report) => (
          <div key={report.id} className="compliance-report-card">
            <h4>{report.label}</h4>
            <div className="compliance-report-actions">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className="compliance-report-button"
                  onClick={() => handleExport(report.id, fmt)}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );

  const renderTab = () => {
    switch (tab) {
      case "dashboard":
        return renderDashboard();
      case "audits":
        return renderAudits();
      case "policies":
        return renderPolicies();
      case "risks":
        return renderRisks();
      case "calendar":
        return renderCalendar();
      case "ceo":
        return renderCeo();
      case "reports":
        return renderReports();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="beta__container">
      <header className="beta__header">
        <div>
          <h1 className="beta__title">Compliance & Governance Center</h1>
          <p className="beta__subtitle">
            Regulatory compliance, audits, policies, risk register, calendar, and governance dashboard.
          </p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {message ? <p className="beta__success">{message}</p> : null}
      {loading && !data ? <p>Loading compliance & governance…</p> : null}

      <div className="compliance-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`compliance-tab ${tab === item.id ? "compliance-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="compliance-content">{renderTab()}</div>
    </div>
  );
}
