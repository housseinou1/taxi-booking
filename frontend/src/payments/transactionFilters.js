export const TRANSACTION_FILTERS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom range" },
];

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date) {
  const copy = startOfDay(date);
  const day = copy.getDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

export function getFilterRange(filterId, referenceDate = new Date(), customRange = {}) {
  if (filterId === "custom") {
    return {
      from: parseDateBoundary(customRange.from),
      to: parseDateBoundary(customRange.to, true),
    };
  }
  if (filterId === "today") {
    return { from: startOfDay(referenceDate), to: referenceDate };
  }
  if (filterId === "week") {
    return { from: startOfWeek(referenceDate), to: referenceDate };
  }
  if (filterId === "month") {
    return { from: startOfMonth(referenceDate), to: referenceDate };
  }
  return { from: null, to: null };
}

export function filterTransactionsByDate(items, filterId, dateField = "created_at", customRange = {}) {
  const { from, to } = getFilterRange(filterId, new Date(), customRange);
  if (!from || !Array.isArray(items)) return items || [];

  return items.filter((item) => {
    const value = item?.[dateField];
    if (!value) return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date >= from && (!to || date <= to);
  });
}

export function groupPaymentsByStatus(payments = []) {
  return {
    completed: payments.filter((item) => item.status === "paid"),
    pending: payments.filter((item) =>
      ["pending_verification", "authorized", "pending"].includes(item.status)
    ),
    failed: payments.filter((item) => ["failed", "cancelled", "reversed"].includes(item.status)),
  };
}
