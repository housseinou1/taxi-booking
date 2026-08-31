import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  ConfirmationDialog,
  DashboardSkeleton,
  DataTable,
  FilterBar,
  InlineError,
  KPICard,
  RetryBlock,
  Select,
  StatusChip,
  useToast,
  formatTimestamp,
} from "../components/library";
import ProtectedActionButton from "../components/guards/ProtectedActionButton";
import { usePermissions } from "../permissions/PermissionContext";
import {
  auditToCsv,
  fetchDisasterRecovery,
  fetchFeatureFlags,
  fetchPlatformSettings,
  fetchReleases,
  fetchSecurityCenter,
  fetchStaffUsers,
  fetchSystemAudit,
  fetchSystemDashboard,
  inviteStaffUser,
  queueBackupAction,
  updateFeatureFlag,
  updatePlatformSetting,
  updateStaffUser,
} from "./systemAdminApi";
import "../finance/FinanceDashboard.css";

const TABS = [
  { id: "health", label: "Platform Health" },
  { id: "users", label: "Users & Roles" },
  { id: "security", label: "Security" },
  { id: "audit", label: "Audit" },
  { id: "settings", label: "Settings" },
  { id: "backup", label: "Backup" },
  { id: "integrations", label: "Integrations" },
  { id: "flags", label: "Feature Flags" },
  { id: "releases", label: "Releases" },
  { id: "dr", label: "Disaster Recovery" },
];

function toneForStatus(status) {
  if (status === "ok" || status === "configured" || status === "ready") return "success";
  if (status === "degraded" || status === "unknown" || status === "attention" || status === "not_configured") return "warning";
  return "danger";
}

