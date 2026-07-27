import React from "react";
import ErrorState from "../design-system/components/ErrorState";

/**
 * Cross-app error + retry state — delegates to the shared YALA design system.
 */
export default function YalaErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  retryLabel = "Try again",
  onRetry,
}) {
  return (
    <ErrorState
      title={title}
      description={message || undefined}
      actionLabel={retryLabel}
      onRetry={onRetry}
    />
  );
}
