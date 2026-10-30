import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  AlertBanner,
  DataTable,
  InlineError,
  KPICard,
  StatusChip,
  formatTimestamp,
} from "../components/library";
import {
  assignAccountRole,
  fetchRoleAccounts,
  fetchRoleRegistry,
  isProtectedAccount,
  setStaffAccess,
} from "./rolesApi";
import "./RolesPermissionsCenter.css";

const ROLE_COLUMNS = [
  { id: "label", label: "Role" },
  { id: "groups", label: "Groups", render: (row) => (row.groups || []).join(", ") || "—" },
  {
    id: "modules",
    label: "Modules",
    render: (row) => `${(row.modules || []).length} module(s)`,
  },
  {
    id: "limits",
    label: "Approval limits",
    render: (row) => {
      const limits = Object.entries(row.approval_limits || {});
      if (!limits.length) return "—";
      return limits.map(([key, value]) => `${key}: ${value} MRU`).join(" · ");
    },
  },
  { id: "members", label: "Members" },
  {
    id: "protected",
    label: "Protection",
    render: (row) =>
      row.protected ? (
        <StatusChip label="protected" tone="danger" />
      ) : (
        <StatusChip label="standard" tone="neutral" />
      ),
  },
  {
    id: "assignable",
    label: "Assignable",
    render: (row) => (row.assignable ? "Yes" : "No"),
  },
];

const ACCOUNT_COLUMNS = [
  { id: "name", label: "Account" },
  { id: "email", label: "Email" },
  { id: "role_label", label: "Role" },
  { id: "groups", label: "Groups", render: (row) => (row.groups || []).join(", ") || "—" },
  {
    id: "is_staff",
    label: "Admin access",
    render: (row) => (
      <StatusChip
        label={row.is_staff ? "enabled" : "revoked"}
        tone={row.is_staff ? "success" : "danger"}
      />
    ),
  },
  {
    id: "totp_confirmed",
    label: "Strong auth",
    render: (row) => (
      <StatusChip
        label={row.totp_confirmed ? "confirmed" : "missing"}
        tone={row.totp_confirmed ? "success" : "warning"}
      />
    ),
  },
  {
    id: "last_login",
    label: "Last login",
    render: (row) => (row.last_login ? formatTimestamp(row.last_login) : "Never"),
  },
];

/**
 * Roles & Permissions Center (Phase 10) — CEO-governed RBAC management.
 *
 * Three sections: the role registry (what each role can see and approve), the
 * administrative accounts with guarded role assignment / access revocation, and
 * the live permission catalogue. Protected Founder/CEO accounts are rendered as
 * read-only — the backend refuses them even if the UI were bypassed.
 */
