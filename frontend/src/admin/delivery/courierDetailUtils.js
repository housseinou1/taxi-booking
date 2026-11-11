export function naOr(value) {
  if (value === null || value === undefined) return "N/A";
  const text = String(value).trim();
  return text === "" ? "N/A" : text;
}

export function formatTimestamp(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "N/A" : parsed.toLocaleString();
}

export function formatMru(value, currency = "MRU") {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value} ${currency}`;
}

export function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved" || value === "delivered" || value === "complete" || value === "active") {
    return "success";
  }
  if (
    value === "rejected" ||
    value === "suspended" ||
    value === "cancelled" ||
    value === "failed"
  ) {
    return "danger";
  }
  if (value === "inactive") return "neutral";
  if (
    value === "pending_review" ||
    value === "pending review" ||
    value === "uploaded" ||
    value === "pending" ||
    value === "requested" ||
    value === "accepted" ||
    value === "in_transit" ||
    value === "picked_up"
  ) {
    return "warning";
  }
  return "neutral";
}

export function normalizeCityLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function citiesMismatch(accountCity, deliveryCities) {
  const account = normalizeCityLabel(accountCity);
  const cities = (Array.isArray(deliveryCities) ? deliveryCities : [])
    .map(normalizeCityLabel)
    .filter(Boolean);
  if (!account || !cities.length) return false;
  return !cities.includes(account);
}

export function initialsFromName(name, email) {
  const source = String(name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const COURIER_DETAIL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal Information" },
  { id: "vehicle", label: "Vehicle & Delivery Settings" },
  { id: "documents", label: "Documents & Verification" },
  { id: "cities", label: "Operating Cities" },
  { id: "agreement", label: "Electronic Agreement" },
  { id: "onboarding", label: "Onboarding Checklist" },
  { id: "deliveries", label: "Deliveries & Performance" },
  { id: "earnings", label: "Earnings & Wallet" },
  { id: "audit", label: "Approval & Audit History" },
];
