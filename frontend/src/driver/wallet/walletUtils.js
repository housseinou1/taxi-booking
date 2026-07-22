import { formatMoney } from "../../marketConfig";

export const MIN_WITHDRAWAL = 500;
export const AMOUNT_PRESETS = [500, 1000, 2000];

export const PAYOUT_METHODS = [
  { id: "bankily", label: "Bankily", icon: "B", backendType: "bankily", supported: true },
  { id: "sedad", label: "Sedad", icon: "S", backendType: "seddad", supported: true },
  { id: "masravi", label: "Masravi", icon: "M", backendType: "masrvi", supported: true },
  {
    id: "bank_account",
    label: "Bank account",
    icon: "🏦",
    backendType: "bank_account",
    supported: true,
  },
];

export const WITHDRAWAL_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatWalletAmount(value) {
  return formatMoney(toNumber(value));
}

export function maskAccount(value = "") {
  const normalized = String(value).trim();
  if (!normalized) return "Not set";
  if (normalized.length <= 4) return normalized;
  return `•••• ${normalized.slice(-4)}`;
}

export function normalizeBackendPayoutType(value = "") {
  const raw = String(value).toLowerCase();
  if (raw === "masrvi" || raw === "masravi") return "masravi";
  if (raw === "seddad" || raw === "sedad") return "sedad";
  if (raw === "bankily") return "bankily";
  if (raw === "bank_account") return "bank_account";
  return raw;
}

export function findSavedMethod(methods, methodId) {
  const config = PAYOUT_METHODS.find((item) => item.id === methodId);
  if (!config) return null;
  return (
    methods.find((item) => normalizeBackendPayoutType(item.payout_type) === methodId) ||
    methods.find((item) => item.payout_type === config.backendType) ||
    null
  );
}

export function formatLedgerStatus(entry) {
  if (entry.type === "withdrawal") {
    return entry.status || "Completed";
  }
  return entry.is_credit ? "Credited" : "Debited";
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function withdrawalReference(withdrawal) {
  if (!withdrawal) return "";
  return withdrawal.reference || withdrawal.payment_reference || `WD-${withdrawal.id}`;
}

export function maskPayoutMethod(method) {
  if (!method) return "Not set";
  const type = normalizeBackendPayoutType(method.payout_type);
  if (type === "bank_account") {
    return `${method.bank_name || "Bank"} · ${maskAccount(method.account_reference)}`;
  }
  return maskAccount(method.phone_number || method.wallet_id || method.display_name);
}
