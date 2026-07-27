import React from "react";
import { cx } from "../utils/cx";

export default function LoadingState({
  title = "Loading…",
  description,
  className,
}) {
  return (
    <div className={cx("yds-state", "yds-loading", className)} role="status" aria-live="polite">
      <span className="yds-spinner" aria-hidden="true" />
      <strong className="yds-state__title">{title}</strong>
      {description ? <p className="yds-state__description">{description}</p> : null}
    </div>
  );
}
