import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ConfirmationDialog,
  DashboardSkeleton,
  DataTable,
  Drawer,
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
  APP_OPTIONS,
  CATEGORY_OPTIONS,
  LOST_PROPERTY_STATUSES,
  QUEUE_TABS,
  SAVED_REPLY_TEMPLATES,
  SEVERITY_OPTIONS,
  STATUS_OPTIONS,
  bulkAssignTickets,
  fetchSupportList,
  fetchSupportTicket,
  ticketsToCsv,
  updateSupportTicket,
} from "./supportCenterApi";
import "../finance/FinanceDashboard.css";

const SAVED_VIEWS_KEY = "yala.support.savedViews";

function loadSavedViews() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function SupportCenter() {
  const { canEdit, canExport } = usePermissions();
  const { push } = useToast();
  const abortRef = useRef(null);
  const submittingRef = useRef(false);

  const [dashboard, setDashboard] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadMs, setLoadMs] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    queue: "open",
    app: "",
    category: "",
    severity: "",
    owner_id: "",
    sort: "sla",
  });
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [lang, setLang] = useState("en");
  const [confirm, setConfirm] = useState(null);
  const [bulkOwnerId, setBulkOwnerId] = useState("");
  const [savedViews, setSavedViews] = useState(loadSavedViews);

  const canManage = canEdit("support") || canEdit("operations");

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort?.();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    abortRef.current = controller;
    const started = performance.now();
    setLoading(true);
    try {
      setError("");
      const params = {
        page,
        page_size: pageSize,
        queue: filters.queue || undefined,
        app: filters.app || undefined,
        category: filters.category || undefined,
        priority: filters.severity || undefined,
        owner_id: filters.owner_id || undefined,
        search: search || undefined,
        sort: filters.sort || undefined,
      };
      const response = await fetchSupportList(params);
      if (controller?.signal?.aborted) return;
      const data = response.data;
      setDashboard(data.dashboard || null);
      setTickets(data.tickets || data.reports || []);
      setTotal(data.total ?? (data.tickets || data.reports || []).length);
      setLoadMs(Math.round(performance.now() - started));
      setLastRefresh(new Date());
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
      setError(err?.response?.data?.detail || err?.message || "Failed to load support center");
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, search]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort?.();
  }, [load]);

  const kpis = useMemo(() => {
    const d = dashboard || {};
    return [
      { id: "open", label: "Open tickets", value: d.open_tickets ?? d.open_reports },
      { id: "new", label: "New today", value: d.new_tickets_today },
      { id: "await", label: "Awaiting reply", value: d.awaiting_reply },
      { id: "esc", label: "Escalated", value: d.escalated_tickets, tone: "warning" },
      { id: "safety", label: "Critical safety", value: d.critical_safety_tickets, tone: "danger" },
      { id: "frt", label: "Avg first response (h)", value: d.average_response_hours },
      { id: "res", label: "Avg resolution (h)", value: d.average_resolution_hours },
      { id: "sla", label: "SLA breaches", value: d.sla_breaches, tone: "danger" },
      { id: "reopen", label: "Reopened", value: d.reopened_tickets },
      {
        id: "csat",
        label: "CSAT",
        value: d.customer_satisfaction_score,
        hint: d.customer_satisfaction_score == null ? "Not available from backend" : null,
      },
    ];
  }, [dashboard]);

  const openTicket = async (row) => {
    try {
      const response = await fetchSupportTicket(row.id);
      setDetail(response.data);
      setDetailOpen(true);
      setReply("");
      setInternalNote("");
    } catch (err) {
      push({ tone: "danger", title: "Load failed", message: err?.message });
    }
  };

  const runTicketAction = async (payload, successLabel) => {
    if (!detail || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const response = await updateSupportTicket(detail.id, payload);
      setDetail(response.data);
      push({ tone: "success", title: "Saved", message: successLabel });
      await load();
    } catch (err) {
      push({
        tone: "danger",
        title: "Action failed",
        message: err?.response?.data?.detail || err?.message,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const exportCsv = () => {
    if (!canExport?.("support") && !canExport?.("reports")) {
      push({ tone: "warning", title: "Export not permitted" });
      return;
    }
    const csv = ticketsToCsv(tickets);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `support-tickets-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveView = () => {
    const name = window.prompt("Saved view name");
    if (!name) return;
    const next = [{ name, filters: { ...filters, search }, savedAt: new Date().toISOString() }, ...savedViews].slice(0, 12);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    setSavedViews(next);
  };

  const columns = [
    { id: "reference", label: "Ticket", sortable: true },
    {
      id: "customer",
      label: "Customer",
      render: (row) => row.user_name || row.user_email || row.user_id,
    },
    { id: "customer_type", label: "Type", render: (row) => row.customer_type || row.app_type },
    {
      id: "ref",
      label: "Ride / Delivery",
      render: (row) => row.ride_id || row.delivery_id || "—",
    },
    { id: "category", label: "Category" },
    {
      id: "priority",
      label: "Priority",
      render: (row) => <StatusChip tone={row.severity === "P0" ? "danger" : row.severity === "P1" ? "warning" : "neutral"} label={row.severity || row.priority} />,
    },
    { id: "status", label: "Status" },
    { id: "owner_email", label: "Agent", render: (row) => row.owner_email || "Unassigned" },
    { id: "created_at", label: "Created", render: (row) => formatTimestamp(row.created_at) },
    {
      id: "sla_resolution_due",
      label: "SLA deadline",
      render: (row) => (
        <span className={row.sla_breached ? "fin-dash__danger" : row.sla_warning ? "fin-dash__warn" : ""}>
          {formatTimestamp(row.sla_resolution_due) || "—"}
        </span>
      ),
    },
    { id: "updated_at", label: "Last update", render: (row) => formatTimestamp(row.updated_at) },
  ];

  if (loading && !dashboard) {
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
          <h1 className="fin-dash__title">Customer Support Center</h1>
          <p className="fin-dash__subtitle">
            Tickets, SLA, lost property, and agent workspace
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="fin-dash__header-actions">
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
            Refresh
          </button>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={saveView}>
            Save view
          </button>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={exportCsv}>
            Export page CSV
          </button>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/support">
            Legacy Support Console
          </a>
        </div>
      </header>

      {error ? (
        <RetryBlock message={error} onRetry={load} />
      ) : (
        <>
          <section className="fin-dash__kpi-grid">
            {kpis.map((kpi) => (
              <KPICard
                key={kpi.id}
                label={kpi.label}
                value={kpi.value == null ? "—" : kpi.value}
                tone={kpi.tone}
                subtitle={kpi.hint}
              />
            ))}
          </section>

          <section className="fin-dash__panel">
            <FilterBar
              onReset={() => {
                setFilters({ queue: "open", app: "", category: "", severity: "", owner_id: "", sort: "sla" });
                setSearch("");
                setPage(1);
              }}
            >
              <Select
                label="Queue"
                value={filters.queue}
                onChange={(v) => {
                  setFilters((f) => ({ ...f, queue: v }));
                  setPage(1);
                }}
                options={QUEUE_TABS.map((q) => ({ value: q, label: q }))}
              />
              <Select
                label="Customer type"
                value={filters.app}
                onChange={(v) => setFilters((f) => ({ ...f, app: v }))}
                options={[{ value: "", label: "All" }, ...APP_OPTIONS]}
              />
              <Select
                label="Category"
                value={filters.category}
                onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
                options={[{ value: "", label: "All" }, ...CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))]}
              />
              <Select
                label="Priority"
                value={filters.severity}
                onChange={(v) => setFilters((f) => ({ ...f, severity: v }))}
                options={[{ value: "", label: "All" }, ...SEVERITY_OPTIONS.map((s) => ({ value: s, label: s }))]}
              />
              <Select
                label="Sort"
                value={filters.sort}
                onChange={(v) => setFilters((f) => ({ ...f, sort: v }))}
                options={[
                  { value: "sla", label: "SLA deadline" },
                  { value: "newest", label: "Newest" },
                ]}
              />
              {savedViews.length ? (
                <Select
                  label="Saved view"
                  value=""
                  onChange={(name) => {
                    const view = savedViews.find((v) => v.name === name);
                    if (!view) return;
                    setFilters({ ...view.filters, search: undefined });
                    setSearch(view.filters.search || "");
                    setPage(1);
                  }}
                  options={[{ value: "", label: "Apply…" }, ...savedViews.map((v) => ({ value: v.name, label: v.name }))]}
                />
              ) : null}
            </FilterBar>
          </section>

          <section className="fin-dash__panel">
            <div className="fin-dash__panel-head">
              <h2>Unified ticket inbox</h2>
              <div className="fin-dash__row-actions">
                <input
                  className="admin-lib-input"
                  placeholder="Owner user id for bulk assign"
                  value={bulkOwnerId}
                  onChange={(e) => setBulkOwnerId(e.target.value)}
                />
              </div>
            </div>
            <DataTable
              title="Tickets"
              columns={columns}
              rows={tickets}
              loading={loading}
              error={error}
              serverMode
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              searchValue={search}
              onSearchChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              onRefresh={load}
              bulkActions={(ids) => (
                <ProtectedActionButton
                  module="support"
                  disabled={!canManage || !ids.length}
                  onClick={() =>
                    setConfirm({
                      type: "bulk_assign",
                      label: `Assign ${ids.length} tickets`,
                      ids,
                    })
                  }
                >
                  Assign selected
                </ProtectedActionButton>
              )}
              rowActions={(row) => (
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => openTicket(row)}>
                  Open
                </button>
              )}
            />
          </section>
        </>
      )}

      <Drawer open={detailOpen} title={detail?.reference || "Ticket"} onClose={() => setDetailOpen(false)}>
        {!detail ? (
          <InlineError message="No ticket selected" />
        ) : (
          <div className="fin-dash__drawer">
            {(detail.sla_warning || detail.sla_breached) && (
              <p className={detail.sla_breached ? "fin-dash__danger" : "fin-dash__warn"}>
                {detail.sla_breached ? "SLA breached — escalate if needed." : "SLA warning — respond soon."}
              </p>
            )}
            <p>
              <strong>{detail.subject || detail.category}</strong> · {detail.status} · {detail.severity}
            </p>
            <p className="fin-dash__hint">
              Customer: {detail.user_name || detail.user_email} ({detail.customer_type || detail.app_type})
              {detail.ride_id ? ` · Ride #${detail.ride_id}` : ""}
              {detail.delivery_id ? ` · Delivery #${detail.delivery_id}` : ""}
            </p>
            <p>{detail.description}</p>

            <h3>Conversation</h3>
            <ul className="fin-dash__timeline">
              {(detail.conversation || []).map((entry, idx) => (
                <li key={`${entry.at}-${idx}`}>
                  <StatusChip label={entry.type} /> {entry.actor_email} · {formatTimestamp(entry.at)}
                  <div>{entry.body}</div>
                  {entry.delivery_status ? <small>Delivery: {entry.delivery_status}</small> : null}
                </li>
              ))}
              {!detail.conversation?.length ? <li>No messages yet</li> : null}
            </ul>

            <h3>Internal notes</h3>
            <pre className="fin-dash__pre">{detail.internal_notes || "—"}</pre>

            {detail.category === "lost_property" ? (
              <>
                <h3>Lost property</h3>
                <Select
                  label="Return status"
                  value={detail.lost_property_status || "reported"}
                  onChange={(v) => runTicketAction({ lost_property_status: v, action: "lost_property" }, "Lost property updated")}
                  options={LOST_PROPERTY_STATUSES.map((s) => ({ value: s, label: s }))}
                />
              </>
            ) : null}

            <h3>Reply</h3>
            <Select
              label="Template language"
              value={lang}
              onChange={setLang}
              options={[
                { value: "en", label: "English" },
                { value: "fr", label: "French" },
                { value: "ar", label: "Arabic" },
              ]}
            />
            <Select
              label="Saved reply"
              value=""
              onChange={(id) => {
                const tpl = (SAVED_REPLY_TEMPLATES[lang] || []).find((t) => t.id === id);
                if (tpl) setReply(tpl.body);
              }}
              options={[{ value: "", label: "Insert…" }, ...(SAVED_REPLY_TEMPLATES[lang] || []).map((t) => ({ value: t.id, label: t.label }))]}
            />
            <textarea className="admin-lib-input" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Customer-facing reply" />
            <ProtectedActionButton
              module="support"
              disabled={!canManage || !reply.trim()}
              onClick={() => runTicketAction({ reply, channel: "in_app", action: "reply" }, "Reply recorded (await backend delivery confirmation)")}
            >
              Send reply
            </ProtectedActionButton>

            <h3>Internal note</h3>
            <textarea className="admin-lib-input" rows={2} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
            <ProtectedActionButton
              module="support"
              disabled={!canManage || !internalNote.trim()}
              onClick={() => runTicketAction({ internal_note: internalNote, action: "internal_note" }, "Note added")}
            >
              Add note
            </ProtectedActionButton>

            <h3>Actions</h3>
            <div className="fin-dash__row-actions">
              <Select
                label="Priority"
                value={detail.severity}
                onChange={(v) => runTicketAction({ severity: v }, "Priority updated")}
                options={SEVERITY_OPTIONS.map((s) => ({ value: s, label: s }))}
              />
              <Select
                label="Status"
                value={detail.status}
                onChange={(v) => runTicketAction({ status: v }, "Status updated")}
                options={STATUS_OPTIONS}
              />
              <ProtectedActionButton module="support" onClick={() => runTicketAction({ action: "escalate", escalated_to: "operations", reason: "Agent escalation" }, "Escalated")}>
                Escalate
              </ProtectedActionButton>
              <ProtectedActionButton module="support" onClick={() => runTicketAction({ action: "request_finance_review", reason: "Finance review requested" }, "Finance review requested")}>
                Request Finance
              </ProtectedActionButton>
              <ProtectedActionButton module="support" onClick={() => runTicketAction({ action: "request_operations_review", reason: "Ops review requested" }, "Ops review requested")}>
                Request Ops
              </ProtectedActionButton>
              <ProtectedActionButton module="support" onClick={() => runTicketAction({ action: "request_driver_ops_review", reason: "Driver ops review requested" }, "Driver Ops review requested")}>
                Request Driver Ops
              </ProtectedActionButton>
              <ProtectedActionButton
                module="support"
                onClick={() =>
                  runTicketAction({ status: "resolved", resolution_code: "resolved_standard", action: "resolve" }, "Resolved")
                }
              >
                Resolve
              </ProtectedActionButton>
              <ProtectedActionButton module="support" onClick={() => runTicketAction({ action: "reopen", reason: "Reopened by agent" }, "Reopened")}>
                Reopen
              </ProtectedActionButton>
            </div>
            <p className="fin-dash__hint">Refunds, suspensions, and ledger changes are not available here — escalate to Finance / Ops / Driver Ops.</p>
          </div>
        )}
      </Drawer>

      <ConfirmationDialog
        open={Boolean(confirm)}
        title={confirm?.label || "Confirm"}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            if (confirm?.type === "bulk_assign") {
              await bulkAssignTickets(confirm.ids || [], bulkOwnerId ? Number(bulkOwnerId) : null);
              push({ tone: "success", title: "Assigned" });
              await load();
            }
          } catch (err) {
            push({ tone: "danger", title: "Failed", message: err?.response?.data?.detail || err?.message });
          } finally {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
