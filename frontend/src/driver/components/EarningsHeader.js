import React from "react";
import { formatMoney } from "../../marketConfig";

const PERIOD_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
];

/**
 * Floating earnings pill — tap label to cycle Today / Week / Month / Year; tap amount for details.
 */
export default function EarningsHeader({
  earnings = 0,
  period = "today",
  onPeriodChange,
  onTap,
  lyftUI = false,
}) {
  const currentIndex = Math.max(
    0,
    PERIOD_OPTIONS.findIndex((option) => option.key === period)
  );
  const current = PERIOD_OPTIONS[currentIndex] || PERIOD_OPTIONS[0];

  const cyclePeriod = (event) => {
    event.stopPropagation();
    if (typeof onPeriodChange !== "function") return;
    const next = PERIOD_OPTIONS[(currentIndex + 1) % PERIOD_OPTIONS.length];
    onPeriodChange(next.key);
  };

  return (
    <div
      className={
        lyftUI
          ? "driver-earnings-header driver-earnings-header--lyft"
          : "driver-earnings-header"
      }
    >
      <button
        type="button"
        className="driver-earnings-header__label"
        onClick={cyclePeriod}
        aria-label={`Earnings period: ${current.label}. Tap to change.`}
      >
        {current.label}
        <small aria-hidden="true">▾</small>
      </button>
      <button
        type="button"
        className="driver-earnings-header__amount"
        onClick={onTap}
        aria-label={`${current.label} earnings: ${formatMoney(earnings)}`}
      >
        {formatMoney(earnings)}
      </button>
    </div>
  );
}

export { PERIOD_OPTIONS };