export default function RolesPermissionsCenter({ pathname = "/admin/roles" } = {}) {
  const [registry, setRegistry] = useState(null);
  const [registryError, setRegistryError] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [pending, setPending] = useState(null); // { account, kind, role, reason, error }
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);

  const loadRegistry = useCallback(async () => {
    setRegistryError("");
    try {
      setRegistry(await fetchRoleRegistry());
    } catch (err) {
      setRegistryError(err?.response?.data?.detail || "Could not load the role registry.");
      setRegistry(null);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRoleAccounts({ search, role: roleFilter });
      setAccounts(data.results || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load administrative accounts.");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const openRoleChange = (account) => {
    const fallback = (registry?.assignable_roles || []).includes(account.role)
      ? account.role
      : "support";
    setPending({ account, kind: "role", role: fallback, reason: "", error: "" });
  };

  const openAccessChange = (account) =>
    setPending({
      account,
      kind: "access",
      enabled: !account.is_staff,
      reason: "",
      error: "",
    });

  const submitPending = async () => {
    if (!pending) return;
    const reason = (pending.reason || "").trim();
    if (reason.length < 5) {
      setPending((prev) => ({
        ...prev,
        error: "A reason of at least 5 characters is required.",
      }));
      return;
    }
    setWorking(true);
    try {
      const result =
        pending.kind === "role"
          ? await assignAccountRole(pending.account.id, pending.role, reason)
          : await setStaffAccess(pending.account.id, pending.enabled, reason);
      setNotice({ tone: "success", message: result?.message || "Change applied." });
      setPending(null);
      await loadAccounts();
      await loadRegistry();
    } catch (err) {
      const detail =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        "The change could not be applied.";
      setPending((prev) => ({ ...prev, error: detail }));
    } finally {
      setWorking(false);
    }
  };

  const roles = registry?.roles || [];
  const assignableRoles = registry?.assignable_roles || [];
  const catalogue = useMemo(
    () => Object.entries(registry?.permission_catalogue || {}),
    [registry]
  );

  const filtersNode = useMemo(
    () => (
      <div className="admin-filters">
        <label className="admin-filters__field">
          Role
          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role.role} value={role.role}>
                {role.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    ),
    [roleFilter, roles]
  );

  return (
    <AdminShellPage pathname={pathname} title="Roles & Permissions">
      <div className="admin-roles">
        {notice ? (
          <AlertBanner tone={notice.tone} title="Applied" onDismiss={() => setNotice(null)}>
            {notice.message}
          </AlertBanner>
        ) : null}

        <AlertBanner tone="warning" title="Founder/CEO authority is protected">
          <ul className="admin-roles__guarantees">
            {(registry?.protection?.guarantees || [
              "Protected accounts cannot be demoted, suspended or deleted.",
            ]).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </AlertBanner>

        <div className="admin-roles__kpis">
          <KPICard label="Administrative accounts" value={summary?.staff ?? "—"} />
          <KPICard label="Protected accounts" value={summary?.protected ?? "—"} />
          <KPICard label="Superusers" value={summary?.superusers ?? "—"} />
          <KPICard
            label="Without strong auth"
            value={summary?.without_totp ?? "—"}
            hint="TOTP not confirmed"
          />
        </div>

        <section className="admin-roles__section">
          <h3 className="admin-roles__heading">Role registry</h3>
          {registryError ? <InlineError message={registryError} /> : null}
          <DataTable
            title="Roles"
            columns={ROLE_COLUMNS}
            rows={roles}
            rowKey="role"
            loading={!registry && !registryError}
            error=""
            emptyLabel="No roles published."
            searchable={false}
          />
        </section>

        <section className="admin-roles__section">
          <h3 className="admin-roles__heading">Administrative accounts</h3>
          <DataTable
            title="Accounts"
            columns={ACCOUNT_COLUMNS}
            rows={accounts}
            rowKey="id"
            loading={loading}
            error={error}
            emptyLabel="No administrative accounts match these filters."
            serverMode
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search name or email…"
            onRefresh={loadAccounts}
            filters={filtersNode}
            rowActions={(row) =>
              isProtectedAccount(row) ? (
                <span className="admin-roles__protected">
                  Protected — Founder/CEO authority
                </span>
              ) : (
                <div className="admin-roles__row-actions">
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => openRoleChange(row)}
                  >
                    Change role
                  </button>
                  <button
                    type="button"
                    className={
                      row.is_staff
                        ? "admin-lib-btn admin-lib-btn--danger"
                        : "admin-lib-btn admin-lib-btn--success"
                    }
                    onClick={() => openAccessChange(row)}
                  >
                    {row.is_staff ? "Revoke access" : "Grant access"}
                  </button>
                </div>
              )
            }
          />
        </section>

        <section className="admin-roles__section">
          <h3 className="admin-roles__heading">Permission catalogue</h3>
          <p className="admin-roles__note">
            Action keys currently published to the admin shell, grouped by role.
          </p>
          <div className="admin-roles__catalogue">
            {catalogue.map(([role, actions]) => (
              <div key={role} className="admin-roles__catalogue-item">
                <strong>{role}</strong>
                <span className="admin-roles__catalogue-count">
                  {actions.length} actions
                </span>
                <span className="admin-roles__catalogue-keys">{actions.join(", ")}</span>
              </div>
            ))}
            {!catalogue.length ? (
              <p className="admin-roles__note">No permission keys reported yet.</p>
            ) : null}
          </div>
        </section>

        {pending ? (
          <section className="admin-roles__panel" aria-label="Confirm governance change">
            <h3 className="admin-roles__heading">
              {pending.kind === "role"
                ? `Change role for ${pending.account.email}`
                : `${pending.enabled ? "Grant" : "Revoke"} access for ${
                    pending.account.email
                  }`}
            </h3>
            <p className="admin-roles__note">
              Current role: {pending.account.role_label} · {pending.account.email}
            </p>
            {pending.kind === "role" ? (
              <label className="admin-filters__field">
                New role
                <select
                  aria-label="New role"
                  value={pending.role}
                  onChange={(event) =>
                    setPending((prev) => ({ ...prev, role: event.target.value, error: "" }))
                  }
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="admin-roles__reason">
              Reason (required, audited)
              <textarea
                aria-label="Reason"
                rows={2}
                value={pending.reason}
                onChange={(event) =>
                  setPending((prev) => ({ ...prev, reason: event.target.value, error: "" }))
                }
              />
            </label>
            {pending.error ? <InlineError message={pending.error} /> : null}
            <div className="admin-roles__panel-actions">
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--danger"
                onClick={submitPending}
                disabled={working}
              >
                {working ? "Applying…" : "Confirm change"}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </AdminShellPage>
  );
}
