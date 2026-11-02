import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import AdminIcon from "../layouts/icons/AdminIcon";
import { canAccessPath } from "../layouts/permissions/adminRouteAccess";
import { usePermissions } from "../permissions/PermissionContext";
import { fetchDeliveryOverview } from "../delivery/deliveryApi";
import { fetchOperationsFleet } from "../operations/operationsCenterApi";
import { fetchSecurityAuditStream } from "../security/securityConsoleApi";
import { fetchTrustSafetyDashboard } from "../trust/trustSafetyApi";
import "./AdminHomeOverview.css";

export const QUICK_ACCESS_ITEMS = [
  { id: "add-driver", title: "Add Driver", path: "/admin/drivers", icon: "user-plus", tone: "blue" },
  { id: "approve-driver", title: "Approve Driver", path: "/admin/approvals", icon: "shield-check", tone: "green" },
  { id: "add-vehicle", title: "Add Vehicle", path: "/admin/vehicles", icon: "car", tone: "purple" },
  { id: "view-rides", title: "View Rides", path: "/admin/rides", icon: "map-pin", tone: "cyan" },
  { id: "view-deliveries", title: "View Deliveries", path: "/admin/delivery", icon: "package", tone: "amber" },
  { id: "pricing", title: "Manage Pricing", path: "/admin/smart-pricing", icon: "dollar", tone: "amber" },
  { id: "reports", title: "Reports", path: "/admin/business-intelligence", icon: "bar-chart", tone: "blue" },
  { id: "employees", title: "Employees", subtitle: "Clock In/Out", path: "/admin/employees", icon: "users", tone: "purple" },
];

export const MANAGEMENT_MODULES = [
  { id: "riders", title: "Riders", description: "Manage user accounts, activity, and support", path: "/admin/riders", icon: "users", tone: "blue" },
  { id: "drivers", title: "Drivers", description: "Approvals, documents, status, and performance", path: "/admin/drivers", icon: "taxi", tone: "amber" },
  { id: "fleet", title: "Fleet & Vehicles", description: "Vehicles, categories, maintenance, and assignment", path: "/admin/vehicles", icon: "car", tone: "green" },
  { id: "deliveries", title: "Deliveries", description: "Orders, couriers, and tracking", path: "/admin/delivery", icon: "package", tone: "purple" },
  { id: "finance", title: "Payments & Finance", description: "Payments, withdrawals, and settlements", path: "/admin/payments", icon: "wallet", tone: "green" },
  { id: "trust", title: "Trust & Safety", description: "Incidents, SOS, and safety monitoring", path: "/admin/trust-safety", icon: "shield", tone: "red" },
  { id: "hr", title: "Employees & HR", description: "Staff, attendance, and ID cards", path: "/admin/employees", icon: "id-card", tone: "cyan" },
  { id: "reports", title: "Reports & Analytics", description: "Business intelligence and insights", path: "/admin/business-intelligence", icon: "bar-chart", tone: "blue" },
];

const ACTIVITY_PATH = "/admin/security/audit";
const ACTIVITY_LIMIT = 5;
const RIDES_PATH = "/admin/rides";
const FLEET_PATH = "/admin/ops-center/live";
const SAFETY_PATH = "/admin/trust-safety";
const DELIVERY_PATH = "/admin/delivery";

const ENTITY_ICONS = {
  driver: "user-check",
  driverprofile: "user-check",
  rider: "users",
  user: "user",
  ride: "route",
  trip: "route",
  delivery: "package",
  payment: "credit-card",
  withdrawal: "bank",
  vehicle: "car",
  document: "file",
};

const STATUS_COLORS = { completed: "#22a447", active: "#2f7cf6", other: "#f5b800", cancelled: "#e5484d" };

const humanize = (value) =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());

