import {
  filterTransactionsByDate,
  groupPaymentsByStatus,
} from "./transactionFilters";

describe("transactionFilters", () => {
  const payments = [
    { id: 1, status: "paid", created_at: new Date().toISOString() },
    { id: 2, status: "pending_verification", created_at: "2020-01-01T00:00:00.000Z" },
    { id: 3, status: "failed", created_at: new Date().toISOString() },
  ];

  it("groups payments by status", () => {
    const grouped = groupPaymentsByStatus(payments);
    expect(grouped.completed).toHaveLength(1);
    expect(grouped.pending).toHaveLength(1);
    expect(grouped.failed).toHaveLength(1);
  });

  it("filters transactions to today", () => {
    const filtered = filterTransactionsByDate(payments, "today");
    expect(filtered.some((item) => item.id === 1)).toBe(true);
    expect(filtered.some((item) => item.id === 2)).toBe(false);
  });

  it("filters transactions by custom date range", () => {
    const filtered = filterTransactionsByDate(payments, "custom", "created_at", {
      from: "2019-12-31",
      to: "2020-01-02",
    });

    expect(filtered.map((item) => item.id)).toEqual([2]);
  });
});
