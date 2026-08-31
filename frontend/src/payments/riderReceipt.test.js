import { buildRideReceiptRows } from "./riderReceipt";

describe("riderReceipt", () => {
  it("builds receipt rows from backend ride and payment payloads", () => {
    const { rows, total } = buildRideReceiptRows({
      ride: {
        id: 12,
        pickup_address: "Market",
        destination_address: "Airport",
        driver_name: "Ahmed",
        vehicle_make: "Toyota",
        vehicle_model: "Corolla",
        distance_km: 8.4,
        duration_minutes: 18,
        waiting_fee: 50,
        fare: 1200,
      },
      payment: {
        amount: 1200,
        tip_amount: 0,
        method: "cash",
        transaction_id: "tx-123",
        created_at: "2026-07-23T10:00:00.000Z",
        status: "paid",
      },
    });

    expect(rows.some((row) => row.label === "Trip ID" && row.value === "#12")).toBe(true);
    expect(rows.some((row) => row.label === "Waiting fee")).toBe(true);
    expect(rows.some((row) => row.label === "Payment method" && row.value === "Cash")).toBe(true);
    expect(total).toMatch(/1[\s,]?200/);
  });
});
