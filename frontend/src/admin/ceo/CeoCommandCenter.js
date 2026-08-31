import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityFeed,
  AlertBanner,
  ApprovalCard,
  ApprovalQueue,
  AuditTimeline,
  BarChart,
  DashboardSkeleton,
  DataTable,
  ExportMenu,
  InlineError,
  KPICard,
  KPITrendCard,
  LineChart,
  LiveMap,
  DriverMarker,
  RideMarker,
  DeliveryMarker,
  HeatmapOverlay,
  MapLegend,
  MapToolbar,
  MapFilters,
  PercentageIndicator,
  RetryBlock,
  Select,
  StatusChip,
  SuccessBanner,
  useToast,
  formatCurrency,
} from "../components/library";
import { API_URL } from "../../apiConfig";
import { usePermissions } from "../permissions/PermissionContext";
import { approveWithdrawal, rejectWithdrawal } from "../executive/executiveApi";
import { ceoMasterReportUrl, postCeoApproveOnboarding } from "./ceoMasterApi";
import {
  buildActivityFeed,
  buildExecutiveAlerts,
  buildKpiDefinitions,
  formatExportSummaryRows,
  mapChartSeries,
} from "./ceoDashboardMappers";
import { useCeoDashboardData } from "./useCeoDashboardData";
import "./CeoCommandCenter.css";

const LazyAreaChart = lazy(() =>
  import("../components/library/charts/ChartComponents").then((m) => ({ default: m.AreaChart }))
);

function useLazySection() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible };
}

const QUICK_ACTIONS = [
  { label: "Operations Center", href: "/admin/ops-control" },
  { label: "Finance", href: "/admin/finance-ops" },
  { label: "Driver Operations", href: "/admin/fleet" },
  { label: "Support", href: "/admin/support" },
  { label: "Marketing", href: "/admin/launch-growth" },
  { label: "Analytics", href: "/admin/bi" },
  { label: "System Health", href: "/admin/status" },
  { label: "Reports", href: "/admin/board-reports" },
];

const DUAL_APPROVAL_THRESHOLD = 50000;

function requiresDualApproval(amount, limits) {
  const value = Number(amount || 0);
  if (!limits) return value >= DUAL_APPROVAL_THRESHOLD;
  const cap = limits.withdrawal_mru ?? limits.refund_mru;
  if (cap == null) return false;
  return value > Number(cap);
}

