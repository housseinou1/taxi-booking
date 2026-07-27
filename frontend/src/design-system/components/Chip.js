import React from "react";
import { cx } from "../utils/cx";

export default function Chip({ children, className, ...rest }) {
  return (
    <span className={cx("yds-chip", className)} {...rest}>
      {children}
    </span>
  );
}
