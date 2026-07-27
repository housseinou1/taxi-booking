import React from "react";
import { cx } from "../utils/cx";

const INTENT_CLASS = {
  success: "yds-status-chip--success",
  warning: "yds-status-chip--warning",
  danger: "yds-status-chip--danger",
  error: "yds-status-chip--danger",
  info: "yds-status-chip--info",
  neutral: "yds-status-chip--neutral",
};

export default function StatusChip({
  children,
  intent = "neutral",
  dot = false,
  className,
  ...rest
}) {
  return (
    <span
      className={cx("yds-status-chip", INTENT_CLASS[intent] || INTENT_CLASS.neutral, className)}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />}
      {children}
    </span>
  );
}
