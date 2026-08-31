import { isPaymentPending, isPaymentSettled } from "./ridePaymentService";

describe("ridePaymentService", () => {
  it("detects settled payments", () => {
    expect(isPaymentSettled({ status: "paid" })).toBe(true);
    expect(isPaymentSettled({ status: "authorized" })).toBe(true);
    expect(isPaymentSettled({ status: "pending_verification" })).toBe(false);
  });

  it("detects pending payments", () => {
    expect(isPaymentPending({ status: "pending_verification" })).toBe(true);
    expect(isPaymentPending({ status: "paid" })).toBe(false);
  });
});
