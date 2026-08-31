import { formatPercent, formatTrend, formatCurrency } from "./formatters";

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
});
