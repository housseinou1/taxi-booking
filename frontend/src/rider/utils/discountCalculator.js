/**
 * Apply a discount to a fare. Supports both percentage-based and fixed-amount discounts.
 * If both discountPercent and discountAmount are provided, percentage is applied first,
 * then the fixed amount is subtracted from the result.
 *
 * @param {number} fare - Original fare amount
 * @param {number} [discountPercent=0] - Discount percentage (1-100)
 * @param {number} [discountAmount=0] - Fixed discount amount in MRU
 * @returns {{ originalFare: number, discountedFare: number }} Object with both values
 */
export function applyDiscount(fare, discountPercent = 0, discountAmount = 0) {
  const originalFare = Number(fare) || 0;
  const percent = Number(discountPercent) || 0;
  const amount = Number(discountAmount) || 0;

  let discountedFare = originalFare;

  if (percent > 0 && percent <= 100) {
    discountedFare = originalFare * (1 - percent / 100);
  }

  if (amount > 0) {
    discountedFare = discountedFare - amount;
  }

  // Ensure discounted fare is not negative
  discountedFare = Math.max(0, Math.round(discountedFare * 100) / 100);

  return {
    originalFare,
    discountedFare,
  };
}
