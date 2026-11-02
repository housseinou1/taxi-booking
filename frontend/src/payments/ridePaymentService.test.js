import { hasPaymentAttempt, isPaymentPending, isPaymentSettled } from "./ridePaymentService";

describe("ridePaymentService", () => {
  it("only treats a backend 'paid' status as settled", () => {
    expect(isPaymentSettled({ status: "paid" })).toBe(true);
    expect(isPaymentSettled({ status: "PAID" })).toBe(true);

    // `authorized` is not a settlement: it was authorized but not captured.
    expect(isPaymentSettled({ status: "authorized" })).toBe(false);
    expect(isPaymentSettled({ status: "pending_verification" })).toBe(false);
    expect(isPaymentSettled({ status: "pending" })).toBe(false);
    expect(isPaymentSettled({ status: "failed" })).toBe(false);
    expect(isPaymentSettled({})).toBe(false);
    expect(isPaymentSettled(null)).toBe(false);
  });

  it("reports an existing attempt for every non-retryable status", () => {
    // This gate must stay wider than `isPaymentSettled` so a second payment is
    // never submitted for a ride that already has one.
    expect(hasPaymentAttempt({ status: "paid" })).toBe(true);
    expect(hasPaymentAttempt({ status: "authorized" })).toBe(true);
    expect(hasPaymentAttempt({ status: "pending_verification" })).toBe(true);

    expect(hasPaymentAttempt({ status: "pending" })).toBe(false);
    expect(hasPaymentAttempt({ status: "failed" })).toBe(false);
    expect(hasPaymentAttempt({ status: "cancelled" })).toBe(false);
    expect(hasPaymentAttempt({})).toBe(false);
  });

  it("keeps authorized as an attempt but not as a settlement", () => {
    const authorized = { status: "authorized" };
    expect(hasPaymentAttempt(authorized)).toBe(true);
    expect(isPaymentSettled(authorized)).toBe(false);
  });

  it("detects pending payments", () => {
    expect(isPaymentPending({ status: "pending_verification" })).toBe(true);
    expect(isPaymentPending({ status: "pending" })).toBe(true);
    expect(isPaymentPending({ status: "paid" })).toBe(false);
    expect(isPaymentPending({ status: "authorized" })).toBe(false);
  });
});
