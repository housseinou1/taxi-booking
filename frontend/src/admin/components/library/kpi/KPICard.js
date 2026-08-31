import React from "react";

import InlineError from "../feedback/InlineError";
import RetryBlock from "../feedback/RetryBlock";
import { CardSkeleton } from "../feedback/skeletons";
import { formatCurrency, formatPercent } from "../utils/formatters";

function TrendArrow({ direction }) {
  if (direction === "up") return <span className="admin-kpi__trend admin-kpi__trend--up" aria-hidden="true">↑</span>;
  if (direction === "down") return <span className="admin-kpi__trend admin-kpi__trend--down" aria-hidden="true">↓</span>;
  return <span className="admin-kpi__trend admin-kpi__trend--flat" aria-hidden="true">→</span>;
}

export default function KPICard({
  label,
  value,
  subtitle,
  tone,
  format = "auto",
  trend,
  trendLabel,
  loading,
  error,
  empty,
  emptyLabel = "No data",
  onRefresh,
  onClick,
  className = "",
}) {
  if (loading) return <CardSkeleton className={className} />;

  if (error) {
    return (
      <div className={`admin-kpi admin-kpi--error ${className}`.trim()}>
        <div className="admin-kpi__label">{label}</div>
        <InlineError message={error} />
        {onRefresh ? <RetryBlock onRetry={onRefresh} label="Retry" /> : null}
      </div>
    );
  }

  if (empty) {
    return (
      <div className={`admin-kpi admin-kpi--empty ${className}`.trim()}>
        <div className="admin-kpi__label">{label}</div>
        <p className="admin-kpi__empty">{emptyLabel}</p>
        {onRefresh ? (
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onRefresh}>
            Refresh
          </button>
        ) : null}
      </div>
    );
  }

  let displayValue = value ?? "—";
  if (format === "currency") displayValue = formatCurrency(value);
  else if (format === "percent") displayValue = formatPercent(value);

  const toneClass = tone ? ` admin-kpi--${tone}` : "";
  const content = (
    <>
      <div className="admin-kpi__head">
        <div className="admin-kpi__label">{label}</div>
        {onRefresh ? (
          <button
            type="button"
            className="admin-kpi__refresh"
            aria-label={`Refresh ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
          >
            ↻
          </button>
        ) : null}
      </div>
      <div className="admin-kpi__value">{displayValue}</div>
      {subtitle ? <div className="admin-kpi__subtitle">{subtitle}</div> : null}
      {trend != null ? (
        <div className="admin-kpi__trend-row">
          <TrendArrow direction={trend} />
          <span className="admin-kpi__trend-label">{trendLabel}</span>
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`admin-kpi admin-kpi--clickable${toneClass} ${className}`.trim()}
        onClick={onClick}
        aria-label={`${label}: ${displayValue}`}
      >
        {content}
      </button>
    );
  }

  return <div className={`admin-kpi${toneClass} ${className}`.trim()}>{content}</div>;
}