export function activityStatus(row) {
  if (row?.high_risk) return { label: "High risk", tone: "danger" };
  const text = `${row?.action || ""} ${row?.summary || ""}`.toLowerCase();
  if (/(reject|fail|declin|suspend|block|revok|delet|error)/.test(text)) return { label: "Rejected / failed", tone: "danger" };
  if (/(approv|complet|success|paid|verified|activat|resolv)/.test(text)) return { label: "Completed", tone: "success" };
  if (/(pending|request|submit|await|queue)/.test(text)) return { label: "Pending", tone: "warning" };
  if (/(progress|start|assign|update|change)/.test(text)) return { label: "Updated", tone: "info" };
  return { label: humanize(row?.action) || "Recorded", tone: "neutral" };
}

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

function formatCount(value) {
  return isNum(value) ? value.toLocaleString() : null;
}

export function relativeTime(value, now = Date.now()) {
  if (!value) return "—";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "—";
  const minutes = Math.max(0, Math.round((now - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Percent change of the last `days` points vs the `days` before them; null when not computable. */
export function periodChange(series, days) {
  if (!Array.isArray(series) || series.length < days * 2) return null;
  const sum = (rows) => rows.reduce((total, row) => total + Number(row?.value || 0), 0);
  const current = sum(series.slice(-days));
  const previous = sum(series.slice(-days * 2, -days));
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Ride status slices from the admin analytics summary. Never invents a status the API lacks. */
export function rideStatusSlices(summary) {
  if (!summary || !isNum(summary.total_rides)) return [];
  const completed = Number(summary.completed_rides || 0);
  const active = Number(summary.active_rides || 0);
  const cancelled = Number(summary.cancelled_rides || 0);
  const other = Math.max(0, summary.total_rides - completed - active - cancelled);
  return [
    { key: "completed", label: "Completed", value: completed },
    { key: "active", label: "In Progress", value: active },
    { key: "other", label: "Other / Scheduled", value: other },
    { key: "cancelled", label: "Cancelled", value: cancelled },
  ].filter((slice) => slice.value > 0 || slice.key !== "other");
}

function useLoad(enabled, loader, deps) {
  const [state, setState] = useState({ loading: enabled, data: null, error: !enabled });
  useEffect(() => {
    let alive = true;
    if (!enabled) {
      setState({ loading: false, data: null, error: true });
      return undefined;
    }
    setState((current) => ({ ...current, loading: true }));
    loader()
      .then((data) => alive && setState({ loading: false, data, error: false }))
      .catch(() => alive && setState({ loading: false, data: null, error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function HeroIllustration() {
  return (
    <svg className="admin-home__hero-art" viewBox="0 0 520 160" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <g fill="#cfe0f5">
        <path d="M60 160V96h22v-14h10v14h16v64zM120 160V70h8V40l6-12 6 12v30h8v90zM168 160v-52a24 24 0 0 1 48 0v52zM228 160V88h30v72z" />
        <circle cx="192" cy="100" r="5" fill="#b7cdea" />
      </g>
      <g transform="translate(270 22)">
        <rect x="0" y="0" width="2.5" height="110" fill="#7c8da6" />
        <g transform="translate(2.5 2)">
          <rect width="58" height="38" fill="#00a95c" />
          <rect width="58" height="6" fill="#d01c1f" />
          <rect y="32" width="58" height="6" fill="#d01c1f" />
          <path d="M17 16a12 12 0 0 0 24 0 11.2 11.2 0 0 1-24 0z" fill="#ffd700" />
          <path d="M29 9.5l1.3 4h4.2l-3.4 2.5 1.3 4L29 17.5l-3.4 2.5 1.3-4-3.4-2.5h4.2z" fill="#ffd700" />
        </g>
      </g>
      <g transform="translate(350 82)">
        <path d="M6 58h150c6 0 10-4 10-10v-8c0-6-4-9-10-10l-22-4-20-18c-4-3-8-5-13-5H62c-6 0-11 2-15 6L30 26 12 30C6 31 2 36 2 42v8c0 5 2 8 4 8z" fill="#f5b800" />
        <path d="M52 26l14-13c2-2 4-3 7-3h24c3 0 5 1 7 3l14 13z" fill="#1f3554" />
        <rect x="78" y="-4" width="34" height="12" rx="3" fill="#f5b800" stroke="#0f1f3d" strokeWidth="1.2" />
        <text x="95" y="5.5" fontSize="8" fontWeight="800" textAnchor="middle" fill="#0f1f3d">YALA</text>
        <text x="98" y="47" fontSize="15" fontWeight="800" textAnchor="middle" fill="#0f1f3d">YALA</text>
        <circle cx="40" cy="58" r="13" fill="#1f2937" /><circle cx="40" cy="58" r="6" fill="#cbd5e1" />
        <circle cx="134" cy="58" r="13" fill="#1f2937" /><circle cx="134" cy="58" r="6" fill="#cbd5e1" />
      </g>
      <g transform="translate(470 40)" fill="#3f8f4f">
        <rect x="9" y="20" width="4" height="100" fill="#8a6a43" />
        <path d="M11 20c-14-6-24 0-30 8 10-4 20-4 30-8zM11 20c14-6 24 0 30 8-10-4-20-4-30-8zM11 20c-6-12-2-20 4-24-2 8-2 16-4 24z" />
      </g>
    </svg>
  );
}

function KpiCard({ tone, icon, label, value, change, caption, loading, unavailable }) {
  return (
    <article className={`admin-home__kpi admin-home__tone-bg--${tone}`}>
      <span className={`admin-home__kpi-icon admin-home__tone--${tone}`}>
        <AdminIcon name={icon} size={22} />
      </span>
      <div className="admin-home__kpi-body">
        <div className="admin-home__kpi-value" aria-live="polite">
          {loading ? <span className="admin-home__skeleton" /> : unavailable ? <span className="admin-home__kpi-na">—</span> : value}
        </div>
        <div className="admin-home__kpi-label">{label}</div>
        {!loading && !unavailable && isNum(change) ? (
          <div className={`admin-home__change admin-home__change--${change >= 0 ? "up" : "down"}`}>
            <AdminIcon name={change >= 0 ? "arrow-up" : "arrow-down"} size={12} /> {Math.abs(change)}%
            <span>{caption}</span>
          </div>
        ) : (
          <div className="admin-home__kpi-caption">{unavailable && !loading ? "Unavailable" : caption}</div>
        )}
      </div>
    </article>
  );
}

function Panel({ title, icon, action, children, className = "", id }) {
  return (
    <section className={`admin-home__panel ${className}`.trim()} aria-labelledby={id}>
      <header className="admin-home__panel-head">
        <h2 id={id}>
          {icon ? <AdminIcon name={icon} size={18} className="admin-home__panel-icon" /> : null}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function PanelState({ icon = "inbox", title, text }) {
  return (
    <div className="admin-home__state">
      <AdminIcon name={icon} size={22} />
      <strong>{title}</strong>
      {text ? <span>{text}</span> : null}
    </div>
  );
}

function RevenueChart({ points, formatMoney }) {
  const width = 560;
  const height = 190;
  const pad = { left: 52, right: 12, top: 12, bottom: 26 };
  const values = points.map((p) => Number(p.value || 0));
  const max = Math.max(...values, 0);
  const niceMax = max > 0 ? Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))) * Math.pow(10, Math.floor(Math.log10(max))) : 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const y = (v) => pad.top + innerH - (v / niceMax) * innerH;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${pad.top + innerH} L${x(0).toFixed(1)} ${pad.top + innerH} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  return (
    <svg className="admin-home__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily revenue">
      <defs>
        <linearGradient id="ahRevenueFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f7cf6" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2f7cf6" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="admin-home__chart-grid" />
          <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="admin-home__chart-tick">
            {Math.round(t).toLocaleString()}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#ahRevenueFill)" />
      <path d={line} fill="none" stroke="#2f7cf6" strokeWidth="2.5" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={points[i].date || i} cx={x(i)} cy={y(v)} r="4" fill="#fff" stroke="#2f7cf6" strokeWidth="2">
          <title>{`${points[i].date || points[i].label}: ${formatMoney(v)}`}</title>
        </circle>
      ))}
      {points.map((p, i) => (
        <text key={`l-${p.date || i}`} x={x(i)} y={height - 6} textAnchor="middle" className="admin-home__chart-tick">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

function Donut({ slices, total }) {
  const size = 150;
  const r = 56;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const sum = slices.reduce((t, s) => t + s.value, 0) || 1;
  let offset = 0;
  return (
    <svg className="admin-home__donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Rides by status">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ah-track)" strokeWidth={stroke} />
      {slices.map((s) => {
        const len = (s.value / sum) * c;
        const el = (
          <circle
            key={s.key}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={STATUS_COLORS[s.key]}
            strokeWidth={stroke}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x="50%" y="48%" textAnchor="middle" className="admin-home__donut-total">{total.toLocaleString()}</text>
      <text x="50%" y="62%" textAnchor="middle" className="admin-home__donut-label">Rides</text>
    </svg>
  );
}

/**
 * Home Dashboard modelled on the YALA reference design. Every figure comes from an
 * existing API; anything the backend does not return is shown as unavailable.
 */
export default function AdminHomeOverview({
  driversCount,
  driversLoading,
  ridersCount,
  ridersLoading,
  revenueValue,
  revenueLoading,
  formatMoney,
}) {
  const { permissions, cityId } = usePermissions();
  const [revenueDays, setRevenueDays] = useState(7);

  const allowed = useCallback((path) => canAccessPath(permissions, path), [permissions]);
  const canSeeRides = allowed(RIDES_PATH);
  const canSeeFleet = allowed(FLEET_PATH);
  const canSeeSafety = allowed(SAFETY_PATH);
  const canSeeDelivery = allowed(DELIVERY_PATH);
  const canSeeActivity = allowed(ACTIVITY_PATH);
  const cityParams = cityId ? { city: cityId } : {};

  const analytics = useLoad(
    canSeeRides,
    () => authenticatedApi.get(`${API_URL}/rides/analytics/admin/`, { params: cityParams }).then((res) => res.data),
    [canSeeRides, cityId]
  );
  const fleet = useLoad(canSeeFleet, () => fetchOperationsFleet(cityParams), [canSeeFleet, cityId]);
  const safety = useLoad(canSeeSafety, () => fetchTrustSafetyDashboard(cityParams), [canSeeSafety, cityId]);
  const delivery = useLoad(canSeeDelivery, () => fetchDeliveryOverview(), [canSeeDelivery]);
  const activity = useLoad(
    canSeeActivity,
    () => fetchSecurityAuditStream({ page: 1, page_size: ACTIVITY_LIMIT }),
    [canSeeActivity]
  );

  const summary = analytics.data?.summary || null;
  const dailyRevenue = useMemo(() => analytics.data?.charts?.daily_revenue || [], [analytics.data]);
  const revenuePoints = dailyRevenue.slice(-revenueDays);
  const revenuePeriodTotal = revenuePoints.reduce((t, p) => t + Number(p.value || 0), 0);
  const revenueChange = periodChange(dailyRevenue, revenueDays);
  const slices = rideStatusSlices(summary);
  const counts = fleet.data?.counts || null;
  const safetyScore = safety.data?.safety_score;
  const deliveriesTotal = delivery.data?.deliveries?.total;
  const activityRows = Array.isArray(activity.data?.results) ? activity.data.results.slice(0, ACTIVITY_LIMIT) : [];
  const revenueAvailable = revenueValue !== null && revenueValue !== undefined && revenueValue !== "";

  const quickActions = useMemo(() => QUICK_ACCESS_ITEMS.filter((item) => allowed(item.path)), [allowed]);
  const modules = useMemo(() => MANAGEMENT_MODULES.filter((item) => allowed(item.path)), [allowed]);

  const onPlatform = [
    { key: "drivers", label: "Drivers Online", icon: "car", tone: "green", value: counts?.online_drivers },
    { key: "riders", label: "Active Riders", icon: "users", tone: "blue", value: counts?.active_riders },
    { key: "couriers", label: "Couriers Online", icon: "bike", tone: "purple", value: counts?.online_couriers },
  ];

  return (
    <div className="admin-home">
      <section className="admin-home__hero" aria-label="Welcome">
        <div className="admin-home__hero-content">
          <h1 className="admin-home__hero-title">
            Welcome to <span>YALA</span> Technologies
          </h1>
          <p className="admin-home__hero-sub">Ride · Delivery · Mobility · Operations</p>
        </div>
        <HeroIllustration />
      </section>

      <section className="admin-home__kpis" aria-label="Key performance indicators">
        <KpiCard
          tone="blue"
          icon="car"
          label="Total Rides"
          value={formatCount(summary?.total_rides)}
          unavailable={formatCount(summary?.total_rides) === null}
          loading={analytics.loading}
          caption={isNum(summary?.completion_rate) ? `${summary.completion_rate}% completed` : "All recorded rides"}
        />
        <KpiCard
          tone="green"
          icon="users"
          label="Riders"
          value={formatCount(ridersCount)}
          unavailable={formatCount(ridersCount) === null}
          loading={ridersLoading}
          caption="Registered accounts"
        />
        <KpiCard
          tone="amber"
          icon="user-check"
          label="Drivers"
          value={formatCount(driversCount)}
          unavailable={formatCount(driversCount) === null}
          loading={driversLoading}
          caption="Registered taxi drivers"
        />
        <KpiCard
          tone="purple"
          icon="package"
          label="Deliveries"
          value={formatCount(deliveriesTotal)}
          unavailable={formatCount(deliveriesTotal) === null}
          loading={delivery.loading}
          caption={isNum(delivery.data?.deliveries?.delivered) ? `${delivery.data.deliveries.delivered.toLocaleString()} delivered` : "All orders"}
        />
        <KpiCard
          tone="orange"
          icon="dollar"
          label="Total Revenue"
          value={revenueAvailable ? formatMoney(revenueValue) : null}
          unavailable={!revenueAvailable}
          loading={revenueLoading}
          caption="Completed rides"
        />
        <KpiCard
          tone="teal"
          icon="shield-check"
          label="Safety Score"
          value={isNum(safetyScore) ? `${safetyScore}%` : null}
          unavailable={!isNum(safetyScore)}
          loading={safety.loading}
          caption="Trust & Safety"
        />
      </section>

      <div className="admin-home__grid">
        <Panel
          id="admin-home-revenue"
          title="Revenue Overview"
          icon="bar-chart"
          className="admin-home__area-revenue"
          action={
            <select
              className="admin-home__select"
              value={revenueDays}
              onChange={(e) => setRevenueDays(Number(e.target.value))}
              aria-label="Revenue period"
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
            </select>
          }
        >
          {analytics.loading ? (
            <PanelState icon="refresh" title="Loading revenue…" />
          ) : analytics.error || !revenuePoints.length ? (
            <PanelState icon="lock" title="Revenue chart unavailable" text="Ride analytics are not available for your account or could not be loaded." />
          ) : (
            <>
              <div className="admin-home__revenue-total">
                <strong>{formatMoney(revenuePeriodTotal)}</strong>
                {isNum(revenueChange) ? (
                  <span className={`admin-home__change admin-home__change--${revenueChange >= 0 ? "up" : "down"}`}>
                    <AdminIcon name={revenueChange >= 0 ? "arrow-up" : "arrow-down"} size={12} /> {Math.abs(revenueChange)}%
                    {revenueDays === 7 ? <span>vs. previous 7 days</span> : null}
                  </span>
                ) : null}
              </div>
              <RevenueChart points={revenuePoints} formatMoney={formatMoney} />
            </>
          )}
        </Panel>

        <Panel id="admin-home-status" title="Rides by Status" icon="pie" className="admin-home__area-status">
          {analytics.loading ? (
            <PanelState icon="refresh" title="Loading rides…" />
          ) : analytics.error || !summary ? (
            <PanelState icon="lock" title="Ride status unavailable" />
          ) : !summary.total_rides ? (
            <PanelState title="No rides recorded yet" />
          ) : (
            <div className="admin-home__status">
              <Donut slices={slices} total={summary.total_rides} />
              <ul className="admin-home__legend">
                {slices.map((s) => (
                  <li key={s.key}>
                    <span className="admin-home__legend-dot" style={{ background: STATUS_COLORS[s.key] }} />
                    <span className="admin-home__legend-label">{s.label}</span>
                    <span className="admin-home__legend-value">
                      {Math.round((s.value / summary.total_rides) * 100)}% ({s.value.toLocaleString()})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel id="admin-home-platform" title="Active on Platform" icon="radio" className="admin-home__area-platform">
          {fleet.loading ? (
            <PanelState icon="refresh" title="Loading live counts…" />
          ) : fleet.error || !counts ? (
            <PanelState icon="lock" title="Live counts unavailable" text="The live fleet snapshot is not available for your account." />
          ) : (
            <ul className="admin-home__platform">
              {onPlatform.map((row) => (
                <li key={row.key} className={`admin-home__tone-bg--${row.tone}`}>
                  <span className={`admin-home__platform-icon admin-home__tone--${row.tone}`}>
                    <AdminIcon name={row.icon} size={18} />
                  </span>
                  <span className="admin-home__platform-label">{row.label}</span>
                  <strong>{formatCount(row.value) ?? "—"}</strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="admin-home-quick" title="Quick Actions" icon="rocket" className="admin-home__area-quick">
          {quickActions.length ? (
            <div className="admin-home__quick-grid">
              {quickActions.map((item) => (
                <a key={item.id} href={item.path} className={`admin-home__quick admin-home__tone-bg--${item.tone}`}>
                  <span className={`admin-home__quick-icon admin-home__tone--${item.tone}`}>
                    <AdminIcon name={item.icon} size={22} />
                  </span>
                  <span className="admin-home__quick-title">{item.title}</span>
                  {item.subtitle ? <span className="admin-home__quick-sub">({item.subtitle})</span> : null}
                </a>
              ))}
            </div>
          ) : (
            <PanelState title="No quick actions are available for your role." />
          )}
        </Panel>

        <Panel
          id="admin-home-activity"
          title="Recent Activity"
          icon="clock"
          className="admin-home__area-activity"
          action={
            canSeeActivity && !activity.error ? (
              <a className="admin-home__view-all" href={ACTIVITY_PATH}>
                View All
              </a>
            ) : null
          }
        >
          {activity.loading ? (
            <PanelState icon="refresh" title="Loading recent activity…" />
          ) : activity.error ? (
            <PanelState icon="lock" title="Activity feed unavailable" text="The platform audit stream is not available for your account." />
          ) : !activityRows.length ? (
            <PanelState title="No recent activity" text="Recorded platform events will appear here." />
          ) : (
            <ul className="admin-home__activity">
              {activityRows.map((row, index) => {
                const status = activityStatus(row);
                const entityKey = String(row.entity_type || "").toLowerCase().replace(/[^a-z]/g, "");
                return (
                  <li key={row.id || index}>
                    <span className={`admin-home__activity-icon admin-home__status--${status.tone}`}>
                      <AdminIcon name={ENTITY_ICONS[entityKey] || "activity"} size={14} />
                    </span>
                    <span className="admin-home__activity-text" title={row.actor_email || "System"}>
                      {row.summary || humanize(row.action) || "Event"}
                    </span>
                    <time className="admin-home__activity-time" dateTime={row.created_at}>
                      {relativeTime(row.created_at)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel id="admin-home-modules" title="Management Modules" icon="grid" className="admin-home__area-modules">
          {modules.length ? (
            <div className="admin-home__modules">
              {modules.map((item) => (
                <a key={item.id} href={item.path} className="admin-home__module">
                  <span className={`admin-home__module-icon admin-home__tone--${item.tone}`}>
                    <AdminIcon name={item.icon} size={22} />
                  </span>
                  <span className="admin-home__module-text">
                    <span className="admin-home__module-title">{item.title}</span>
                    <span className="admin-home__module-desc">{item.description}</span>
                  </span>
                  <AdminIcon name="chevron-right" size={16} className="admin-home__module-arrow" />
                </a>
              ))}
            </div>
          ) : (
            <PanelState title="No management modules are available for your role." />
          )}
        </Panel>
      </div>
    </div>
  );
}
