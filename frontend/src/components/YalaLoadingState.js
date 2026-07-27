import React from "react";
import LoadingState from "../design-system/components/LoadingState";

/**
 * Cross-app loading state — delegates to the shared YALA design system.
 */
export default function YalaLoadingState({ label = "Loading…", compact = false }) {
  return <LoadingState title={label} compact={compact} />;
}
