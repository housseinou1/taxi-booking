import {
  canCreditWallet,
  canShowReceipt,
  describePaymentStatus,
  isFailedPaymentStatus,
  isPendingPaymentStatus,
  isSettledPaymentStatus,
} from "./paymentStatus";

/**
 * These assertions encode the non-negotiable rule from
 * payments/provider_security.py: only a **verified live provider confirmation**
 * settles a payment. Selecting a provider or submitting a reference never does,
 * and the UI must therefore never reveal a confirmation or a receipt for
 * anything the backend has not settled.
 */
describe("payment status safety", () => {
  test("only 'paid' counts as settled", () => {
    expect(isSettledPaymentStatus("paid")).toBe(true);
    expect(isSettledPaymentStatus("PAID")).toBe(true);

    [
      "pending",
      "authorized",
      "pending_verification",
      "failed",
      "cancelled",
      "refunded",
      "mock_succeeded",
      "succeeded",
      "",
      undefined,
      null,
    ].forEach((status) => {
      expect(isSettledPaymentStatus(status)).toBe(false);
    });
  });

  test("pending states are recognized but never settled", () => {
    ["pending", "authorized", "pending_verification"].forEach((status) => {
      expect(isPendingPaymentStatus(status)).toBe(true);
      const described = describePaymentStatus(status);
      expect(described.tone).toBe("pending");
      expect(described.settled).toBe(false);
      expect(described.defaultMessage).toMatch(/not a confirmation/i);
    });
  });

  test("failed states never claim money moved", () => {
    ["failed", "cancelled"].forEach((status) => {
      expect(isFailedPaymentStatus(status)).toBe(true);
      const described = describePaymentStatus(status);
      expect(described.tone).toBe("failed");
      expect(described.settled).toBe(false);
    });
  });

  test("an unrecognized status is treated as unknown, never as settled", () => {
    const described = describePaymentStatus("something_new");
    expect(described.tone).toBe("unknown");
    expect(described.settled).toBe(false);
    expect(described.status).toBe("something_new");
  });

  test("a receipt is only available for a verified settlement", () => {
    expect(canShowReceipt("paid")).toBe(true);
    ["pending", "authorized", "pending_verification", "failed", "cancelled"].forEach((status) => {
      expect(canShowReceipt(status)).toBe(false);
    });
  });

  test("a wallet is never credited without a verified settlement", () => {
    expect(canCreditWallet("paid")).toBe(true);
    ["pending", "authorized", "pending_verification", "failed", "cancelled", "refunded"].forEach(
      (status) => {
        expect(canCreditWallet(status)).toBe(false);
      }
    );
  });

  test("describes a settlement as provider-confirmed", () => {
    const described = describePaymentStatus("paid");
    expect(described.tone).toBe("settled");
    expect(described.settled).toBe(true);
    expect(described.defaultMessage).toMatch(/provider confirmed/i);
  });
});
