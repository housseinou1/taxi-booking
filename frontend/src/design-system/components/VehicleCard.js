import React from "react";
import { cx } from "../utils/cx";

export default function VehicleCard({
  name,
  plate,
  type,
  color,
  className,
  children,
  ...rest
}) {
  return (
    <div className={cx("yds-card", className)} {...rest}>
      <div className="yds-card__header">
        <div>
          <div className="yds-row__title">{name}</div>
          <small className="yds-row__subtitle">{type} · {plate} · {color}</small>
        </div>
      </div>
      {children}
    </div>
  );
}
