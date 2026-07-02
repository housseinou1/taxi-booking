/** Customer-facing delivery categories (Uber Eats style). */

export const ALL_DELIVERY_CATEGORIES = [
  {
    key: "food",
    label: "Food",
    icon: "🍔",
    description: "Restaurant meals and hot food",
    defaultPackageType: "small",
  },
  {
    key: "pharmacy",
    label: "Pharmacy / Medicine",
    icon: "💊",
    description: "Medicines and prescriptions",
    defaultPackageType: "small",
  },
  {
    key: "grocery",
    label: "Grocery",
    icon: "🛒",
    description: "Groceries and supermarket items",
    defaultPackageType: "medium",
  },
  {
    key: "package",
    label: "Parcel",
    icon: "📦",
    description: "Boxes, parcels, and packages",
    defaultPackageType: "small",
  },
  {
    key: "documents",
    label: "Documents",
    icon: "📄",
    description: "Envelopes and important papers",
    defaultPackageType: "document",
  },
  {
    key: "shopping",
    label: "Shopping",
    icon: "🛍️",
    description: "Retail shopping pickups",
    defaultPackageType: "small",
  },
  {
    key: "restaurant",
    label: "Restaurant Orders",
    icon: "🍽️",
    description: "Pre-placed restaurant orders",
    defaultPackageType: "small",
  },
  {
    key: "market",
    label: "Market",
    icon: "🏪",
    description: "Fresh market and local shops",
    defaultPackageType: "medium",
  },
  {
    key: "household",
    label: "Water / Household",
    icon: "💧",
    description: "Water and household essentials",
    defaultPackageType: "medium",
  },
  {
    key: "business",
    label: "Business",
    icon: "🏢",
    description: "Office and business deliveries",
    defaultPackageType: "small",
  },
];

export const HOME_DELIVERY_CATEGORIES = ALL_DELIVERY_CATEGORIES.filter((item) =>
  ["food", "pharmacy", "grocery", "package", "documents", "shopping"].includes(item.key)
);

export const MORE_DELIVERY_CATEGORIES = ALL_DELIVERY_CATEGORIES.filter((item) =>
  ["restaurant", "market", "household", "business"].includes(item.key)
);

const CATEGORY_LOOKUP = ALL_DELIVERY_CATEGORIES.reduce((map, item) => {
  map[item.key] = item;
  return map;
}, {});

export function getCustomerCategory(key) {
  return CATEGORY_LOOKUP[key] || CATEGORY_LOOKUP.package;
}

export function mapCategoryToApi(categoryKey) {
  return categoryKey || "package";
}

export function getCategoryFormDefaults(categoryKey) {
  const meta = getCustomerCategory(categoryKey);
  const defaults = {
    package_type: meta.defaultPackageType,
    restaurant_name: "",
    food_items: "",
    preparation_time_minutes: "",
    pharmacy_name: "",
    shopping_list: "",
    prescription_reference: "",
    prescription_photo: null,
    is_urgent: false,
    is_temperature_sensitive: false,
    store_name: "",
    item_quantity: "",
    substitution_notes: "",
    package_description: "",
    is_secure_delivery: false,
    is_fragile: false,
    weight_kg: "",
    customer_notes: "",
  };

  if (categoryKey === "documents") {
    defaults.is_fragile = false;
  }
  if (categoryKey === "package") {
    defaults.is_fragile = false;
  }

  return defaults;
}
