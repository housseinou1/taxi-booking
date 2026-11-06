/**
 * Tests for the Moosyl checkout wiring and the backend-gated Cash option.
 *
 * These pin the contract the Rider and Delivery screens depend on:
 *   - the options endpoint is the source of truth for availability
 *   - Cash appears only when the backend offers it
 *   - confirmation is backend-webhook only, never the redirect
 */

import {
  fetchPaymentOptions,
  startMoosylCheckout,
  fetchMoosylMethods,
} from "./paymentApi";
import {
  categoriesForMethods,
  providersForMethods,
  resolvePaymentSelection,
} from "./paymentMethods";

function mockFetchOnce(body, { ok = true, status = 200 } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("fetchPaymentOptions", () => {
  it("calls the options endpoint", async () => {
    mockFetchOnce({ cash: { available: true } });
    await fetchPaymentOptions();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain("/payments/options/");
  });

  it("surfaces the backend error message", async () => {
    mockFetchOnce({ error: "Not configured." }, { ok: false, status: 503 });
    await expect(fetchPaymentOptions()).rejects.toThrow("Not configured.");
  });
});

describe("startMoosylCheckout", () => {
  it("sends a ride checkout request and returns the backend confirmation marker", async () => {
    mockFetchOnce({
      checkout_url: "https://payments.moosyl.com/checkout/abc",
      transaction_id: "YALA-RIDE-1043",
      confirmation: "backend_webhook",
    });
    const result = await startMoosylCheckout({ rideId: 1043 });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ ride_id: 1043 });
    expect(result.transaction_id).toBe("YALA-RIDE-1043");
    // The app must treat this as "started", never as "paid".
    expect(result.confirmation).toBe("backend_webhook");
    expect(result).not.toHaveProperty("paid");
    expect(result).not.toHaveProperty("settled");
  });

  it("sends a delivery checkout request when a delivery id is given", async () => {
    mockFetchOnce({ checkout_url: "https://payments.moosyl.com/checkout/def" });
    await startMoosylCheckout({ deliveryId: 88, phoneNumber: "22222222" });
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      delivery_id: 88,
      phone_number: "22222222",
    });
  });
});

describe("fetchMoosylMethods", () => {
  it("calls the methods endpoint", async () => {
    mockFetchOnce({ methods: ["bankily", "masravi", "sedad"] });
    const result = await fetchMoosylMethods();
    expect(global.fetch.mock.calls[0][0]).toContain("/payments/moosyl/methods/");
    expect(result.methods).toEqual(["bankily", "masravi", "sedad"]);
  });
});

describe("Cash is gated by the backend", () => {
  it("offers no cash category when the backend does not allow cash", () => {
    const ids = categoriesForMethods(["card", "bankily", "masrvi", "seddad"]).map(
      (c) => c.id
    );
    expect(ids).not.toContain("cash");
    expect(ids).toContain("card");
    expect(ids).toContain("mobile_money");
  });

  it("offers the cash category when the backend allows cash", () => {
    const ids = categoriesForMethods(["card", "bankily", "cash"]).map((c) => c.id);
    expect(ids).toContain("cash");
  });

  it("never offers cash when the allow-list is unknown", () => {
    const ids = categoriesForMethods(undefined).map((c) => c.id);
    expect(ids).not.toContain("cash");
  });

  it("resolves a cash selection into the cash method", () => {
    const resolved = resolvePaymentSelection({
      category: "cash",
      availableMethods: ["card", "cash"],
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.method).toBe("cash");
  });

  it("rejects a cash selection the backend does not allow", () => {
    const resolved = resolvePaymentSelection({
      category: "cash",
      availableMethods: ["card", "bankily"],
    });
    expect(resolved.ok).toBe(false);
  });
});

describe("Moosyl bank apps follow the backend list", () => {
  it("narrows the provider list to what Moosyl reports as enabled", () => {
    const ids = providersForMethods(["bankily", "card"]).map((p) => p.id);
    expect(ids).toEqual(["bankily"]);
  });

  it("keeps every provider when no allow-list is supplied", () => {
    const ids = providersForMethods(undefined).map((p) => p.id);
    expect(ids).toEqual(["bankily", "masravi", "sedad"]);
  });
});
