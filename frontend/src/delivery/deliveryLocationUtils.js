import { MARKET, getLocationByLabel } from "../marketConfig";
import { getDeliveryCityCenter } from "./deliveryCities";

const AREA_ALIASES = {
  Riyad: "Riyadh",
  Socogim: "Socogim Plage",
  Plage: "Plage des Pecheurs",
  "TVZ Centre": "Tevragh Zeina",
  "Cinquième": "Cinquieme",
  "Sixième": "Sixieme",
  "Ancien Aéroport": "Ancien Aeroport",
  "Nouakchott Airport": "Airport Oumtounsy",
  "Marché Capitale": "Marche Capitale",
  "Ten Sweilim": "Tenweich",
  PK12: "PK10",
};

function normalizeArea(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function resolveDeliveryAreaCoordinates(areaLabel, serviceCity = "Nouakchott") {
  if (!String(areaLabel || "").trim()) return null;

  const city = serviceCity || "Nouakchott";
  const alias = AREA_ALIASES[areaLabel] || areaLabel;

  let loc = getLocationByLabel(alias, city);
  if (!loc) {
    loc = getLocationByLabel(alias);
  }

  if (!loc) {
    const normalized = normalizeArea(alias);
    loc = MARKET.locations.find(
      (entry) =>
        (entry.city === city || city === "Nouakchott") &&
        (normalizeArea(entry.label) === normalized ||
          normalizeArea(entry.label).includes(normalized) ||
          normalized.includes(normalizeArea(entry.label)))
    );
  }

  if (loc?.position) {
    return { lat: loc.position[0], lng: loc.position[1] };
  }

  const center = getDeliveryCityCenter(city);
  return { lat: center[0], lng: center[1] };
}

export function applyDeliveryAreaToForm(form, field, areaLabel) {
  const coords = resolveDeliveryAreaCoordinates(areaLabel, form.service_city);
  if (!coords) {
    return { ...form, [field]: areaLabel };
  }

  if (field === "pickup") {
    return {
      ...form,
      pickup: areaLabel,
      pickup_lat: coords.lat,
      pickup_lng: coords.lng,
    };
  }

  return {
    ...form,
    destination: areaLabel,
    destination_lat: coords.lat,
    destination_lng: coords.lng,
  };
}
