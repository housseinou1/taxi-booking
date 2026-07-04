/** Client-side fare estimates — mirrors backend deliveries/services/pricing.py */

import { getCourierTypeOptions } from "./deliveryCourierRouting";

export const CATEGORY_BASE = {
  food: 40,
  pharmacy: 50,
  grocery: 60,
  package: 70,
  documents: 35,
  shopping: 65,
  restaurant: 40,
  market: 60,
  household: 60,
  business: 70,
  courier: 70,
};

export const PACKAGE_SIZE_FEES = {
  document: 0,
  small: 0,
  medium: 20,
  large: 40,
  extra_large: 80,
};

export const COURIER_MULTIPLIERS = {
  bicycle: 1.0,
  motorcycle: 1.2,
  car: 1.5,
};

const URGENT_SURCHARGE = 30;
const FRAGILE_SURCHARGE = 20;
const HEAVY_SURCHARGE = 25;
const NIGHT_SURGE_RATE = 0.15;
const HEAVY_WEIGHT_KG = 15;
const BASE_ETA = 30;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateTieredDistanceFee(distanceKm) {
  const distance = Math.max(Number(distanceKm) || 0, 0);
  if (distance <= 3) return 0;

  let fee = 0;
  if (distance > 3) fee += (Math.min(distance, 10) - 3) * 8;
  if (distance > 10) fee += (Math.min(distance, 25) - 10) * 12;
  if (distance > 25) fee += (distance - 25) * 18;
  return Math.round(fee);
}

function isNightDelivery(date = new Date()) {
  const hour = date.getHours();
  return hour >= 22 || hour < 6;
}

function isHeavyPackage(packageType, weightKg) {
  if (weightKg != null && Number(weightKg) >= HEAVY_WEIGHT_KG) return true;
  return ["large", "extra_large"].includes(String(packageType || "").toLowerCase());
}

function normalizeCourierType(courierType) {
  const value = String(courierType || "motorcycle").toLowerCase();
  if (value === "vehicle" || value === "van") return "car";
  return COURIER_MULTIPLIERS[value] ? value : "motorcycle";
}

export function estimateFare({
  serviceCategory = "package",
  packageType = "small",
  distanceKm = 5,
  fragile = false,
  urgent = false,
  weightKg = null,
  courierType = "motorcycle",
  weatherSurgePercent = 0,
  demandSurgePercent = 0,
  discountAmount = 0,
  atNight = isNightDelivery(),
}) {
  const category = serviceCategory;
  const baseFee = CATEGORY_BASE[category] ?? CATEGORY_BASE.package;
  const distanceFee = calculateTieredDistanceFee(distanceKm);
  const packageSizeFee = PACKAGE_SIZE_FEES[packageType] ?? 0;
  const urgentFee = urgent ? URGENT_SURCHARGE : 0;
  const fragileFee = fragile ? FRAGILE_SURCHARGE : 0;
  const heavyFee = isHeavyPackage(packageType, weightKg) ? HEAVY_SURCHARGE : 0;

  const core = baseFee + distanceFee + packageSizeFee + urgentFee + fragileFee + heavyFee;
  const nightFee = atNight ? Math.round(core * NIGHT_SURGE_RATE) : 0;
  const weatherSurge = Math.round(core * (Math.min(Math.max(weatherSurgePercent, 0), 25) / 100));
  const demandSurge = Math.round(core * (Math.min(Math.max(demandSurgePercent, 0), 50) / 100));

  const subtotalBeforeMultiplier = core + nightFee + weatherSurge + demandSurge;
  const multiplier = COURIER_MULTIPLIERS[normalizeCourierType(courierType)] || 1.2;
  const subtotalAfterMultiplier = Math.round(subtotalBeforeMultiplier * multiplier);
  const discount = Math.max(Number(discountAmount) || 0, 0);
  const total = Math.max(subtotalAfterMultiplier - discount, 0);
  const platformCommission = Math.round(total * 0.2);
  const driverEarning = Math.round(total * 0.8);

  const option = getCourierTypeOptions(packageType).find((item) => item.key === normalizeCourierType(courierType));
  const etaMinutes = BASE_ETA + (option?.etaAdjustment || 0);

  return {
    baseFee,
    distanceFee,
    packageSizeFee,
    urgentFee,
    fragileFee,
    heavyFee,
    nightFee,
    weatherSurge,
    demandSurge,
    surgeFee: weatherSurge + demandSurge,
    extraChargesTotal: packageSizeFee + urgentFee + fragileFee + heavyFee,
    courierMultiplier: multiplier,
    subtotalBeforeMultiplier,
    subtotalAfterMultiplier,
    discountAmount: discount,
    platformCommission,
    appFee: platformCommission,
    driverEarning,
    courierEarning: driverEarning,
    total,
    distanceKm: Number(Math.max(distanceKm, 0).toFixed(1)),
    etaMinutes,
    courierType: normalizeCourierType(courierType),
  };
}

