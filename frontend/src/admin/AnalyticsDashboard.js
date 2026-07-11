/**
 * AnalyticsDashboard — Uber/Lyft-grade professional analytics.
 * Props:
 *   mode:  "admin" | "driver" | "rider"
 *   token: JWT access token string
 */
import React, { useCallback, useEffect, useState } from "react";
import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { formatMoney } from "../marketConfig";

// ─── Design tokens (Uber-inspired) ──────────────────────────────────────────
const T = {
  bg:        "#000000",
  card:      "#141414",
  cardHover: "#1a1a1a",
  border:    "#262626",
  text:      "#ffffff",
  sub:       "#a3a3a3",
  dim:       "#737373",
  green:     "#00A651",
  greenBg:   "rgba(6,193,103,0.12)",
  blue:      "#276ef1",
  blueBg:    "rgba(39,110,241,0.12)",
  amber:     "#D4AF37",
  amberBg:   "rgba(255,192,67,0.12)",
  red:       "#e11900",
  redBg:     "rgba(225,25,0,0.12)",
  purple:    "#7356bf",
  purpleBg:  "rgba(115,86,191,0.12)",
  radius:    "16px",
  radiusSm:  "10px",
  font:      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  shadow:    "0 1px 3px rgba(0,0,0,0.4)",
  shadowLg:  "0 8px 32px rgba(0,0,0,0.5)",
};

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchAnalytics(mode, cityId = "") {
  const path = mode === "admin" ? "/rides/analytics/admin/"
    : mode === "driver" ? "/rides/analytics/driver/"
    : "/rides/analytics/rider/";
  const query = mode === "admin" && cityId ? `?city=${cityId}` : "";
  const res = await authenticatedApi.get(`${API_URL}${path}${query}`);
  return res.data;
}

async function fetchActivityHeatmap(period, cityId = "") {
  const cityQuery = cityId ? `&city=${cityId}` : "";
  const res = await authenticatedApi.get(`${API_URL}/rides/analytics/admin/activity-heatmap/?period=${period}${cityQuery}`);
  return res.data;
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
function MetricCard({ label, value, change, accent = T.green, accentBg = T.greenBg }) {
  return (
    <div style={{
      background: T.card, borderRadius: T.radius, padding: "20px 24px",
      display: "flex", flexDirection: "column", gap: 8,
      boxShadow: T.shadow, transition: "transform 0.15s, background 0.15s",
      cursor: "default", minWidth: 0,
    }}
    onMouseEnter={e => { e.currentTarget.style.background = T.cardHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = T.card; e.currentTarget.style.transform = "none"; }}
    >
      <span style={{ color: T.sub, fontSize: 13, fontWeight: 500, letterSpacing: "0.01em" }}>{label}</span>
      <span style={{ color: T.text, fontSize: 28, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</span>
      {change && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content",
          padding: "3px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
          background: accentBg, color: accent,
        }}>{change}</span>
      )}
    </div>
  );
}

// ─── Chart Container ─────────────────────────────────────────────────────────
function ChartPanel({ title, subtitle, action, children }) {
  return (
    <div style={{
      background: T.card, borderRadius: T.radius, padding: "24px",
      boxShadow: T.shadow, display: "flex", flexDirection: "column", gap: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: T.text, fontSize: 16, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ color: T.dim, fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Period Selector ─────────────────────────────────────────────────────────
function PeriodSelector({ value, onChange }) {
  const opts = ["daily", "weekly", "monthly"];
  return (
    <div style={{ display: "flex", background: "#262626", borderRadius: 8, padding: 3 }}>
      {opts.map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          padding: "6px 14px", borderRadius: 6, border: 0, cursor: "pointer",
          background: value === p ? "#ffffff" : "transparent",
          color: value === p ? "#000000" : T.dim,
          fontWeight: 600, fontSize: 12, textTransform: "capitalize",
          transition: "all 0.2s",
        }}>{p}</button>
      ))}
    </div>
  );
}

