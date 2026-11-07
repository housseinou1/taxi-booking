import { API_URL } from "../apiConfig";
import {
  filterMajorOperatingLocationCities,
  normalizeCityNameKey,
} from "../admin/city/majorOperatingCities";
import { WEBSITE_WILAYAS } from "./websiteWilayas";

function canonicalKey(name) {
  const key = normalizeCityNameKey(name);
  if (key.startsWith("nouakchott")) return "nouakchott";
  if (key.startsWith("aioun") || key.includes("ayoun")) return "aioun";
  if (key === "kaedi") return "kaedi";
  if (key === "nema") return "nema";
  if (key === "zouerat" || key === "zouerate") return "zouerate";
  return key;
}

async function fetchOperatingKeysFromDedicatedEndpoint() {
  const res = await fetch(`${API_URL}/locations/operating-cities/`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    return { keys: null, error: `operating-cities HTTP ${res.status}` };
  }
  const body = await res.json();
  const rows = Array.isArray(body?.cities) ? body.cities : [];
  const keys = new Set();
  rows.forEach((row) => {
    const key = canonicalKey(row.canonical_name || row.name);
    if (key) keys.add(key);
  });
  return { keys, error: null, source: "operating-cities" };
}

/** Fallback when prod backend predates /operating-cities/ — derive majors from /locations/cities/. */
async function fetchOperatingKeysFromCityCatalog() {
  const res = await fetch(`${API_URL}/locations/cities/`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    return { keys: null, error: `locations/cities HTTP ${res.status}` };
  }
  const list = await res.json();
  if (!Array.isArray(list)) {
    return { keys: null, error: "locations/cities invalid JSON" };
  }
  const majors = filterMajorOperatingLocationCities(list);
  const keys = new Set(majors.map((row) => canonicalKey(row.name)));
  return { keys, error: null, source: "locations/cities" };
}

/**
 * Merge wilaya catalog with operating-city data.
 * serviceStatus per row: live | planned | unknown (unknown when API data unavailable).
 */
export async function loadWebsiteCityCatalog() {
  let operatingKeys = null;
  let availabilitySource = null;
  let apiError = null;
  let nouakchottDistricts = [];

  try {
    let result = await fetchOperatingKeysFromDedicatedEndpoint();
    if (result.keys == null) {
      const fallback = await fetchOperatingKeysFromCityCatalog();
      if (fallback.keys != null) {
        result = fallback;
      } else {
        apiError = result.error || fallback.error || "unavailable";
      }
    }
    if (result.keys != null) {
      operatingKeys = result.keys;
      availabilitySource = result.source;
    }
  } catch (err) {
    apiError = err?.message || "network";
  }

  try {
    const res = await fetch(`${API_URL}/locations/cities/`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        nouakchottDistricts = list
          .filter((c) => canonicalKey(c?.name) === "nouakchott" && c?.name !== "Nouakchott")
          .map((c) => c.name)
          .sort((a, b) => String(a).localeCompare(String(b)));
      }
    }
  } catch {
    /* districts optional */
  }

  const availabilityKnown = operatingKeys != null;

  const entries = WEBSITE_WILAYAS.map((row) => {
    const key = canonicalKey(row.canonical);
    let serviceStatus = "unknown";
    if (availabilityKnown) {
      serviceStatus = operatingKeys.has(key) ? "live" : "planned";
    }
    return {
      ...row,
      operational: serviceStatus === "live",
      serviceStatus,
    };
  });

  return {
    entries,
    nouakchottDistricts,
    apiError: availabilityKnown ? null : apiError,
    availabilityKnown,
    availabilitySource,
    operatingCount: operatingKeys?.size ?? 0,
  };
}
