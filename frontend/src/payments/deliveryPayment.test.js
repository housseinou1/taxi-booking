import { getDeliveryPayButtonLabel, getDeliveryPaymentLabel } from "./deliveryPayment";
import { DELIVERY_PAYMENT_METHODS } from "./paymentApi";

describe("delivery payment helpers", () => {
  test("only exposes prepaid delivery payment providers", () => {
    expect(DELIVERY_PAYMENT_METHODS.map((method) => method.value)).toEqual([
      "card",
      "bankily",
      "sedad",
      "masravi",
    ]);
  });

  test("builds card pay label with amount", () => {
    expect(getDeliveryPayButtonLabel("card", 138)).toBe("Pay 138 MRU");
  });

  test("builds provider-specific labels", () => {
    expect(getDeliveryPayButtonLabel("bankily", 138)).toBe("Pay with Bankily");
    expect(getDeliveryPayButtonLabel("sedad", 138)).toBe("Pay with Sedad");
    expect(getDeliveryPayButtonLabel("masravi", 138)).toBe("Pay with Masravi");
  });

  test("maps payment labels for summary", () => {
    expect(getDeliveryPaymentLabel("bankily")).toBe("Bankily");
    expect(getDeliveryPaymentLabel("masravi")).toBe("Masravi");
  });
});
