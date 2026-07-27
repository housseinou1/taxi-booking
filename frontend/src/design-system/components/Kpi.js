import React from "react";
import { cx } from "../utils/cx";

export default function Kpi({ icon, value, label, className }) {
  return (
    <article className={cx("yds-kpi", className)}>
      {icon ? <span className="yds-kpi__icon" aria-hidden="true">{icon}</span> : null}
      <strong className="yds-kpi__value">{value}</strong>
      <span className="yds-kpi__label">{label}</span>
    </article>
  );
}

export function KpiGrid({ children, className }) {
  return <div className={cx("yds-kpi-grid", className)}>{children}</div>;
}
