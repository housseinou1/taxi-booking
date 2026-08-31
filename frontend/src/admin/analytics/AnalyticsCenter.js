import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BarChart,
  ChartSkeleton,
  DashboardSkeleton,
  DataTable,
  FilterBar,
  KPICard,
  RetryBlock,
  Select,
  useToast,
} from "../components/library";
import ProtectedActionButton from "../components/guards/ProtectedActionButton";
import { usePermissions } from "../permissions/PermissionContext";
import {
  REPORT_PRESETS,
  approvedMetricsCatalog,
  exportBiReport,
  fetchAnalyticsCenter,
  loadReportConfigs,
  saveReportConfig,
} from "./analyticsCenterApi";
import "../finance/FinanceDashboard.css";

function downloadBlob(response, filename) {
  const blob = new Blob([response.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function AnalyticsCenter() {
  const { canExport, cityId, canEdit } = usePermissions();
  const { push } = useToast();
  const abortRef = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("monthly");
  const [chartsReady, setChartsReady] = useState(false);
  const [loadMs, setLoadMs] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedMetrics, setSelectedMetrics] = useState(["gross_bookings", "net_revenue", "completed_rides"]);
  const [savedReports, setSavedReports] = useState(loadReportConfigs);

  const canWriteOps = canEdit("operations") || canEdit("finance");

  const load = useCallback(async () => {
    const reqId = ++abortRef.current;
    const started = performance.now();
    setLoading(true);
    try {
      setError("");
      const params = { period };
      if (cityId) params.city_id = cityId;
      const payload = await fetchAnalyticsCenter(params);
      if (reqId !== abortRef.current) return;
      setData(payload);
      setLoadMs(Math.round(performance.now() - started));
      setLastRefresh(new Date());
      setTimeout(() => setChartsReady(true), 50);
    } catch (err) {
      if (reqId !== abortRef.current) return;
      setError(err?.response?.data?.detail || err?.message || "Failed to load analytics center");
    } finally {
      if (reqId === abortRef.current) setLoading(false);
    }
  }, [cityId, period]);

  useEffect(() => {
    setChartsReady(false);
    load();
  }, [load]);

  const overview = data?.overview || {};
  const growth = data?.growth || {};
  const exec = overview.executive_analytics || growth.executive_kpis || {};
  const customers = data?.riders || overview.subject_areas?.customers || growth.customer_analytics || {};
  const drivers = data?.drivers || overview.subject_areas?.drivers || growth.driver_analytics || {};
  const ops = data?.ops || overview.subject_areas?.operations || {};
  const finance = data?.finance || overview.subject_areas?.finance || growth.financial_reports?.monthly || {};
  const quality = overview.data_quality || {};
  const governance = overview.data_governance || {};

  const freshness = overview.generated_at || growth.generated_at || quality.generated_at;
  const stale =
    freshness && Date.now() - new Date(freshness).getTime() > 15 * 60 * 1000
      ? "Dataset may be stale (>15m since generated_at)"
      : null;

  const overviewKpis = useMemo(
    () => [
      { id: "gross", label: "Gross bookings", value: exec.gmv_mru ?? exec.revenue_mru ?? finance.gross_revenue },
      { id: "net", label: "Net revenue", value: growth.executive_kpis?.net_revenue ?? finance.net_revenue },
      { id: "rides", label: "Completed rides", value: exec.completed_rides ?? growth.executive_kpis?.completed_trips },
      { id: "deliveries", label: "Completed deliveries", value: exec.completed_deliveries },
      { id: "riders", label: "Active riders", value: customers.active_riders ?? customers.active },
      { id: "drivers", label: "Active drivers", value: drivers.active_drivers ?? drivers.active },
      { id: "util", label: "Driver utilization", value: drivers.fleet_utilization_pct != null ? `${drivers.fleet_utilization_pct}%` : null },
      { id: "accept", label: "Acceptance rate", value: drivers.acceptance_rate_pct != null ? `${drivers.acceptance_rate_pct}%` : null },
      { id: "cancel", label: "Cancellation rate", value: growth.executive_kpis?.cancellation_rate_pct != null ? `${growth.executive_kpis.cancellation_rate_pct}%` : null },
      { id: "pickup", label: "Avg pickup / wait (min)", value: exec.avg_wait_time_minutes ?? ops.avg_wait_minutes },
      { id: "pay", label: "Payment success", value: finance.payment_success_rate_pct != null ? `${finance.payment_success_rate_pct}%` : null },
      { id: "ret", label: "Retention", value: customers.retention_30d_pct != null ? `${customers.retention_30d_pct}%` : exec.customer_retention_pct },
      { id: "churn", label: "Churn", value: customers.churn_pct != null ? `${customers.churn_pct}%` : null },
    ],
    [customers, drivers, exec, finance, growth, ops]
  );

  const demandSeries = useMemo(() => {
    const hours = growth.geographic_insights?.peak_demand_hours || overview.predictive_analytics?.demand_forecast?.peak_hours || [];
    return hours.map((h) => ({
      label: String(h.hour ?? h.label ?? h),
      value: Number(h.demand ?? h.count ?? h.value ?? 0),
    }));
  }, [growth, overview]);

  const exportReport = async (reportType, format) => {
    try {
      const response = await exportBiReport(reportType, format, { period, city_id: cityId || undefined });
      downloadBlob(response, `${reportType}.${format === "xlsx" ? "xlsx" : format}`);
      push({ tone: "success", title: "Export ready" });
    } catch (err) {
      push({ tone: "danger", title: "Export failed", message: err?.response?.data?.detail || err?.message });
    }
  };

  const persistReport = () => {
    const name = window.prompt("Report name");
    if (!name) return;
    const next = saveReportConfig({
      name,
      period,
      cityId: cityId || null,
      metrics: selectedMetrics,
    });
    setSavedReports(next);
    push({ tone: "success", title: "Report configuration saved locally" });
  };

  if (loading && !data) {
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
          <h1 className="fin-dash__title">Analytics Center</h1>
          <p className="fin-dash__subtitle">
            Platform metrics, cohorts, and approved exports
            {lastRefresh ? ` · UI refreshed ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="fin-dash__header-actions">
          <Select
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "quarterly", label: "Quarterly" },
            ]}
          />
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={load}>
            Refresh
          </button>
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/bi">
            BI Warehouse
          </a>
        </div>
      </header>

      {stale ? <p className="fin-dash__warn">{stale}</p> : null}
      {error ? <RetryBlock message={error} onRetry={load} /> : null}

      <section className="fin-dash__panel">
        <h2>Data quality</h2>
        <p className="fin-dash__hint">
          Last successful refresh: {freshness || "—"} · Time zone: Africa/Nouakchott (platform default) · Currency: MRU
        </p>
        <p className="fin-dash__hint">
          Source: BI warehouse aggregations · Access: {(governance.access_roles || []).join(", ") || "Analytics roles"} · Incomplete fields shown as —
        </p>
        {quality?.issues?.length ? (
          <ul>
            {quality.issues.map((issue, idx) => (
              <li key={idx}>{typeof issue === "string" ? issue : issue.message || JSON.stringify(issue)}</li>
            ))}
          </ul>
        ) : (
          <p>No failed aggregation warnings returned.</p>
        )}
      </section>

      <section className="fin-dash__kpi-grid">
        {overviewKpis.map((kpi) => (
          <KPICard key={kpi.id} label={kpi.label} value={kpi.value == null ? "—" : kpi.value} />
        ))}
      </section>

      <section className="fin-dash__panel">
        <h2>Rider analytics</h2>
        <div className="fin-dash__kpi-grid">
          <KPICard label="New riders" value={customers.new_riders_period ?? customers.new_period ?? "—"} />
          <KPICard label="Activated" value={customers.active_riders ?? "—"} />
          <KPICard label="Returning" value={customers.returning_riders ?? "—"} />
          <KPICard label="Retention 7d" value={customers.retention_7d_pct != null ? `${customers.retention_7d_pct}%` : "—"} />
          <KPICard label="Retention 30d" value={customers.retention_30d_pct != null ? `${customers.retention_30d_pct}%` : "—"} />
          <KPICard label="Loyalty members" value={customers.loyalty_members ?? "—"} />
        </div>
      </section>

      <section className="fin-dash__panel">
        <h2>Driver analytics</h2>
        <div className="fin-dash__kpi-grid">
          <KPICard label="Total drivers" value={drivers.total_drivers ?? "—"} />
          <KPICard label="Active / online" value={drivers.active_drivers ?? "—"} />
          <KPICard label="Acceptance" value={drivers.acceptance_rate_pct != null ? `${drivers.acceptance_rate_pct}%` : "—"} />
          <KPICard label="Avg rating" value={drivers.average_rating ?? "—"} />
          <KPICard label="Earnings" value={drivers.driver_earnings_mru ?? "—"} />
          <KPICard label="Utilization" value={drivers.fleet_utilization_pct != null ? `${drivers.fleet_utilization_pct}%` : "—"} />
        </div>
      </section>

      <section className="fin-dash__panel">
        <h2>Operations analytics</h2>
        {!chartsReady ? (
          <ChartSkeleton />
        ) : (
          <BarChart title="Demand by hour (when available)" data={demandSeries} />
        )}
        <div className="fin-dash__kpi-grid" style={{ marginTop: 12 }}>
          <KPICard label="Completion rate" value={growth.executive_kpis?.completion_rate_pct != null ? `${growth.executive_kpis.completion_rate_pct}%` : "—"} />
          <KPICard label="Cancellation rate" value={growth.executive_kpis?.cancellation_rate_pct != null ? `${growth.executive_kpis.cancellation_rate_pct}%` : "—"} />
          <KPICard label="Avg wait (min)" value={exec.avg_wait_time_minutes ?? "—"} />
        </div>
      </section>

      <section className="fin-dash__panel">
        <h2>Financial analytics (read-only)</h2>
        <div className="fin-dash__kpi-grid">
          <KPICard label="Gross revenue" value={finance.gross_revenue ?? growth.executive_kpis?.gross_revenue ?? "—"} />
          <KPICard label="Net revenue" value={finance.net_revenue ?? growth.executive_kpis?.net_revenue ?? "—"} />
          <KPICard label="Commission" value={finance.platform_commission ?? growth.executive_kpis?.commission_revenue ?? "—"} />
          <KPICard label="Refund rate" value={finance.refund_rate_pct != null ? `${finance.refund_rate_pct}%` : "—"} />
        </div>
        {canWriteOps ? (
          <p className="fin-dash__warn">You also have write roles elsewhere — this center remains read-only for analytics exports.</p>
        ) : (
          <p className="fin-dash__hint">Analytics users cannot approve refunds, payouts, or mutate operational records from this page.</p>
        )}
      </section>

      <section className="fin-dash__panel">
        <div className="fin-dash__panel-head">
          <h2>Report builder</h2>
          <ProtectedActionButton module="analytics" onClick={persistReport}>
            Save configuration
          </ProtectedActionButton>
        </div>
        <FilterBar>
          {approvedMetricsCatalog().map((metric) => (
            <label key={metric.id} className="fin-dash__check">
              <input
                type="checkbox"
                checked={selectedMetrics.includes(metric.id)}
                onChange={(e) => {
                  setSelectedMetrics((prev) =>
                    e.target.checked ? [...prev, metric.id] : prev.filter((id) => id !== metric.id)
                  );
                }}
              />
              {metric.label}
            </label>
          ))}
        </FilterBar>
        <p className="fin-dash__hint">Only approved BI report types can be exported — arbitrary SQL is not available.</p>
        <div className="fin-dash__row-actions">
          {REPORT_PRESETS.map((preset) => (
            <React.Fragment key={preset.id}>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport(preset.reportType, "csv")}>
                {preset.label} CSV
              </button>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport(preset.reportType, "xlsx")}>
                Excel
              </button>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => exportReport(preset.reportType, "pdf")}>
                PDF
              </button>
            </React.Fragment>
          ))}
        </div>
        {!canExport?.("analytics") && !canExport?.("reports") ? (
          <p className="fin-dash__hint">Export permission is enforced by BI endpoints and AdminActionGuard where wired.</p>
        ) : null}
        <DataTable
          title="Saved report configs (local)"
          columns={[
            { id: "name", label: "Name" },
            { id: "period", label: "Period" },
            { id: "metrics", label: "Metrics", render: (r) => (r.metrics || []).join(", ") },
            { id: "savedAt", label: "Saved" },
          ]}
          rows={savedReports}
          searchable={false}
        />
      </section>
    </div>
  );
}
