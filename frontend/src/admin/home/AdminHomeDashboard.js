import React, { useMemo } from "react";

import useAdminHomeData from "./useAdminHomeData";
import { useOptionalPermissions } from "../permissions/PermissionContext";
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
};

export function Icon({ name, className = "" }) {
  const d = I[name] || I.home;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  return <>{Number(value).toLocaleString("en-US")}{suffix ? ` ${suffix}` : ""}</>;
}

/* ------------------------------------------------------------ quick access */
const QUICK = [
  { label: "Manage Drivers", icon: "car", to: "/admin/drivers", tone: "green" },
  { label: "Manage Vehicles", icon: "car", to: "/admin/vehicles", tone: "blue" },
  { label: "Manage Riders", icon: "users", to: "/admin/riders", tone: "purple" },
  { label: "Manage Deliveries", icon: "box", to: "/admin/delivery", tone: "amber" },
  { label: "Payments & Finance", icon: "card", to: "/admin/payments", tone: "cyan" },
  { label: "Employees & HR", icon: "users", to: "/admin/employees", tone: "rose" },
  { label: "Trust & Safety", icon: "shield", to: "/admin/trust-safety", tone: "blue" },
  { label: "Reports & Analytics", icon: "bar", to: "/admin/business-intelligence", tone: "green" },
];

