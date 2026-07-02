import React from "react";

import BottomSheet from "../../rider/components/BottomSheet";
import "../../rider/components/BottomSheet.css";

/**
 * Uber Eats–style draggable bottom sheet for Yala Delivery courier.
 */
export default function CourierBottomSheet({
  state = "half",
  onStateChange,
  children,
  className = "",
  contentClassName = "",
}) {
  return (
    <div className={`cce-sheet-panel ${className}`.trim()}>
      <BottomSheet
        state={state}
        onStateChange={onStateChange}
        contentClassName={`cce-sheet__content ${contentClassName}`.trim()}
      >
        {children}
      </BottomSheet>
    </div>
  );
}
