import React from "react";
import Button from "../design-system/components/Button";
import EmptyState from "../design-system/components/EmptyState";

/**
 * Cross-app empty state — delegates to the shared YALA design system.
 */
export default function YalaEmptyState({
  icon = "📭",
  title = "Nothing here yet",
  message = "",
  actionLabel = "",
  onAction,
}) {
  return (
    <EmptyState
      role="status"
      icon={icon}
      title={title}
      text={message || undefined}
      action={
        actionLabel && onAction ? (
          <Button type="button" variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null
      }
    />
  );
}
