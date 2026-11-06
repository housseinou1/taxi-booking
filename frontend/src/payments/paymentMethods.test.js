import {
  ALL_PAYMENT_METHODS,
  categoriesForMethods,
  MOBILE_MONEY_PROVIDERS,
  MOBILE_MONEY_PROVIDER_IDS,
  PAYMENT_CATEGORIES,
  getCategoryForMethod,
  isMobileMoneyProvider,
  resolvePaymentSelection,
  selectionFromMethod,
  toCanonicalProvider,
  toRidePaymentMethod,
} from "./paymentMethods";

/**
 * The catalog must mirror the backend vocabulary exactly, because a mismatch
 * means a customer can pick a method the API will reject.
 *
 * Backend sources of truth:
 *   payments/providers/base.py      PROVIDER_CODES
 *   payments/models.py              Payment.PAYMENT_METHOD_CHOICES,
 *                                   PaymentRecord.METHOD_CHOICES
 *   payments/settlement_service.py  _normalize_method() aliases
 */
describe("payment method catalog", () => {
  test("offers the five primary payment categories in order", () => {
    expect(PAYMENT_CATEGORIES.map((category) => category.id)).toEqual([
      "card",
      "mobile_money",
      "wallet",
      "bank_transfer",
      "cash",
    ]);
  });

  test("Cash is an opt-in category the backend must enable", () => {
    const cash = PAYMENT_CATEGORIES.find((category) => category.id === "cash");
    expect(cash).toBeDefined();
    expect(cash.requiresBackendOptIn).toBe(true);
    // Never offered when the backend allow-list is unknown.
    expect(categoriesForMethods(undefined).map((c) => c.id)).not.toContain("cash");
    expect(categoriesForMethods(["cash"]).map((c) => c.id)).toContain("cash");
  });


  test("Mobile Money offers exactly Bankily, Masravi and Sedad", () => {
    expect(MOBILE_MONEY_PROVIDERS.map((provider) => provider.id)).toEqual([
      "bankily",
      "masravi",
      "sedad",
    ]);
    expect(MOBILE_MONEY_PROVIDER_IDS).toEqual(["bankily", "masravi", "sedad"]);
  });

  test("only Mobile Money declares a second-step provider choice", () => {
    const withProviders = PAYMENT_CATEGORIES.filter((category) => category.hasProviders);
    expect(withProviders).toHaveLength(1);
    expect(withProviders[0].id).toBe("mobile_money");
  });

  test("every emitted method is a real backend value", () => {
    // PROVIDER_CODES plus the non-provider method values declared on the models.
    const backendMethods = new Set([
      "card",
      "bankily",
      "masravi",
      "sedad",
      "bank_transfer",
      "wallet",
      "bank_account",
      // `cash` is a real backend method value (Payment.PAYMENT_METHOD_CHOICES). It is
      // offered only when the cashless policy is relaxed, but it must remain a valid
      // catalog value so the checkout can select it.
      "cash",
    ]);
    ALL_PAYMENT_METHODS.forEach((method) => {
      expect(backendMethods.has(method)).toBe(true);
    });
  });
});

describe("provider normalization", () => {
  test("normalizes the legacy aliases to the canonical provider id", () => {
    // payments/settlement_service.py::_normalize_method
    expect(toCanonicalProvider("masrvi")).toBe("masravi");
    expect(toCanonicalProvider("seddad")).toBe("sedad");
    expect(toCanonicalProvider("Masravi")).toBe("masravi");
    expect(toCanonicalProvider("bankily")).toBe("bankily");
    expect(toCanonicalProvider("")).toBe("");
  });

  test("maps to the legacy spelling the ride Payment.method column expects", () => {
    // payments/models.Payment.PAYMENT_METHOD_CHOICES uses masrvi / seddad
    expect(toRidePaymentMethod("masravi")).toBe("masrvi");
    expect(toRidePaymentMethod("sedad")).toBe("seddad");
    expect(toRidePaymentMethod("bankily")).toBe("bankily");
    expect(toRidePaymentMethod("card")).toBe("card");
  });

  test("round-trips a legacy alias through canonical and back", () => {
    ["bankily", "masravi", "sedad"].forEach((provider) => {
      const legacy = toRidePaymentMethod(provider);
      expect(toCanonicalProvider(legacy)).toBe(provider);
    });
  });

  test("recognizes mobile money providers in both spellings", () => {
    expect(isMobileMoneyProvider("bankily")).toBe(true);
    expect(isMobileMoneyProvider("masrvi")).toBe(true);
    expect(isMobileMoneyProvider("seddad")).toBe(true);
    expect(isMobileMoneyProvider("card")).toBe(false);
    expect(isMobileMoneyProvider("wallet")).toBe(false);
  });
});

