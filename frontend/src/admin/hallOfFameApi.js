import { API_URL } from "../apiConfig";

/**
 * YALA Hall of Fame - admin API access.
 *
 * READ-ONLY. Both endpoints already existed; nothing new is added here.
 *
 *   GET /drivers/hall-of-fame/admin/?year&month&city   -> AdminHallOfFameView (IsAdminUser)
 *   GET /locations/cities/                             -> shared admin city list
 *
 * Deliberately uses `fetch` (not the axios `authenticatedApi`) so the existing
 * contract - bearer token from `localStorage.access`, no write verbs - is unchanged.
 *
 * The admin endpoint is MONTH-SCOPED: `year` is always applied, `month` and `city`
 * are optional. It returns `{year, city, members[]}` and caps `members` at 500.
 */

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("access")}` };
}

/** Error carrying the API's `detail`, so callers can surface the server's message. */
export class HallOfFameError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "HallOfFameError";
    this.status = status;
  }
}

export async function fetchRecognitions({ year, month, city } = {}) {
  const params = new URLSearchParams({ year: String(year) });
  if (month) params.set("month", String(month));
  if (city) params.set("city", String(city));

  const response = await fetch(`${API_URL}/drivers/hall-of-fame/admin/?${params}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new HallOfFameError(
      data?.detail || "Unable to load Hall of Fame recognitions.",
      response.status
    );
  }

  return {
    year: data?.year ?? year,
    city: data?.city ?? "",
    members: Array.isArray(data?.members) ? data.members : [],
  };
}

export async function fetchCityOptions() {
  const response = await fetch(`${API_URL}/locations/operating-cities/`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  const rows = Array.isArray(data?.cities) ? data.cities : [];
  return rows.map((row) => ({ id: row.id, name: row.name, region: row.region }));
}
