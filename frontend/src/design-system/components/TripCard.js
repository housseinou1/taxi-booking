import React from "react";
import { cx } from "../utils/cx";
import StatusChip from "./StatusChip";

export default function TripCard({
  from,
  to,
  status,
  price,
  date,
  className,
  ...rest
}) {
  return (
    <div className={cx("yds-card", className)} {...rest}>
      <div className="yds-card__header">
        <div>
          <div className="yds-row__title">{from} → {to}</div>
          <small className="yds-row__subtitle">{date}</small>
        </div>
        {price ? <span className="yds-row__title">{price}</span> : null}
      </div>
      {status ? <StatusChip intent={status.intent || "neutral"}>{status.label}</StatusChip> : null}
    </div>
  );
}