describe("resolvePaymentSelection", () => {
  test("reports no category when nothing is selected", () => {
    const result = resolvePaymentSelection({});
    expect(result.ok).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.error).toBe("no_category");
  });

  test("rejects an unknown category", () => {
    expect(resolvePaymentSelection({ category: "crypto" }).error).toBe("unknown_category");
  });

  test("treats Mobile Money without a provider as incomplete, not invalid", () => {
    const result = resolvePaymentSelection({ category: "mobile_money" });
    expect(result.ok).toBe(false);
    expect(result.complete).toBe(false);
    expect(result.method).toBe("");
    expect(result.error).toBe("provider_required");
  });

  test("resolves each single-method category", () => {
    expect(resolvePaymentSelection({ category: "card" })).toMatchObject({
      ok: true,
      complete: true,
      method: "card",
    });
    expect(resolvePaymentSelection({ category: "wallet" })).toMatchObject({
      ok: true,
      complete: true,
      method: "wallet",
    });
    expect(resolvePaymentSelection({ category: "bank_transfer" })).toMatchObject({
      ok: true,
      complete: true,
      method: "bank_account",
    });
  });

  test("resolves every mobile money provider to its canonical id", () => {
    ["bankily", "masravi", "sedad"].forEach((provider) => {
      const result = resolvePaymentSelection({ category: "mobile_money", provider });
      expect(result.ok).toBe(true);
      expect(result.complete).toBe(true);
      expect(result.method).toBe(provider);
      expect(result.provider).toBe(provider);
    });
  });

  test("accepts a legacy alias and returns the canonical provider", () => {
    const result = resolvePaymentSelection({ category: "mobile_money", provider: "seddad" });
    expect(result.ok).toBe(true);
    expect(result.method).toBe("sedad");
  });

  test("rejects a provider that is not part of Mobile Money", () => {
    expect(
      resolvePaymentSelection({ category: "mobile_money", provider: "paypal" }).error
    ).toBe("unknown_provider");
  });

  test("honours the per-surface allow-list", () => {
    // Delivery prepay accepts card + mobile money only (settlement_service).
    const delivery = ["card", "mobile_money"];
    expect(
      resolvePaymentSelection({ category: "wallet", availableMethods: delivery }).error
    ).toBe("category_unavailable");
    expect(
      resolvePaymentSelection({ category: "bank_transfer", availableMethods: delivery }).error
    ).toBe("category_unavailable");
    expect(resolvePaymentSelection({ category: "card", availableMethods: delivery }).method).toBe(
      "card"
    );
  });

  test("rejects a provider excluded by the allow-list", () => {
    const result = resolvePaymentSelection({
      category: "mobile_money",
      provider: "sedad",
      availableMethods: ["card", "bankily"],
    });
    expect(result.error).toBe("provider_unavailable");
  });
});

describe("selectionFromMethod", () => {
  test("rebuilds the category and provider from a stored method", () => {
    expect(selectionFromMethod("bankily")).toEqual({
      category: "mobile_money",
      provider: "bankily",
    });
    expect(selectionFromMethod("card")).toEqual({ category: "card", provider: "" });
    expect(selectionFromMethod("bank_account")).toEqual({
      category: "bank_transfer",
      provider: "",
    });
  });

  test("understands a legacy stored alias", () => {
    expect(selectionFromMethod("masrvi")).toEqual({
      category: "mobile_money",
      provider: "masravi",
    });
  });

  test("returns an empty selection for an unknown method", () => {
    expect(selectionFromMethod("crypto")).toEqual({ category: "", provider: "" });
    expect(selectionFromMethod("")).toEqual({ category: "", provider: "" });
  });

  test("maps a method back to its category", () => {
    expect(getCategoryForMethod("sedad")).toBe("mobile_money");
    expect(getCategoryForMethod("wallet")).toBe("wallet");
    expect(getCategoryForMethod("nope")).toBeNull();
  });
});