export default function CeoCommandCenter() {
  const { permissions, cityId, setCity } = usePermissions();
  const { push } = useToast();
  const {
    master,
    mapData,
    health,
    withdrawals,
    loading,
    refreshing,
    error,
    lastRefresh,
    loadMs,
    refresh,
    refreshMap,
  } = useCeoDashboardData(cityId);

  const [serviceFilter, setServiceFilter] = useState("all");
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const revenueCharts = useLazySection();
  const opsCharts = useLazySection();
  const growthCharts = useLazySection();

  const overview = master?.executive_overview || {};
  const analytics = master?.analytics || {};
  const fleet = master?.fleet || {};
  const growth = master?.growth || {};
  const ops = master?.operations || {};
  const approvals = ops.approval_queues || {};

  const kpis = useMemo(
    () =>
      buildKpiDefinitions({
        master,
        financeSummary: master?.financial_overview?.summary,
        analytics: master?.analytics,
      }),
    [master]
  );
  const alerts = useMemo(() => buildExecutiveAlerts({ master, health, mapData }), [master, health, mapData]);
  const activity = useMemo(() => buildActivityFeed({ master, withdrawals }), [master, withdrawals]);

  const mapCenter = useMemo(() => {
    const markers = mapData?.markers?.drivers || mapData?.drivers || [];
    const first = markers[0];
    if (first?.lat != null && first?.lng != null) return [first.lat, first.lng];
    return [18.0735, -15.9582];
  }, [mapData]);

  const heatPoints = (fleet.peak_demand_areas || []).map((point, index) => ({
    id: `heat-${index}`,
    lat: point.lat,
    lng: point.lng,
    intensity: point.intensity || point.weight || 0.6,
  }));

  const approvalItems = useMemo(() => {
    const items = [];
    (approvals.pending_drivers || []).forEach((row) => {
      items.push({
        id: `driver-${row.id}`,
        type: "driver",
        title: `Driver #${row.id}`,
        subtitle: `${row.user__first_name || ""} ${row.user__last_name || row.user__email || ""}`.trim(),
        status: "pending",
        entityType: "driver",
        entityId: row.id,
        approveAction: "payout",
      });
    });
    (approvals.pending_couriers || []).forEach((row) => {
      items.push({
        id: `courier-${row.id}`,
        type: "courier",
        title: `Courier #${row.id}`,
        subtitle: row.user__email,
        status: "pending",
        entityType: "courier",
        entityId: row.id,
      });
    });
    (approvals.pending_merchants || []).forEach((row) => {
      items.push({
        id: `merchant-${row.id}`,
        type: "merchant",
        title: row.business_name,
        subtitle: row.email,
        status: "pending",
        entityType: "merchant",
        entityId: row.id,
      });
    });
    (approvals.pending_refunds || []).forEach((row) => {
      items.push({
        id: `refund-${row.id}`,
        type: "refund",
        title: `Refund #${row.id}`,
        subtitle: row.customer__email,
        amount: formatCurrency(row.amount),
        status: "pending",
        entityType: "refund",
        entityId: row.id,
        requiresDualApproval: requiresDualApproval(row.amount, permissions?.approval_limits),
        approveAction: "refund",
      });
    });
    withdrawals.forEach((row) => {
      items.push({
        id: `withdrawal-${row.id}`,
        type: "withdrawal",
        title: `Withdrawal #${row.id}`,
        subtitle: row.driver_name || row.user_email || "Payout request",
        amount: formatCurrency(row.amount),
        status: "pending",
        entityType: "withdrawal",
        entityId: row.id,
        requiresDualApproval: requiresDualApproval(row.amount, permissions?.approval_limits),
        approveAction: "withdrawal",
      });
    });
    return items;
  }, [approvals, withdrawals, permissions]);

  const exportRows = formatExportSummaryRows(kpis);
  const exportColumns = [
    { id: "metric", label: "Metric" },
    { id: "value", label: "Value" },
  ];

  const handleApproveEntity = async (item) => {
    const key = item.id;
    setActionLoading((state) => ({ ...state, [key]: true }));
    try {
      if (item.entityType === "withdrawal") {
        await approveWithdrawal(item.entityId);
      } else if (item.entityType === "refund") {
        push({ tone: "info", title: "Refund review", message: "Route to Finance Ops for processing." });
        window.location.href = "/admin/finance-ops";
        return;
      } else {
        await postCeoApproveOnboarding({
          entity_type: item.entityType,
          entity_id: Number(item.entityId),
          note: "CEO Command Center approval",
        });
      }
      push({ tone: "success", title: "Approved", message: `${item.title} approved.` });
      await refresh();
    } catch (err) {
      push({
        tone: "danger",
        title: "Approval failed",
        message: err?.response?.data?.detail || err?.message || "Could not approve",
      });
    } finally {
      setActionLoading((state) => ({ ...state, [key]: false }));
    }
  };

  const handleRejectWithdrawal = async (item) => {
    if (item.entityType !== "withdrawal") return;
    const key = `${item.id}-reject`;
    setActionLoading((state) => ({ ...state, [key]: true }));
    try {
      await rejectWithdrawal(item.entityId);
      push({ tone: "success", title: "Rejected", message: `Withdrawal #${item.entityId} rejected.` });
      await refresh();
    } catch (err) {
      push({ tone: "danger", title: "Reject failed", message: err?.response?.data?.error || err?.message });
    } finally {
      setActionLoading((state) => ({ ...state, [key]: false }));
    }
  };

  if (loading && !master) {
    return (
      <div className="ceo-cc">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className={`ceo-cc ${mapFullscreen ? "ceo-cc--map-fullscreen" : ""}`.trim()}>
      <header className="ceo-cc__header">
        <div>
          <h1 className="ceo-cc__title">CEO Command Center</h1>
          <p className="ceo-cc__subtitle">
            Real-time operational, financial, and strategic visibility
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
          </p>
        </div>
        <div className="ceo-cc__header-actions">
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <ExportMenu
            filename="ceo-dashboard-summary"
            rows={exportRows}
            columns={exportColumns}
            exportScope="reports"
          />
          <a className="admin-lib-btn admin-lib-btn--ghost" href={ceoMasterReportUrl("daily")} download>
            Daily CSV
          </a>
          <a className="admin-lib-btn admin-lib-btn--ghost" href={ceoMasterReportUrl("weekly")} download>
            Weekly CSV
          </a>
          <a
            className="admin-lib-btn admin-lib-btn--ghost"
            href={`${API_URL}/operations/executive/reports/export/?format=pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Executive PDF
          </a>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {health?.status === "ok" ? (
        <SuccessBanner title="Platform healthy">All core health checks passing.</SuccessBanner>
      ) : null}

      <section className="ceo-cc__section" aria-label="Executive KPI bar">
        <div className="ceo-cc__kpi-grid">
          {kpis.map((kpi) => {
            const subtitle =
              kpi.weekChangePercent != null ? `${kpi.weekChangePercent}% vs last week` : kpi.subtitle;
            if (kpi.changePercent != null) {
              return (
                <KPITrendCard
                  key={kpi.id}
                  label={kpi.label}
                  value={kpi.value}
                  format={kpi.format}
                  tone={kpi.tone}
                  subtitle={subtitle}
                  changePercent={kpi.changePercent}
                  periodLabel={kpi.periodLabel || "vs yesterday"}
                  loading={loading && !master}
                  onClick={() => {
                    if (kpi.href) window.location.href = kpi.href;
                  }}
                />
              );
            }
            return (
              <KPICard
                key={kpi.id}
                label={kpi.label}
                value={kpi.value}
                format={kpi.format}
                tone={kpi.tone}
                subtitle={subtitle}
                loading={loading && !master}
                onClick={() => {
                  if (kpi.href) window.location.href = kpi.href;
                }}
              />
            );
          })}
        </div>
      </section>

      <div className="ceo-cc__grid ceo-cc__grid--main">
        <section className={`ceo-cc__panel ceo-cc__panel--map ${mapFullscreen ? "ceo-cc__panel--fullscreen" : ""}`.trim()}>
          <div className="ceo-cc__panel-head">
            <h2>Live Operations Map</h2>
            <MapToolbar>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setMapFullscreen((v) => !v)}>
                {mapFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={refreshMap}>
                Refresh map
              </button>
            </MapToolbar>
          </div>
          <MapFilters onReset={() => setServiceFilter("all")}>
            <Select
              label="City"
              value={cityId}
              onChange={setCity}
              placeholder="All cities"
              options={[
                { value: "", label: "All cities" },
                ...(permissions?.assigned_city?.id
                  ? [{ value: String(permissions.assigned_city.id), label: permissions.assigned_city.name }]
                  : [{ value: "nouakchott", label: "Nouakchott" }]),
              ]}
            />
            <Select
              label="Service"
              value={serviceFilter}
              onChange={setServiceFilter}
              options={[
                { value: "all", label: "All services" },
                { value: "rides", label: "Rides" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
          </MapFilters>
          <LiveMap
            center={mapCenter}
            zoom={12}
            height={mapFullscreen ? 720 : 380}
            onRefresh={refreshMap}
            legend={
              <MapLegend
                items={[
                  { type: "driver", label: "Drivers online" },
                  { type: "ride", label: "Active rides" },
                  { type: "delivery", label: "Deliveries" },
                ]}
              />
            }
          >
            {(mapData?.markers?.drivers || mapData?.drivers || []).map((driver) => (
              <DriverMarker
                key={`driver-${driver.id}`}
                position={[driver.lat, driver.lng]}
                popup={driver.label || `Driver ${driver.id}`}
              />
            ))}
            {(serviceFilter === "all" || serviceFilter === "rides") &&
              (mapData?.markers?.trips || mapData?.trips || []).map((trip) => (
                <RideMarker key={`ride-${trip.id}`} position={[trip.lat, trip.lng]} popup={`Ride #${trip.id}`} />
              ))}
            {(serviceFilter === "all" || serviceFilter === "delivery") &&
              (mapData?.markers?.deliveries || mapData?.deliveries || []).map((delivery) => (
                <DeliveryMarker
                  key={`delivery-${delivery.id}`}
                  position={[delivery.lat, delivery.lng]}
                  popup={`Delivery #${delivery.id}`}
                />
              ))}
            <HeatmapOverlay points={heatPoints} />
          </LiveMap>
        </section>

        <section className="ceo-cc__panel">
          <div className="ceo-cc__panel-head">
            <h2>Executive Alerts</h2>
            <StatusChip label={`${alerts.length} open`} tone={alerts.length ? "warning" : "success"} />
          </div>
          {alerts.length === 0 ? (
            <p className="admin-empty">No critical alerts</p>
          ) : (
            <div className="ceo-cc__alerts">
              {alerts.slice(0, 8).map((alert) => (
                <AlertBanner key={alert.id} tone={alert.tone} title={alert.title}>
                  <div className="ceo-cc__alert-meta">
                    <StatusChip label={alert.severity} tone={alert.tone} />
                    <span>{alert.owner}</span>
                    <time dateTime={alert.timestamp}>{new Date(alert.timestamp).toLocaleString()}</time>
                  </div>
                  {alert.actionHref ? (
                    <a className="admin-lib-btn admin-lib-btn--ghost" href={alert.actionHref}>
                      {alert.actionLabel}
                    </a>
                  ) : null}
                </AlertBanner>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="ceo-cc__section">
        <div className="ceo-cc__panel-head">
          <h2>Approval Center</h2>
          <StatusChip label={`${approvalItems.length} pending`} tone={approvalItems.length ? "warning" : "success"} />
        </div>
        <ApprovalQueue
          items={approvalItems}
          emptyLabel="No pending approvals"
          renderItem={(item) => (
            <ApprovalCard
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              amount={item.amount}
              status={item.status}
              requiresDualApproval={item.requiresDualApproval}
              approveAction={item.approveAction || "refund"}
              onApprove={() => handleApproveEntity(item)}
              onReject={() => handleRejectWithdrawal(item)}
              onRequestInfo={() => push({ tone: "info", title: "Info requested", message: "Support notified." })}
            />
          )}
        />
        {(ops.driver_compliance?.pending_reviews || 0) > 0 ? (
          <p className="ceo-cc__hint">
            {ops.driver_compliance.pending_reviews} vehicle/document review(s) pending —{" "}
            <a href="/admin/fleet">Open Fleet Center</a>
          </p>
        ) : null}
      </section>

      <section ref={revenueCharts.ref} className="ceo-cc__section ceo-cc__charts">
        <h2>Revenue Analytics</h2>
        {revenueCharts.visible ? (
          <div className="ceo-cc__grid ceo-cc__grid--charts">
          <BarChart
            title="Daily revenue (hourly)"
            data={mapChartSeries(analytics.revenue_by_hour, "revenue")}
            loading={loading && !master}
            onRefresh={refresh}
          />
          <BarChart
            title="Weekly revenue trend"
            data={mapChartSeries(analytics.revenue_by_day, "gross_revenue", "label")}
            loading={loading && !master}
            onRefresh={refresh}
          />
          <Suspense fallback={<DashboardSkeleton />}>
            <LazyAreaChart
              title="Revenue by service (today)"
              data={[
                { label: "Rides", value: Number(String(overview.ride_revenue_today || 0).replace(/[^\d.-]/g, "")) || 0 },
                {
                  label: "Delivery",
                  value: Number(String(overview.delivery_revenue_today || 0).replace(/[^\d.-]/g, "")) || 0,
                },
              ]}
            />
          </Suspense>
          <DataTable
            title="Revenue by city"
            columns={[
              { id: "city_name", label: "City" },
              { id: "revenue_month", label: "Revenue (month)", render: (row) => formatCurrency(row.revenue_month) },
              { id: "driver_count", label: "Drivers" },
            ]}
            rows={(analytics.trips_by_city || []).slice(0, 10)}
            loading={loading && !master}
            searchable={false}
            exportFilename="revenue-by-city"
            exportScope="finance"
          />
          </div>
        ) : (
          <DashboardSkeleton />
        )}
      </section>

      <section ref={opsCharts.ref} className="ceo-cc__section ceo-cc__charts">
        <h2>Operations Analytics</h2>
        {opsCharts.visible ? (
          <div className="ceo-cc__grid ceo-cc__grid--charts">
          <LineChart
            title="Trips per hour"
            data={mapChartSeries(analytics.trips_by_hour, "count")}
            loading={loading && !master}
          />
          <PercentageIndicator
            label="Driver utilization"
            value={fleet.fleet_utilization_pct || 0}
            target={75}
          />
          <PercentageIndicator
            label="Acceptance rate"
            value={overview.driver_acceptance_rate_pct || 0}
            target={85}
          />
          <PercentageIndicator
            label="Cancellation rate"
            value={overview.cancellation_rate_pct || 0}
            target={10}
            tone="danger"
          />
          <KPITrendCard
            label="Avg pickup wait"
            value={fleet.average_wait_time_minutes ?? overview.average_eta_minutes ?? "—"}
            subtitle="minutes"
          />
          <KPITrendCard label="Platform health score" value={overview.platform_health_score ?? "—"} format="percent" />
          </div>
        ) : (
          <DashboardSkeleton />
        )}
      </section>

      <section ref={growthCharts.ref} className="ceo-cc__section ceo-cc__charts">
        <h2>Growth Analytics</h2>
        {growthCharts.visible ? (
          <>
          <div className="ceo-cc__grid ceo-cc__grid--metrics">
          <KPITrendCard label="New riders (week)" value={growth.new_riders_week} />
          <KPITrendCard label="New drivers (week)" value={growth.new_drivers_week} />
          <KPITrendCard label="New merchants (week)" value={growth.new_merchants_week} />
          <PercentageIndicator label="Retention (30d)" value={growth.retention_rate_pct || 0} target={40} />
          <KPITrendCard
            label="Rider referrals (week)"
            value={growth.referral_growth?.rider_referrals_week}
          />
          <KPITrendCard
            label="Driver referrals (week)"
            value={growth.referral_growth?.driver_referrals_week}
          />
        </div>
        <DataTable
          title="Top cities"
          columns={[
            { id: "name", label: "City" },
            { id: "completed_rides", label: "Completed rides" },
          ]}
          rows={(growth.top_cities || []).slice(0, 8)}
          searchable={false}
          exportFilename="growth-cities"
          exportScope="reports"
        />
          </>
        ) : (
          <DashboardSkeleton />
        )}
      </section>

      <div className="ceo-cc__grid ceo-cc__grid--main">
        <section className="ceo-cc__panel">
          <h2>Recent Activity</h2>
          <ActivityFeed items={activity} />
          <AuditTimeline
            entries={activity.slice(0, 6).map((item) => ({
              id: item.id,
              summary: item.title,
              actor: "Platform",
              timestamp: item.timestamp,
              reason: item.description,
            }))}
          />
        </section>

        <section className="ceo-cc__panel">
          <h2>Quick Actions</h2>
          <div className="ceo-cc__quick-actions">
            {QUICK_ACTIONS.map((action) => (
              <a key={action.href} className="ceo-cc__quick-link" href={action.href}>
                {action.label}
              </a>
            ))}
          </div>
          {error ? <RetryBlock onRetry={refresh} message="Some widgets failed to load." /> : null}
        </section>
      </div>
    </div>
  );
}
