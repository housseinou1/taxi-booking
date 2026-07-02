/** Category-specific form field definitions for the customer request flow. */

import { emptyInstructions } from "./deliveryInstructionUtils";

const PACKAGE_SIZES = [
  { key: "document", label: "Document" },
  { key: "small", label: "Small" },
  { key: "medium", label: "Medium" },
  { key: "large", label: "Large" },
  { key: "extra_large", label: "Extra Large" },
];

export const CATEGORY_FORM_FIELDS = {
  food: [
    { key: "restaurant_name", type: "text", label: "Restaurant name", required: true, placeholder: "Restaurant or café" },
    { key: "food_items", type: "textarea", label: "Food items", required: true, placeholder: "List meals and quantities", rows: 3 },
    { key: "preparation_time_minutes", type: "number", label: "Pickup time (minutes)", placeholder: "e.g. 25", min: 5 },
    { key: "is_temperature_sensitive", type: "toggle", label: "Temperature-sensitive (keep hot/cold)" },
  ],
  restaurant: [
    { key: "restaurant_name", type: "text", label: "Restaurant name", required: true, placeholder: "Restaurant name" },
    { key: "food_items", type: "textarea", label: "Order details", required: true, placeholder: "Your order number and items", rows: 3 },
    { key: "preparation_time_minutes", type: "number", label: "Ready in (minutes)", placeholder: "e.g. 20", min: 5 },
    { key: "is_temperature_sensitive", type: "toggle", label: "Temperature-sensitive" },
  ],
  pharmacy: [
    { key: "pharmacy_name", type: "text", label: "Pharmacy name", required: true, placeholder: "Pharmacy or clinic" },
    { key: "shopping_list", type: "textarea", label: "Medicine list", required: true, placeholder: "Medicines to collect", rows: 3 },
    { key: "prescription_photo", type: "file", label: "Prescription upload", accept: "image/*,.pdf" },
    { key: "is_urgent", type: "toggle", label: "Urgent delivery" },
  ],
  grocery: [
    { key: "store_name", type: "text", label: "Store / market name", required: true, placeholder: "Supermarket or shop" },
    { key: "shopping_list", type: "textarea", label: "Item list", required: true, placeholder: "List groceries to buy", rows: 3 },
    { key: "item_quantity", type: "text", label: "Quantity", placeholder: "e.g. 2 kg rice, 3 bottles" },
    { key: "substitution_notes", type: "textarea", label: "Substitution notes", placeholder: "If an item is unavailable...", rows: 2 },
  ],
  market: [
    { key: "store_name", type: "text", label: "Market name", required: true, placeholder: "Local market or shop" },
    { key: "shopping_list", type: "textarea", label: "Item list", required: true, placeholder: "Fresh items to collect", rows: 3 },
    { key: "item_quantity", type: "text", label: "Quantity", placeholder: "Amounts per item" },
    { key: "substitution_notes", type: "textarea", label: "Substitution notes", rows: 2 },
  ],
  shopping: [
    { key: "store_name", type: "text", label: "Shop name", placeholder: "Mall or retail store" },
    { key: "shopping_list", type: "textarea", label: "Shopping list", required: true, placeholder: "Items to buy", rows: 3 },
    { key: "item_quantity", type: "text", label: "Quantity", placeholder: "Sizes, colors, quantities" },
  ],
  package: [
    { key: "package_type", type: "select", label: "Package size", options: PACKAGE_SIZES },
    { key: "weight_kg", type: "number", label: "Package weight (kg)", placeholder: "e.g. 2.5", min: 0, step: 0.1 },
    { key: "is_fragile", type: "toggle", label: "Fragile item" },
    { key: "package_description", type: "textarea", label: "Package contents", placeholder: "Brief description", rows: 2 },
  ],
  documents: [
    { key: "package_description", type: "textarea", label: "Envelope / papers", required: true, placeholder: "Describe documents to deliver", rows: 3 },
    { key: "is_secure_delivery", type: "toggle", label: "Secure delivery (ID check)" },
  ],
  household: [
    { key: "shopping_list", type: "textarea", label: "Household items", required: true, placeholder: "Water bottles, gas, supplies...", rows: 3 },
    { key: "store_name", type: "text", label: "Store (optional)", placeholder: "Preferred shop" },
    { key: "item_quantity", type: "text", label: "Quantity", placeholder: "e.g. 4 x 5L water" },
  ],
  business: [
    { key: "package_description", type: "textarea", label: "Delivery details", required: true, placeholder: "Office supplies, documents, parcels...", rows: 3 },
    { key: "package_type", type: "select", label: "Package size", options: PACKAGE_SIZES },
    { key: "is_fragile", type: "toggle", label: "Fragile item" },
  ],
};

