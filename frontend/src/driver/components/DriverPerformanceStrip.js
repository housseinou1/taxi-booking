import React from "react";
import { formatMoney, MARKET } from "../../marketConfig";
import "./DriverPerformanceStrip.css";

// ─── Animated ring chip ──────────────────────────────────────────────────────
function RingChip({ label, value, percent, color, sub }) {
  const R = 24;
  const circ = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  const offset = circ * (1 - pct / 100);
  return (
    <div
      className="driver-perf-chip driver-perf-chip--ring"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={`${label}: ${Math.round(pct)}%`}
    >
      <div className="driver-perf-chip__ring-wrap" aria-hidden="true">
        <svg width={64} height={64} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={32} cy={32} r={R} fill="none" stroke="rgba(15,23,42,0.07)" strokeWidth={5} />
          <circle
            cx={32} cy={32} r={R} fill="none"
            stroke={color} strokeWidth={5} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="driver-perf-chip__ring-center">
          <strong style={{ color }}>{value}</strong>
        </div>
      </div>
      <span className="driver-perf-chip__label">{label}</span>
      {sub && <span className="driver-perf-chip__sub">{sub}</span>}
    </div>
  );
}

// ─── Plain chip (no ring) ────────────────────────────────────────────────────
function PlainChip({ label, value, icon, color }) {
  return (
    <div className="driver-perf-chip">
      <strong style={{ color: color || "#0f172a", fontSize: 18 }}>
        {icon && <span style={{ marginRight: 3 }} aria-hidden="true">{icon}</span>}{value}
      </strong>
      <span className="driver-perf-chip__label">{label}</span>
    </div>
  );
}

// ─── Streak banner ───────────────────────────────────────────────────────────
function StreakBanner({ streak }) {
  if (!streak || streak < 2) return null;
  return (
    <div className="driver-perf-streak">
      <span className="driver-perf-streak__fire" aria-hidden="true">🔥</span>
      <div>
        <strong>{streak} ride streak!</strong>
        <span>Keep the momentum going</span>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function DriverPerformanceStrip({
  stats,
  todayEarnings = 0,
  onOpenEarnings,
}) {
  if (!stats) return null;

  const acceptance        = Number(stats.acceptance_rate   ?? stats.acceptance_rate_points ?? 0);
  const completion        = Number(stats.completion_rate   ?? 0);
  const cancellation      = Number(stats.cancellation_rate ?? 0);
  const noShowRate        = Number(stats.no_show_rate      ?? 0);
  const noShowCount       = Number(stats.total_rides_no_show ?? 0);
  const rating            = Number(stats.average_rating    ?? stats.rating ?? 0);
  const driverScore       = Number(stats.driver_score ?? stats.performance_points ?? 0);
  const driverScoreLabel  = stats.driver_score_label || "";
  const streak            = Number(stats.streak            ?? 0);
  const ridesTotal        = Number(stats.rides_today       ?? stats.total_rides_today ?? 0);
  const onlineHours       = Number(stats.online_hours_today ?? 0);
  const perHour           = onlineHours > 0 ? Math.round(todayEarnings / onlineHours) : null;
  const cancellationWarn  = stats.cancellation_warning || "";
  const underReview       = stats.account_under_review || false;

  const accColor  = acceptance  >= 80 ? "#047857" : acceptance  >= 60 ? "#b45309" : "#b91c1c";
  const compColor = completion  >= 90 ? "#0369a1" : completion  >= 75 ? "#b45309" : "#b91c1c";
  const cxlColor  = cancellation <= 5  ? "#047857" : cancellation <= 15 ? "#b45309" : "#b91c1c";

  return (
    <section className="driver-perf-strip" aria-label="Driver performance">
      {/* Cancellation / under-review warning */}
      {cancellationWarn && (
        <div className={`driver-perf-strip__warning${underReview ? " driver-perf-strip__warning--review" : ""}`}>
          {underReview ? "⚠️ Account under review — " : "⚠️ "}{cancellationWarn}
        </div>
      )}

      {/* Header */}
      <div className="driver-perf-strip__header">
        <strong>Your performance</strong>
        <button type="button" className="driver-perf-strip__link" onClick={onOpenEarnings}>
          {formatMoney(todayEarnings)} today ›
        </button>
      </div>

      {driverScoreLabel && (
        <div className="driver-perf-strip__score-badge" aria-label="Driver score">
          ⭐ {driverScore}/100 · {driverScoreLabel}
        </div>
      )}

      {/* Per-hour + rides hero row */}
      <div className="driver-perf-strip__hero">
        <div className="driver-perf-strip__hero-stat">
          <strong>{ridesTotal}</strong>
          <span>Trips today</span>
        </div>
        {perHour != null && (
          <div className="driver-perf-strip__hero-stat">
            <strong>{perHour} <small>{MARKET.currency}/h</small></strong>
            <span>Per hour</span>
          </div>
        )}
        {rating > 0 && (
          <div className="driver-perf-strip__hero-stat">
            <strong>⭐ {rating.toFixed(1)}</strong>
            <span>Rating</span>
          </div>
        )}
      </div>

      <StreakBanner streak={streak} />

      {/* Ring stats grid */}
      <div className="driver-perf-strip__grid">
        <RingChip
          label="Acceptance"
          value={`${Math.round(acceptance)}%`}
          percent={acceptance}
          color={accColor}
          sub={acceptance >= 80 ? "Great" : "Improve"}
        />
        <RingChip
          label="Completion"
          value={`${Math.round(completion)}%`}
          percent={completion}
          color={compColor}
        />
        <RingChip
          label="Cancels"
          value={`${Math.round(cancellation)}%`}
          percent={100 - cancellation}
          color={cxlColor}
        />
        {noShowRate > 0 ? (
          <RingChip
            label="No-shows"
            value={`${Math.round(noShowRate)}%`}
            percent={100 - noShowRate}
            color={noShowRate <= 5 ? "#047857" : "#b45309"}
            sub={noShowCount > 0 ? `${noShowCount} total` : undefined}
          />
        ) : (
          <PlainChip
            label="No-shows"
            value={noShowCount > 0 ? `${noShowCount}` : "0"}
            icon="✓"
            color="#047857"
          />
        )}
      </div>
    </section>
  );
}