function Panel({ title, icon, action, children }) {
  return (
    <section className="yah-panel">
      <div className="yah-panel__head">
        <h2 className="yah-panel__title"><Icon name={icon} />{title}</h2>
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

/* ---------------------------------------------------------------- the page */
export default function AdminHomeDashboard({
  user,
  navGroups = [],
  onNavigate = (to) => { window.location.href = to; },
  /**
   * When true the component renders ONLY its content — no header, no sidebar.
   * Used when mounted inside AdminShell, which already provides both (and
   * already applies RBAC), so no navigation or permission can be lost.
   */
  embedded = false,
}) {
  // Role-aware data loading (Phase 4): the permission context tells the hook
  // which data sources this role may call, so Finance no longer requests
  // operations/executive endpoints and vice versa. When the component is
  // rendered without a provider the hook falls back to requesting everything.
  const permissions = useOptionalPermissions();
  const data = useAdminHomeData({ canView: permissions?.canView });
  const [open, setOpen] = React.useState(null);

  const name = user?.full_name || user?.name
    || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Administrator";
  const initials = name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "YA";

  // Already mapped by useAdminHomeData.buildActivity() from command.timeline[].
  const activity = useMemo(
    () => (Array.isArray(data.activity) ? data.activity : []),
    [data.activity]
  );

  const today = useMemo(() => {
    const t = data.today || {};
    return [
      { icon: "car", label: "New Rides", value: t.new_rides },
      { icon: "box", label: "New Deliveries", value: t.new_deliveries },
      { icon: "users", label: "New Registrations", value: t.new_registrations },
      { icon: "alert", label: "Open Safety Reports", value: t.open_safety_reports, tone: "alert" },
    ];
  }, [data.today]);

  // Field names come from the verified /admin/approvals/stats/ contract.
  const pending = useMemo(() => {
    const p = data.pending || {};
    return [
      { icon: "doc", label: "Driver Approvals", value: p.pending_drivers },
      { icon: "users", label: "Rider Approvals", value: p.pending_riders },
      { icon: "box", label: "Courier Approvals", value: p.pending_couriers },
    ];
  }, [data.pending]);

  const pendingTotal = pending.reduce((s, r) => s + (Number(r.value) || 0), 0);
  // Real infrastructure status from command.live_operations.infrastructure.
  const health = Array.isArray(data.health) ? data.health : [];
  const todayLabel = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className={`yah${embedded ? " yah-embedded" : ""}`}>
      {!embedded && (
      <header className="yah-top">
        <div className="yah-brand">
          <span className="yah-brand__mark" aria-hidden="true">Y</span>
          <span className="yah-brand__txt">
            <strong>YALA Technologies</strong>
            <small>Admin Console</small>
          </span>
          <span className="yah-flag" role="img" aria-label="Mauritania"><MauritaniaFlag className="" /></span>
        </div>

        <div className="yah-search">
          <Icon name="search" />
          <input type="search" placeholder="Global search (rides, drivers, riders, orders…)" aria-label="Global search" />
          <span className="yah-kbd">Ctrl + K</span>
        </div>

        <div className="yah-top__right">
          <span className="yah-city"><Icon name="pin" />All Cities</span>
          <button className="yah-iconbtn" type="button" aria-label="Notifications">
            <Icon name="bell" />
            {pendingTotal > 0 && <span className="yah-dot">{pendingTotal}</span>}
          </button>
          <button className="yah-iconbtn" type="button" aria-label="Help"><Icon name="help" /></button>
          <span className="yah-user">
            <span className="yah-user__av" aria-hidden="true">{initials}</span>
            <span className="yah-user__txt">
              <strong>{name}</strong><small>{user?.role || "Administrator"}</small>
            </span>
          </span>
        </div>
      </header>
      )}

      <div className="yah-grid">
        {!embedded && (
        <aside className="yah-side" aria-label="Admin navigation">
          <nav className="yah-nav">
            <button className="yah-nav__item is-active" type="button" aria-current="page">
              <Icon name="home" /><span>Home Dashboard</span>
            </button>
            {navGroups.map((g) => {
              const id = g.id || g.label;
              return (
                <React.Fragment key={id}>
                  <button className="yah-nav__item" type="button" aria-expanded={open === id}
                          onClick={() => setOpen(open === id ? null : id)}>
                    <Icon name={g.icon || "layers"} />
                    <span>{g.label}</span>
                    <Icon name="chev" className="yah-nav__chev" />
                  </button>
                  {open === id && (g.items || []).length > 0 && (
                    <div className="yah-nav__sub">
                      {g.items.map((it) => (
                        <a key={it.to || it.label} href={it.to || "#"}
                           onClick={(e) => { e.preventDefault(); onNavigate(it.to); }}>{it.label}</a>
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
          {/* ------------------------------------------------------ banner */}
          <section className="yah-banner">
            <div className="yah-banner__art" aria-hidden="true" />
            <div className="yah-banner__txt">
              <h1>Welcome back, {name}</h1>
              <p>YALA Technologies — Executive Admin Dashboard</p>
              <span className="yah-banner__tag">Ride • Drive • Deliver — One platform for Mauritania</span>
            </div>
            <div className="yah-banner__art--right" aria-hidden="true">
              <span className="yah-banner__chip"><Icon name="car" /></span>
              <span className="yah-banner__chip"><Icon name="box" /></span>
              <span className="yah-banner__chip"><MauritaniaFlag className="" /></span>
            </div>
          </section>

          {/* -------------------------------------------------------- KPIs */}
          <div className="yah-kpis">
            {data.loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div className="yah-kpi" key={i}>
                    <div className="yah-skel" style={{ width: "55%", height: 26 }} />
                    <div className="yah-skel" style={{ width: "80%" }} />
                  </div>
                ))
              : data.kpis.map((k) => (
                  <article className={`yah-kpi yah-kpi--${k.tone}`} key={k.key}>
                    <div className="yah-kpi__top">
                      <span className="yah-kpi__ico" aria-hidden="true">
                        <Icon name={k.key === "riders" || k.key === "drivers" ? "users"
                              : k.key === "delivery" ? "box"
                              : k.key === "completed" ? "check"
                              : k.key === "revenue" ? "card" : "activity"} />
                      </span>
                      <div>
                        <div className={"yah-kpi__val" + (k.value === null || k.value === undefined ? " yah-kpi__val--none" : "")}><Value value={k.value} suffix={k.suffix} /></div>
                        <div className="yah-kpi__lbl">{k.label}</div>
                      </div>
                    </div>
                    <div className="yah-kpi__foot">
                      {k.live && k.value !== null
                        ? <span className="yah-kpi__live"><span className="yah-kpi__pulse" />Live</span>
                        : <span className="yah-kpi__nodata">Trend unavailable — not enough data yet</span>}
                    </div>
                  </article>
                ))}
          </div>

          {/* ------------------------------------------------- quick access */}
          <section className="yah-panel yah-quick">
            <div className="yah-panel__head">
              <h2 className="yah-panel__title"><Icon name="bolt" />Quick Access</h2>
              <button className="yah-panel__link" type="button" onClick={() => onNavigate("/admin")}>Manage Platform</button>
            </div>
            <div className="yah-quick__grid">
              {QUICK.map((q) => (
                <button className={`yah-quick__btn yah-quick__btn--${q.tone}`} type="button"
                        key={q.label} onClick={() => onNavigate(q.to)}>
                  <span className="yah-quick__ico" aria-hidden="true"><Icon name={q.icon} /></span>
                  <span className="yah-quick__lbl">{q.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ------------------------------------------------ lower panels */}
          <div className="yah-cols yah-cols--2">
            <div className="yah-stack">
              <Panel
                title="Recent Activity"
                icon="activity"
                action={<button className="yah-panel__link" type="button"
                                onClick={() => onNavigate("/admin/security/audit")}>View All Activity →</button>}
              >
                {data.loading ? <Loading rows={5} />
                  : activity.length === 0 ? <Empty />
                  : (
                    <div className="yah-rows">
                      {activity.map((a, i) => (
                        <div className={`yah-row yah-row--${a.tone}`} key={`${a.text}-${i}`}>
                          <span className="yah-row__ico" aria-hidden="true"><Icon name="check" /></span>
                          <span className="yah-row__txt">{a.text}</span>
                          <span className="yah-row__meta">{a.meta}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </Panel>

              <div className="yah-cols yah-cols--3">
                <Panel title="System Overview" icon="server">
                  <div className="yah-rows">
                    {data.loading ? <Loading rows={5} />
                      : health.length === 0 ? <Empty />
                      : health.map((h) => (
                        <div className="yah-row" key={h.name}>
                          <span className={`yah-row__ico yah-row--${h.ok ? "ok" : "alert"}`} aria-hidden="true">
                            <Icon name={h.ok ? "check" : "alert"} />
                          </span>
                          <span className="yah-row__txt">{h.name}</span>
                          <span className={`yah-status${h.ok ? "" : " yah-status--off"}`}>{h.label}</span>
                        </div>
                      ))}
                  </div>
                </Panel>

                <Panel title="System Health" icon="chart">
                  <div className="yah-health">
                    <div className="yah-health__ring" style={{ "--p": 0 }}>
                      <span className="yah-health__val" style={{ fontSize: 15, color: "var(--yah-dim)" }}>—</span>
                    </div>
                    <span className="yah-health__lbl">Uptime (30 days)</span>
                    <p className="yah-health__nodata">
                      Not enough data yet — uptime is not recorded by the platform.
                    </p>
                  </div>
                </Panel>
              </div>
            </div>





            <div className="yah-stack">
              <Panel
                title="Today's Operations"
                icon="calendar"
                action={<span className="yah-row__meta">{todayLabel}</span>}
              >
                <div className="yah-rows">
                  {today.map((r) => (
                    <div className={`yah-row yah-row--${r.tone || "info"}`} key={r.label}>
                      <span className="yah-row__ico" aria-hidden="true"><Icon name={r.icon} /></span>
                      <span className="yah-row__txt">{r.label}</span>
                      <span className="yah-row__num"><Value value={r.value} /></span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Pending Actions"
                icon="bell"
                action={pendingTotal > 0 ? <span className="yah-badge">{pendingTotal}</span> : null}
              >
                <div className="yah-rows">
                  {pending.map((r) => (
                    <div className="yah-row yah-row--muted" key={r.label}>
                      <span className="yah-row__ico" aria-hidden="true"><Icon name={r.icon} /></span>
                      <span className="yah-row__txt">{r.label}</span>
                      {Number(r.value) > 0
                        ? <span className="yah-badge">{r.value}</span>
                        : <span className="yah-badge yah-badge--grey">0</span>}
                    </div>
                  ))}
                </div>
              </Panel>

              {data.error && (
                <Panel title="Data unavailable" icon="alert">
                  <Empty text={data.error} error />
                  <div style={{ textAlign: "center", marginTop: 10 }}>
                    <button className="yah-panel__link" type="button" onClick={data.reload}>Retry</button>
                  </div>
                </Panel>
              )}

              {!data.error && data.noPermittedSources && (
                <Panel title="Dashboard" icon="activity">
                  <Empty text="No dashboard data is available for your role. Open a module from the navigation, or ask an administrator to assign a role." />
                </Panel>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

