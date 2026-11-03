import {
  formatPercent,
  formatTrend,
  formatCurrency,
  formatMoney,
  formatMoneyOrDash,
} from "./formatters";

describe("admin library formatters", () => {
  test("formatPercent renders signed values", () => {
    expect(formatPercent(12.34)).toBe("12.3%");
    expect(formatPercent(5, { signed: true })).toBe("+5.0%");
  });

  test("formatTrend resolves direction", () => {
    expect(formatTrend(3).direction).toBe("up");
    expect(formatTrend(-2).direction).toBe("down");
    expect(formatTrend(0).direction).toBe("flat");
  });

  test("formatCurrency includes MRU", () => {
    expect(formatCurrency(1000)).toContain("MRU");
  });

  test("formatMoneyOrDash distinguishes unavailable from a genuine zero", () => {
    // Unavailable: the API did not report the field at all.
    expect(formatMoneyOrDash(null)).toBe("—");
    expect(formatMoneyOrDash(undefined)).toBe("—");
    expect(formatMoneyOrDash("")).toBe("—");

    // Genuine zero must NOT be reported as unavailable.
    expect(formatMoneyOrDash(0)).toBe("0 MRU");
    expect(formatMoneyOrDash("0")).toBe("0 MRU");
    expect(formatMoneyOrDash("0.00")).toBe("0 MRU");

    // Real amounts keep decimal-safe grouping and 2-decimal rounding.
    expect(formatMoneyOrDash(1234.5)).toBe("1,234.50 MRU");
    expect(formatMoneyOrDash("563.520000000000")).toBe("563.52 MRU");
  });

  test("formatMoney alone still renders an absent value as 0 MRU (unchanged contract)", () => {
    // Documents the behaviour the new helper exists to avoid at call sites that
    // need the distinction. formatMoney's own contract is deliberately unchanged.
    expect(formatMoney(undefined)).toBe("0 MRU");
  });
});