// ─── Bar Chart (Uber style — rounded, gradient) ──────────────────────────────
function UberBarChart({ data, color = T.green, height = 160 }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, paddingTop: 8 }}>
      {data.map((item, i) => {
        const pct = Math.max(3, (item.value / max) * 100);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", gap: 6 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div title={`${item.label}: ${formatMoney(item.value)}`} style={{
                width: "100%", height: `${pct}%`, minHeight: 3,
                background: item.value > 0 ? color : "#262626",
                borderRadius: "4px 4px 2px 2px",
                transition: "height 0.5s cubic-bezier(0.4,0,0.2,1)",
                opacity: item.value > 0 ? 1 : 0.4,
              }} />
            </div>
            <span style={{ color: T.dim, fontSize: 10, fontWeight: 500, textAlign: "center", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Area Chart (SVG) ────────────────────────────────────────────────────────
function AreaChart({ data, color = T.green, height = 100 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 300; const H = height;
  const pts = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * W,
    y: H - (d.value / max) * (H - 16) - 8,
  }));
  const line = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const id = `area-${color.replace(/[^a-z0-9]/gi, "")}-${Math.random().toString(36).slice(2,6)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Donut ───────────────────────────────────────────────────────────────────
function Donut({ segments, size = 100, label }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const r = 36; const cx = 50; const cy = 50;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#262626" strokeWidth="10" />
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={seg.color} strokeWidth="10"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              style={{ transform: "rotate(-90deg)", transformOrigin: "50px 50px", transition: "stroke-dasharray 0.6s ease" }}
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      {label && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <span style={{ color: T.text, fontSize: 18, fontWeight: 700 }}>{total}</span>
          <span style={{ color: T.dim, fontSize: 10 }}>{label}</span>
        </div>
      )}
    </div>
  );
}

// ─── List Row ────────────────────────────────────────────────────────────────
function ListRow({ rank, title, subtitle, value, accent = T.green }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      borderRadius: T.radiusSm, background: "#1a1a1a",
      transition: "background 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "#222"}
    onMouseLeave={e => e.currentTarget.style.background = "#1a1a1a"}
    >
      {rank != null && (
        <span style={{
          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: rank <= 3 ? accent : "#262626",
          color: rank <= 3 ? "#000" : T.dim, fontSize: 12, fontWeight: 700,
        }}>{rank}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.text, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        {subtitle && <div style={{ color: T.dim, fontSize: 12, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <span style={{ color: accent, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

// ─── Progress ────────────────────────────────────────────────────────────────
function Progress({ label, value, max, color = T.green, display }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: T.sub, fontSize: 13 }}>{label}</span>
        <span style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{display || value}</span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: "#262626" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      </div>
    </div>
  );
}

// ─── Admin Activity Heat Map ────────────────────────────────────────────────
function DemandHeatSurface({ zones, bounds }) {
  if (!zones || zones.length === 0) {
    return (
      <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: T.dim }}>
        No ride requests in this period
      </div>
    );
  }

  const latRange = Math.max(bounds.max_lat - bounds.min_lat, 0.01);
  const lngRange = Math.max(bounds.max_lng - bounds.min_lng, 0.01);
  const positioned = zones.map(zone => ({
    ...zone,
    x: 6 + ((zone.lng - bounds.min_lng) / lngRange) * 88,
    y: 94 - ((zone.lat - bounds.min_lat) / latRange) * 88,
  }));

  return (
    <div style={{
      position: "relative", height: 360, overflow: "hidden", borderRadius: 8,
      background: "#101820",
      border: `1px solid ${T.border}`,
    }}>
      <div style={{
        position: "absolute", inset: 0, opacity: 0.25,
        backgroundImage: "linear-gradient(#51606d 1px, transparent 1px), linear-gradient(90deg, #51606d 1px, transparent 1px)",
        backgroundSize: "10% 10%",
      }} />
      <div style={{ position: "absolute", left: 14, top: 12, color: "#b8c6d1", fontSize: 11, fontWeight: 700 }}>
        DEMAND GRID
      </div>
      {positioned.map((zone, index) => {
        const size = 26 + zone.demand_intensity * 48;
        const color = zone.needs_drivers ? T.red : zone.demand_intensity >= 0.6 ? T.amber : T.green;
        return (
          <div key={`${zone.lat}-${zone.lng}-${index}`} title={`${zone.label}: ${zone.requests} requests, ${zone.available_drivers} available drivers`} style={{
            position: "absolute",
            left: `${zone.x}%`,
            top: `${zone.y}%`,
            width: size,
            height: size,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: color,
            opacity: 0.3 + zone.demand_intensity * 0.55,
            border: `2px solid ${color}`,
            boxShadow: `0 0 ${12 + size / 2}px ${color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            cursor: "help",
          }}>
            {zone.requests}
          </div>
        );
      })}
      <div style={{
        position: "absolute", right: 12, bottom: 12, display: "flex", gap: 12,
        background: "rgba(0,0,0,0.68)", borderRadius: 6, padding: "7px 9px", color: "#fff", fontSize: 10,
      }}>
        <span><b style={{ color: T.red }}>●</b> Drivers needed</span>
        <span><b style={{ color: T.amber }}>●</b> High demand</span>
        <span><b style={{ color: T.green }}>●</b> Covered</span>
      </div>
    </div>
  );
}

