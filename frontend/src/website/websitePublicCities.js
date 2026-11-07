import { API_URL } from "../apiConfig";
import { normalizeCityNameKey } from "../admin/city/majorOperatingCities";
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

/** Merge wilaya catalog with live operating-city API (no auth required on public list). */
export async function loadWebsiteCityCatalog() {
  let operatingKeys = new Set();
  let nouakchottDistricts = [];
  let apiError = null;

  try {
    const res = await fetch(`${API_URL}/locations/operating-cities/`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const body = await res.json();
      const rows = Array.isArray(body?.cities) ? body.cities : [];
      rows.forEach((row) => {
        const key = canonicalKey(row.canonical_name || row.name);
        if (key) operatingKeys.add(key);
      });
    } else {
      apiError = `HTTP ${res.status}`;
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

  const entries = WEBSITE_WILAYAS.map((row) => ({
    ...row,
    operational: operatingKeys.has(canonicalKey(row.canonical)),
  }));

  return { entries, nouakchottDistricts, apiError, operatingCount: operatingKeys.size };
}
