import React from "react";
import { cx } from "../utils/cx";

export default function Badge({
  children,
  intent = "danger",
  className,
  label,
  ...rest
}) {
  return (
    <span
      className={cx("yds-badge", `yds-badge--${intent}`, className)}
      aria-label={label}
      {...rest}
    >
      {children}
    </span>
  );
}
