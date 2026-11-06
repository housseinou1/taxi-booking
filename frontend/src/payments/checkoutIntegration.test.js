/**
 * Tests for the Rider / Delivery checkout wiring.
 *
 * The invariant under test throughout: starting a Moosyl payment is a HANDOFF, never a
 * settlement. Only the backend webhook may mark an order paid.
 */

jest.mock("./paymentApi", () => ({
  DELIVERY_PAYMENT_METHODS: [
    { value: "card", label: "Debit/Credit Card", payLabel: "Pay with Card" },
    { value: "bankily", label: "Bankily", payLabel: "Pay with Bankily" },
  ],
  startMoosylCheckout: jest.fn(),
  createRidePayment: jest.fn(),
  markRidePaid: jest.fn(),
  payRideWithWallet: jest.fn(),
  withPaymentRetry: (operation) => operation(),
}));

import {
  createRidePayment,
  markRidePaid,
  payRideWithWallet,
  startMoosylCheckout,
} from "./paymentApi";
import {
  beginMoosylCheckout,
  isMoosylMethod,
  waitForBackendSettlement,
  MOOSYL_METHODS,
} from "./moosylCheckout";
import { submitRidePayment } from "./ridePaymentService";
import { submitDeliveryPayment, deliveryMethodsFor } from "./deliveryPayment";

const CHECKOUT = {
  checkout_url: "https://payments.moosyl.com/checkout/abc",
  transaction_id: "YALA-RIDE-1043",
  amount_mru: "121",
  environment: "sandbox",
  confirmation: "backend_webhook",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isMoosylMethod", () => {
  it("routes the bank apps, in either spelling", () => {
    ["bankily", "masravi", "sedad", "masrvi", "seddad"].forEach((method) => {
      expect(isMoosylMethod(method)).toBe(true);
    });
  });

  it("never routes card, wallet or cash through Moosyl", () => {
    ["card", "wallet", "cash", "", undefined].forEach((method) => {
      expect(isMoosylMethod(method)).toBe(false);
    });
  });

  it("covers exactly Bankily, Masravi and Sedad", () => {
    expect(MOOSYL_METHODS).toEqual(["bankily", "masravi", "sedad"]);
  });
});

describe("beginMoosylCheckout", () => {
  it("returns a handoff and never a settlement", async () => {
    startMoosylCheckout.mockResolvedValue(CHECKOUT);
    const result = await beginMoosylCheckout({ rideId: 1043 });
    expect(result.started).toBe(true);
    expect(result.checkoutUrl).toBe(CHECKOUT.checkout_url);
    expect(result.settled).toBe(false);
    expect(result.method).toBe("backend_webhook");
  });

  it("does not navigate when redirect is not requested", async () => {
    startMoosylCheckout.mockResolvedValue(CHECKOUT);
    const navigate = jest.fn();
    await beginMoosylCheckout({ rideId: 1, navigate });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to the checkout page when asked", async () => {
    startMoosylCheckout.mockResolvedValue(CHECKOUT);
    const navigate = jest.fn();
    await beginMoosylCheckout({ rideId: 1, redirect: true, navigate });
    expect(navigate).toHaveBeenCalledWith(CHECKOUT.checkout_url);
  });

  it("refuses when the backend returns no checkout page", async () => {
    startMoosylCheckout.mockResolvedValue({ transaction_id: "YALA-RIDE-1" });
    await expect(beginMoosylCheckout({ rideId: 1 })).rejects.toThrow(
      "Moosyl did not return a checkout page."
    );
  });

  it("requires a ride or a delivery", async () => {
    await expect(beginMoosylCheckout({})).rejects.toThrow(
      "A ride or delivery is required to start a payment."
    );
  });
});

