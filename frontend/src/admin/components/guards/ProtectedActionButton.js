import React from "react";

import AdminActionGuard from "./AdminActionGuard";

export default function ProtectedActionButton({
  module,
  action,
  approve,
  exportScope,
  className = "admin-shell__btn",
  // "disable" (default) keeps the control visible-but-inert for discoverability.
  // "hide" removes it entirely, which is what sensitive financial approvals need:
  // an operator who cannot approve must not see an approve control at all.
  mode = "disable",
  children,
  onClick,
  type = "button",
  ...rest
}) {
  return (
    <AdminActionGuard
      module={module}
      action={action}
      approve={approve}
      exportScope={exportScope}
      mode={mode}
    >
      <button type={type} className={className} onClick={onClick} {...rest}>
        {children}
      </button>
    </AdminActionGuard>
  );
}
