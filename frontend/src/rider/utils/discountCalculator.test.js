import { applyDiscount } from './discountCalculator';

describe('applyDiscount', () => {
  it('applies percentage discount correctly', () => {
    const result = applyDiscount(1000, 20, 0);
    expect(result.originalFare).toBe(1000);
    expect(result.discountedFare).toBe(800);
  });

  it('applies fixed amount discount correctly', () => {
    const result = applyDiscount(1000, 0, 150);
    expect(result.originalFare).toBe(1000);
    expect(result.discountedFare).toBe(850);
  });

  it('applies both percentage and fixed amount', () => {
    // 1000 * (1 - 10/100) = 900, then 900 - 50 = 850
    const result = applyDiscount(1000, 10, 50);
    expect(result.originalFare).toBe(1000);
    expect(result.discountedFare).toBe(850);
  });

  it('does not go below zero', () => {
    const result = applyDiscount(100, 0, 500);
    expect(result.discountedFare).toBe(0);
  });

  it('handles 100% discount', () => {
    const result = applyDiscount(500, 100, 0);
    expect(result.discountedFare).toBe(0);
  });

  it('handles zero fare', () => {
    const result = applyDiscount(0, 20, 50);
    expect(result.originalFare).toBe(0);
    expect(result.discountedFare).toBe(0);
  });

  it('handles no discount', () => {
    const result = applyDiscount(500, 0, 0);
    expect(result.originalFare).toBe(500);
    expect(result.discountedFare).toBe(500);
  });

  it('rounds to 2 decimal places', () => {
    // 333 * (1 - 33/100) = 333 * 0.67 = 223.11
    const result = applyDiscount(333, 33, 0);
    expect(result.discountedFare).toBe(223.11);
  });
});
