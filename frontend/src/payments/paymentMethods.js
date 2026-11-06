/**
 * YALA payment method catalog — the single source of truth for every customer
 * checkout surface (YALA Rider, YALA Delivery customer, and merchant checkout
 * where supported).
 *
 * ── Backend vocabulary (never invent codes) ─────────────────────────────────
 *
 *   payments/providers/base.py
 *     PROVIDER_CODES = ("bankily", "masravi", "sedad", "bank_transfer", "card")
 *
 *   payments/models.py
 *     Payment.PAYMENT_METHOD_CHOICES  → cash | card | bank_account | bankily |
 *                                       masrvi | seddad | wallet | corporate | test
 *     PaymentRecord.METHOD_CHOICES    → cash | card | wallet | bankily |
 *                                       masrvi | seddad | promo_credit
 *
 *   payments/settlement_service.py::_normalize_method()
 *     aliases: masrvi → masravi, seddad → sedad
 *     accepts: card + { bankily, masravi, sedad }  (rejects wallet/bank_transfer/cash)
 *
 *   payments/cashless.py
 *     DIGITAL_METHODS — the cashless allow-list (contains both spellings)
 *
 * ── Why two spellings exist ────────────────────────────────────────────────
 *
 * The **ride** `Payment.method` column still declares the legacy spellings
 * (`masrvi`, `seddad`), so a ride payment must be sent with those. The
 * **delivery/merchant** ledger normalises to the canonical provider codes
 * (`masravi`, `sedad`) and accepts the legacy aliases on input.
 *
 * Both conversions live here so no surface has to guess, and so the UI can
 * always *display* the canonical provider while each API boundary sends exactly
 * what its endpoint expects.
 */

/** Canonical mobile-money provider ids (backend canonical spelling). */
export const MOBILE_MONEY_PROVIDER_IDS = ["bankily", "masravi", "sedad"];

/** Canonical → ride `Payment.method` legacy alias. */
const RIDE_METHOD_ALIASES = { masravi: "masrvi", sedad: "seddad" };

/** Legacy alias → canonical provider id. */
const CANONICAL_PROVIDER_ALIASES = { masrvi: "masravi", seddad: "sedad" };

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Map any accepted spelling to the canonical provider id.
 * `masrvi` → `masravi`, `seddad` → `sedad`; everything else is lower-cased as-is.
 */
export function toCanonicalProvider(value) {
  const token = normalizeToken(value);
  return CANONICAL_PROVIDER_ALIASES[token] || token;
}

/**
 * Map a provider/method to the spelling the **ride** `Payment.method` column
 * expects. Mirrors the previous behaviour of `paymentApi.normalizeRidePaymentMethod`
 * so ride payments are unchanged.
 */
export function toRidePaymentMethod(value) {
  const token = normalizeToken(value);
  return RIDE_METHOD_ALIASES[token] || token;
}

export function isMobileMoneyProvider(value) {
  return MOBILE_MONEY_PROVIDER_IDS.includes(toCanonicalProvider(value));
}

/**
 * Primary payment categories shown to the customer.
 *
 * `methods` lists every backend method value a category can produce.
 * `hasProviders` marks the category that requires a second, single-choice step.
 */
export const PAYMENT_CATEGORIES = [
  {
    id: "card",
    icon: "💳",
    labelKey: "payments.methods.card",
    defaultLabel: "Credit Card / Debit Card",
    hintKey: "payments.methods.cardHint",
    defaultHint: "Visa or Mastercard via a secure card gateway",
    methods: ["card"],
    hasProviders: false,
  },
  {
    id: "mobile_money",
    icon: "📱",
    labelKey: "payments.methods.mobileMoney",
    defaultLabel: "Mobile Money",
    hintKey: "payments.methods.mobileMoneyHint",
    defaultHint: "Bankily, Masravi or Sedad",
    methods: [...MOBILE_MONEY_PROVIDER_IDS],
    hasProviders: true,
  },
  {
    id: "wallet",
    icon: "👛",
    labelKey: "payments.methods.wallet",
    defaultLabel: "YALA Wallet",
    hintKey: "payments.methods.walletHint",
    defaultHint: "Pay from your YALA balance",
    methods: ["wallet"],
    hasProviders: false,
  },
  {
    id: "bank_transfer",
    icon: "🏦",
    labelKey: "payments.methods.bankTransfer",
    defaultLabel: "Bank Transfer",
    hintKey: "payments.methods.bankTransferHint",
    defaultHint: "Transfer from your Mauritanian bank account",
    methods: ["bank_account"],
    hasProviders: false,
  },
  {
    // Cash is only ever rendered when the backend reports it as available
    // (`cashless_policy_enforced` false). YALA's commission is still recorded for a
    // cash ride — the driver confirms receipt through the verified path, so a cash
    // trip is accounted exactly like a digital one.
    id: "cash",
    icon: "💵",
    labelKey: "payments.methods.cash",
    defaultLabel: "Cash",
    hintKey: "payments.methods.cashHint",
    defaultHint: "Pay the driver directly — your commission is still recorded",
    methods: ["cash"],
    hasProviders: false,
    requiresBackendOptIn: true,
  },
];