export function estimateCourierTypeFares({
  serviceCategory,
  packageType,
  distanceKm,
  fragile = false,
  urgent = false,
  weightKg = null,
  discountAmount = 0,
}) {
  return getCourierTypeOptions(packageType).map((option) => {
    const fare = estimateFare({
      serviceCategory,
      packageType,
      distanceKm,
      fragile,
      urgent,
      weightKg,
      courierType: option.key,
      discountAmount,
    });
    return {
      key: option.key,
      label: option.label,
      icon: option.icon,
      description: option.description,
      ...fare,
    };
  });
}

export async function fetchServerCourierFares({
  serviceCategory,
  packageType,
  distanceKm,
  fragile = false,
  urgent = false,
  weightKg = null,
  promoCode = "",
}) {
  const localOptions = estimateCourierTypeFares({
    serviceCategory,
    packageType,
    distanceKm,
    fragile,
    urgent,
    weightKg,
  });

  if (!localStorage.getItem("access")) {
    return localOptions;
  }

  try {
    const { API_URL } = await import("../apiConfig");
    const { apiRequest } = await import("./DeliveryShared");
    const merged = await Promise.all(
      localOptions.map(async (option) => {
        try {
          const data = await apiRequest(`${API_URL}/deliveries/estimate/`, {
            method: "POST",
            body: JSON.stringify({
              service_category: serviceCategory,
              package_type: packageType,
              distance_km: distanceKm,
              courier_type: option.key,
              is_fragile: fragile,
              is_urgent: urgent,
              weight_kg: weightKg || null,
              promo_code: promoCode || "",
            }),
          });
          return {
            ...option,
            total: Math.round(Number(data.total_fare || option.total)),
            serverEstimate: true,
          };
        } catch {
          return option;
        }
      })
    );
    return merged;
  } catch {
    return localOptions;
  }
}

export function buildFareBreakdownLines(fare) {
  const lines = [
    { key: "base", label: "Base fare", amount: fare.baseFee, show: fare.baseFee > 0 },
    { key: "distance", label: "Distance fee", amount: fare.distanceFee, show: fare.distanceFee > 0 },
    { key: "package", label: "Package size", amount: fare.packageSizeFee, show: fare.packageSizeFee > 0 },
    { key: "urgent", label: "Urgent delivery", amount: fare.urgentFee, show: fare.urgentFee > 0 },
    { key: "fragile", label: "Fragile handling", amount: fare.fragileFee, show: fare.fragileFee > 0 },
    { key: "heavy", label: "Heavy package", amount: fare.heavyFee, show: fare.heavyFee > 0 },
    { key: "night", label: "Night delivery", amount: fare.nightFee, show: fare.nightFee > 0 },
    { key: "surge", label: "Surge", amount: fare.surgeFee, show: fare.surgeFee > 0 },
    {
      key: "multiplier",
      label: `Courier multiplier (×${fare.courierMultiplier})`,
      amount: fare.subtotalAfterMultiplier - fare.subtotalBeforeMultiplier,
      show: fare.courierMultiplier !== 1,
    },
    { key: "discount", label: "Promo discount", amount: -fare.discountAmount, show: fare.discountAmount > 0 },
    { key: "yala", label: "Yala fee (20%)", amount: fare.platformCommission, show: fare.total > 0, muted: true },
  ];
  return lines.filter((line) => line.show);
}
