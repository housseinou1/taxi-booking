import { formatMoney, MARKET } from "../../marketConfig";
import {
  averageTripValue,
  filterRidesInRange,
  revenuePerHour,
  toAmount,
  tripDrivingMinutes,
} from "./earningsNormalize";

function formatAmount(amount) {
  return `${toAmount(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${MARKET.currency}`;
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildDailyStatementText(hub) {
  const today = hub?.earnings?.today || {};
  const hours = hub?.onlineHours?.today ?? 0;
  const financials = hub?.financials?.today || {};
  const avg = averageTripValue(today.totalEarnings, today.rideCount);
  const perHour = revenuePerHour(today.totalEarnings, hours);

  return [
    "Yala Driver — Daily Earnings Statement",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    `Total earnings: ${formatAmount(today.totalEarnings)}`,
    `Completed trips: ${today.rideCount || 0}`,
    `Average trip value: ${formatAmount(avg)}`,
    `Online hours: ${hours} h`,
    financials.drivingMinutes
      ? `Trip driving time: ${(financials.drivingMinutes / 60).toFixed(1)} h`
      : null,
    perHour != null ? `Revenue per online hour: ${formatAmount(perHour)}` : null,
    "",
    `Gross fares: ${formatAmount(financials.gross)}`,
    `Commission: ${formatAmount(financials.commission)}`,
    `Net earnings: ${formatAmount(financials.net || today.totalEarnings)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMonthDailyBreakdownFromLedger(rides = []) {
  const monthStart = new Date();
  monthStart.setDate(1);
  const startIso = monthStart.toISOString().slice(0, 10);
  const byDay = new Map();

  filterRidesInRange(rides, startIso, null).forEach((ride) => {
    const raw = ride?.completed_at || ride?.created_at;
    if (!raw) return;
    const day = String(raw).slice(0, 10);
    const current = byDay.get(day) || { label: day, value: 0, ride_count: 0 };
    current.value += toAmount(ride.driver_earning ?? ride.driver_share);
    current.ride_count += 1;
    byDay.set(day, current);
  });

  return Array.from(byDay.values()).sort((left, right) =>
    String(left.label).localeCompare(String(right.label)),
  );
}

export function buildMonthlySummaryText(hub, chartRows = []) {
  const month = hub?.earnings?.month || {};
  const financials = hub?.financials?.month || {};
  const daysInMonth = new Date().getDate();
  const avgDaily = daysInMonth ? month.totalEarnings / daysInMonth : 0;
  const breakdownRows =
    chartRows.length > 0 ? chartRows : buildMonthDailyBreakdownFromLedger(hub?.ridesLedger || []);

  const lines = [
    "Yala Driver — Monthly Earnings Summary",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    `Monthly net earnings: ${formatAmount(month.totalEarnings)}`,
    `Trips completed: ${month.rideCount || financials.tripCount || 0}`,
    `Gross fares: ${formatAmount(financials.gross)}`,
    `Commission deducted: ${formatAmount(financials.commission)}`,
    `Average daily earnings: ${formatAmount(avgDaily)}`,
    `Online hours (month): ${hub?.onlineHours?.month ?? 0} h`,
    "",
    "Daily breakdown (from completed trips):",
  ];

  breakdownRows.forEach((row) => {
    lines.push(
      `- ${row.label}: ${formatAmount(row.value)} (${row.ride_count || 0} trips)`,
    );
  });

  return lines.join("\n");
}

export function downloadDailyStatement(hub) {
  downloadTextFile(
    `yala-driver-daily-${new Date().toISOString().slice(0, 10)}.txt`,
    buildDailyStatementText(hub),
  );
}

export function downloadMonthlySummary(hub) {
  downloadTextFile(
    `yala-driver-monthly-${new Date().toISOString().slice(0, 7)}.txt`,
    buildMonthlySummaryText(hub),
  );
}

export function buildTripsCsv(trips = []) {
  const header = [
    "trip_id",
    "date",
    "pickup",
    "destination",
    "distance_km",
    "duration_min",
    "fare",
    "waiting_fee",
    "commission",
    "net_earning",
    "payment_method",
    "payment_status",
  ].join(",");

  const rows = trips
    .filter((ride) => ride?.status === "completed")
    .map((ride) => {
      const minutes = tripDrivingMinutes(ride);
      return [
        ride.id,
        ride.completed_at || ride.created_at || "",
        JSON.stringify(ride.pickup || ride.pickup_address || ""),
        JSON.stringify(ride.destination || ride.destination_address || ""),
        ride.distance_km ?? "",
        minutes != null ? minutes : "",
        toAmount(ride.fare),
        toAmount(ride.waiting_fee),
        toAmount(ride.app_fee),
        toAmount(ride.driver_earning ?? ride.driver_share),
        JSON.stringify(ride.payment_method || ""),
        ride.payment_status || "",
      ].join(",");
    });

  return [header, ...rows].join("\n");
}

export function downloadTripsCsvFromHub(hub, filenamePrefix = "yala-driver-trips") {
  const ledger = Array.isArray(hub?.ridesLedger) ? hub.ridesLedger : [];
  downloadTripsCsv(ledger, filenamePrefix);
}

export function downloadTripsCsv(trips, filenamePrefix = "yala-driver-trips") {
  downloadTextFile(
    `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`,
    buildTripsCsv(trips),
    "text/csv;charset=utf-8",
  );
}
