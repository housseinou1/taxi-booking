import { formatMoney as marketFormatMoney } from "../../../../marketConfig";

export { formatMoney } from "../../../../marketConfig";

export function formatPercent(value, { decimals = 1, signed = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const num = Number(value);
  const prefix = signed && num > 0 ? "+" : "";
  return `${prefix}${num.toFixed(decimals)}%`;
}

export function formatTrend(value) {
  if (value == null || Number.isNaN(Number(value))) return { direction: "flat", label: "—" };
  const num = Number(value);
  if (num > 0) return { direction: "up", label: `+${Math.abs(num).toFixed(1)}%` };
  if (num < 0) return { direction: "down", label: `-${Math.abs(num).toFixed(1)}%` };
  return { direction: "flat", label: "0%" };
}

export function formatCompactNumber(value) {
  const num = Number(value || 0);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function formatCurrency(value) {
  return marketFormatMoney(value);
}

export function formatTimestamp(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (error) {
    return String(iso);
  }
}
