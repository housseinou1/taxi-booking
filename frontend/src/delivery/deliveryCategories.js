export const YALA_DELIVERY_CATEGORIES = [
  { key: "food", label: "Food", icon: "🍔", description: "Restaurant meals and hot food." },
  { key: "pharmacy", label: "Pharmacy / Medicine", icon: "💊", description: "Medicines and prescriptions." },
  { key: "grocery", label: "Grocery", icon: "🛒", description: "Groceries and supermarket items." },
  { key: "package", label: "Parcel", icon: "📦", description: "Parcels and boxed items." },
  { key: "documents", label: "Documents", icon: "📄", description: "Envelopes and important papers." },
  { key: "shopping", label: "Shopping", icon: "🛍️", description: "Retail shopping pickups." },
  { key: "restaurant", label: "Restaurant Orders", icon: "🍽️", description: "Pre-placed restaurant orders." },
  { key: "market", label: "Market Delivery", icon: "🏪", description: "Fresh market items." },
  { key: "household", label: "Water / Household", icon: "💧", description: "Water and household essentials." },
  { key: "business", label: "Business Delivery", icon: "🏢", description: "Office and business deliveries." },
  { key: "courier", label: "Courier", icon: "🚴", description: "Legacy general courier runs." },
];

export const LEGACY_CATEGORY_ALIASES = {
  document: "documents",
  parcel: "package",
};

const CATEGORY_LOOKUP = YALA_DELIVERY_CATEGORIES.reduce((map, item) => {
  map[item.key] = item;
  return map;
}, {});

export function normalizeDeliveryCategory(value = "package") {
  const key = String(value || "package").toLowerCase();
  return LEGACY_CATEGORY_ALIASES[key] || key;
}

export function getDeliveryCategory(key) {
  const normalized = normalizeDeliveryCategory(key);
  return CATEGORY_LOOKUP[normalized] || CATEGORY_LOOKUP.package;
}

export function getDeliveryCategoryLabel(key) {
  return getDeliveryCategory(key).label;
}

export function getDeliveryCategoryIcon(key) {
  return getDeliveryCategory(key).icon;
}
