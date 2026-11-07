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
  ACCESS_FLAG_OPTIONS,
  ACCESS_FLAG_TONES,
  AUDIT_ACTION_OPTIONS,
  ENTITY_OPTIONS,
  ISSUE_STATUS_TONES,
  fetchOutstandingIssues,
  fetchSecurityAccessReview,
  fetchSecurityAuditStream,
  fetchSecurityOverview,
} from "./securityConsoleApi";
import "./SecurityOperationsCenter.css";

const PAGE_SIZE = 25;

const AUDIT_COLUMNS = [
  {
    id: "created_at",
    label: "When",
    render: (row) => formatTimestamp(row.created_at),
  },
  { id: "action", label: "Action" },
  { id: "entity_type", label: "Entity" },
  { id: "entity_id", label: "Entity ID" },
  { id: "summary", label: "Summary" },
  {
    id: "actor_email",
    label: "Actor",
    render: (row) => row.actor_email || "system",
  },
  {
    id: "high_risk",
    label: "Risk",
    render: (row) =>
      row.high_risk ? (
        <StatusChip label="high" tone="danger" />
      ) : (
        <StatusChip label="standard" tone="neutral" />
      ),
  },
];

const ACCESS_COLUMNS = [
  { id: "name", label: "Administrator" },
  { id: "email", label: "Email" },
  { id: "groups", label: "Groups", render: (row) => (row.groups || []).join(", ") || "—" },
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
    render: (row) =>
      row.last_login
        ? `${formatTimestamp(row.last_login)} (${row.days_since_login}d)`
        : "Never",
  },
  {
    id: "flags",
    label: "Flags",
    render: (row) => (
      <div className="sec-console__flags">
        {(row.flags || []).length ? (
          row.flags.map((flag) => (
            <StatusChip
              key={flag}
              label={flag.replace(/_/g, " ")}
              tone={ACCESS_FLAG_TONES[flag] || "neutral"}
            />
          ))
        ) : (
          <StatusChip label="clean" tone="success" />
        )}
      </div>
    ),
  },
];

/**
 * Security Operations Center (Phase 11) — remote security supervision.
 *
 * Four read-only sections: posture KPIs, the administrative audit stream with
 * filters, the administrative access review, and the tracked outstanding-issues
 * register (PDF ID cards, secure QR verification, CSS-order build warnings,
 * migration state). Nothing here can change platform state.
 */