/**
 * Categories to render for a given backend allow-list.
 *
 * The backend is the source of truth: a category marked `requiresBackendOptIn` (cash)
 * is dropped unless the backend explicitly offers one of its methods. Everything else
 * keeps its existing behaviour, so a category whose methods are partially allowed still
 * renders (the provider step narrows it).
 */
export function categoriesForMethods(availableMethods) {
  const allowed = Array.isArray(availableMethods)
    ? availableMethods.map(normalizeToken)
    : null;

  if (!allowed || !allowed.length) {
    // No allow-list supplied: keep the historical "everything" behaviour, except
    // opt-in categories, which must never be offered without explicit backend approval.
    return PAYMENT_CATEGORIES.filter((category) => !category.requiresBackendOptIn);
  }

  return PAYMENT_CATEGORIES.filter(
    (category) =>
      allowed.includes(category.id) ||
      category.methods.some((method) => allowed.includes(method))
  );
}

/** The mobile-money providers to render, narrowed to those the backend allows. */
export function providersForMethods(availableMethods) {
  const allowed = Array.isArray(availableMethods)
    ? availableMethods.map(normalizeToken)
    : null;
  if (!allowed) return [...MOBILE_MONEY_PROVIDERS];
  return MOBILE_MONEY_PROVIDERS.filter((provider) => allowed.includes(provider.id));
}

/** The mobile-money providers offered inside the Mobile Money dropdown. */
export const MOBILE_MONEY_PROVIDERS = [
  { id: "bankily", labelKey: "payments.providers.bankily", defaultLabel: "Bankily" },
  { id: "masravi", labelKey: "payments.providers.masravi", defaultLabel: "Masravi" },
  { id: "sedad", labelKey: "payments.providers.sedad", defaultLabel: "Sedad" },
];

/** Every method value the catalog can emit, in display order. */
export const ALL_PAYMENT_METHODS = PAYMENT_CATEGORIES.flatMap((category) => category.methods);

/**
 * Methods the delivery/merchant settlement service accepts.
 * Mirrors `payments/settlement_service.py::DELIVERY_PREPAY_METHODS`
 * (`_normalize_method` rejects `wallet`, `bank_transfer` and cash).
 */
export const DELIVERY_PREPAY_METHODS = ["card", "bankily", "masravi", "sedad"];

/**
 * Methods the ride checkout accepts.
 * Mirrors `payments/models.Payment.PAYMENT_METHOD_CHOICES` (legacy spellings).
 */
export const RIDE_PAYMENT_METHODS = [
  "card",
  "bankily",
  "masrvi",
  "seddad",
  "wallet",
  "bank_account",
];

export function getPaymentCategory(categoryId) {
  const token = normalizeToken(categoryId);
  return PAYMENT_CATEGORIES.find((category) => category.id === token) || null;
}

/**
 * Which category does a stored method value belong to?
 * Accepts both spellings so a legacy saved value still resolves.
 */
export function getCategoryForMethod(method) {
  const token = normalizeToken(method);
  if (!token) return null;
  if (isMobileMoneyProvider(token)) return "mobile_money";
  const match = PAYMENT_CATEGORIES.find((category) => category.methods.includes(token));
  return match ? match.id : null;
}

/**
 * Resolve a `{ category, provider }` pair into a submittable method.
 *
 * Returns `{ ok, complete, method, category, provider, error }`.
 * `complete` is false for an incomplete selection (Mobile Money chosen but no
 * provider yet) — callers must block submission while it is false.
 */
export function resolvePaymentSelection({ category, provider, availableMethods } = {}) {
  const allowed = availableMethods ? availableMethods.map(normalizeToken) : null;
  const categoryId = normalizeToken(category);
  const providerId = toCanonicalProvider(provider);

  const base = { ok: false, complete: false, method: "", category: categoryId, provider: "" };

  if (!categoryId) {
    return { ...base, error: "no_category" };
  }

  const definition = getPaymentCategory(categoryId);
  if (!definition) {
    return { ...base, error: "unknown_category" };
  }
  if (allowed) {
    // A category is available when the allow-list names it directly, or names at
    // least one of its methods — so `["card","bankily"]` means "Mobile Money, but
    // only Bankily", not "Mobile Money is unavailable".
    const categoryAllowed =
      allowed.includes(categoryId) ||
      definition.methods.some((method) => allowed.includes(method));
    if (!categoryAllowed) {
      return { ...base, error: "category_unavailable" };
    }
  }

  if (definition.hasProviders) {
    if (!providerId) {
      // Incomplete, not invalid: the customer simply has not chosen a provider yet.
      return { ...base, error: "provider_required" };
    }
    if (!definition.methods.includes(providerId)) {
      return { ...base, error: "unknown_provider" };
    }
    if (allowed && !allowed.includes(providerId)) {
      return { ...base, error: "provider_unavailable" };
    }
    return {
      ok: true,
      complete: true,
      method: providerId,
      category: categoryId,
      provider: providerId,
      error: "",
    };
  }

  const method = definition.methods[0];
  return {
    ok: true,
    complete: true,
    method,
    category: categoryId,
    provider: "",
    error: "",
  };
}

/** Rebuild a `{ category, provider }` pair from a stored method value. */
export function selectionFromMethod(method) {
  const category = getCategoryForMethod(method);
  if (!category) return { category: "", provider: "" };
  return {
    category,
    provider: category === "mobile_money" ? toCanonicalProvider(method) : "",
  };
}

