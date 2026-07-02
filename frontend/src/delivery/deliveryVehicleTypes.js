export const DELIVERY_VEHICLE_TYPES = [
  {
    key: "car",
    label: "Vehicle / Car",
    icon: "🚗",
    description: "Car for large packages and bulky items.",
    maxPackage: "Large packages",
  },
  {
    key: "bicycle",
    label: "Bicycle",
    icon: "🚲",
    description: "Best for small food, pharmacy, and courier items.",
    maxPackage: "Small packages",
  },
  {
    key: "motorcycle",
    label: "Motorcycle",
    icon: "🏍️",
    description: "Fast city deliveries up to medium packages.",
    maxPackage: "Medium packages",
  },
];

const VEHICLE_LOOKUP = DELIVERY_VEHICLE_TYPES.reduce((map, item) => {
  map[item.key] = item;
  return map;
}, {});

export function getDeliveryVehicleLabel(key = "motorcycle") {
  return VEHICLE_LOOKUP[key]?.label || "Motorcycle";
}

export function getDeliveryVehicleIcon(key = "motorcycle") {
  return VEHICLE_LOOKUP[key]?.icon || "🏍️";
}
