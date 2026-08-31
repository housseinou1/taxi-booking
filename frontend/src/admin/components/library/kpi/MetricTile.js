import React from "react";

import KPICard from "./KPICard";

/** Compact KPI tile — same API as KPICard with compact styling */
export default function MetricTile(props) {
  return <KPICard {...props} className={`admin-kpi--tile ${props.className || ""}`.trim()} />;
}
