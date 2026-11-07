import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import { filterMajorOperatingLocationCities } from "../city/majorOperatingCities";

/**
 * GET /locations/operating-cities/ — 13 operating metros with real ``locations.City`` ids.
 */
export async function fetchOperatingLocationCities() {
  const res = await authenticatedApi.get(`${API_URL}/locations/operating-cities/`, {
    timeout: 20000,
  });
  const rows = Array.isArray(res.data?.cities) ? res.data.cities : [];
  return rows;
}

/** Fallback when the operating-cities endpoint is unavailable (local dev without migrate). */
const OPERATING_METRO_COUNT = 13;

export async function fetchOperatingLocationCitiesWithFallback() {
  try {
    const rows = await fetchOperatingLocationCities();
    if (rows.length >= OPERATING_METRO_COUNT) return rows;
    if (rows.length > 0) {
      /* Partial catalog — retry once (backend may have just seeded missing metros). */
      const retry = await fetchOperatingLocationCities();
      if (retry.length >= rows.length) return retry;
    }
  } catch {
    /* fall through */
  }
  const res = await authenticatedApi.get(`${API_URL}/locations/cities/`, { timeout: 20000 });
  const list = Array.isArray(res.data) ? res.data : [];
  return filterMajorOperatingLocationCities(list).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    region: c.region,
    registry_city_ids: [],
    primary_registry_city_id: null,
    display_order: 0,
    canonical_name: c.name,
  }));
}