export default function SecurityOperationsCenter({ pathname: pathnameProp } = {}) {
  const pathname =
    pathnameProp ||
    (typeof window !== "undefined" ? window.location.pathname : "/admin/security");
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");

  const [audit, setAudit] = useState([]);
  const [auditMeta, setAuditMeta] = useState({ count: 0, page: 1, total_pages: 1 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilters, setAuditFilters] = useState({
    action: "",
    entity_type: "",
    date_from: "",
    date_to: "",
  });

  const [access, setAccess] = useState({ results: [], summary: null });
  const [accessError, setAccessError] = useState("");
  const [accessFlag, setAccessFlag] = useState("");

  const [issues, setIssues] = useState(null);
  const [issuesError, setIssuesError] = useState("");

  const loadOverview = useCallback(async () => {
    setOverviewError("");
    try {
      setOverview(await fetchSecurityOverview());
    } catch (err) {
      setOverviewError(err?.response?.data?.detail || "Could not load the security posture.");
      setOverview(null);
    }
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError("");
    try {
      const data = await fetchSecurityAuditStream({
        page: auditPage,
        page_size: PAGE_SIZE,
        search: auditSearch,
        action: auditFilters.action,
        entity_type: auditFilters.entity_type,
        date_from: auditFilters.date_from,
        date_to: auditFilters.date_to,
      });
      setAudit(data.results || []);
      setAuditMeta({
        count: data.count || 0,
        page: data.page || 1,
        total_pages: data.total_pages || 1,
      });
    } catch (err) {
      setAuditError(err?.response?.data?.detail || "Could not load the audit stream.");
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage, auditSearch, auditFilters]);

  const loadAccess = useCallback(async () => {
    setAccessError("");
    try {
      const data = await fetchSecurityAccessReview({ flag: accessFlag });
      setAccess({ results: data.results || [], summary: data.summary || null });
    } catch (err) {
      setAccessError(err?.response?.data?.detail || "Could not load the access review.");
      setAccess({ results: [], summary: null });
    }
  }, [accessFlag]);

  const loadIssues = useCallback(async () => {
    setIssuesError("");
    try {
      setIssues(await fetchOutstandingIssues());
    } catch (err) {
      setIssuesError(err?.response?.data?.detail || "Could not load the outstanding issues.");
      setIssues(null);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  useEffect(() => {
    loadAccess();
  }, [loadAccess]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  const overviewReady =
    overview &&
    overview.audit &&
    overview.administrators &&
    overview.fraud &&
    overview.delivery_verification;

  const overviewCards = overviewReady
    ? [
        { label: "Audit events (24h)", value: overview.audit.last_24h, hint: `${overview.audit.total} total` },
        { label: "High-risk actions (7d)", value: overview.audit.high_risk_last_7d },
        { label: "Administrators", value: overview.administrators.staff },
        { label: "Without strong auth", value: overview.administrators.without_totp, hint: "TOTP not confirmed" },
        { label: "Fraud flags", value: overview.fraud.total, hint: `${overview.fraud.open_last_7d} new in 7d` },
        {
          label: "Verification failures (24h)",
          value: overview.delivery_verification.failures_last_24h,
          hint: `${overview.delivery_verification.events_last_24h} events`,
        },
      ]
    : [];

  const auditFiltersNode = useMemo(
    () => (
      <div className="admin-filters">
        <label className="admin-filters__field">
          Action
          <select
            aria-label="Filter by action"
            value={auditFilters.action}
            onChange={(event) => {
              setAuditPage(1);
              setAuditFilters((prev) => ({ ...prev, action: event.target.value }));
            }}
          >
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filters__field">
          Entity
          <select
            aria-label="Filter by entity"
            value={auditFilters.entity_type}
            onChange={(event) => {
              setAuditPage(1);
              setAuditFilters((prev) => ({ ...prev, entity_type: event.target.value }));
            }}
          >
            {ENTITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filters__field">
          From
          <input
            type="date"
            aria-label="Filter from date"
            value={auditFilters.date_from}
            onChange={(event) => {
              setAuditPage(1);
              setAuditFilters((prev) => ({ ...prev, date_from: event.target.value }));
            }}
          />
        </label>
        <label className="admin-filters__field">
          To
          <input
            type="date"
            aria-label="Filter to date"
            value={auditFilters.date_to}
            onChange={(event) => {
              setAuditPage(1);
              setAuditFilters((prev) => ({ ...prev, date_to: event.target.value }));
            }}
          />
        </label>
      </div>
    ),
    [auditFilters]
  );


  return (
    <AdminShellPage pathname={pathname} title="Security Operations Center">
      <div className="sec-console">
        {overviewError ? (
          <AlertBanner tone="warning" title="Posture unavailable">
            {overviewError}
          </AlertBanner>
        ) : null}

        <div className="sec-console__kpis">
          {overviewCards.map((card) => (
            <KPICard key={card.label} label={card.label} value={card.value} hint={card.hint} />
          ))}
        </div>

        <AlertBanner tone="info" title="Read-only supervision">
          This console never changes platform state: no account action, no payment, no
          public activation. Founder/CEO protections remain enforced by the API.
        </AlertBanner>

        <section className="sec-console__section">
          <h3 className="sec-console__heading">Administrative audit stream</h3>
          <DataTable
            title="Audit events"
            columns={AUDIT_COLUMNS}
            rows={audit}
            rowKey="id"
            loading={auditLoading}
            error={auditError}
            emptyLabel="No audit events match these filters."
            serverMode
            searchValue={auditSearch}
            onSearchChange={(value) => {
              setAuditPage(1);
              setAuditSearch(value);
            }}
            searchPlaceholder="Search summary or entity id…"
            page={auditMeta.page}
            pageSize={PAGE_SIZE}
            total={auditMeta.count}
            onPageChange={setAuditPage}
            onRefresh={loadAudit}
            filters={auditFiltersNode}
          />
        </section>

        <section className="sec-console__section">
          <h3 className="sec-console__heading">Administrative access review</h3>
          <div className="admin-filters">
            <label className="admin-filters__field">
              Flag
              <select
                aria-label="Filter by access flag"
                value={accessFlag}
                onChange={(event) => setAccessFlag(event.target.value)}
              >
                {ACCESS_FLAG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {accessError ? <InlineError message={accessError} /> : null}
          {access.summary ? (
            <div className="sec-console__summary">
              <span>{access.summary.total} administrators</span>
              <span>{access.summary.protected} protected</span>
              <span>{access.summary.without_totp} without strong auth</span>
              <span>{access.summary.stale_login} stale login</span>
              <span>{access.summary.never_logged_in} never signed in</span>
            </div>
          ) : null}
          <DataTable
            title="Administrators"
            columns={ACCESS_COLUMNS}
            rows={access.results}
            rowKey="id"
            loading={false}
            error=""
            emptyLabel="No administrators match this flag."
            searchable={false}
          />
        </section>


        <section className="sec-console__section">
          <h3 className="sec-console__heading">Outstanding issues</h3>
          {issuesError ? <InlineError message={issuesError} /> : null}
          <div className="sec-console__issues">
            {(issues?.items || []).map((item) => (
              <article key={item.id} className="sec-console__issue">
                <header className="sec-console__issue-head">
                  <strong>{item.title}</strong>
                  <StatusChip
                    label={item.status.replace(/_/g, " ")}
                    tone={ISSUE_STATUS_TONES[item.status] || "neutral"}
                  />
                  <span className="sec-console__issue-severity">{item.severity}</span>
                </header>
                <p className="sec-console__issue-summary">{item.summary}</p>
                <p className="sec-console__issue-action">
                  <strong>Owner action:</strong> {item.owner_action}
                </p>
                {(item.checks || []).length ? (
                  <ul className="sec-console__checks">
                    {item.checks.map((check) => (
                      <li key={check.name}>
                        <span
                          className={
                            check.ok
                              ? "sec-console__check-state"
                              : "sec-console__check-state sec-console__check-state--attention"
                          }
                        >
                          {check.ok ? "pass" : "attention"}
                        </span>
                        <span className="sec-console__check-name">{check.name}</span>
                        <span className="sec-console__check-detail">{check.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
            {!issues && !issuesError ? (
              <p className="sec-console__muted">Loading outstanding issues…</p>
            ) : null}
          </div>
        </section>
      </div>
    </AdminShellPage>
  );
}

