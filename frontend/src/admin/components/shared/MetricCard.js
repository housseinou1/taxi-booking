import React from "react";

import MetricTile from "../library/kpi/MetricTile";

/** @deprecated Prefer MetricTile or KPICard from admin/components/library */
export default function MetricCard(props) {
  return <MetricTile {...props} />;
}
