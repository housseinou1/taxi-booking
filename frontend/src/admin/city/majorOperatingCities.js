/**
 * YALA primary operating cities — admin filters and scoping show only these metros,
 * not every commune/town in the locations catalog.
 *
 * Names align with Mauritania wilaya capitals + Nouakchott (national capital).
 */
export const MAJOR_OPERATING_CITIES = [
  { name: "Nouakchott", region: "Nouakchott" },
  { name: "Nouadhibou", region: "Dakhlet Nouadhibou" },
  { name: "Rosso", region: "Trarza" },
  { name: "Atar", region: "Adrar" },
  { name: "Kaédi", region: "Gorgol" },
  { name: "Kiffa", region: "Assaba" },
  { name: "Néma", region: "Hodh Ech Chargui" },
  { name: "Aïoun", region: "Hodh El Gharbi" },
  { name: "Aleg", region: "Brakna" },
  { name: "Tidjikja", region: "Tagant" },
  { name: "Sélibaby", region: "Guidimakha" },
  { name: "Zouerate", region: "Tiris Zemmour" },
  { name: "Akjoujt", region: "Inchiri" },
];

export function normalizeCityNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ORDER_INDEX = new Map(
  MAJOR_OPERATING_CITIES.map((row, index) => [normalizeCityNameKey(row.name), index])
);

/** DB / API spellings that should map to a major city. */
const MAJOR_ALIASES = new Map([
  ["kaedi", "kaedi"],
  ["aioun el atrouss", "aioun"],
  ["aioun", "aioun"],
  ["selibaby", "selibaby"],
  ["zouerat", "zouerate"],
  ["zouerate", "zouerate"],
  ["nema", "nema"],
  ["nouakchott nord", "nouakchott"],
  ["nouakchott ouest", "nouakchott"],
  ["nouakchott sud", "nouakchott"],
]);

function majorKeyForName(name) {
  const key = normalizeCityNameKey(name);
  if (MAJOR_ALIASES.has(key)) return MAJOR_ALIASES.get(key);
  if (key.startsWith("aioun")) return "aioun";
  if (key.startsWith("nouakchott")) return "nouakchott";
  if (ORDER_INDEX.has(key)) return key;
  return null;
}

/** True when this city name is one of the 13 primary operating metros. */
export function isMajorOperatingCityName(name) {
  return majorKeyForName(name) != null;
}

/** Sort helper: user's table order (Nouakchott first, etc.). */
export function compareMajorCityNames(a, b) {
  const ka = majorKeyForName(a);
  const kb = majorKeyForName(b);
  const ia = ka != null ? ORDER_INDEX.get(ka) ?? 999 : 999;
  const ib = kb != null ? ORDER_INDEX.get(kb) ?? 999 : 999;
  if (ia !== ib) return ia - ib;
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

/**
 * Filter location rows ({ id, name, region? }) to major cities only.
 * Nouakchott borough rows collapse to a single "Nouakchott" entry (lowest id kept).
 */
export function filterMajorOperatingLocationCities(cities) {
  const list = Array.isArray(cities) ? cities.filter((c) => c?.is_active !== false) : [];
  const majors = list.filter((c) => isMajorOperatingCityName(c?.name));
  const nouakchottRows = majors.filter((c) => majorKeyForName(c.name) === "nouakchott");
  const rest = majors.filter((c) => majorKeyForName(c.name) !== "nouakchott");
  let merged = rest;
  if (nouakchottRows.length) {
    nouakchottRows.sort((a, b) => Number(a.id) - Number(b.id));
    const pick = nouakchottRows[0];
    merged = [...rest, { ...pick, name: "Nouakchott" }];
  }
  merged.sort((a, b) => compareMajorCityNames(a.name, b.name));
  return merged;
}
