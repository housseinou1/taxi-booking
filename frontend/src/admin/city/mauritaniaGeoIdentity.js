/**
 * YALA — Mauritania geographical identification.
 *
 * One canonical, permanent identification scheme for the country's wilayas (regions),
 * their capitals, the national capital Nouakchott with its three boroughs, and every
 * other town registered under a wilaya.
 *
 * Format:  MR-REG-CITY      e.g. MR-GOR-KAE  (Kaédi, Gorgol)
 * Capital: MR-NKC           e.g. MR-NKC-N    (Nouakchott Nord borough)
 *
 * IMPORTANT — what this module does and does not claim
 * ----------------------------------------------------
 * The region codes and the capital-city codes below are the ones supplied by YALA and are
 * treated as authoritative. `CityProfile.code` on the server is the permanent record; where
 * the server already holds a code (ATR, KAE, SEL, ZOU today) this module agrees with it.
 *
 * For the towns that have no assigned code yet, this module exposes a *proposal* in
 * `PROPOSED_CITY_CODES` and marks it `assigned: false`. The UI renders proposals in a
 * visibly different style and never presents one as an official code. Nothing here writes
 * to the database, and no code is invented for a city that already has one.
 */

/** Towns the legacy schema filed under a region named after the town itself. */
export const LEGACY_CITY_REGIONS = {
  atar: "Adrar",
  kaedi: "Gorgol",
  nouadhibou: "Dakhlet Nouadhibou",
  rosso: "Trarza",
};

export const CLASSIFICATIONS = {
  capital: "National capital",
  borough: "Capital borough",
  regionalCapital: "Regional capital (wilaya seat)",
  town: "Town / commune",
};

/**
 * The twelve wilayas of Mauritania, with their permanent YALA codes and seats.
 * Order follows the administrative convention (roughly north to south).
 */
export const WILAYAS = [
  { name: "Adrar", nameFr: "Adrar", nameAr: "أدرار", regionCode: "ADR", capital: "Atar", capitalCode: "ATR" },
  { name: "Assaba", nameFr: "Assaba", nameAr: "العصابة", regionCode: "ASB", capital: "Kiffa", capitalCode: "KIF" },
  { name: "Brakna", nameFr: "Brakna", nameAr: "البراكنة", regionCode: "BRK", capital: "Aleg", capitalCode: "ALG" },
  { name: "Dakhlet Nouadhibou", nameFr: "Dakhlet Nouadhibou", nameAr: "داخلت نواذيبو", regionCode: "DNB", capital: "Nouadhibou", capitalCode: "NDB" },
  { name: "Gorgol", nameFr: "Gorgol", nameAr: "لكوركل", regionCode: "GOR", capital: "Kaédi", capitalCode: "KAE" },
  { name: "Guidimakha", nameFr: "Guidimakha", nameAr: "كيدي ماغا", regionCode: "GDM", capital: "Sélibaby", capitalCode: "SEL" },
  { name: "Hodh Ech Chargui", nameFr: "Hodh Ech Chargui", nameAr: "الحوض الشرقي", regionCode: "HEC", capital: "Néma", capitalCode: "NEM" },
  { name: "Hodh El Gharbi", nameFr: "Hodh El Gharbi", nameAr: "الحوض الغربي", regionCode: "HEG", capital: "Aïoun el-Atrouss", capitalCode: "AYN" },
  { name: "Inchiri", nameFr: "Inchiri", nameAr: "إنشيري", regionCode: "INC", capital: "Akjoujt", capitalCode: "AKJ" },
  { name: "Tagant", nameFr: "Tagant", nameAr: "تكانت", regionCode: "TAG", capital: "Tidjikja", capitalCode: "TDJ" },
  { name: "Tiris Zemmour", nameFr: "Tiris Zemmour", nameAr: "تيرس زمور", regionCode: "TZM", capital: "Zouérat", capitalCode: "ZOU" },
  { name: "Trarza", nameFr: "Trarza", nameAr: "الترارزة", regionCode: "TRZ", capital: "Rosso", capitalCode: "ROS" },
];

