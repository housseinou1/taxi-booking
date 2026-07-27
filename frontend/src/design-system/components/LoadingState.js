import React from "react";
import { cx } from "../utils/cx";

export default function LoadingState({
  title = "Loading…",
  description,
  compact = false,
  className,
}) {
  return (
    <div
      className={cx("yds-state", "yds-loading", compact && "yds-loading--compact", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="yds-spinner" aria-hidden="true" />
      <strong className="yds-state__title">{title}</strong>
      {description ? <p className="yds-state__description">{description}</p> : null}
    </div>
  );
}