function PeakHoursChart({ data }) {
  const max = Math.max(...(data || []).map(item => item.requests), 1);
  return (
    <div style={{ height: 160, display: "flex", alignItems: "flex-end", gap: 3 }}>
      {(data || []).map(item => (
        <div key={item.hour} title={`${item.label}: ${item.requests} requests`} style={{
          flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 5,
        }}>
          <div style={{
            height: `${Math.max(3, (item.requests / max) * 100)}%`,
            background: item.requests === max && item.requests > 0 ? T.red : T.blue,
            borderRadius: "3px 3px 1px 1px",
            opacity: item.requests > 0 ? 1 : 0.25,
          }} />
          {item.hour % 3 === 0 && <span style={{ color: T.dim, fontSize: 9 }}>{String(item.hour).padStart(2, "0")}</span>}
        </div>
      ))}
    </div>
  );
}

function AdminActivityHeatMap({ cityId = "" }) {
  const [period, setPeriod] = useState("daily");
  const [heatmap, setHeatmap] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    fetchActivityHeatmap(period, cityId)
      .then(data => { if (active) setHeatmap(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [period, cityId]);

  if (error) {
    return <ChartPanel title="Driver activity heat map"><div style={{ color: T.red }}>Unable to load heat map: {error}</div></ChartPanel>;
  }
  if (!heatmap) {
    return <ChartPanel title="Driver activity heat map"><div style={{ color: T.dim, padding: 24 }}>Loading demand and coverage…</div></ChartPanel>;
  }

  const { summary, zones, bounds, peak_hours, busiest_hours } = heatmap;
  const driverNeeds = zones.filter(zone => zone.needs_drivers).slice(0, 6);
  const highestDemand = [...zones].sort((a, b) => b.requests - a.requests).slice(0, 3);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: T.text, fontSize: 18, fontWeight: 700 }}>Driver Activity Heat Map</div>
          <div style={{ color: T.dim, fontSize: 13 }}>Ride demand compared with live available-driver coverage</div>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
        <MetricCard label="Ride requests" value={summary.ride_requests} accent={T.blue} accentBg={T.blueBg} />
        <MetricCard label="Available drivers" value={summary.available_drivers} accent={T.green} accentBg={T.greenBg} />
        <MetricCard label="High-demand areas" value={summary.high_demand_areas} accent={T.amber} accentBg={T.amberBg} />
        <MetricCard label="Areas needing drivers" value={summary.areas_needing_drivers} accent={T.red} accentBg={T.redBg} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
        <ChartPanel title="Ride requests by location" subtitle="Larger circles indicate more requests; red areas need more drivers">
          <DemandHeatSurface zones={zones} bounds={bounds} />
        </ChartPanel>
        <ChartPanel title="Demand and coverage priorities" subtitle="Highest demand and lowest driver coverage">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: T.sub, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 2 }}>Highest ride demand</div>
            {highestDemand.map((zone, i) => (
              <ListRow key={`demand-${zone.lat}-${zone.lng}`} rank={i + 1} title={zone.label}
                subtitle={`${zone.completed} completed · ${zone.cancelled} cancelled`}
                value={`${zone.requests} requests`} accent={T.amber} />
            ))}
            <div style={{ color: T.sub, fontSize: 11, fontWeight: 800, textTransform: "uppercase", margin: "14px 0 2px" }}>Lowest driver coverage</div>
            {driverNeeds.length > 0 ? driverNeeds.map((zone, i) => (
              <ListRow key={`coverage-${zone.lat}-${zone.lng}`} rank={i + 1} title={zone.label}
                subtitle={`${zone.avg_daily_requests}/day · ${zone.available_drivers} live · recommend ${zone.recommended_drivers}`}
                value={`${zone.need_score}×`} accent={T.red} />
            )) : <div style={{ color: T.dim, padding: 20 }}>Current driver coverage meets recorded demand.</div>}
          </div>
        </ChartPanel>
      </div>

      <ChartPanel title="Peak request hours" subtitle={`Busiest: ${busiest_hours.map(hour => `${hour.label} (${hour.requests})`).join(", ") || "No requests"}`}>
        <PeakHoursChart data={peak_hours} />
      </ChartPanel>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function DriverView({ data }) {
  const [period, setPeriod] = useState("daily");
  const { summary, charts } = data;
  const chart = period === "daily" ? charts.daily_earnings
    : period === "weekly" ? charts.weekly_earnings : charts.monthly_earnings;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label="Today's earnings" value={formatMoney(summary.today_earnings)} accent={T.green} accentBg={T.greenBg} change={`${summary.today_rides} rides`} />
        <MetricCard label="This week" value={formatMoney(summary.week_earnings)} accent={T.blue} accentBg={T.blueBg} />
        <MetricCard label="This month" value={formatMoney(summary.month_earnings)} accent={T.amber} accentBg={T.amberBg} />
        <MetricCard label="All time" value={formatMoney(summary.total_earnings)} accent={T.purple} accentBg={T.purpleBg} change={`${summary.total_rides} total rides`} />
        <MetricCard label="Avg fare" value={formatMoney(summary.avg_fare)} />
        <MetricCard label="Rating" value={summary.avg_rating > 0 ? `${summary.avg_rating} ★` : "—"} accent={T.amber} accentBg={T.amberBg} />
      </div>

      {/* Earnings chart */}
      <ChartPanel title="Earnings" subtitle="Your income over time"
        action={<PeriodSelector value={period} onChange={setPeriod} />}>
        <UberBarChart data={chart} color={T.green} height={180} />
      </ChartPanel>

      {/* Rides trend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ChartPanel title="Completed rides" subtitle="Last 30 days">
          <AreaChart data={charts.completed_rides_daily} color={T.green} height={90} />
        </ChartPanel>
        <ChartPanel title="Cancellations" subtitle="Last 30 days">
          <AreaChart data={charts.cancelled_rides_daily} color={T.red} height={90} />
        </ChartPanel>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIDER VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function RiderView({ data }) {
  const [period, setPeriod] = useState("monthly");
  const { summary, charts, ride_type_breakdown, recent_rides } = data;
  const chart = period === "daily" ? charts.daily_spending
    : period === "weekly" ? charts.weekly_spending : charts.monthly_spending;

  const colors = [T.green, T.blue, T.amber, T.purple];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label="Total spent" value={formatMoney(summary.total_spent)} accent={T.blue} accentBg={T.blueBg} change={`${summary.total_rides} rides`} />
        <MetricCard label="This month" value={formatMoney(summary.month_spent)} accent={T.amber} accentBg={T.amberBg} />
        <MetricCard label="Avg fare" value={formatMoney(summary.avg_fare)} />
        <MetricCard label="Cancelled" value={summary.cancelled_rides} accent={T.red} accentBg={T.redBg} />
      </div>

      {/* Spending chart */}
      <ChartPanel title="Spending" subtitle="Your ride expenses over time"
        action={<PeriodSelector value={period} onChange={setPeriod} />}>
        <UberBarChart data={chart} color={T.blue} height={160} />
      </ChartPanel>

      {/* Ride type + recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
        {ride_type_breakdown && ride_type_breakdown.length > 0 && (
          <ChartPanel title="Ride types">
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <Donut size={90} label="rides" segments={ride_type_breakdown.map((r, i) => ({ value: r.count, color: colors[i % 4] }))} />
              <div style={{ flex: 1 }}>
                {ride_type_breakdown.map((r, i) => (
                  <Progress key={r.ride_type} label={r.ride_type} value={r.count} max={summary.total_rides} color={colors[i % 4]} display={`${r.count}`} />
                ))}
              </div>
            </div>
          </ChartPanel>
        )}
        {recent_rides && recent_rides.length > 0 && (
          <ChartPanel title="Recent rides">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent_rides.slice(0, 6).map(ride => (
                <ListRow key={ride.id} title={`${ride.pickup} → ${ride.destination}`}
                  subtitle={`${ride.ride_type} · ${ride.distance_km} km`}
                  value={formatMoney(ride.fare)} accent={T.green} />
              ))}
            </div>
          </ChartPanel>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function AdminView({ data, cityId }) {
  const [revPeriod, setRevPeriod] = useState("monthly");
  const { summary, charts, ride_type_breakdown, top_drivers } = data;
  const revChart = revPeriod === "daily" ? charts.daily_revenue
    : revPeriod === "weekly" ? charts.weekly_revenue : charts.monthly_revenue;
  const colors = [T.green, T.blue, T.amber, T.purple];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label="Total revenue" value={formatMoney(summary.total_revenue)} accent={T.green} accentBg={T.greenBg} />
        <MetricCard label="Platform commission" value={formatMoney(summary.total_commission)} accent={T.amber} accentBg={T.amberBg} change={`${summary.completion_rate}% completion`} />
        <MetricCard label="Driver payouts" value={formatMoney(summary.total_driver_earnings)} accent={T.blue} accentBg={T.blueBg} />
        <MetricCard label="Total rides" value={summary.total_rides} accent={T.purple} accentBg={T.purpleBg} change={`${summary.active_rides} active now`} />
        <MetricCard label="Completed" value={summary.completed_rides} accent={T.green} accentBg={T.greenBg} />
        <MetricCard label="Cancelled" value={summary.cancelled_rides} accent={T.red} accentBg={T.redBg} change={`${summary.cancellation_rate}%`} />
        <MetricCard label="Avg fare" value={formatMoney(summary.avg_fare)} />
      </div>

      {/* Revenue chart */}
      <ChartPanel title="Revenue" subtitle="Total fare collected"
        action={<PeriodSelector value={revPeriod} onChange={setRevPeriod} />}>
        <UberBarChart data={revChart} color={T.green} height={200} />
      </ChartPanel>

      <AdminActivityHeatMap cityId={cityId} />

      {/* Commission + rides trend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ChartPanel title="Commission earned" subtitle="Monthly platform fees">
          <UberBarChart data={charts.monthly_commission} color={T.amber} height={120} />
        </ChartPanel>
        <ChartPanel title="User growth" subtitle="New registrations per month">
          <UberBarChart data={charts.user_growth} color={T.blue} height={120} />
        </ChartPanel>
      </div>

      {/* Completed vs cancelled */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ChartPanel title="Completed rides" subtitle="Daily (30 days)">
          <AreaChart data={charts.completed_rides_daily} color={T.green} height={90} />
        </ChartPanel>
        <ChartPanel title="Cancellations" subtitle="Daily (30 days)">
          <AreaChart data={charts.cancelled_rides_daily} color={T.red} height={90} />
        </ChartPanel>
      </div>

      {/* Ride types + Top drivers */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
        {ride_type_breakdown && ride_type_breakdown.length > 0 && (
          <ChartPanel title="Revenue by type">
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <Donut size={90} label="types" segments={ride_type_breakdown.map((r, i) => ({ value: r.count, color: colors[i % 4] }))} />
              <div style={{ flex: 1 }}>
                {ride_type_breakdown.map((r, i) => (
                  <Progress key={r.ride_type} label={r.ride_type} value={r.revenue} max={summary.total_revenue} color={colors[i % 4]} display={formatMoney(r.revenue)} />
                ))}
              </div>
            </div>
          </ChartPanel>
        )}
        {top_drivers && top_drivers.length > 0 && (
          <ChartPanel title="Top drivers" subtitle="By total earnings">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {top_drivers.map((d, i) => (
                <ListRow key={d.driver__id || i} rank={i + 1} title={d.name}
                  subtitle={`${d.ride_count} rides · ${d.avg_rating > 0 ? d.avg_rating + " ★" : "—"}`}
                  value={formatMoney(d.total_earned)} accent={T.amber} />
              ))}
            </div>
          </ChartPanel>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function AnalyticsDashboard({ mode = "admin" }) {
  const [data, setData] = useState(null);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); setData(await fetchAnalytics(mode, selectedCity)); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [mode, selectedCity]);

  const loadCities = useCallback(async () => {
    if (mode !== "admin") return;
    try {
      const res = await authenticatedApi.get(`${API_URL}/locations/cities/`);
      setCities(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setCities([]);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCities(); }, [loadCities]);

  const shell = {
    fontFamily: T.font, background: T.bg, color: T.text,
    padding: "28px 24px", minHeight: "100vh", boxSizing: "border-box",
  };

  if (loading) return (
    <div style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.green, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: T.dim, fontSize: 14 }}>Loading analytics…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ ...shell, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: T.card, borderRadius: T.radius, padding: "32px", textAlign: "center", maxWidth: 360, boxShadow: T.shadowLg }}>
        <p style={{ color: T.red, fontSize: 15, fontWeight: 600, margin: "0 0 8px" }}>Unable to load analytics</p>
        <p style={{ color: T.dim, fontSize: 13, margin: "0 0 20px" }}>{error}</p>
        <button onClick={load} style={{
          padding: "10px 24px", borderRadius: 8, border: 0,
          background: T.green, color: "#000", fontWeight: 600, fontSize: 14, cursor: "pointer",
        }}>Try again</button>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div style={shell}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.text }}>
          {mode === "admin" ? "Platform Analytics" : mode === "driver" ? "Earnings Dashboard" : "Spending Overview"}
        </h2>
        <p style={{ margin: "4px 0 0", color: T.dim, fontSize: 14 }}>
          {mode === "admin" ? "Revenue, rides, and growth metrics" : mode === "driver" ? "Track your income and performance" : "Your ride expenses and history"}
        </p>
        {mode === "admin" && (
          <select
            value={selectedCity}
            onChange={(event) => setSelectedCity(event.target.value)}
            style={{
              marginTop: 14,
              minHeight: 40,
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: T.card,
              color: T.text,
              padding: "0 12px",
              fontWeight: 700,
            }}
          >
            <option value="">All cities</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} · {city.region_name}
              </option>
            ))}
          </select>
        )}
      </div>
      {mode === "driver" && <DriverView data={data} />}
      {mode === "rider" && <RiderView data={data} />}
      {mode === "admin" && <AdminView data={data} cityId={selectedCity} />}
    </div>
  );
}