/**
 * Nouakchott is the national capital and is deliberately modelled as ONE city with three
 * boroughs, not as three independent cities. The boroughs are reported under the capital
 * entry; each keeps its official wilaya classification in the underlying records.
 */
export const NOUAKCHOTT = {
  name: "Nouakchott",
  nameAr: "نواكشوط",
  regionCode: "NKC",
  capitalCode: "MR-NKC",
  // Nouakchott is its own wilaya (district) as well as the national capital.
  wilaya: "Nouakchott",
  boroughs: [
    { name: "Nouakchott Nord", nameFr: "Nouakchott Nord", code: "MR-NKC-N", borough: "Nord" },
    { name: "Nouakchott Ouest", nameFr: "Nouakchott Ouest", code: "MR-NKC-W", borough: "Ouest" },
    { name: "Nouakchott Sud", nameFr: "Nouakchott Sud", code: "MR-NKC-S", borough: "Sud" },
  ],
};


/**
 * Proposed three-letter codes for the towns that have no assigned code yet.
 *
 * These are YALA proposals, not server values. They exist so the identification scheme is
 * complete and reviewable; `assigned` stays false and the UI labels them as proposals.
 * Adopting them is a one-line change per city once Kiro writes them to CityProfile.code.
 */
export const PROPOSED_CITY_CODES = {
  adrar: { Aoujeft: "AUJ", Chinguetti: "CHG", Ouadane: "OUA" },
  assaba: { Barkeol: "BKL", Boumdeid: "BMD", Guerou: "GUR", Kankossa: "KAN" },
  brakna: { Bababe: "BAB", Boghe: "BOG", "M'Bagne": "MBG", "Magta Lahjar": "MTL", Male: "MAL" },
  "dakhlet nouadhibou": { Chami: "CHM" },
  gorgol: { "M'Bout": "MBT", Maghama: "MGH", Monguel: "MGL", Toulel: "TLL" },
  guidimakha: { Ghabou: "GHB", "Ould Yenge": "OLY", Wompou: "WMP" },
  "hodh ech chargui": { "Adel Bagrou": "ADB", Amourj: "AMR", Bassiknou: "BSK", Djiguenni: "DJG", Oualata: "OLT", Timbedra: "TMD" },
  "hodh el gharbi": { Kobeni: "KBN", Tamchekett: "TMC", Tintane: "TNT", Touil: "TOL" },
  inchiri: { Benichab: "BNC", Mhaijratt: "MHJ" },
  tagant: { Moudjeria: "MDJ", Tichit: "TCT" },
  "tiris zemmour": { "Bir Moghrein": "BMG", "F'Derik": "FDR" },
  trarza: { Boutilimit: "BTL", "Keur Macene": "KRM", Mederdra: "MDR", "R'Kiz": "RKZ", Tekane: "TKN", Tiguent: "TGT", "Wad Naga": "WDN" },
};

