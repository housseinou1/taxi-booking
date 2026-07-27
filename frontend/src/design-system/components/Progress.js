import React from "react";
import { cx } from "../utils/cx";

export default function Progress({
  value = 0,
  max = 100,
  label = "Progress",
  intent = "primary",
  className,
}) {
  const safeMax = Math.max(Number(max) || 100, 1);
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), safeMax);
  const percentage = (safeValue / safeMax) * 100;

  return (
    <div
      className={cx("yds-progress", `yds-progress--${intent}`, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
    >
      <span className="yds-progress__bar" style={{ width: `${percentage}%` }} />
    </div>
  );
}
