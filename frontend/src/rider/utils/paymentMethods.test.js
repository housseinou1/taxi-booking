import {
  resolveAvailablePaymentMethods,
  resolveDefaultPaymentMethod,
  storePaymentMethod,
  readStoredPaymentMethod,
  getPaymentMethodLabel,
} from "./paymentMethods";

describe("paymentMethods", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns labels for known methods", () => {
    expect(getPaymentMethodLabel("bankily")).toBe("Bankily");
    expect(getPaymentMethodLabel("unknown")).toBe("unknown");
  });

  it("stores and reads preferred payment method", () => {
    storePaymentMethod("masrvi");
    expect(readStoredPaymentMethod()).toBe("masrvi");
  });

  it("merges saved admin methods with baseline options", () => {
    const options = resolveAvailablePaymentMethods([
      { payment_type: "bankily", is_default: true },
    ]);
    expect(options.some((item) => item.id === "cash")).toBe(true);
    expect(options.some((item) => item.id === "bankily")).toBe(true);
  });

  it("uses saved default method when present", () => {
    const method = resolveDefaultPaymentMethod([
      { payment_type: "seddad", is_default: true },
    ], "cash");
    expect(method).toBe("seddad");
  });
});