export default function SystemAdminDashboard() {
  const { canExport, canEdit, role } = usePermissions();
  const { push } = useToast();
  const [tab, setTab] = useState("health");
  const [dash, setDash] = useState(null);
  const [users, setUsers] = useState([]);
  const [assignableGroups, setAssignableGroups] = useState([]);
  const [security, setSecurity] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ user: "", action: "", module: "", ip: "" });
  const [settings, setSettings] = useState(null);
  const [flags, setFlags] = useState({});
  const [releases, setReleases] = useState(null);
  const [dr, setDr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadMs, setLoadMs] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [invite, setInvite] = useState({ email: "", group: "Support", first_name: "" });
  const [flagForm, setFlagForm] = useState({ flag: "", enabled: true, rollout_pct: 100, environment: "production" });
  const [tempSecret, setTempSecret] = useState("");

  const canManage = canEdit("system") || role === "ceo" || role === "system_admin";

  const loadCore = useCallback(async () => {
    const started = performance.now();
    setLoading(true);
    try {
      setError("");
      const data = await fetchSystemDashboard();
      setDash(data);
      setLoadMs(Math.round(performance.now() - started));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load system admin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (tab === "users") {
          const data = await fetchStaffUsers();
          if (!cancelled) {
            setUsers(data.users || []);
            setAssignableGroups(data.assignable_groups || []);
          }
        } else if (tab === "security") {
          const data = await fetchSecurityCenter();
          if (!cancelled) setSecurity(data);
        } else if (tab === "audit") {
          const data = await fetchSystemAudit(auditFilters);
          if (!cancelled) setAudit(data.logs || []);
        } else if (tab === "settings") {
          const data = await fetchPlatformSettings();
          if (!cancelled) setSettings(data);
        } else if (tab === "flags") {
          const data = await fetchFeatureFlags();
          if (!cancelled) setFlags(data.flags || {});
        } else if (tab === "releases") {
          const data = await fetchReleases();
          if (!cancelled) setReleases(data);
        } else if (tab === "dr") {
          const data = await fetchDisasterRecovery();
          if (!cancelled) setDr(data);
        }
      } catch (err) {
        if (!cancelled) push({ tone: "danger", title: "Load failed", message: err?.response?.data?.detail || err?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, auditFilters, push]);

  const services = useMemo(() => dash?.health?.services || {}, [dash]);
  const serviceRows = useMemo(
    () =>
      Object.entries(services).map(([id, svc]) => ({
        id,
        service: id,
        status: svc.status,
        response_time_ms: svc.response_time_ms,
        last_check: svc.last_check,
        error_count: svc.error_count,
        uptime_pct: svc.uptime_pct,
      })),
    [services]
  );

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === "staff") {
        const result = await updateStaffUser(confirm.userId, confirm.payload);
        if (result.temporary_password) setTempSecret(result.temporary_password);
        push({ tone: "success", title: "Staff updated", message: confirm.label });
        const data = await fetchStaffUsers();
        setUsers(data.users || []);
      } else if (confirm.type === "setting") {
        const result = await updatePlatformSetting(confirm.payload);
        push({
          tone: "success",
          title: result.status === "pending_approval" ? "Awaiting dual approval" : "Setting applied",
          message: result.message || result.key,
        });
        setSettings(await fetchPlatformSettings());
      } else if (confirm.type === "approve_setting") {
        await updatePlatformSetting(confirm.payload);
        push({ tone: "success", title: "Setting approved" });
        setSettings(await fetchPlatformSettings());
      } else if (confirm.type === "backup") {
        const result = await queueBackupAction(confirm.payload);
        push({ tone: "success", title: "Backup action queued", message: `${result.action} · ${result.status}` });
        await loadCore();
      } else if (confirm.type === "flag") {
        await updateFeatureFlag(confirm.payload);
        push({ tone: "success", title: "Feature flag updated" });
        setFlags((await fetchFeatureFlags()).flags || {});
      } else if (confirm.type === "invite") {
        const result = await inviteStaffUser(confirm.payload);
        if (result.temporary_password) setTempSecret(result.temporary_password);
        push({ tone: "success", title: "Staff invited", message: result.email });
        const data = await fetchStaffUsers();
        setUsers(data.users || []);
      }
      setConfirm(null);
    } catch (err) {
      push({ tone: "danger", title: "Action failed", message: err?.response?.data?.detail || err?.message });
    }
  };

  const exportAudit = () => {
    if (!canExport?.("system") && !canExport?.("reports") && !canManage) {
      push({ tone: "warning", title: "Export not permitted" });
      return;
    }
    const csv = auditToCsv(audit);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "system-audit.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !dash) {
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
          <h1 className="fin-dash__title">System Administration</h1>
          <p className="fin-dash__subtitle">
            Platform health, security, settings, and recovery · CEO / Platform Admin only
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="fin-dash__header-actions">
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={loadCore}>
            Refresh
          </button>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/status">
            Legacy Status
          </a>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/api-gateway">
            API Gateway
          </a>
        </div>
      </header>

      {error ? <RetryBlock message={error} onRetry={loadCore} /> : null}
      {tempSecret ? (
        <p className="fin-dash__warn">
          Temporary password (show once): <code>{tempSecret}</code>{" "}
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setTempSecret("")}>
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="fin-dash__row-actions" style={{ flexWrap: "wrap" }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`admin-lib-btn ${tab === item.id ? "" : "admin-lib-btn--ghost"}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "health" && (
        <section className="fin-dash__panel">
          <div className="fin-dash__panel-head">
            <h2>Platform health</h2>
            <StatusChip label={dash?.health?.status || "—"} tone={toneForStatus(dash?.health?.status)} />
          </div>
          <div className="fin-dash__kpi-grid">
            <KPICard label="Overall" value={dash?.health?.status || "—"} />
            <KPICard label="Services" value={serviceRows.length} />
            <KPICard label="Security risk" value={dash?.security?.risk_level || "—"} />
            <KPICard label="Backup" value={dash?.backup?.backup_status || "—"} />
          </div>
          <DataTable
            title="Live service checks"
            columns={[
              { id: "service", label: "Service" },
              {
                id: "status",
                label: "Status",
                render: (r) => <StatusChip label={r.status} tone={toneForStatus(r.status)} />,
              },
              { id: "response_time_ms", label: "Response (ms)" },
              { id: "last_check", label: "Last check", render: (r) => formatTimestamp(r.last_check) },
              { id: "error_count", label: "Errors" },
              { id: "uptime_pct", label: "Uptime %", render: (r) => (r.uptime_pct == null ? "—" : r.uptime_pct) },
            ]}
            rows={serviceRows}
            searchable
          />
          <p className="fin-dash__hint">
            External providers show configured / not_configured from environment — live provider success is never invented.
          </p>
        </section>
      )}

      {tab === "users" && (
        <section className="fin-dash__panel">
          <h2>User & role management</h2>
          <div className="fin-dash__form-grid">
            <input className="admin-lib-input" placeholder="Email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <input className="admin-lib-input" placeholder="First name" value={invite.first_name} onChange={(e) => setInvite({ ...invite, first_name: e.target.value })} />
            <Select
              label="Group"
              value={invite.group}
              onChange={(v) => setInvite({ ...invite, group: v })}
              options={(assignableGroups.length ? assignableGroups : ["Support"]).map((g) => ({ value: g, label: g }))}
            />
            <ProtectedActionButton
              module="system"
              disabled={!canManage}
              onClick={() => setConfirm({ type: "invite", label: `Invite ${invite.email}`, payload: invite })}
            >
              Invite employee
            </ProtectedActionButton>
          </div>
          <DataTable
            title="Staff accounts"
            columns={[
              { id: "email", label: "Email" },
              { id: "name", label: "Name" },
              { id: "groups", label: "Roles", render: (r) => (r.groups || []).join(", ") },
              {
                id: "mfa_confirmed",
                label: "MFA",
                render: (r) => <StatusChip label={r.mfa_confirmed ? "On" : "Off"} tone={r.mfa_confirmed ? "success" : "warning"} />,
              },
              {
                id: "is_active",
                label: "Active",
                render: (r) => <StatusChip label={r.is_active ? "Yes" : "No"} tone={r.is_active ? "success" : "danger"} />,
              },
              { id: "active_refresh_tokens", label: "Sessions" },
              { id: "last_login", label: "Last login", render: (r) => formatTimestamp(r.last_login) || "—" },
            ]}
            rows={users}
            rowActions={(row) => (
              <div className="fin-dash__row-actions">
                <ProtectedActionButton module="system" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setConfirm({ type: "staff", userId: row.id, label: `Disable ${row.email}`, payload: { action: "disable" } })}>
                  Disable
                </ProtectedActionButton>
                <ProtectedActionButton module="system" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setConfirm({ type: "staff", userId: row.id, label: `Enable ${row.email}`, payload: { action: "enable" } })}>
                  Enable
                </ProtectedActionButton>
                <ProtectedActionButton module="system" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setConfirm({ type: "staff", userId: row.id, label: `Force logout ${row.email}`, payload: { action: "force_logout" } })}>
                  Force logout
                </ProtectedActionButton>
                <ProtectedActionButton module="system" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setConfirm({ type: "staff", userId: row.id, label: `Reset password ${row.email}`, payload: { action: "reset_password" } })}>
                  Reset password
                </ProtectedActionButton>
                <ProtectedActionButton
                  module="system"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => {
                    const group = window.prompt("Assign group name", "Support");
                    if (!group) return;
                    setConfirm({ type: "staff", userId: row.id, label: `Assign ${group}`, payload: { action: "assign_role", group } });
                  }}
                >
                  Assign role
                </ProtectedActionButton>
                <ProtectedActionButton
                  module="system"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => {
                    const group = window.prompt("Revoke group name", (row.groups || [])[0] || "");
                    if (!group) return;
                    setConfirm({ type: "staff", userId: row.id, label: `Revoke ${group}`, payload: { action: "revoke_role", group } });
                  }}
                >
                  Revoke role
                </ProtectedActionButton>
              </div>
            )}
          />
        </section>
      )}

      {tab === "security" && (
        <section className="fin-dash__panel">
          <h2>Security center</h2>
          {!security ? (
            <InlineError message="Loading security…" />
          ) : (
            <>
              <div className="fin-dash__kpi-grid">
                <KPICard label="Risk" value={security.risk_level} />
                <KPICard label="Failed logins (7d)" value={security.failed_logins_7d} />
                <KPICard label="Locked accounts" value={security.locked_accounts} />
                <KPICard label="JWT failures (7d)" value={security.jwt_failures_7d} />
                <KPICard label="Permission violations" value={security.permission_violations_7d} />
                <KPICard label="Open fraud flags" value={security.open_fraud_flags} />
              </div>
              <p className="fin-dash__hint">Recommended: {(security.recommended_actions || []).join(" · ")}</p>
              <p className="fin-dash__hint">Suspicious IPs: {(security.suspicious_ips || []).join(", ") || "—"}</p>
              <DataTable
                title="Incident timeline"
                columns={[
                  { id: "at", label: "When", render: (r) => formatTimestamp(r.at) },
                  { id: "actor", label: "Actor" },
                  { id: "action", label: "Action" },
                  { id: "summary", label: "Summary" },
                  { id: "ip_address", label: "IP" },
                ]}
                rows={security.incident_timeline || []}
              />
            </>
          )}
        </section>
      )}

      {tab === "audit" && (
        <section className="fin-dash__panel">
          <div className="fin-dash__panel-head">
            <h2>Audit investigation</h2>
            <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={exportAudit}>
              Export CSV
            </button>
          </div>
          <FilterBar
            onReset={() => setAuditFilters({ user: "", action: "", module: "", ip: "" })}
          >
            <input className="admin-lib-input" placeholder="User email" value={auditFilters.user} onChange={(e) => setAuditFilters({ ...auditFilters, user: e.target.value })} />
            <input className="admin-lib-input" placeholder="Action" value={auditFilters.action} onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value })} />
            <input className="admin-lib-input" placeholder="Module / entity" value={auditFilters.module} onChange={(e) => setAuditFilters({ ...auditFilters, module: e.target.value })} />
            <input className="admin-lib-input" placeholder="IP" value={auditFilters.ip} onChange={(e) => setAuditFilters({ ...auditFilters, ip: e.target.value })} />
          </FilterBar>
          <DataTable
            title="Audit logs"
            columns={[
              { id: "created_at", label: "Time", render: (r) => formatTimestamp(r.created_at) },
              { id: "actor_email", label: "User" },
              { id: "action", label: "Action" },
              { id: "entity_type", label: "Module" },
              { id: "entity_id", label: "Resource" },
              { id: "summary", label: "Summary" },
              { id: "reason", label: "Reason", render: (r) => r.reason || "—" },
              {
                id: "diff",
                label: "Before → After",
                render: (r) => {
                  if (r.before == null && r.after == null) return "—";
                  return `${JSON.stringify(r.before)} → ${JSON.stringify(r.after)}`;
                },
              },
              { id: "ip_address", label: "IP" },
            ]}
            rows={audit}
          />
        </section>
      )}

      {tab === "settings" && (
        <section className="fin-dash__panel">
          <h2>Platform settings</h2>
          <p className="fin-dash__hint">Critical keys require dual approval. Values come from PlatformSetting — not hard-coded rates.</p>
          {(settings?.pending_approvals || []).length ? (
            <div className="fin-dash__panel" style={{ marginBottom: 12 }}>
              <h3>Pending dual approvals</h3>
              {(settings.pending_approvals || []).map((item) => (
                <div key={item.token} className="fin-dash__row-actions" style={{ marginBottom: 8 }}>
                  <span>
                    {item.key} by {item.requested_by}
                  </span>
                  <ProtectedActionButton
                    module="system"
                    onClick={() =>
                      setConfirm({
                        type: "approve_setting",
                        label: `Approve ${item.key}`,
                        payload: { key: item.key, approve_token: item.token, confirm: true },
                      })
                    }
                  >
                    Approve
                  </ProtectedActionButton>
                </div>
              ))}
            </div>
          ) : null}
          <DataTable
            title="Allowlisted settings"
            columns={[
              { id: "key", label: "Key" },
              { id: "label", label: "Label" },
              { id: "critical", label: "Critical", render: (r) => (r.critical ? "Yes" : "No") },
              {
                id: "value",
                label: "Value",
                render: (r) => <code style={{ fontSize: 12 }}>{JSON.stringify(r.value)}</code>,
              },
              { id: "updated_by", label: "Updated by" },
              { id: "updated_at", label: "Updated", render: (r) => formatTimestamp(r.updated_at) || "—" },
            ]}
            rows={settings?.settings || []}
            rowActions={(row) =>
              row.read_only ? null : (
                <ProtectedActionButton
                  module="system"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => {
                    const raw = window.prompt(`New JSON value for ${row.key}`, JSON.stringify(row.value ?? {}));
                    if (raw == null) return;
                    let value;
                    try {
                      value = JSON.parse(raw);
                    } catch {
                      push({ tone: "danger", title: "Invalid JSON" });
                      return;
                    }
                    setConfirm({
                      type: "setting",
                      label: `Update ${row.key}`,
                      payload: { key: row.key, value, confirm: true, reason: "System Admin update" },
                    });
                  }}
                >
                  Edit
                </ProtectedActionButton>
              )
            }
          />
        </section>
      )}

      {tab === "backup" && (
        <section className="fin-dash__panel">
          <h2>Backup & recovery</h2>
          <div className="fin-dash__kpi-grid">
            <KPICard label="Status" value={dash?.backup?.backup_status || "—"} />
            <KPICard label="Last backup" value={dash?.backup?.last_backup || "—"} />
            <KPICard label="Storage" value={dash?.backup?.storage_usage || "—"} />
            <KPICard label="Retention" value={dash?.backup?.retention || "—"} />
          </div>
          <DataTable
            title="Restore points"
            columns={[
              { id: "id", label: "ID", render: (r) => r.id || r.name || "—" },
              { id: "created_at", label: "Created", render: (r) => formatTimestamp(r.created_at || r.at) || "—" },
              { id: "status", label: "Status" },
            ]}
            rows={dash?.backup?.restore_points || []}
            emptyLabel="No restore points reported by backup ingest"
          />
          <div className="fin-dash__row-actions">
            <ProtectedActionButton module="system" onClick={() => setConfirm({ type: "backup", label: "Trigger backup", payload: { action: "trigger", confirm: true } })}>
              Trigger backup
            </ProtectedActionButton>
            <ProtectedActionButton module="system" onClick={() => setConfirm({ type: "backup", label: "Verify backup", payload: { action: "verify", confirm: true } })}>
              Verify backup
            </ProtectedActionButton>
            <ProtectedActionButton module="system" onClick={() => setConfirm({ type: "backup", label: "Restore test (non-prod)", payload: { action: "restore_test", confirm: true } })}>
              Restore test
            </ProtectedActionButton>
          </div>
          <p className="fin-dash__hint">{dash?.backup?.note}</p>
        </section>
      )}

      {tab === "integrations" && (
        <section className="fin-dash__panel">
          <h2>Integrations</h2>
          <DataTable
            title="External systems"
            columns={[
              { id: "id", label: "Integration" },
              {
                id: "status",
                label: "Status",
                render: (r) => <StatusChip label={r.status} tone={toneForStatus(r.status)} />,
              },
              { id: "detail", label: "Detail", render: (r) => r.note || r.provider || r.gateways?.join(", ") || "—" },
              { id: "last_check", label: "Last check", render: (r) => formatTimestamp(r.last_check) || "—" },
            ]}
            rows={Object.entries(dash?.integrations?.integrations || {}).map(([id, svc]) => ({ id, ...svc }))}
          />
          <p className="fin-dash__hint">Retry = re-run health composition via Refresh. Provider outages require ops runbooks.</p>
        </section>
      )}

      {tab === "flags" && (
        <section className="fin-dash__panel">
          <h2>Feature flags</h2>
          <div className="fin-dash__form-grid">
            <input className="admin-lib-input" placeholder="Flag id" value={flagForm.flag} onChange={(e) => setFlagForm({ ...flagForm, flag: e.target.value })} />
            <Select
              label="Environment"
              value={flagForm.environment}
              onChange={(v) => setFlagForm({ ...flagForm, environment: v })}
              options={[
                { value: "development", label: "Development" },
                { value: "staging", label: "Staging" },
                { value: "production", label: "Production" },
              ]}
            />
            <input
              className="admin-lib-input"
              type="number"
              min={0}
              max={100}
              value={flagForm.rollout_pct}
              onChange={(e) => setFlagForm({ ...flagForm, rollout_pct: Number(e.target.value) })}
            />
            <label className="fin-dash__check">
              <input type="checkbox" checked={flagForm.enabled} onChange={(e) => setFlagForm({ ...flagForm, enabled: e.target.checked })} />
              Enabled
            </label>
            <ProtectedActionButton
              module="system"
              onClick={() => setConfirm({ type: "flag", label: `Update flag ${flagForm.flag}`, payload: flagForm })}
            >
              Save flag
            </ProtectedActionButton>
          </div>
          <DataTable
            title="Flags"
            columns={[
              { id: "id", label: "Flag" },
              { id: "enabled", label: "Enabled", render: (r) => String(r.enabled) },
              { id: "rollout_pct", label: "Rollout %" },
              { id: "environment", label: "Environment" },
              { id: "updated_by", label: "Updated by" },
              { id: "updated_at", label: "Updated", render: (r) => formatTimestamp(r.updated_at) || "—" },
            ]}
            rows={Object.entries(flags).map(([id, value]) => ({ id, ...value }))}
            rowActions={(row) => (
              <ProtectedActionButton
                module="system"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  setConfirm({
                    type: "flag",
                    label: `${row.enabled ? "Disable" : "Enable"} ${row.id}`,
                    payload: { flag: row.id, enabled: !row.enabled, rollout_pct: row.rollout_pct || 0, environment: row.environment || "production" },
                  })
                }
              >
                Toggle
              </ProtectedActionButton>
            )}
          />
        </section>
      )}

      {tab === "releases" && (
        <section className="fin-dash__panel">
          <h2>Release management</h2>
          <div className="fin-dash__kpi-grid">
            <KPICard label="Backend" value={releases?.backend_version || dash?.releases?.backend_version || "—"} />
            <KPICard label="Admin" value={releases?.admin_version || dash?.releases?.admin_version || "—"} />
            <KPICard label="Rider" value={releases?.rider?.latest || dash?.releases?.rider?.latest || "—"} />
            <KPICard label="Driver" value={releases?.driver?.latest || dash?.releases?.driver?.latest || "—"} />
            <KPICard label="Delivery" value={releases?.delivery?.latest || dash?.releases?.delivery?.latest || "—"} />
            <KPICard label="Environment" value={releases?.environment || dash?.releases?.environment || "—"} />
          </div>
          <p className="fin-dash__hint">
            Rollback available: {String(releases?.rollback_available ?? dash?.releases?.rollback_available ?? false)} ·{" "}
            {releases?.release_notes || dash?.releases?.release_notes}
          </p>
          <DataTable
            title="Deployment history"
            columns={[
              { id: "version", label: "Version", render: (r) => r.version || r.id || "—" },
              { id: "environment", label: "Environment" },
              { id: "deployed_at", label: "Deployed", render: (r) => formatTimestamp(r.deployed_at || r.at) || "—" },
              { id: "notes", label: "Notes" },
            ]}
            rows={releases?.deployment_history || dash?.releases?.deployment_history || []}
            emptyLabel="No deployment history ingested yet"
          />
        </section>
      )}

      {tab === "dr" && (
        <section className="fin-dash__panel">
          <h2>Disaster recovery</h2>
          <p className="fin-dash__hint">Overall health: {dr?.overall_health || dash?.disaster_recovery?.overall_health || "—"}</p>
          {(dr?.playbooks || dash?.disaster_recovery?.playbooks || []).map((book) => (
            <div key={book.id} className="fin-dash__panel" style={{ marginBottom: 10 }}>
              <div className="fin-dash__panel-head">
                <h3>{book.title}</h3>
                <StatusChip label={`${book.current_status} · ${book.readiness}`} tone={toneForStatus(book.readiness === "ready" ? "ok" : "degraded")} />
              </div>
              <ol>
                {(book.steps || []).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <ConfirmationDialog
        open={Boolean(confirm)}
        title={confirm?.label || "Confirm administrative action"}
        message="This action is audited. Critical settings require a second approver."
        confirmLabel="Confirm"
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </div>
  );
}
