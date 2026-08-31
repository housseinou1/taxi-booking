import React from "react";

import KPICard from "./KPICard";
import { formatTrend } from "../utils/formatters";

/** KPI card with computed trend direction from numeric delta */
export default function KPITrendCard({
  label,
  value,
  changePercent,
  periodLabel = "vs prior period",
  format,
  tone,
  subtitle,
  loading,
  error,
  empty,
  onRefresh,
  onClick,
}) {
  const trend = formatTrend(changePercent);
  const resolvedTone =
    tone ||
    (trend.direction === "up" ? "success" : trend.direction === "down" ? "danger" : undefined);
  return (
    <KPICard
      label={label}
      value={value}
      format={format}
      subtitle={subtitle}
      trend={changePercent == null ? undefined : trend.direction}
      trendLabel={changePercent == null ? undefined : `${trend.label} ${periodLabel}`}
      loading={loading}
      error={error}
      empty={empty}
      onRefresh={onRefresh}
      onClick={onClick}
      tone={resolvedTone}
    />
  );
}
