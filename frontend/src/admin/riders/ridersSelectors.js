/**
 * Pure, unit-tested helpers for the Riders Management module.
 *
 * All functions here are side-effect free so they can be covered by fast Jest
 * unit tests and reused by the container component. They operate only on the
 * fields exposed by the backend `serialize_user` payload (GET /auth/users/) and
 * the ride-history list already fetched by AdminDashboard. No data is
 * fabricated: when a value is not available from the API, the helpers return
 * `null` and the UI renders an honest empty state.
 */

/** A user is a rider when flagged is_rider (or user_type rider) and NOT staff. */
export function isRider(user) {
  return Boolean((user?.is_rider || user?.user_type === "rider") && !user?.is_staff);
}

/**
 * Real summary counts computed from the loaded riders list.
 * - total: all riders
 * - active: is_active === true (account status dimension)
 * - pending: rider_status === "pending" (verification dimension)
 * - verified: rider_status === "approved"
 * - suspended: is_active === false
 * Account status (active/suspended) is deliberately kept separate from
 * verification status (pending/approved/rejected) — see requirement 6.
 */
export function computeRiderSummary(riders = []) {
  return riders.reduce(
    (acc, rider) => {
      acc.total += 1;
      if (rider.is_active) acc.active += 1;
      else acc.suspended += 1;
      if (rider.rider_status === "pending") acc.pending += 1;
      if (rider.rider_status === "approved") acc.verified += 1;
      return acc;
    },
    { total: 0, active: 0, pending: 0, verified: 0, suspended: 0 }
  );
}

const SEARCH_FIELDS = ["full_name", "email", "phone_number", "national_id_number"];

/**
 * Client-side filtering over the loaded riders list. Mirrors the fields used by
 * AdminDashboard.matchesSearch for riders. No new backend query params.
 *   query        — matched against name/email/phone/national id (case-insensitive)
 *   verification — "" | "pending" | "approved" | "rejected" (rider_status)
 *   account      — "" | "active" | "suspended" (is_active)
 */
export function filterRiders(riders = [], { query = "", verification = "", account = "" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  return riders.filter((rider) => {
    if (q) {
      const matches = SEARCH_FIELDS.some((field) =>
        String(rider[field] ?? "").toLowerCase().includes(q)
      );
      if (!matches) return false;
    }
    if (verification && rider.rider_status !== verification) return false;
    if (account === "active" && !rider.is_active) return false;
    if (account === "suspended" && rider.is_active) return false;
    return true;
  });
}

/** Stable sort of riders by date_joined. dir = "asc" | "desc". */
export function sortRidersByDate(riders = [], dir = "desc") {
  const factor = dir === "asc" ? 1 : -1;
  return [...riders].sort((a, b) => {
    const ta = Date.parse(a?.date_joined) || 0;
    const tb = Date.parse(b?.date_joined) || 0;
    return (ta - tb) * factor;
  });
}

/**
 * Verification-status descriptor (rider_status dimension).
 * pending -> amber (warning), approved -> green (success), rejected -> red (danger).
 */
export function getVerification(rider) {
  const status = rider?.rider_status;
  if (status === "approved") return { status, label: rider.rider_status_label || "Approved", tone: "success" };
  if (status === "rejected") return { status, label: rider.rider_status_label || "Rejected", tone: "danger" };
  if (status === "pending") return { status, label: rider.rider_status_label || "Pending", tone: "warning" };
  return { status: status || "unknown", label: rider?.rider_status_label || "Unknown", tone: "neutral" };
}

/**
 * Account-status descriptor (is_active dimension) — kept separate from
 * verification. active -> green (success), suspended -> grey-red (neutral).
 */
export function getAccountStatus(rider) {
  return rider?.is_active
    ? { active: true, label: "Active", tone: "success" }
    : { active: false, label: "Suspended", tone: "neutral" };
}

/**
 * Derived count of COMPLETED rides for a rider from the already-loaded ride
 * history list. serialize_user has NO per-rider ride count, so this is the only
 * possible client-side source. A ride is counted only when it reliably links to
 * the rider by an EXACT email match AND carries a trustworthy completed marker
 * (status === "completed"). If no rides list is available or the rider has no
 * email to match on, we return `null` so the UI shows "N/A" rather than a
 * fabricated 0. This remains a documented missing backend capability regardless
 * (the list may be paginated/filtered server-side and is not an authoritative
 * per-rider total).
 */
export function getCompletedRideCount(rider, rides) {
  if (!Array.isArray(rides) || rides.length === 0) return null;
  const email = String(rider?.email || "").trim().toLowerCase();
  if (!email) return null;
  let linkable = false;
  let count = 0;
  for (const ride of rides) {
    const rideEmail = String(ride?.rider_email || "").trim().toLowerCase();
    if (!rideEmail) continue;
    linkable = true;
    if (rideEmail === email && ride?.status === "completed") count += 1;
  }
  // If not a single ride exposed a rider_email we cannot reliably link — N/A.
  return linkable ? count : null;
}

/**
 * DISPLAY-ONLY heuristic that flags likely QA / test accounts so an admin can
 * recognise them at a glance. It NEVER filters, deletes, modifies, or auto-acts
 * on any account — it only drives a neutral "TEST/QA" badge. Matches common test
 * markers in the email (example.com domain, "test"/"qa" substrings, "+tester"
 * plus-tag) or the word "test" in the display name.
 */
export function isTestAccount(rider) {
  const email = String(rider?.email || "").toLowerCase();
  const name = String(rider?.full_name || "").toLowerCase();
  if (!email && !name) return false;
  if (email.endsWith("@example.com")) return true;
  if (email.includes("+test")) return true;
  // Match test/qa/tester only as DELIMITED tokens (not arbitrary substrings) to
  // avoid mislabeling legitimate accounts (e.g. "contestant", "mustaqa", a name
  // like "Contest"). Delimiters: start/end or . _ + @ - boundaries.
  if (/(^|[._+@-])(test|qa|tester)([._+@-]|$)/.test(email)) return true;
  if (/(^|\s)(test|qa|tester)(\s|$)/.test(name)) return true;
  return false;
}
