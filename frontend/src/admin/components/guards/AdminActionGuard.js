import React from "react";

import { usePermissions } from "../../permissions/PermissionContext";

/**
 * Hide or disable UI when the user lacks a module/action permission.
 * Backend APIs remain the source of truth — this is UX only.
 */
export default function AdminActionGuard({
  module,
  action,
  approve,
  exportScope,
  children,
  fallback = null,
  mode = "hide",
  disabledTitle = "You do not have permission for this action",
}) {
  const { canView, canAction, canApprove, canExport } = usePermissions();

  let allowed = true;
  if (module) allowed = allowed && canView(module);
  if (action) allowed = allowed && canAction(action);
  if (approve) allowed = allowed && canApprove(approve);
  if (exportScope) allowed = allowed && canExport(exportScope);

  if (allowed) return children;
  if (mode === "hide") return fallback;

  if (React.isValidElement(children)) {
    return React.cloneElement(children, {
      disabled: true,
      "aria-disabled": true,
      title: disabledTitle,
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
    });
  }

  return fallback;
}
