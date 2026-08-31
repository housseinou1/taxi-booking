import React from "react";

import AdminActionGuard from "./AdminActionGuard";

export default function ProtectedActionButton({
  module,
  action,
  approve,
  exportScope,
  className = "admin-shell__btn",
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
      mode="disable"
    >
      <button type={type} className={className} onClick={onClick} {...rest}>
        {children}
      </button>
    </AdminActionGuard>
  );
}
