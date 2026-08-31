/**
 * Rider payment method catalog.
 * Admin can enable methods by saving them via /payments/methods/save/;
 * the UI merges saved methods with this baseline list.
 */

export const RIDER_PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: "💵", hint: "Pay driver directly" },
  { id: "wallet", label: "Yala Wallet", icon: "👛", hint: "Instant wallet debit" },
  { id: "bankily", label: "Bankily", icon: "📱", hint: "Mobile wallet" },
  { id: "masrvi", label: "Masravi", icon: "👛", hint: "Local wallet" },
  { id: "seddad", label: "Sedad", icon: "💳", hint: "Mobile wallet" },
  { id: "card", label: "Card", icon: "💳", hint: "Saved card" },
];

export const RIDER_PAYMENT_METHOD_IDS = new Set(RIDER_PAYMENT_METHODS.map((item) => item.id));

export const PAYMENT_METHOD_STORAGE_KEY = "yala_preferred_payment_method";
export const LAST_PAYMENT_METHOD_STORAGE_KEY = "yala_last_payment_method";

export function getPaymentMethodLabel(methodId) {
  return RIDER_PAYMENT_METHODS.find((item) => item.id === methodId)?.label || methodId || "Cash";
}

export function readStoredPaymentMethod() {
  if (typeof localStorage === "undefined") return "cash";
  const saved = localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY);
  return saved && RIDER_PAYMENT_METHOD_IDS.has(saved) ? saved : "cash";
}

export function storePaymentMethod(methodId) {
  if (typeof localStorage === "undefined" || !RIDER_PAYMENT_METHOD_IDS.has(methodId)) return;
  localStorage.setItem(PAYMENT_METHOD_STORAGE_KEY, methodId);
  localStorage.setItem(LAST_PAYMENT_METHOD_STORAGE_KEY, methodId);
}

/**
 * Merge admin-saved methods with baseline options.
 * Cash and wallet are always available when wallet is enabled.
 */
export function resolveAvailablePaymentMethods(savedMethods = [], { walletEnabled = true } = {}) {
  const enabledIds = new Set(["cash"]);
  if (walletEnabled) enabledIds.add("wallet");

  savedMethods.forEach((method) => {
    const type = String(method?.payment_type || "").toLowerCase();
    if (RIDER_PAYMENT_METHOD_IDS.has(type)) {
      enabledIds.add(type);
    }
  });

  // If rider has no saved methods yet, show full baseline except wallet when disabled.
  if (savedMethods.length === 0) {
    RIDER_PAYMENT_METHODS.forEach((item) => {
      if (item.id === "wallet" && !walletEnabled) return;
      enabledIds.add(item.id);
    });
  }

  return RIDER_PAYMENT_METHODS.filter((item) => enabledIds.has(item.id));
}

export function resolveDefaultPaymentMethod(savedMethods = [], storedMethod = readStoredPaymentMethod()) {
  const defaultSaved = savedMethods.find((method) => method.is_default);
  const defaultType = defaultSaved?.payment_type;
  if (defaultType && RIDER_PAYMENT_METHOD_IDS.has(defaultType)) {
    return defaultType;
  }
  return storedMethod;
}
