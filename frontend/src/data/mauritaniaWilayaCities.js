/**
 * Mauritania wilayas (regions) and major service cities with map centers.
 * One capital per wilaya plus other large urban centers.
 */

export const MAURITANIA_WILAYAS = [
  {
    wilaya: "Nouakchott",
    cities: [{ label: "Nouakchott", center: [18.0735, -15.9582], capital: true }],
  },
  {
    wilaya: "Dakhlet Nouadhibou",
    cities: [
      { label: "Nouadhibou", center: [20.94188, -17.03842], capital: true },
      { label: "Chami", center: [21.2833, -16.9667] },
    ],
  },
  {
    wilaya: "Adrar",
    cities: [
      { label: "Atar", center: [20.5169, -13.0489], capital: true },
      { label: "Chinguetti", center: [20.4647, -12.3617] },
      { label: "Ouadane", center: [20.9289, -11.6233] },
      { label: "Aoujeft", center: [19.9683, -13.0433] },
    ],
  },
  {
    wilaya: "Inchiri",
    cities: [
      { label: "Akjoujt", center: [19.7464, -14.3853], capital: true },
      { label: "Benichab", center: [19.0819, -15.2117] },
      { label: "Mhaijratt", center: [18.7206, -16.0578] },
    ],
  },
  {
    wilaya: "Trarza",
    cities: [
      { label: "Rosso", center: [16.51378, -15.80503], capital: true },
      { label: "Boutilimit", center: [17.5467, -14.6944] },
      { label: "Keur Macene", center: [16.5358, -16.2342] },
      { label: "Mederdra", center: [16.9214, -15.6581] },
      { label: "R'Kiz", center: [16.9025, -15.9589] },
      { label: "Wad Naga", center: [17.4581, -15.3336] },
      { label: "Tiguent", center: [17.2358, -16.0269] },
      { label: "Tekane", center: [16.5833, -16.2167] },
    ],
  },
  {
    wilaya: "Brakna",
    cities: [
      { label: "Aleg", center: [17.0528, -13.9089], capital: true },
      { label: "Boghe", center: [16.7, -14.2667] },
      { label: "Bababe", center: [16.5833, -14.85] },
      { label: "Magta Lahjar", center: [17.9667, -13.9167] },
      { label: "Male", center: [15.2333, -14.2833] },
      { label: "M'Bagne", center: [16.0167, -13.9667] },
    ],
  },
  {
    wilaya: "Gorgol",
    cities: [
      { label: "Kaedi", center: [16.1503, -13.5037], capital: true },
      { label: "Maghama", center: [15.5101, -12.851] },
      { label: "Toulel", center: [15.485, -12.82] },
      { label: "M'Bout", center: [16.0167, -12.5833] },
      { label: "Monguel", center: [15.9167, -12.7833] },
    ],
  },
  {
    wilaya: "Guidimakha",
    cities: [
      { label: "Selibaby", center: [15.15846, -12.1843], capital: true },
      { label: "Ould Yenge", center: [15.4167, -12.3833] },
      { label: "Wompou", center: [15.1167, -11.8167] },
      { label: "Ghabou", center: [15.6167, -12.35] },
    ],
  },
  {
    wilaya: "Assaba",
    cities: [
      { label: "Kiffa", center: [16.6166, -11.4042], capital: true },
      { label: "Guerou", center: [16.8131, -12.8022] },
      { label: "Barkeol", center: [16.92, -12.55] },
      { label: "Kankossa", center: [15.8833, -11.85] },
      { label: "Boumdeid", center: [17.0833, -12.4167] },
    ],
  },
  {
    wilaya: "Hodh El Gharbi",
    cities: [
      { label: "Aioun el Atrouss", center: [16.6614, -9.6149], capital: true },
      { label: "Tintane", center: [16.1167, -10.5833] },
      { label: "Kobeni", center: [15.8167, -9.4167] },
      { label: "Tamchekett", center: [17.2167, -10.7333] },
      { label: "Touil", center: [16.8833, -10.2667] },
    ],
  },
  {
    wilaya: "Hodh Ech Chargui",
    cities: [
      { label: "Nema", center: [16.616, -7.2565], capital: true },
      { label: "Bassiknou", center: [15.8667, -5.95] },
      { label: "Djiguenni", center: [16.3167, -6.2333] },
      { label: "Amourj", center: [18.0833, -5.7167] },
      { label: "Adel Bagrou", center: [15.5667, -7.3833] },
      { label: "Timbedra", center: [15.6667, -8.0] },
      { label: "Oualata", center: [17.3, -7.0167] },
    ],
  },
  {
    wilaya: "Tagant",
    cities: [
      { label: "Tidjikja", center: [18.5564, -11.4272], capital: true },
      { label: "Tichit", center: [18.45, -9.5167] },
      { label: "Moudjeria", center: [17.4833, -12.3333] },
    ],
  },
  {
    wilaya: "Tiris Zemmour",
    cities: [
      { label: "Zouerate", center: [22.7354, -12.4783], capital: true },
      { label: "F'Derik", center: [22.6833, -12.7167] },
      { label: "Bir Moghrein", center: [25.2333, -11.5833] },
    ],
  },
];

export const MAURITANIA_WILAYA_CITIES = MAURITANIA_WILAYAS.flatMap((entry) => entry.cities);

export const WILAYA_CAPITAL_CITIES = MAURITANIA_WILAYAS.flatMap((entry) =>
  entry.cities.filter((city) => city.capital).map((city) => city.label)
);

const CITY_LOOKUP = MAURITANIA_WILAYA_CITIES.reduce((map, city) => {
  map[city.label.toLowerCase()] = city;
  return map;
}, {});

/** Alternate spellings used in forms, DB, or legacy data. */
const CITY_ALIASES = {
  kaédi: "Kaedi",
  kaedi: "Kaedi",
  "aioun": "Aioun el Atrouss",
  "aïoun": "Aioun el Atrouss",
  "aioun el atrouss": "Aioun el Atrouss",
  sélibaby: "Selibaby",
  selibaby: "Selibaby",
  zouérat: "Zouerate",
  zouerate: "Zouerate",
  néma: "Nema",
  nema: "Nema",
  "keur macène": "Keur Macene",
  "keur macene": "Keur Macene",
  "ouad naga": "Wad Naga",
  "wad naga": "Wad Naga",
  boghé: "Boghe",
  boghe: "Boghe",
  bababé: "Bababe",
  bababe: "Bababe",
  "barkeol": "Barkeol",
  "barkéol": "Barkeol",
  "ould yengé": "Ould Yenge",
  "ould yenge": "Ould Yenge",
  "f'dérik": "F'Derik",
  "f'derik": "F'Derik",
  "m'bout": "M'Bout",
  "m'bagne": "M'Bagne",
};

export function resolveCityLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return null;
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  return CITY_LOOKUP[key]?.label || null;
}

export function getWilayaCityCenter(cityName) {
  const label = resolveCityLabel(cityName) || cityName;
  const match = CITY_LOOKUP[String(label).toLowerCase()];
  return match?.center || null;
}

export function getWilayaForCity(cityName) {
  const label = resolveCityLabel(cityName) || cityName;
  const entry = MAURITANIA_WILAYAS.find((wilaya) =>
    wilaya.cities.some((city) => city.label.toLowerCase() === String(label).toLowerCase())
  );
  return entry?.wilaya || null;
}
