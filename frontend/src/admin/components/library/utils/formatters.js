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

/**
 * Format a monetary amount, distinguishing UNAVAILABLE data from a genuine zero.
 *
 * `formatMoney(null)` renders "0 MRU", which is indistinguishable from a real
 * zero balance, so a dashboard cannot tell "the API did not report this" from
 * "the value really is zero". Use this helper for any field that may be absent
 * from a payload: it returns "—" when the value is null/undefined/blank, and
 * otherwise delegates to the decimal-safe `formatMoney`, so a genuine 0 still
 * reads "0 MRU" and a real amount keeps its grouping and 2-decimal rounding.
 */
export function formatMoneyOrDash(value) {
  if (value === null || value === undefined || value === "") return "—";
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