describe("submitRidePayment", () => {
  it("hands a bank app off to Moosyl without creating a second payment row", async () => {
    startMoosylCheckout.mockResolvedValue(CHECKOUT);
    const result = await submitRidePayment({ rideId: 1043, method: "bankily" });

    expect(startMoosylCheckout).toHaveBeenCalledTimes(1);
    // The backend creates the payment row when the session is created, so the client
    // must not also call create_payment (that would be a duplicate attempt).
    expect(createRidePayment).not.toHaveBeenCalled();
    expect(markRidePaid).not.toHaveBeenCalled();
    expect(result.awaitingBackend).toBe(true);
    expect(result.payment).toBeNull();
    expect(result.message).toMatch(/bank app/i);
  });

  it("routes the legacy ride spelling (masrvi) through Moosyl too", async () => {
    startMoosylCheckout.mockResolvedValue(CHECKOUT);
    await submitRidePayment({ rideId: 7, method: "masrvi" });
    expect(startMoosylCheckout).toHaveBeenCalledTimes(1);
  });

  it("keeps the card flow on its existing handler", async () => {
    createRidePayment.mockResolvedValue({
      payment: { id: 1, status: "pending_verification" },
    });
    const result = await submitRidePayment({ rideId: 5, method: "card" });
    expect(createRidePayment).toHaveBeenCalledTimes(1);
    expect(startMoosylCheckout).not.toHaveBeenCalled();
    expect(result.pendingVerification).toBe(true);
  });

  it("keeps the wallet flow on its existing handler", async () => {
    payRideWithWallet.mockResolvedValue({ payment: { id: 2, status: "paid" } });
    const result = await submitRidePayment({ rideId: 6, method: "wallet" });
    expect(payRideWithWallet).toHaveBeenCalledTimes(1);
    expect(startMoosylCheckout).not.toHaveBeenCalled();
    expect(result.message).toMatch(/wallet payment completed/i);
  });

  it("no longer refuses cash — it is recorded and awaits driver confirmation", async () => {
    createRidePayment.mockResolvedValue({
      payment: { id: 3, status: "pending_verification" },
    });
    const result = await submitRidePayment({ rideId: 8, method: "cash" });
    expect(createRidePayment).toHaveBeenCalledTimes(1);
    expect(result.message).not.toMatch(/not available/i);
    expect(result.message).toMatch(/driver will confirm/i);
  });
});

describe("submitDeliveryPayment", () => {
  it("hands a bank app off to Moosyl", async () => {
    startMoosylCheckout.mockResolvedValue(CHECKOUT);
    const result = await submitDeliveryPayment({ deliveryId: 88, method: "sedad" });
    expect(startMoosylCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 88 })
    );
    expect(result.awaitingBackend).toBe(true);
    expect(result.payment).toBeNull();
  });

  it("records cash and awaits courier confirmation", async () => {
    const result = await submitDeliveryPayment({ deliveryId: 88, method: "cash" });
    expect(startMoosylCheckout).not.toHaveBeenCalled();
    expect(result.message).toMatch(/courier will confirm/i);
  });

  it("pays from the wallet when a handler is supplied", async () => {
    const payWithWallet = jest.fn().mockResolvedValue({ id: 9, status: "paid" });
    const result = await submitDeliveryPayment({
      deliveryId: 88,
      method: "wallet",
      payWithWallet,
    });
    expect(payWithWallet).toHaveBeenCalledTimes(1);
    expect(result.awaitingBackend).toBe(false);
  });

  it("rejects an unsupported method instead of guessing", async () => {
    await expect(
      submitDeliveryPayment({ deliveryId: 88, method: "cheque" })
    ).rejects.toThrow("Unsupported delivery payment method: cheque");
  });

  it("requires a delivery id", async () => {
    await expect(submitDeliveryPayment({ method: "bankily" })).rejects.toThrow(
      "Delivery ID is required."
    );
  });
});

describe("deliveryMethodsFor", () => {
  it("renders cash only when the backend offers it", () => {
    const withCash = deliveryMethodsFor(["card", "bankily", "cash"]).map((m) => m.value);
    expect(withCash).toContain("cash");
    const withoutCash = deliveryMethodsFor(["card", "bankily"]).map((m) => m.value);
    expect(withoutCash).not.toContain("cash");
  });
});

describe("waitForBackendSettlement", () => {
  it("returns as soon as the backend reports the payment settled", async () => {
    const fetchPayment = jest
      .fn()
      .mockResolvedValueOnce({ status: "pending_verification" })
      .mockResolvedValueOnce({ status: "paid" });
    const sleep = jest.fn().mockResolvedValue(undefined);

    const result = await waitForBackendSettlement({
      fetchPayment,
      isSettled: (payment) => payment?.status === "paid",
      sleep,
    });

    expect(result.status).toBe("paid");
    expect(fetchPayment).toHaveBeenCalledTimes(2);
  });

  it("never invents a success when the backend stays pending", async () => {
    const fetchPayment = jest
      .fn()
      .mockResolvedValue({ status: "pending_verification" });
    const sleep = jest.fn().mockResolvedValue(undefined);

    const result = await waitForBackendSettlement({
      fetchPayment,
      isSettled: (payment) => payment?.status === "paid",
      attempts: 3,
      sleep,
    });

    expect(result.status).toBe("pending_verification");
    expect(fetchPayment).toHaveBeenCalledTimes(3);
  });
});

