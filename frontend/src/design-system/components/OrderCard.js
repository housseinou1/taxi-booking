import React from "react";
import { cx } from "../utils/cx";
import StatusChip from "./StatusChip";

export default function OrderCard({
  id,
  customer,
  items,
  status,
  eta,
  className,
  ...rest
}) {
  return (
    <div className={cx("yds-card", className)} {...rest}>
      <div className="yds-card__header">
        <div>
          <div className="yds-row__title">{id}</div>
          <small className="yds-row__subtitle">{customer}</small>
        </div>
        {eta ? <span className="yds-row__meta">{eta}</span> : null}
      </div>
      <p className="yds-hint" style={{ marginBottom: 8 }}>{items}</p>
      {status ? <StatusChip intent={status.intent || "neutral"}>{status.label}</StatusChip> : null}
    </div>
  );
}
