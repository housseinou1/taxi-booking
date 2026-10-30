import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  AlertBanner,
  ConfirmationDialog,
  DataTable,
  InlineError,
  KPICard,
  StatusChip,
  formatTimestamp,
} from "../components/library";
import {
  ACCOUNT_DOMAIN_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  APPROVAL_GROUP_LABELS,
  ceoAccountAction,
  fetchCeoAccounts,
  fetchCeoApprovals,
  fetchCeoAuditTrail,
} from "./ceoControlApi";
import { apiErrorMessage } from "../layouts/errors/apiErrorMessage";

const PAGE_SIZE = 25;

/**
 * What each CEO lifecycle action actually does, shown in the confirmation dialog so the
 * CEO confirms a precise state change (not a vague verb). Suspension and deactivation
 * are deliberately different: suspension stops new work but keeps app access;
 * deactivation disables sign-in.
 */
const PROPOSED_STATE_LABEL = {
  approve: "approved / active",
  suspend: "suspended (keeps app access, receives no new work)",
  deactivate: "deactivated (sign-in disabled)",
  block: "deactivated (sign-in disabled)",
  reactivate: "active (access restored; not automatically online)",
};

/**
 * Map a backend status string to a badge tone.
 * Keeps the CEO console's status language consistent (pending = warning,
 * approved/active = success, rejected/blocked = danger, everything else neutral).
 */
function approvalTone(status) {
  const value = String(status || "").toLowerCase();
  if (["approved", "active", "completed", "online"].includes(value)) return "success";
  if (["pending", "pending_review", "awaiting_ceo", "requested", "suspended"].includes(value)) {
    return "warning";
  }
  if (["rejected", "blocked", "failed", "cancelled"].includes(value)) return "danger";
  return "neutral";
}

const ACCOUNT_COLUMNS = [
  { id: "name", label: "Account" },
  { id: "email", label: "Email" },
  { id: "domain", label: "Domain" },
  { id: "city_name", label: "City" },
  {
    id: "is_active",
    label: "State",
    render: (row) => {
      // Prefer the domain lifecycle label so "suspended" is never confused with
      // "offline" or "active".
      const label = row.lifecycle?.status_label || (row.is_active ? "active" : "inactive");
      const tone =
        label === "online" || label === "active"
          ? "success"
          : label === "suspended" || label === "under_review"
          ? "warning"
          : label === "offline"
          ? "neutral"
          : "danger";
      return <StatusChip label={label} tone={tone} />;
    },
  },
  {
    id: "last_login",
    label: "Last login",
    render: (row) => (row.last_login ? formatTimestamp(row.last_login) : "Never"),
  },
  {
    id: "actionable",
    label: "Actionable",
    render: (row) => (row.actionable ? "Yes" : "Protected"),
  },
];

/**
 * CEO Control Center (Phase 8) — remote control and oversight from anywhere.
 *
 * Three sections: the read-only approvals inbox (what awaits CEO authority), the
 * account directory with audited suspend/reactivate/block actions, and the CEO
 * audit trail. Financial approvals are listed read-only: the finance freeze still
 * applies, and no wallet, payout or transfer is ever touched here.
 */
