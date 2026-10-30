/**
 * Pure, unit-tested helpers for the Drivers Management module.
 *
 * All functions here are side-effect free so they can be covered by fast Jest
 * unit tests and reused by the container component. They operate only on the
 * fields exposed by the ADMIN driver list payload (GET /drivers/list/, which
 * merges serialize_driver + get_driver_performance_snapshot plus the two
 * FEAT-001 admin-only keys total_rides_completed and average_rating). No data
 * is fabricated: when a value is not available from the API the helpers return
 * `null` and the UI renders an honest "N/A" / empty state — never a 0.
 */

/** A driver profile belongs to the taxi fleet when it is NOT flagged is_courier. */
export function isTaxiDriver(driver) {
  return driver?.is_courier === false;
}

/**
 * Return null for a missing datum (undefined, null) so the UI can render an
 * honest "N/A" instead of coercing the unknown value to 0. Mirrors the
 * null-not-zero convention used by the Riders module's getCompletedRideCount.
 */
export function naOrNull(value) {
  if (value === null || value === undefined) return null;
  return value;
}

/** True when a date string falls inside the current calendar month (local time). */
function isInCurrentMonth(value) {
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return false;
  const d = new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Real Phase-1 summary counts computed from the loaded drivers list.
 * - total: all drivers
 * - approved: status === "approved" (verification dimension)
 * - pending: status === "pending" || "pending_review"
 * - rejected: status === "rejected"
 * - suspended: is_active === false (account dimension)
 * - online: is_available === true
 * - offline: total - online
 * - newThisMonth: date_joined within the current calendar month
 * - totalCompletedRides: SUM of total_rides_completed across drivers, but NULL
 *   if ANY driver lacks the key (never coerce a missing value to 0).
 * Account status (active/suspended), verification status (approved/pending/
 * rejected) and online status (available) are three distinct dimensions.
 */
export function computeDriverSummary(drivers = []) {
  let totalCompletedRides = 0;
  let completedRidesKnown = true;

  const counts = drivers.reduce(
    (acc, driver) => {
      acc.total += 1;
      if (driver.status === "approved") acc.approved += 1;
      if (driver.status === "pending" || driver.status === "pending_review") acc.pending += 1;
      if (driver.status === "rejected") acc.rejected += 1;
      if (driver.is_active === false) acc.suspended += 1;
      if (driver.is_available === true) acc.online += 1;
      if (isInCurrentMonth(driver.date_joined)) acc.newThisMonth += 1;

      const completed = driver.total_rides_completed;
      if (completed === null || completed === undefined) completedRidesKnown = false;
      else totalCompletedRides += Number(completed) || 0;

      return acc;
    },
    {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      suspended: 0,
      online: 0,
      newThisMonth: 0,
    }
  );

  counts.offline = counts.total - counts.online;
  counts.totalCompletedRides = completedRidesKnown ? totalCompletedRides : null;
  return counts;
}

const SEARCH_FIELDS = ["driver_name", "email", "phone_number", "vehicle_plate"];

/**
 * Client-side filtering over the loaded drivers list. No new backend query
 * params.
 *   query        — matched against name/email/phone/driver id/vehicle plate
 *   verification — "" | "approved" | "pending" | "rejected" (status)
 *   account      — "" | "active" | "suspended" (is_active)
 *   online       — "" | "online" | "offline" (is_available)
 *   city         — "" | <city_name> (exact, case-insensitive)
 *   vehicleType  — "" | <driver_category_label || car_type> (exact, case-insensitive)
 */
export function filterDrivers(
  drivers = [],
  { query = "", verification = "", account = "", online = "", city = "", vehicleType = "" } = {}
) {
  const q = String(query || "").trim().toLowerCase();
  const cityNeedle = String(city || "").trim().toLowerCase();
  const vehicleNeedle = String(vehicleType || "").trim().toLowerCase();
  return drivers.filter((driver) => {
    if (q) {
      const idValue = String(driver.driver_code ?? driver.id ?? "").toLowerCase();
      const matches =
        SEARCH_FIELDS.some((field) => String(driver[field] ?? "").toLowerCase().includes(q)) ||
        idValue.includes(q);
      if (!matches) return false;
    }
    if (verification && driver.status !== verification) return false;
    if (account === "active" && driver.is_active === false) return false;
    if (account === "suspended" && driver.is_active !== false) return false;
    if (online === "online" && driver.is_available !== true) return false;
    if (online === "offline" && driver.is_available === true) return false;
    if (cityNeedle && String(driver.city_name ?? "").toLowerCase() !== cityNeedle) return false;
    if (vehicleNeedle) {
      const vehicle = String(driver.driver_category_label || driver.car_type || "").toLowerCase();
      if (vehicle !== vehicleNeedle) return false;
    }
    return true;
  });
}

/** Stable, non-mutating sort of drivers by date_joined. dir = "asc" | "desc". */
export function sortDrivers(drivers = [], dir = "desc") {
  const factor = dir === "asc" ? 1 : -1;
  return [...drivers].sort((a, b) => {
    const ta = Date.parse(a?.date_joined) || 0;
    const tb = Date.parse(b?.date_joined) || 0;
    return (ta - tb) * factor;
  });
}

/**
 * Verification-status descriptor (status dimension).
 * approved -> green (success), pending/pending_review -> amber (warning),
 * rejected -> red (danger).
 */
export function getVerificationStatus(driver) {
  const status = driver?.status;
  if (status === "approved") return { status, label: "Approved", tone: "success" };
  if (status === "rejected") return { status, label: "Rejected", tone: "danger" };
  if (status === "pending" || status === "pending_review") {
    return { status, label: "Pending", tone: "warning" };
  }
  return { status: status || "unknown", label: "Unknown", tone: "neutral" };
}

/**
 * Account-status descriptor (is_active dimension) — kept separate from
 * verification. Active -> green (success), Suspended -> neutral.
 */
export function getAccountStatus(driver) {
  return driver?.is_active === false
    ? { active: false, label: "Suspended", tone: "neutral" }
    : { active: true, label: "Active", tone: "success" };
}

/**
 * Online-status descriptor (is_available dimension) — kept separate from both
 * account and verification. Online -> green (success), Offline -> neutral.
 */
export function getOnlineStatus(driver) {
  return driver?.is_available === true
    ? { online: true, label: "Online", tone: "success" }
    : { online: false, label: "Offline", tone: "neutral" };
}
