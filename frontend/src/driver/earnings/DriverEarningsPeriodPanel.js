import React from "react";

import { formatEarningsMRU } from "./earningsNormalize";

export default function DriverEarningsPeriodPanel({
  periodKey = "week",
  hub,
  formatAmount = formatEarningsMRU,
}) {
  if (!hub) return null;

  const period = hub.earnings?.[periodKey] || {};
  const financials = hub.financials?.[periodKey] || {};
  const breakdown = hub.earnings?.breakdown?.[periodKey] || {};
  const title =
    periodKey === "week"
      ? "This week"
      : periodKey === "month"
        ? "This month"
        : periodKey.charAt(0).toUpperCase() + periodKey.slice(1);

  const rows = [
    { label: "Net earnings", value: period.totalEarnings },
    { label: "Trips completed", value: period.rideCount || financials.tripCount, isCount: true },
    { label: "Gross fares", value: financials.gross },
    { label: "Commission deducted", value: financials.commission },
    { label: "Bonuses", value: breakdown.bonus },
    { label: "Incentives", value: breakdown.incentive },
    { label: "Referrals", value: breakdown.referral },
  ];

  if (periodKey === "month") {
    const daysInMonth = new Date().getDate();
    rows.push({
      label: "Average daily earnings",
      value: daysInMonth ? period.totalEarnings / daysInMonth : 0,
    });
  }

  const visibleRows = rows.filter(
    (row) => row.isCount || Number(row.value) > 0 || row.label.includes("Net") || row.label.includes("Average"),
  );

  return (
    <section className="earnings-hub__section" aria-label={`${title} breakdown`}>
      <h3 className="earnings-hub__section-title">{title} breakdown</h3>
      {visibleRows.map((row) => (
        <div key={row.label} className="earnings-hub__row">
          <span>{row.label}</span>
          <strong>
            {row.isCount
              ? row.value || 0
              : formatAmount(row.value || 0)}
          </strong>
        </div>
      ))}
    </section>
  );
}