export default function CeoControlCenter({ pathname = "/admin/ceo-control" } = {}) {
  const [approvals, setApprovals] = useState(null);
  const [approvalsError, setApprovalsError] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  // Canonical fleet figures (operations/fleet_metrics.py): drivers and delivery
  // couriers are counted separately, so "drivers" can never silently include the
  // delivery fleet again.
  const [fleet, setFleet] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ domain: "", status: "" });
  const [pending, setPending] = useState(null); // { account, action, reason, error }
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);
  const [audit, setAudit] = useState({ loading: false, error: "", data: null });
  const [auditScope, setAuditScope] = useState("me");

  const loadApprovals = useCallback(async () => {
    setApprovalsError("");
    try {
      setApprovals(await fetchCeoApprovals());
    } catch (err) {
      setApprovalsError(apiErrorMessage(err, { resource: "the approvals inbox" }));
      setApprovals(null);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCeoAccounts({
        page,
        page_size: PAGE_SIZE,
        search,
        domain: filters.domain,
        status: filters.status,
      });
      setAccounts(data.results || []);
      setSummary(data.summary || null);
      setFleet(data.fleet || null);
      setWarnings(data.warnings || []);
      setMeta({
        count: data.count || 0,
        page: data.page || 1,
        total_pages: data.total_pages || 1,
        page_size: data.page_size || PAGE_SIZE,
      });
    } catch (err) {
      setError(apiErrorMessage(err, { resource: "accounts" }));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters]);

  const loadAudit = useCallback(async () => {
    setAudit((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await fetchCeoAuditTrail({ scope: auditScope, limit: 25 });
      setAudit({ loading: false, error: "", data });
    } catch (err) {
      setAudit({
        loading: false,
        error: apiErrorMessage(err, { resource: "the audit trail" }),
        data: null,
      });
    }
  }, [auditScope]);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const runAction = async () => {
    if (!pending) return;
    const { account, action, reason } = pending;
    if (!reason || reason.trim().length < 5) {
      setPending((prev) => ({ ...prev, error: "A clear reason (5+ characters) is required." }));
      return;
    }
    setWorking(true);
    try {
      const result = await ceoAccountAction(account.id, action, reason.trim());
      setNotice({ tone: "success", message: result?.message || `Account ${action}ed.` });
      setPending(null);
      await loadAccounts();
      await loadAudit();
    } catch (err) {
      const detail = apiErrorMessage(err, { resource: "the account action", action: "complete" });
      setPending((prev) => ({ ...prev, error: detail }));
    } finally {
      setWorking(false);
    }
  };

  const groups = approvals?.groups || {};
  const filtersNode = useMemo(
    () => (
      <div className="admin-filters">
        <label className="admin-filters__field">
          Domain
          <select
            aria-label="Filter by domain"
            value={filters.domain}
            onChange={(e) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, domain: e.target.value }));
            }}
          >
            {ACCOUNT_DOMAIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filters__field">
          State
          <select
            aria-label="Filter by state"
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, status: e.target.value }));
            }}
          >
            {ACCOUNT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    ),
    [filters]
  );

  const auditRows = audit.data?.results || [];

  return (
    <AdminShellPage pathname={pathname} title="CEO Control Center">
      <div className="ceo-control">
        <div className="admin-kpi-row">
          <KPICard
            label="Pending approvals"
            value={approvals?.total_pending}
            subtitle="Awaiting CEO authority"
            loading={loading}
            error={approvalsError}
            onRefresh={loadApprovals}
          />
          <KPICard
            label="Accounts"
            value={summary?.total}
            subtitle={`${summary?.active ?? "N/A"} active · ${summary?.inactive ?? "N/A"} suspended`}
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
          <KPICard
            label="Ride drivers"
            value={fleet?.drivers?.total ?? summary?.drivers}
            subtitle={`${fleet?.drivers?.approved ?? "—"} approved · ${fleet?.drivers?.pending ?? "—"} pending`}
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
          <KPICard
            label="Drivers online"
            value={fleet?.drivers?.online}
            subtitle="Approved and dispatchable"
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
          <KPICard
            label="Delivery couriers"
            value={fleet?.couriers?.total ?? summary?.couriers}
            subtitle={`${fleet?.couriers?.approved ?? "—"} approved · ${fleet?.couriers?.suspended ?? "—"} suspended`}
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
          <KPICard
            label="Couriers online"
            value={fleet?.couriers?.online}
            subtitle="Delivery mode on"
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
          <KPICard
            label="Riders"
            value={summary?.riders}
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
          <KPICard
            label="Merchants"
            value={summary?.merchants}
            loading={loading}
            error={error}
            onRefresh={loadAccounts}
          />
        </div>

        {notice ? (
          <p className="ceo-control__notice" role="status">
            {notice.message}
          </p>
        ) : null}

        {warnings.map((warning) => (
          <AlertBanner key={warning} tone="warning" title="Degraded data source">
            {warning}
          </AlertBanner>
        ))}

        <section className="ceo-control__section">
          <h3 className="ceo-control__heading">Approvals inbox</h3>
          {approvalsError ? <InlineError message={approvalsError} /> : null}
          {approvals?.financial_approvals_frozen ? (
            <AlertBanner tone="info">{approvals.financial_approvals_note}</AlertBanner>
          ) : null}
          <div className="ceo-control__groups">
            {Object.entries(APPROVAL_GROUP_LABELS).map(([key, label]) => {
              const group = groups[key];
              const items = group?.items || [];
              return (
                <div className="ceo-control__group" key={key}>
                  <div className="ceo-control__group-head">
                    <span>{label}</span>
                    <span className="ceo-control__count">{group?.count ?? 0}</span>
                  </div>
                  {items.length === 0 ? (
                    <p className="ceo-control__empty">Nothing pending.</p>
                  ) : (
                    <ul className="ceo-control__list">
                      {items.slice(0, 5).map((item) => (
                        <li key={`${key}-${item.id}`}>
                          <span className="ceo-control__item-title">{item.title}</span>
                          {item.status ? (
                            <span
                              className={`ceo-control__badge ceo-control__badge--${approvalTone(
                                item.status
                              )}`}
                            >
                              {item.status}
                            </span>
                          ) : null}
                          <span className="ceo-control__meta">
                            {item.amount ? `${item.amount} MRU · ` : ""}
                            {item.status ? `${item.status} · ` : ""}
                            {item.city || "—"}
                          </span>
                          <a className="admin-lib-btn admin-lib-btn--ghost" href={item.deep_link}>
                            Open
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="ceo-control__section">
          <h3 className="ceo-control__heading">Account directory</h3>
          <DataTable
            title="Accounts"
            columns={ACCOUNT_COLUMNS}
            rows={accounts}
            rowKey="id"
            loading={loading}
            error={error}
            emptyLabel="No accounts match these filters."
            serverMode
            searchValue={search}
            onSearchChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            searchPlaceholder="Search name, email or phone…"
            page={meta.page}
            pageSize={meta.page_size}
            total={meta.count}
            onPageChange={setPage}
            onRefresh={loadAccounts}
            filters={filtersNode}
            rowActions={(row) =>
              row.actionable ? (
                <div className="ceo-control__row-actions">
                  {row.capabilities?.approve ? (
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--success ceo-control__action ceo-control__action--approve"
                      onClick={() => setPending({ account: row, action: "approve", reason: "" })}
                    >
                      Approve
                    </button>
                  ) : null}
                  {row.capabilities?.suspend ? (
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--warning ceo-control__action ceo-control__action--suspend"
                      onClick={() => setPending({ account: row, action: "suspend", reason: "" })}
                    >
                      Suspend
                    </button>
                  ) : null}
                  {row.capabilities?.deactivate ? (
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--danger ceo-control__action ceo-control__action--deactivate"
                      onClick={() => setPending({ account: row, action: "deactivate", reason: "" })}
                    >
                      Deactivate
                    </button>
                  ) : null}
                  {row.capabilities?.reactivate ? (
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--success ceo-control__action ceo-control__action--reactivate"
                      onClick={() => setPending({ account: row, action: "reactivate", reason: "" })}
                    >
                      Reactivate
                    </button>
                  ) : null}
                  {!row.capabilities ? (
                    <span className="ceo-control__meta">
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span className="ceo-control__meta">Protected account</span>
              )
            }
          />
        </section>

        <section className="ceo-control__section">
          <h3 className="ceo-control__heading">Audit trail</h3>
          <div className="admin-filters">
            <label className="admin-filters__field">
              Scope
              <select
                aria-label="Audit scope"
                value={auditScope}
                onChange={(e) => setAuditScope(e.target.value)}
              >
                <option value="me">My actions</option>
                <option value="all">All high-authority actions</option>
              </select>
            </label>
            <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={loadAudit}>
              Refresh
            </button>
          </div>
          {audit.loading ? <p className="ceo-control__empty">Loading audit trail…</p> : null}
          {audit.error ? <InlineError message={audit.error} /> : null}
          {!audit.loading && !audit.error && auditRows.length === 0 ? (
            <p className="ceo-control__empty">No audit entries recorded.</p>
          ) : null}
          {auditRows.length > 0 ? (
            <ul className="ceo-control__audit">
              {auditRows.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.summary}</strong>
                  <span className="ceo-control__meta">
                    {entry.action} · {entry.entity_type}
                    {entry.entity_id ? ` #${entry.entity_id}` : ""} ·{" "}
                    {formatTimestamp(entry.created_at)}
                    {entry.actor_email ? ` · ${entry.actor_email}` : ""}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      {pending ? (
        <ConfirmationDialog
          open
          title={`${{ approve: "Approve", reactivate: "Reactivate", deactivate: "Deactivate", block: "Deactivate", suspend: "Suspend" }[pending.action] || "Update"} account`}
          message={
            <span>
              {`${pending.account.email} (${pending.account.domain})`}
              <br />
              {/* The CEO confirms a precise transition, not just a verb (Part 6). */}
              <span className="ceo-control__meta">
                {`Current: ${
                  pending.account.lifecycle?.status_label ||
                  (pending.account.is_active ? "active" : "inactive")
                } → Proposed: ${PROPOSED_STATE_LABEL[pending.action] || pending.action}`}
              </span>
              <br />
              <label className="ceo-control__reason">
                Reason (required)
                <textarea
                  rows={3}
                  aria-label="Account action reason"
                  value={pending.reason}
                  onChange={(e) =>
                    setPending((prev) => ({ ...prev, reason: e.target.value, error: "" }))
                  }
                />
              </label>
              {pending.error ? <InlineError message={pending.error} /> : null}
            </span>
          }
          confirmLabel={working ? "Working…" : "Confirm"}
          onConfirm={runAction}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </AdminShellPage>
  );
}