export function getCategoryFormFields(categoryKey) {
  return CATEGORY_FORM_FIELDS[categoryKey] || CATEGORY_FORM_FIELDS.package;
}

export function validateCategoryForm(categoryKey, form) {
  const fields = getCategoryFormFields(categoryKey);

  for (const field of fields) {
    if (!field.required) continue;
    const value = form[field.key];
    if (field.type === "file") continue;
    if (field.type === "toggle") continue;
    if (!String(value ?? "").trim()) {
      return `${field.label} is required.`;
    }
  }

  if (!form.pickup?.trim()) return "Pickup location is required.";
  if (!form.destination?.trim()) return "Drop-off location is required.";
  if (!form.recipient_name?.trim()) return "Recipient name is required.";
  if (!form.recipient_phone?.trim()) return "Recipient phone is required.";

  return "";
}

export function buildDeliveryPayload(form, category, distanceKm, selectedOption) {
  const payload = {
    service_city: form.service_city,
    pickup: form.pickup,
    destination: form.destination,
    recipient_name: form.recipient_name,
    recipient_phone: form.recipient_phone,
    service_category: category,
    courier_type_required: selectedOption,
    package_type: form.package_type,
    pickup_lat: form.pickup_lat,
    pickup_lng: form.pickup_lng,
    destination_lat: form.destination_lat,
    destination_lng: form.destination_lng,
    distance_km: distanceKm,
    is_fragile: Boolean(form.is_fragile),
    customer_notes: form.customer_notes || "",
    pickup_instructions: form.pickup_instructions || emptyInstructions(),
    dropoff_instructions: form.dropoff_instructions || emptyInstructions(),
    recipient_alt_phone: form.recipient_alt_phone || "",
    save_address: Boolean(form.save_address),
    save_instructions: Boolean(form.save_instructions),
    address_label: form.address_label || "Home",
    restaurant_name: form.restaurant_name || "",
    food_items: form.food_items || "",
    pharmacy_name: form.pharmacy_name || "",
    shopping_list: form.shopping_list || "",
    store_name: form.store_name || "",
    item_quantity: form.item_quantity || "",
    substitution_notes: form.substitution_notes || "",
    package_description: form.package_description || "",
    prescription_reference: form.prescription_reference || "",
    is_urgent: Boolean(form.is_urgent),
    is_temperature_sensitive: Boolean(form.is_temperature_sensitive),
    is_secure_delivery: Boolean(form.is_secure_delivery),
    promo_code: form.promo_code || "",
  };

  if (form.preparation_time_minutes) {
    payload.preparation_time_minutes = Number(form.preparation_time_minutes);
  }
  if (form.weight_kg) {
    payload.weight_kg = Number(form.weight_kg);
  }
  if (form.max_budget_mru) {
    payload.max_budget_mru = Number(form.max_budget_mru);
  }

  return payload;
}

export function buildDeliveryFormData(form, category, distanceKm, selectedOption) {
  const payload = buildDeliveryPayload(form, category, distanceKm, selectedOption);
  const body = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === "boolean") {
      body.append(key, value ? "true" : "false");
      return;
    }
    if (typeof value === "object") {
      body.append(key, JSON.stringify(value));
      return;
    }
    if (value === "") return;
    body.append(key, String(value));
  });

  if (form.prescription_photo instanceof File) {
    body.append("prescription_photo", form.prescription_photo, form.prescription_photo.name);
  }

  return body;
}
