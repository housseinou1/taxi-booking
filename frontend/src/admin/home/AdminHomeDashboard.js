import React, { useCallback, useMemo, useState } from "react";

import useAdminHomeData from "./useAdminHomeData";
import { useOptionalPermissions } from "../permissions/PermissionContext";
import { exportExecutiveReport } from "../executive/executiveApi";
import { apiErrorMessage } from "../layouts/errors/apiErrorMessage";
import "./adminHomeDashboard.css";

/* ------------------------------------------------------------------ icons */
const I = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  layers: "M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5",
  car: "M5 17h14M7 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM3 17v-4l2-5h14l2 5v4M3 13h18",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87",
  box: "M21 8v8l-9 5-9-5V8l9-5 9 5ZM3 8l9 5 9-5M12 13v8",
  card: "M2 6h20v12H2zM2 10h20",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  bar: "M4 20V10M10 20V4M16 20v-7",
  gear: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  pin: "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0Zm-9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  bolt: "M13 2 3 14h8l-1 8 10-12h-8l1-8Z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  plus: "M12 5v14M5 12h14",
  chev: "M6 9l6 6 6-6",
  arrow: "M5 12h14M13 5l7 7-7 7",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 13h6M9 17h6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
};

export function Icon({ name, className = "" }) {
  const d = I[name] || I.home;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const NO_DATA_LABEL = "Not enough data yet";

/** Mauritania flag as inline SVG — emoji flags do not render on Windows Chrome. */
export function MauritaniaFlag({ className = "yah-flag" }) {
  return (
    <svg className={className} viewBox="0 0 24 16" role="img" aria-label="Mauritania" focusable="false">
      <rect width="24" height="16" fill="#006233" />
      <rect width="24" height="2.6" y="0" fill="#d01c1f" />
      <rect width="24" height="2.6" y="13.4" fill="#d01c1f" />
      <circle cx="12" cy="8" r="4.1" fill="#ffd700" />
      <circle cx="12" cy="6.9" r="3.5" fill="#006233" />
      <path d="M12 7.6l.62 1.28 1.4.2-1.01.99.24 1.4L12 10.79l-1.25.66.24-1.4-1.01-.99 1.4-.2z" fill="#ffd700" />
    </svg>
  );
}

/** Renders a number, or the honest no-data label. Never a fabricated figure. */
export function Value({ value, suffix }) {
  if (value === null || value === undefined) {
    return <span className="yah-kpi__nodata">{NO_DATA_LABEL}</span>;
  }
  return (
    <>
      {Number(value).toLocaleString("en-US")}
      {suffix ? ` ${suffix}` : ""}
    </>
  );
}

function kpiIconName(key) {
  switch (key) {
    case "completed_rides":
    case "completed":
      return "check";
    case "completed_deliveries":
    case "delivery":
      return "box";
    case "gross_revenue":
    case "revenue":
      return "card";
    case "active_drivers":
    case "drivers":
      return "users";
    case "active_riders":
    case "riders":
      return "users";
    case "active":
      return "activity";
    default:
      return "chart";
  }
}

function Panel({ title, icon, action, children, className = "" }) {
  return (
    <section className={`yah-panel ${className}`.trim()}>
      <div className="yah-panel__head">
        <h2 className="yah-panel__title">
          <Icon name={icon} />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text = NO_DATA_LABEL, error = false }) {
  return (
    <div className={`yah-state${error ? " yah-state--err" : ""}`}>
      <Icon name={error ? "alert" : "activity"} />
      <p>{text}</p>
    </div>
  );
}

function Loading({ rows = 4 }) {
  return (
    <div className="yah-rows" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="yah-row" key={i}>
          <div className="yah-skel" style={{ width: `${60 + (i % 3) * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

function RevenueSparkline({ points, loading }) {
  if (loading) {
    return <div className="yah-chart__skel" />;
  }
  if (!points.length) {
    return <Empty text="No revenue series for this period in the API response." />;
  }
  const values = points.map((p) => Number(p.revenue) || 0);
  const max = Math.max(...values, 1);
  const w = 320;
  const h = 120;
  const pad = 8;
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const path = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (v / max) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <div className="yah-chart">
      <svg className="yah-chart__svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={path} fill="none" stroke="var(--yah-green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="yah-chart__foot">
        <span>{points[0]?.label || points[0]?.date}</span>
        <span>{points[points.length - 1]?.label || points[points.length - 1]?.date}</span>
      </div>
    </div>
  );
}

/** Normalized mini sparkline in the KPI row — values are 0..1 from real series only. */
function MiniSparkline({ points, tone = "green" }) {
  if (!points || points.length < 2) return null;
  const w = 120;
  const h = 36;
  const pad = 2;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const path = points
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - v * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      className={`yah-kpi__spark yah-kpi__spark--${tone}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OrdersDonut({ mix, loading }) {
  if (loading) return <div className="yah-donut yah-donut--skel" />;
  if (!mix || mix.total <= 0) {
    return <Empty text="No completed ride or delivery totals returned for the mix chart." />;
  }
  const { rides, deliveries, total, ridesPct, delPct } = mix;
  const rideAngle = (rides / total) * 360;
  const rideLarge = rideAngle > 180 ? 1 : 0;
  const r = 40;
  const cx = 50;
  const cy = 50;
  const x2 = cx + r * Math.sin((rideAngle * Math.PI) / 180);
  const y2 = cy - r * Math.cos((rideAngle * Math.PI) / 180);
  return (
    <div className="yah-donut-wrap">
      <svg className="yah-donut" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="yah-donut__bg" cx={cx} cy={cy} r={r} />
        <path
          className="yah-donut__rides"
          d={`M ${cx} ${cy - r} A ${r} ${r} 0 ${rideLarge} 1 ${x2} ${y2} L ${cx} ${cy} Z`}
        />
        <path
          className="yah-donut__del"
          d={`M ${x2} ${y2} A ${r} ${r} 0 ${rideLarge === 1 ? 0 : 1} 1 ${cx} ${cy - r} L ${cx} ${cy} Z`}
        />
      </svg>
      <div className="yah-donut__legend">
        <div>
          <span className="yah-dot yah-dot--rides" /> Rides: {rides} ({ridesPct != null ? `${ridesPct}%` : NO_DATA_LABEL})
        </div>
        <div>
          <span className="yah-dot yah-dot--del" /> Deliveries: {deliveries} ({delPct != null ? `${delPct}%` : NO_DATA_LABEL})
        </div>
        <div className="yah-donut__total">Total completed: {total}</div>
      </div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "1y", label: "1Y" },
];

function orderStatusIcon(key) {
  switch (key) {
    case "ongoing":
      return "activity";
    case "completed_today":
      return "check";
    case "scheduled":
      return "calendar";
    case "cancelled":
      return "alert";
    default:
      return "layers";
  }
}

export default function AdminHomeDashboard({
  user,
  navGroups = [],
  onNavigate = (to) => {
    window.location.href = to;
  },
  embedded = false,
}) {
  const permissions = useOptionalPermissions();
  const [open, setOpen] = useState(null);
  const [executivePeriod, setExecutivePeriod] = useState("today");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  const data = useAdminHomeData({
    canView: permissions?.canView,
    cityId: permissions?.cityId,
    executivePeriod,
  });

  const name =
    user?.full_name ||
    user?.name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Administrator";

  const activity = useMemo(() => (Array.isArray(data.activity) ? data.activity : []), [data.activity]);

  const today = useMemo(() => {
    const t = data.today || {};
    return [
      { icon: "car", label: "New Rides (today)", value: t.new_rides },
      { icon: "box", label: "New Deliveries (today)", value: t.new_deliveries },
      { icon: "users", label: "New Registrations", value: t.new_registrations },
      { icon: "alert", label: "Open Safety Reports", value: t.open_safety_reports, tone: "alert" },
    ];
  }, [data.today]);

  const pending = useMemo(() => {
    const p = data.pending || {};
    return [
      { icon: "doc", label: "Driver Approvals", value: p.pending_drivers },
      { icon: "users", label: "Rider Approvals", value: p.pending_riders },
      { icon: "box", label: "Courier Approvals", value: p.pending_couriers },
    ];
  }, [data.pending]);

  const pendingTotal = pending.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const health = Array.isArray(data.health) ? data.health : [];
  const orderStatusToday = Array.isArray(data.orderStatusToday) ? data.orderStatusToday : [];
  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const rangeLabel = useMemo(() => {
    const m = data.executiveMeta;
    if (m?.startDate && m?.endDate) {
      try {
        const a = new Date(m.startDate);
        const b = new Date(m.endDate);
        const opts = { month: "short", day: "numeric", year: "numeric" };
        return `${a.toLocaleDateString("en-US", opts)} – ${b.toLocaleDateString("en-US", opts)}`;
      } catch {
        return todayLabel;
      }
    }
    return todayLabel;
  }, [data.executiveMeta, todayLabel]);

  const canExportExecutive = permissions?.canView && (permissions.canView("ceo") || permissions.canView("ops") || permissions.canView("finance"));

  const handleExport = useCallback(async () => {
    if (!canExportExecutive || exporting) return;
    setExportMsg(null);
    setExporting(true);
    try {
      const periodMap = { today: "daily", "7d": "weekly", "30d": "monthly", "90d": "monthly", "1y": "yearly" };
      const period = periodMap[executivePeriod] || "daily";
      const response = await exportExecutiveReport({ export_format: "csv", period });
      const contentType = String(
        response?.headers?.["content-type"] || response?.headers?.["Content-Type"] || ""
      );
      const payload = response?.data;
      const looksJson =
        (typeof payload === "string" && /^\s*["{]/.test(payload)) ||
        contentType.includes("application/json") ||
        contentType.includes("text/html");

      if (looksJson) {
        setExportMsg(
          `The backend did not return a CSV file (content-type: ${contentType || "unknown"}).`
        );
        return;
      }

      const blob = new Blob([payload], { type: contentType || "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yala-executive-${period}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportMsg(apiErrorMessage(e, { resource: "CSV export", action: "generate" }));
    } finally {
      setExporting(false);
    }
  }, [canExportExecutive, exporting, executivePeriod]);

  const revenuePanelAction = (
    <div className="yah-chart-toolbar">
      <div className="yah-seg" role="group" aria-label="Revenue chart period">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`yah-seg__btn${executivePeriod === opt.id ? " is-on" : ""}`}
            onClick={() => setExecutivePeriod(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {canExportExecutive ? (
        <button type="button" className="yah-btn-export yah-btn-export--sm" onClick={handleExport} disabled={exporting || data.loading}>
          <Icon name="download" />
          {exporting ? "…" : "Export"}
        </button>
      ) : null}
    </div>
  );

  const mainClass = `yah${embedded ? " yah-embedded yah-embedded--exec" : ""}`;

  return (
    <div className={mainClass}>
      {!embedded && (
        <header className="yah-top">
          <div className="yah-brand">
            <span className="yah-brand__mark" aria-hidden="true">
              Y
            </span>
            <span className="yah-brand__txt">
              <strong>YALA Technologies</strong>
              <small>Admin Console</small>
            </span>
            <span className="yah-flag" role="img" aria-label="Mauritania">
              <MauritaniaFlag className="" />
            </span>
          </div>

          <div className="yah-search">
            <Icon name="search" />
            <input type="search" placeholder="Global search (rides, drivers, riders, orders…)" aria-label="Global search" />
            <span className="yah-kbd">Ctrl + K</span>
          </div>

          <div className="yah-top__right">
            <span className="yah-city">
              <Icon name="pin" />
              All Cities
            </span>
            <button className="yah-iconbtn" type="button" aria-label="Notifications">
              <Icon name="bell" />
              {pendingTotal > 0 && <span className="yah-dot">{pendingTotal}</span>}
            </button>
            <button className="yah-iconbtn" type="button" aria-label="Help">
              <Icon name="help" />
            </button>
            <span className="yah-user">
              <span className="yah-user__av" aria-hidden="true">
                {name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "YA"}
              </span>
              <span className="yah-user__txt">
                <strong>{name}</strong>
                <small>{user?.role || "Administrator"}</small>
              </span>
            </span>
          </div>
        </header>
      )}

      <div className={embedded ? "yah-grid yah-grid--embedded" : "yah-grid"}>
        {!embedded && (
          <aside className="yah-side" aria-label="Admin navigation">
            <nav className="yah-nav">
              <button className="yah-nav__item is-active" type="button" aria-current="page">
                <Icon name="home" />
                <span>Home Dashboard</span>
              </button>
              {navGroups.map((g) => {
                const id = g.id || g.label;
                return (
                  <React.Fragment key={id}>
                    <button
                      className="yah-nav__item"
                      type="button"
                      aria-expanded={open === id}
                      onClick={() => setOpen(open === id ? null : id)}
                    >
                      <Icon name={g.icon || "layers"} />
                      <span>{g.label}</span>
                      <Icon name="chev" className="yah-nav__chev" />
                    </button>
                    {open === id && (g.items || []).length > 0 && (
                      <div className="yah-nav__sub">
                        {g.items.map((it) => (
                          <a
                            key={it.to || it.label}
                            href={it.to || "#"}
                            onClick={(e) => {
                              e.preventDefault();
                              onNavigate(it.to);
                            }}
                          >
                            {it.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </aside>
        )}

        <main className="yah-main">
          <header className="yah-exec-head">
            <div>
              <h1 className="yah-exec-title">Executive Dashboard</h1>
              <p className="yah-exec-sub">Real-time operations, performance and business overview.</p>
            </div>
            <div className="yah-exec-head__controls">
              <span className="yah-exec-range" title="Dates from the executive dashboard API for the selected period">
                {rangeLabel}
              </span>
              {canExportExecutive ? (
                <button type="button" className="yah-btn-export" onClick={handleExport} disabled={exporting || data.loading}>
                  <Icon name="download" />
                  {exporting ? "Exporting…" : "Export Report"}
                </button>
              ) : null}
            </div>
          </header>
          {exportMsg ? <p className="yah-export-msg">{exportMsg}</p> : null}

          <div className={`yah-kpis${embedded ? " yah-kpis--exec" : ""}`}>
            {data.loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div className="yah-kpi" key={i}>
                    <div className="yah-skel" style={{ width: "55%", height: 26 }} />
                    <div className="yah-skel" style={{ width: "80%" }} />
                  </div>
                ))
              : data.kpis.map((k) => (
                  <article className={`yah-kpi yah-kpi--${k.tone}`} key={k.key}>
                    <div className="yah-kpi__top">
                      <span className="yah-kpi__ico" aria-hidden="true">
                        <Icon name={kpiIconName(k.key)} />
                      </span>
                      <div>
                        <div
                          className={
                            "yah-kpi__val" + (k.value === null || k.value === undefined ? " yah-kpi__val--none" : "")
                          }
                        >
                          <Value value={k.value} suffix={k.suffix} />
                        </div>
                        <div className="yah-kpi__lbl">{k.label}</div>
                      </div>
                    </div>
                    <div className="yah-kpi__foot">
                      {Array.isArray(k.sparkline) && k.sparkline.length >= 2 ? (
                        <MiniSparkline points={k.sparkline} tone={k.tone} />
                      ) : k.live && k.value !== null ? (
                        <span className="yah-kpi__live">
                          <span className="yah-kpi__pulse" />
                          Live
                        </span>
                      ) : (
                        <span className="yah-kpi__nodata">Trend unavailable — not enough data yet</span>
                      )}
                    </div>
                  </article>
                ))}
          </div>

          <div className={`yah-cols yah-cols--charts${embedded ? " yah-cols--3" : " yah-cols--2"}`}>
            <Panel
              title="Revenue performance"
              icon="chart"
              className="yah-panel--chart"
              action={embedded ? revenuePanelAction : null}
            >
              <RevenueSparkline points={data.financeChart || []} loading={data.loading} />
              <p className="yah-hint">Daily totals from paid transactions for the selected period (MRU).</p>
            </Panel>
            <Panel title="Rides & deliveries" icon="layers" className="yah-panel--chart">
              <OrdersDonut mix={data.ordersMix} loading={data.loading} />
            </Panel>
            {embedded ? (
              <Panel
                title="Order status today"
                icon="layers"
                action={<span className="yah-row__meta">{todayLabel}</span>}
              >
                {data.loading ? (
                  <Loading rows={4} />
                ) : orderStatusToday.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="yah-rows">
                    {orderStatusToday.map((row) => (
                      <div className="yah-row yah-row--info" key={row.key} title={row.hint || undefined}>
                        <span className="yah-row__ico" aria-hidden="true">
                          <Icon name={orderStatusIcon(row.key)} />
                        </span>
                        <span className="yah-row__txt">
                          {row.label}
                          <small>
                            {row.key === "ongoing" && "Active rides + deliveries (live)"}
                            {row.key === "completed_today" && "Completed rides + deliveries (today)"}
                            {row.key === "scheduled" && "Scheduled rides (platform total)"}
                            {row.key === "cancelled" && "Cancelled rides + deliveries (platform total)"}
                          </small>
                        </span>
                        <span className="yah-row__num">
                          <Value value={row.value} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="yah-hint">
                  Rows combine the operations command snapshot, CEO daily summary (when present), and executive queue counts. Percent-style trends are
                  not shown without a prior-period baseline from the API.
                </p>
              </Panel>
            ) : null}
          </div>

          <div className={`yah-cols yah-cols--bottom${embedded ? " yah-cols--3" : " yah-cols--2"}`}>
            <Panel
              title="Recent Activity"
              icon="activity"
              action={
                <button className="yah-panel__link" type="button" onClick={() => onNavigate("/admin/security/audit")}>
                  View audit log →
                </button>
              }
            >
              {data.loading ? (
                <Loading rows={5} />
              ) : activity.length === 0 ? (
                <Empty />
              ) : (
                <div className="yah-rows">
                  {activity.map((a, i) => (
                    <div className={`yah-row yah-row--${a.tone}`} key={`${a.text}-${i}`}>
                      <span className="yah-row__ico" aria-hidden="true">
                        <Icon name="check" />
                      </span>
                      <span className="yah-row__txt">{a.text}</span>
                      <span className="yah-row__meta">{a.meta}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Top performing areas" icon="bar">
              {data.loading ? (
                <Loading rows={4} />
              ) : !data.cityPerformance?.length ? (
                <Empty text="Multi-city revenue breakdown is unavailable for your role or not loaded." />
              ) : (
                <div className="yah-city-bars">
                  {data.cityPerformance.map((c) => (
                    <div className="yah-city-bar" key={c.id || c.name}>
                      <div className="yah-city-bar__head">
                        <span>{c.name}</span>
                        <span className="yah-city-bar__pct">{c.pct != null ? `${c.pct}%` : NO_DATA_LABEL}</span>
                      </div>
                      <div className="yah-city-bar__track">
                        <span className="yah-city-bar__fill" style={{ width: `${Math.min(c.pct || 0, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="yah-hint">Share of revenue by city from the multi-city overview (when permitted).</p>
            </Panel>

            {embedded ? (
              <Panel title="System health" icon="server">
                {data.loading ? (
                  <Loading rows={5} />
                ) : health.length === 0 ? (
                  <Empty text="Infrastructure status is not available from the operations command feed." />
                ) : (
                  <div className="yah-rows">
                    {health.map((h) => (
                      <div className="yah-row" key={h.name}>
                        <span className={`yah-row__ico yah-row--${h.ok ? "ok" : "alert"}`} aria-hidden="true">
                          <Icon name={h.ok ? "check" : "alert"} />
                        </span>
                        <span className="yah-row__txt">{h.name}</span>
                        <span className={`yah-status${h.ok ? "" : " yah-status--off"}`}>{h.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="yah-hint">Statuses from live operations infrastructure checks. Uptime is not recorded.</p>
              </Panel>
            ) : (
              <div className="yah-stack">
                <Panel
                  title="Today's operations"
                  icon="calendar"
                  action={<span className="yah-row__meta">{todayLabel}</span>}
                >
                  <div className="yah-rows">
                    {today.map((r) => (
                      <div className={`yah-row yah-row--${r.tone || "info"}`} key={r.label}>
                        <span className="yah-row__ico" aria-hidden="true">
                          <Icon name={r.icon} />
                        </span>
                        <span className="yah-row__txt">{r.label}</span>
                        <span className="yah-row__num">
                          <Value value={r.value} />
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="System health" icon="server">
                  {data.loading ? (
                    <Loading rows={5} />
                  ) : health.length === 0 ? (
                    <Empty text="Infrastructure status is not available from the operations command feed." />
                  ) : (
                    <div className="yah-rows">
                      {health.map((h) => (
                        <div className="yah-row" key={h.name}>
                          <span className={`yah-row__ico yah-row--${h.ok ? "ok" : "alert"}`} aria-hidden="true">
                            <Icon name={h.ok ? "check" : "alert"} />
                          </span>
                          <span className="yah-row__txt">{h.name}</span>
                          <span className={`yah-status${h.ok ? "" : " yah-status--off"}`}>{h.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="yah-hint">Statuses from live operations infrastructure checks. Uptime is not recorded.</p>
                </Panel>
              </div>
            )}
          </div>

          {embedded ? (
            <div className="yah-cols yah-cols--2 yah-cols--extras">
              <Panel
                title="Today's operations"
                icon="calendar"
                action={<span className="yah-row__meta">{todayLabel}</span>}
              >
                <div className="yah-rows">
                  {today.map((r) => (
                    <div className={`yah-row yah-row--${r.tone || "info"}`} key={r.label}>
                      <span className="yah-row__ico" aria-hidden="true">
                        <Icon name={r.icon} />
                      </span>
                      <span className="yah-row__txt">{r.label}</span>
                      <span className="yah-row__num">
                        <Value value={r.value} />
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Pending actions" icon="bell" action={pendingTotal > 0 ? <span className="yah-badge">{pendingTotal}</span> : null}>
                <div className="yah-rows">
                  {pending.map((r) => (
                    <div className="yah-row yah-row--muted" key={r.label}>
                      <span className="yah-row__ico" aria-hidden="true">
                        <Icon name={r.icon} />
                      </span>
                      <span className="yah-row__txt">{r.label}</span>
                      {Number(r.value) > 0 ? (
                        <span className="yah-badge">{r.value}</span>
                      ) : (
                        <span className="yah-badge yah-badge--grey">0</span>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          ) : null}

          {!embedded ? (
            <div className="yah-cols yah-cols--2">
              <Panel
                title="Ride status (platform totals)"
                icon="car"
                action={
                  <span className="yah-row__meta" title="Counts from the executive operations API">
                    All-time aggregates
                  </span>
                }
              >
                <div className="yah-rows">
                  {(data.operationsPipeline || []).map((row) => (
                    <div className="yah-row yah-row--muted" key={row.key}>
                      <span className="yah-row__txt">{row.label}</span>
                      <span className="yah-row__num">
                        <Value value={row.value} />
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Pending actions" icon="bell" action={pendingTotal > 0 ? <span className="yah-badge">{pendingTotal}</span> : null}>
                <div className="yah-rows">
                  {pending.map((r) => (
                    <div className="yah-row yah-row--muted" key={r.label}>
                      <span className="yah-row__ico" aria-hidden="true">
                        <Icon name={r.icon} />
                      </span>
                      <span className="yah-row__txt">{r.label}</span>
                      {Number(r.value) > 0 ? (
                        <span className="yah-badge">{r.value}</span>
                      ) : (
                        <span className="yah-badge yah-badge--grey">0</span>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          ) : null}

          {data.alerts?.length ? (
            <Panel title="Alerts" icon="alert">
              <div className="yah-rows">
                {data.alerts.map((al) => (
                  <div className="yah-row" key={al.title + (al.created_at || "")}>
                    <span className="yah-row__txt">{al.title || "Alert"}</span>
                    <span className="yah-row__meta">{al.severity || ""}</span>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          {data.error && (
            <Panel title="Data unavailable" icon="alert">
              <Empty text={data.error} error />
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <button className="yah-panel__link" type="button" onClick={data.reload}>
                  Retry
                </button>
              </div>
            </Panel>
          )}

          {!data.error && data.noPermittedSources && (
            <Panel title="Dashboard" icon="activity">
              <Empty text="No dashboard data is available for your role. Open a module from the navigation, or ask an administrator to assign a role." />
            </Panel>
          )}
        </main>
      </div>
    </div>
  );
}
