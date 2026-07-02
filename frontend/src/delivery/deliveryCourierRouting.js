/** Package size → eligible courier types (matches backend courier_routing.py). */

import { DELIVERY_VEHICLE_TYPES } from "./deliveryVehicleTypes";

export const PACKAGE_COURIER_OPTIONS = {
  document: ["bicycle", "motorcycle"],
  small: ["bicycle", "motorcycle"],
  medium: ["motorcycle"],
  large: ["car"],
  extra_large: ["car"],
};

const PRICE_MULTIPLIER = {
  bicycle: 1.0,
  motorcycle: 1.2,
  car: 1.5,
};

const ETA_ADJUSTMENT = {
  bicycle: 8,
  motorcycle: 0,
  car: 5,
};

export function getEligibleCourierTypes(packageType = "small") {
  const key = String(packageType || "small").toLowerCase();
  return PACKAGE_COURIER_OPTIONS[key] || ["motorcycle"];
}

export function getDefaultCourierType(packageType = "small") {
  const options = getEligibleCourierTypes(packageType);
  return options[0] || "motorcycle";
}

export function getCourierTypeOptions(packageType = "small") {
  const eligible = new Set(getEligibleCourierTypes(packageType));
  return DELIVERY_VEHICLE_TYPES.filter((item) => eligible.has(item.key)).map((item) => ({
    ...item,
    key: item.key,
    label: item.label,
    priceMultiplier: PRICE_MULTIPLIER[item.key] || 1,
    etaAdjustment: ETA_ADJUSTMENT[item.key] || 0,
  }));
}
