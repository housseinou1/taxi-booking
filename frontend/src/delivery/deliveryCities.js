import { MARKET } from "../marketConfig";
import {
  MAURITANIA_WILAYAS,
  WILAYA_CAPITAL_CITIES,
  getWilayaCityCenter,
  resolveCityLabel,
} from "../data/mauritaniaWilayaCities";

export const DEFAULT_DELIVERY_CITY = MARKET.defaultCity;

/** Wilaya capital cities — shown first in pickers and on the home screen. */
export const PRIMARY_DELIVERY_CITIES = WILAYA_CAPITAL_CITIES;

const ALL_WILAYA_CITY_LABELS = MAURITANIA_WILAYAS.flatMap((entry) =>
  entry.cities.map((city) => city.label)
);

/** All major Mauritania cities grouped by wilaya. Capitals listed first. */
export const MAURITANIA_DELIVERY_CITIES = [
  ...PRIMARY_DELIVERY_CITIES,
  ...ALL_WILAYA_CITY_LABELS.filter((city) => !PRIMARY_DELIVERY_CITIES.includes(city)),
];

export { MAURITANIA_WILAYAS };

export function getDeliveryCityCenter(cityName) {
  const wilayaCenter = getWilayaCityCenter(cityName);
  if (wilayaCenter) return wilayaCenter;

  const label = resolveCityLabel(cityName) || cityName;
  const match = MARKET.cities.find(
    (city) => city.label.toLowerCase() === String(label || "").toLowerCase()
  );
  return match?.center || MARKET.center;
}
