import React from "react";
import { cx } from "../utils/cx";

export default function StatisticCard({ label, value, trend, className, ...rest }) {
  return (
    <article className={cx("yds-kpi", className)} {...rest}>
      <span className="yds-kpi__label">{label}</span>
      <strong className="yds-kpi__value">{value}</strong>
      {trend ? <span className="yds-chip">{trend}</span> : null}
    </article>
  );
}
