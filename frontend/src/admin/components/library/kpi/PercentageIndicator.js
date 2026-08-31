import React from "react";

import { formatPercent } from "../utils/formatters";

export default function PercentageIndicator({
  value,
  label,
  tone,
  target,
  showBar = true,
  decimals = 1,
}) {
  const num = Number(value);
  const safe = Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0;
  const resolvedTone =
    tone ||
    (target != null && num >= target
      ? "success"
      : num >= (target || 70) * 0.85
        ? "warning"
        : "danger");

  return (
    <div className="admin-pct" aria-label={label ? `${label}: ${formatPercent(num, { decimals })}` : undefined}>
      <div className="admin-pct__head">
        {label ? <span className="admin-pct__label">{label}</span> : null}
        <strong className={`admin-pct__value admin-pct__value--${resolvedTone}`}>
          {formatPercent(num, { decimals })}
        </strong>
      </div>
      {showBar ? (
        <div className="admin-pct__track" role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
          <div className={`admin-pct__fill admin-pct__fill--${resolvedTone}`} style={{ width: `${safe}%` }} />
        </div>
      ) : null}
    </div>
  );
}
