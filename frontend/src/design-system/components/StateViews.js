import React from "react";
import { cx } from "../utils/cx";
import Button from "./Button";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import OfflineState from "./OfflineState";
import Skeleton from "./Skeleton";
import Icon from "./Icon";

export function LoadingSkeleton({ lines = 3, className, ...rest }) {
  return (
    <div className={cx("yds-loading-skeleton", className)} role="status" aria-live="polite" {...rest}>
      <span className="yds-visually-hidden">Loading</span>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} height={14} style={{ marginBottom: 10, width: `${90 - index * 10}%` }} />
      ))}
    </div>
  );
}

export function RetryView({
  title = "Something went wrong",
  message = "Please try again.",
  actionLabel = "Try again",
  onRetry,
  className,
}) {
  return (
    <ErrorState
      className={className}
      title={title}
      description={message}
      actionLabel={actionLabel}
      onRetry={onRetry}
    />
  );
}

export function PermissionDenied({
  title = "Permission required",
  description = "Allow access to continue.",
  actionLabel = "Open settings",
  onAction,
  className,
}) {
  return (
    <div className={cx("yds-state", "yds-permission", className)} role="alert">
      <Icon name="warning" size={28} />
      <strong className="yds-state__title">{title}</strong>
      {description ? <p className="yds-state__description">{description}</p> : null}
      {onAction ? <Button onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}

export { EmptyState, OfflineState, ErrorState };

export default {
  LoadingSkeleton,
  EmptyState,
  OfflineState,
  ErrorState,
  RetryView,
  PermissionDenied,
};