/** Lowercase, strip accents and punctuation so "Kaédi" and "Kaedi" resolve alike. */
export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019`]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Accent- and punctuation-insensitive key for matching ("M'Bout" -> "mbout"). */
function matchKey(value) {
  return normalizeName(value).replace(/[^a-z0-9]/g, "");
}

const WILAYA_BY_KEY = WILAYAS.reduce((map, wilaya) => {
  map[matchKey(wilaya.name)] = wilaya;
  map[matchKey(wilaya.nameFr)] = wilaya;
  return map;
}, {});

/**
 * Resolve a region name as stored in the database to its canonical wilaya.
 *
 * The legacy registry contains five "regions" that are really city names (Atar, Kaedi,
 * Nouadhibou, Rosso, Nouakchott). Those rows are mapped back to their true wilaya so the
 * identification code is correct even before the backend is consolidated. `isLegacy`
 * flags that a row was filed under one of them, which is what makes a duplicate visible.
 */
export function resolveRegion(regionName) {
  const raw = String(regionName || "").trim();
  if (!raw) return { wilaya: null, regionCode: null, isLegacy: false, raw };

  if (matchKey(raw) === matchKey(NOUAKCHOTT.name)) {
    return {
      wilaya: NOUAKCHOTT.wilaya,
      regionCode: NOUAKCHOTT.regionCode,
      isLegacy: false,
      isCapital: true,
      raw,
    };
  }

  const legacyTarget = LEGACY_CITY_REGIONS[normalizeName(raw)];
  if (legacyTarget) {
    const wilaya = WILAYA_BY_KEY[matchKey(legacyTarget)];
    return {
      wilaya: wilaya?.name || legacyTarget,
      regionCode: wilaya?.regionCode || null,
      isLegacy: true,
      raw,
    };
  }

  const wilaya = WILAYA_BY_KEY[matchKey(raw)];
  if (wilaya) {
    return { wilaya: wilaya.name, regionCode: wilaya.regionCode, isLegacy: false, raw };
  }
  return { wilaya: raw, regionCode: null, isLegacy: false, raw };
}



/**
 * Full YALA identification for a city row.
 *
 * `assigned` is false when the city code is a frontend proposal rather than a value held in
 * CityProfile.code. The UI must render the two differently — a proposal is never presented
 * as an official code.
 */
export function resolveCityIdentity({ cityName, regionName, serverCode, isoCountryCode } = {}) {
  const region = resolveRegion(regionName);
  const cityKey = matchKey(cityName);
  const iso = (isoCountryCode || "MR").toUpperCase();

  if (region.isCapital || cityKey === matchKey(NOUAKCHOTT.name)) {
    return {
      regionName: region.wilaya || NOUAKCHOTT.wilaya,
      regionCode: NOUAKCHOTT.regionCode,
      cityName,
      cityCode: "NKC",
      yalaId: NOUAKCHOTT.capitalCode,
      classification: CLASSIFICATIONS.capital,
      borough: null,
      assigned: true,
      isLegacyRegion: region.isLegacy,
      iso,
    };
  }

  const wilaya = WILAYAS.find((w) => matchKey(w.name) === matchKey(region.wilaya));
  const isRegionalCapital = wilaya ? matchKey(wilaya.capital) === cityKey : false;

  let cityCode = null;
  let assigned = false;

  if (isRegionalCapital && wilaya) {
    cityCode = wilaya.capitalCode;
    assigned = true;
  } else if (serverCode) {
    // The server is authoritative whenever it holds a code.
    cityCode = String(serverCode).toUpperCase();
    assigned = true;
  } else {
    const proposals = PROPOSED_CITY_CODES[normalizeName(region.wilaya)] || {};
    const match = Object.entries(proposals).find(([name]) => matchKey(name) === cityKey);
    if (match) cityCode = match[1];
  }

  return {
    regionName: region.wilaya || regionName,
    regionCode: region.regionCode,
    cityName,
    cityCode,
    yalaId: region.regionCode && cityCode ? `${iso}-${region.regionCode}-${cityCode}` : null,
    classification: isRegionalCapital
      ? CLASSIFICATIONS.regionalCapital
      : CLASSIFICATIONS.town,
    borough: null,
    assigned,
    isLegacyRegion: region.isLegacy,
    iso,
  };
}

/** The three Nouakchott boroughs, for rendering beneath the capital entry. */
export function nouakchottBoroughs() {
  return NOUAKCHOTT.boroughs.map((borough) => ({
    ...borough,
    classification: CLASSIFICATIONS.borough,
    regionCode: NOUAKCHOTT.regionCode,
    assigned: true,
  }));
}

/** Does a city row's name match the national capital? */
export function isNouakchott(cityName) {
  return matchKey(cityName) === matchKey(NOUAKCHOTT.name);
}

