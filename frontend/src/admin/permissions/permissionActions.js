/** Maps friendly permission checks to backend action keys */

export const APPROVE_ACTION_MAP = {
  refund: "finance.approve_refund",
  withdrawal: "finance.approve_withdrawal",
  payout: "finance.approve_withdrawal",
  broadcast: "ceo.broadcast",
  freeze: "ceo.freeze",
};

export const EXPORT_ACTION_MAP = {
  reports: "analytics.export",
  finance: "finance.export",
  analytics: "analytics.export",
};

export const EDIT_MODULE_ACTIONS = {
  finance: ["finance.approve_refund", "finance.export"],
  driver: ["drivers.edit", "drivers.verify_documents"],
  drivers: ["drivers.edit", "drivers.verify_documents"],
  ops: ["dispatch.force_assign", "dispatch.cancel_ride"],
  support: ["support.manage_tickets"],
  marketing: ["marketing.launch_campaign"],
  system: ["system.manage_flags"],
  users: ["users.delete", "users.manage_roles"],
};

export function resolveApproveAction(kind) {
  return APPROVE_ACTION_MAP[kind] || kind;
}

export function resolveExportAction(scope) {
  return EXPORT_ACTION_MAP[scope] || "analytics.export";
}

export function resolveEditActions(module) {
  const key = String(module || "").toLowerCase();
  return EDIT_MODULE_ACTIONS[key] || [`${key}.edit`];
}
