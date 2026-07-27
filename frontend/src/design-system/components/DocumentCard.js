import React from "react";
import { cx } from "../utils/cx";
import StatusChip from "./StatusChip";

export default function DocumentCard({
  title,
  subtitle,
  status,
  onClick,
  className,
  ...rest
}) {
  return (
    <button
      type="button"
      className={cx("yds-card", "yds-row", className)}
      onClick={onClick}
      style={{ width: "100%", textAlign: "left", borderBottom: 0, padding: "var(--yds-space-4)" }}
      {...rest}
    >
      <span className="yds-row__body">
        <strong className="yds-row__title">{title}</strong>
        {subtitle ? <small className="yds-row__subtitle">{subtitle}</small> : null}
      </span>
      {status ? <StatusChip intent={status.intent || "neutral"}>{status.label}</StatusChip> : null}
      <span className="yds-row__meta" aria-hidden="true">›</span>
    </button>
  );
}
