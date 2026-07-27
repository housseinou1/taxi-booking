import React from "react";
import { cx } from "../utils/cx";
import Button from "./Button";
import Icon from "./Icon";

export default function OfflineState({
  title = "You are offline",
  description = "Check your connection and try again.",
  actionLabel = "Try again",
  onRetry,
  className,
}) {
  return (
    <div className={cx("yds-state", "yds-offline", className)} role="status" aria-live="polite">
      <Icon name="warning" size={28} />
      <strong className="yds-state__title">{title}</strong>
      {description ? <p className="yds-state__description">{description}</p> : null}
      {onRetry ? <Button onClick={onRetry}>{actionLabel}</Button> : null}
    </div>
  );
}
