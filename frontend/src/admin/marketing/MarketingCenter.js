import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ConfirmationDialog,
  DashboardSkeleton,
  DataTable,
  FilterBar,
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
  AUDIENCES,
  CAMPAIGN_STATUSES,
  CHANNELS,
  createCampaign,
  createPromo,
  fetchCampaigns,
  fetchMarketingDashboard,
  updateCampaign,
} from "./marketingCenterApi";
import "../finance/FinanceDashboard.css";

export default function MarketingCenter() {
  const { canEdit, cityId } = usePermissions();
  const { push } = useToast();
  const submittingRef = useRef(false);
  const [dash, setDash] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [byStatus, setByStatus] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadMs, setLoadMs] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [draft, setDraft] = useState({
    name: "",
    channel: "push",
    audience: "all_riders",
    subject: "",
    message: "",
    city_id: cityId || "",
  });
  const [promo, setPromo] = useState({
    code: "",
    discount_type: "percentage",
    discount_value: 10,
    max_total_uses: 100,
    max_per_rider_uses: 1,
    min_fare: 0,
    first_ride_only: false,
    city_id: cityId || "",
  });

  const canManage = canEdit("marketing") || canEdit("growth");

  const load = useCallback(async () => {
    const started = performance.now();
    setLoading(true);
    try {
      setError("");
      const params = cityId ? { city: cityId, city_id: cityId } : {};
      const [marketing, listed] = await Promise.all([
        fetchMarketingDashboard(params),
        fetchCampaigns({ status: statusFilter || undefined, page, page_size: 25, ...params }),
      ]);
      setDash(marketing);
      setCampaigns(listed.campaigns || []);
      setByStatus(listed.by_status || {});
      setTotal(listed.total || 0);
      setLoadMs(Math.round(performance.now() - started));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load marketing center");
    } finally {
      setLoading(false);
    }
  }, [cityId, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const growth = dash?.growth || {};
  const summary = growth.summary || growth.analytics || {};
  const launchMarketing = dash?.launch?.marketing || {};

  const kpis = useMemo(
    () => [
      { id: "new", label: "New riders", value: summary.new_riders_30d ?? launchMarketing.new_riders },
      { id: "activated", label: "Activated riders", value: summary.activated_riders ?? summary.active_riders },
      { id: "first", label: "First rides", value: summary.first_rides_30d ?? summary.first_ride_conversions },
      { id: "repeat", label: "Repeat riders", value: summary.repeat_riders },
      { id: "referral", label: "Referral conversions", value: summary.referral_conversions_30d ?? growth.referrals?.analytics?.conversions },
      { id: "promo", label: "Promo redemptions", value: summary.promo_redemptions_30d ?? growth.promotions?.redemptions_30d },
      { id: "spend", label: "Campaign spend", value: growth.finance?.campaign_spending_30d ?? summary.campaign_spend, format: "currency", hint: "If available" },
      { id: "cac", label: "CAC", value: summary.customer_acquisition_cost_estimate ?? launchMarketing.cac, hint: "Estimate only if backend provides" },
      { id: "retention", label: "Retention", value: summary.retention_rate_pct != null ? `${summary.retention_rate_pct}%` : null },
      { id: "churn", label: "Churn", value: summary.churn_rate_pct != null ? `${summary.churn_rate_pct}%` : null },
      { id: "influenced", label: "Revenue influenced", value: summary.revenue_influenced ?? growth.finance?.promo_cost_30d },
      { id: "active_promos", label: "Active promotions", value: growth.promotions?.active ?? summary.active_promos },
    ],
    [growth, launchMarketing, summary]
  );

  const createDraft = async () => {
    if (submittingRef.current || !draft.name.trim()) return;
    submittingRef.current = true;
    try {
      await createCampaign({
        ...draft,
        status: "draft",
        city_id: draft.city_id || cityId || null,
      });
      push({ tone: "success", title: "Draft created" });
      setDraft((d) => ({ ...d, name: "", subject: "", message: "" }));
      await load();
    } catch (err) {
      push({ tone: "danger", title: "Create failed", message: err?.response?.data?.detail || err?.message });
    } finally {
      submittingRef.current = false;
    }
  };

  const createPromoCode = async () => {
    if (submittingRef.current || !promo.code.trim()) return;
    submittingRef.current = true;
    try {
      await createPromo({
        ...promo,
        city_id: promo.city_id || cityId || null,
      });
      push({ tone: "success", title: "Promo created" });
      setPromo((p) => ({ ...p, code: "" }));
      await load();
    } catch (err) {
      push({ tone: "danger", title: "Promo failed", message: err?.response?.data?.detail || err?.message });
    } finally {
      submittingRef.current = false;
    }
  };

  const runConfirm = async () => {
    if (!confirm || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await updateCampaign(confirm.id, confirm.payload);
      push({ tone: "success", title: "Campaign updated", message: confirm.label });
      setConfirm(null);
      await load();
    } catch (err) {
      push({ tone: "danger", title: "Update failed", message: err?.response?.data?.detail || err?.message });
    } finally {
      submittingRef.current = false;
    }
  };

  const columns = [
    { id: "name", label: "Name" },
    { id: "channel", label: "Channel" },
    { id: "audience", label: "Audience" },
    { id: "city_id", label: "City", render: (r) => r.city_id || "All" },
    {
      id: "status",
      label: "Status",
      render: (r) => <StatusChip label={r.status} tone={r.status === "active" ? "success" : r.status === "paused" ? "warning" : "neutral"} />,
    },
    { id: "scheduled_at", label: "Start", render: (r) => formatTimestamp(r.scheduled_at) || "—" },
    { id: "owner_email", label: "Owner", render: (r) => r.owner_email || "—" },
    {
      id: "perf",
      label: "Sent / Redeemed",
      render: (r) => `${r.sent ?? r.metrics?.sent ?? "—"} / ${r.redeemed ?? r.metrics?.redeemed ?? "—"}`,
    },
  ];

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
          <h1 className="fin-dash__title">Marketing Center</h1>
          <p className="fin-dash__subtitle">
            Campaigns, promotions, audiences, and performance
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="fin-dash__header-actions">
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
            Refresh
          </button>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/launch-growth">
            Launch Growth
          </a>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/customer-growth">
            Customer Growth
          </a>
        </div>
      </header>

      {error ? <RetryBlock message={error} onRetry={load} /> : null}

      <section className="fin-dash__kpi-grid">
        {kpis.map((kpi) => (
          <KPICard key={kpi.id} label={kpi.label} value={kpi.value == null ? "—" : kpi.value} subtitle={kpi.hint} />
        ))}
      </section>

      <section className="fin-dash__panel">
        <div className="fin-dash__panel-head">
          <h2>Campaign pipeline</h2>
          <div className="fin-dash__row-actions">
            {CAMPAIGN_STATUSES.map((s) => (
              <StatusChip key={s} label={`${s}: ${byStatus[s] ?? 0}`} />
            ))}
          </div>
        </div>
        <FilterBar onReset={() => setStatusFilter("")}>
          <Select
            label="Status"
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[{ value: "", label: "All" }, ...CAMPAIGN_STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </FilterBar>
        <DataTable
          title="Campaigns"
          columns={columns}
          rows={campaigns}
          loading={loading}
          serverMode
          page={page}
          pageSize={25}
          total={total}
          onPageChange={setPage}
          onRefresh={load}
          rowActions={(row) => (
            <div className="fin-dash__row-actions">
              <ProtectedActionButton
                module="marketing"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canManage}
                onClick={() =>
                  setConfirm({
                    id: row.id,
                    label: `Schedule ${row.name}`,
                    payload: { action: "schedule", scheduled_at: new Date(Date.now() + 3600000).toISOString() },
                  })
                }
              >
                Schedule
              </ProtectedActionButton>
              <ProtectedActionButton
                module="marketing"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canManage}
                onClick={() => setConfirm({ id: row.id, label: `Pause ${row.name}`, payload: { action: "pause" } })}
              >
                Pause
              </ProtectedActionButton>
              <ProtectedActionButton
                module="marketing"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canManage}
                onClick={() => setConfirm({ id: row.id, label: `Resume ${row.name}`, payload: { action: "resume" } })}
              >
                Resume
              </ProtectedActionButton>
              <ProtectedActionButton
                module="marketing"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canManage}
                onClick={() => setConfirm({ id: row.id, label: `Cancel ${row.name}`, payload: { action: "cancel" } })}
              >
                Cancel
              </ProtectedActionButton>
              <ProtectedActionButton
                module="marketing"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canManage}
                onClick={() => setConfirm({ id: row.id, label: `Duplicate ${row.name}`, payload: { action: "duplicate" } })}
              >
                Duplicate
              </ProtectedActionButton>
            </div>
          )}
        />
      </section>

      <section className="fin-dash__panel">
        <h2>Create campaign draft</h2>
        <div className="fin-dash__form-grid">
          <input className="admin-lib-input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select label="Channel" value={draft.channel} onChange={(v) => setDraft({ ...draft, channel: v })} options={CHANNELS} />
          <Select label="Audience" value={draft.audience} onChange={(v) => setDraft({ ...draft, audience: v })} options={AUDIENCES} />
          <input className="admin-lib-input" placeholder="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <textarea className="admin-lib-input" rows={3} placeholder="Message" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
          <ProtectedActionButton module="marketing" disabled={!canManage} onClick={createDraft}>
            Create draft
          </ProtectedActionButton>
        </div>
        <p className="fin-dash__hint">SMS channel is not offered unless backend SMS delivery exists. Delivery is never marked successful without API confirmation.</p>
      </section>

      <section className="fin-dash__panel">
        <h2>Promotion management</h2>
        <div className="fin-dash__form-grid">
          <input className="admin-lib-input" placeholder="Promo code" value={promo.code} onChange={(e) => setPromo({ ...promo, code: e.target.value.toUpperCase() })} />
          <Select
            label="Discount type"
            value={promo.discount_type}
            onChange={(v) => setPromo({ ...promo, discount_type: v })}
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "fixed", label: "Fixed" },
            ]}
          />
          <input
            className="admin-lib-input"
            type="number"
            placeholder="Value"
            value={promo.discount_value}
            onChange={(e) => setPromo({ ...promo, discount_value: Number(e.target.value) })}
          />
          <input
            className="admin-lib-input"
            type="number"
            placeholder="Max total uses"
            value={promo.max_total_uses}
            onChange={(e) => setPromo({ ...promo, max_total_uses: Number(e.target.value) })}
          />
          <input
            className="admin-lib-input"
            type="number"
            placeholder="Per-user limit"
            value={promo.max_per_rider_uses}
            onChange={(e) => setPromo({ ...promo, max_per_rider_uses: Number(e.target.value) })}
          />
          <label className="fin-dash__check">
            <input type="checkbox" checked={promo.first_ride_only} onChange={(e) => setPromo({ ...promo, first_ride_only: e.target.checked })} />
            First-ride only
          </label>
          <ProtectedActionButton module="marketing" disabled={!canManage} onClick={createPromoCode}>
            Create promo
          </ProtectedActionButton>
        </div>
        <p className="fin-dash__hint">Eligibility and discount amounts remain backend-authoritative. Driver incentives require separate authorization surfaces.</p>
      </section>

      <section className="fin-dash__panel">
        <h2>Audience segments</h2>
        <ul>
          <li>New users / inactive / frequent / high-value riders (from growth APIs)</li>
          <li>Riders by city / service</li>
          <li>Failed payment users (when present in growth payloads)</li>
          <li>Referral users</li>
          <li>Drivers with expiring documents — campaign targeting only where Marketing policy allows</li>
        </ul>
        <p className="fin-dash__hint">Raw personal data is not listed here beyond role permissions.</p>
      </section>

      <ConfirmationDialog open={Boolean(confirm)} title={confirm?.label || "Confirm"} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
    </div>
  );
}
