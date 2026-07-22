import { API_URL } from "../apiConfig";
import { authHeaders } from "../delivery/DeliveryShared";

const BASE = `${API_URL}/merchants`;

async function merchantRequest(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders(options.body instanceof FormData ? false : true),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Object.values(data).flat().join(" ");
    throw new Error(data.error || data.detail || details || "Request failed.");
  }
  return data;
}

export function merchantLogin(email, password) {
  return merchantRequest("/login/", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function merchantRegister(formData) {
  return merchantRequest("/register/", { method: "POST", body: formData });
}

export function fetchMerchantMe() {
  return merchantRequest("/me/");
}

export function updateMerchantMe(formData) {
  return merchantRequest("/me/", { method: "PATCH", body: formData });
}

export function updateMerchantSettings(payload) {
  return merchantRequest("/me/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchMenuCategories() {
  return merchantRequest("/menu/categories/");
}

export function createMenuCategory(payload) {
  return merchantRequest("/menu/categories/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMenuCategory(id, payload) {
  return merchantRequest(`/menu/categories/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteMenuCategory(id) {
  return merchantRequest(`/menu/categories/${id}/`, { method: "DELETE" });
}

export function fetchMerchantSettlements() {
  return merchantRequest("/settlements/");
}

export function fetchStores(params = {}) {
  const query = new URLSearchParams(params).toString();
  return merchantRequest(`/stores/${query ? `?${query}` : ""}`);
}

export function fetchStoreProducts(storeId, category = "") {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  return merchantRequest(`/stores/${storeId}/products/${query}`);
}

export function fetchCart(merchantId, distanceKm = 5) {
  return merchantRequest(`/cart/${merchantId}/?distance_km=${distanceKm}`);
}

export function addCartItem(productId, quantity = 1) {
  return merchantRequest("/cart/items/", {
    method: "POST",
    body: JSON.stringify({ product_id: productId, quantity }),
  });
}

export function updateCartItem(itemId, quantity) {
  return merchantRequest(`/cart/items/${itemId}/`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
}

export function removeCartItem(itemId) {
  return merchantRequest(`/cart/items/${itemId}/`, { method: "DELETE" });
}

export function checkoutCart(payload) {
  return merchantRequest("/cart/checkout/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchMerchantProducts() {
  return merchantRequest("/products/");
}

export function createProduct(formData) {
  return merchantRequest("/products/", { method: "POST", body: formData });
}

export function updateProduct(id, formData) {
  return merchantRequest(`/products/${id}/`, { method: "PATCH", body: formData });
}

export function deleteProduct(id) {
  return merchantRequest(`/products/${id}/`, { method: "DELETE" });
}

export function fetchInventory(stockStatus = "") {
  const query = stockStatus ? `?stock_status=${stockStatus}` : "";
  return merchantRequest(`/inventory/${query}`);
}

export function fetchMerchantOrders(status = "") {
  const query = status ? `?status=${status}` : "";
  return merchantRequest(`/orders/${query}`);
}

export function merchantOrderAction(orderId, action, extra = {}) {
  return merchantRequest(`/orders/${orderId}/action/`, {
    method: "POST",
    body: JSON.stringify({ action, ...extra }),
  });
}

export function fetchMerchantAnalytics() {
  return merchantRequest("/dashboard/analytics/");
}

export function fetchMerchantPayouts() {
  return merchantRequest("/payouts/");
}

export function fetchPromotions() {
  return merchantRequest("/promotions/");
}

export function createPromotion(payload) {
  return merchantRequest("/promotions/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePromotion(id) {
  return merchantRequest(`/promotions/${id}/`, { method: "DELETE" });
}

export const MERCHANT_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "fast_food", label: "Fast Food" },
  { value: "cafe", label: "Cafe" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "grocery", label: "Grocery Store" },
  { value: "supermarket", label: "Supermarket" },
  { value: "water_supplier", label: "Water Supplier" },
  { value: "electronics", label: "Electronics Shop" },
  { value: "clothing", label: "Clothing Store" },
  { value: "market", label: "Local Market" },
  { value: "business_supplier", label: "Business Supplier" },
];

export const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "grocery", label: "Grocery" },
  { value: "supermarket", label: "Supermarket" },
  { value: "shop", label: "Shop" },
  { value: "other", label: "Other" },
];

export const PRODUCT_CATEGORIES = {
  food: ["Burger", "Pizza", "Drinks", "Sides", "Desserts"],
  pharmacy: ["Medicine", "Vitamins", "Baby products", "First Aid"],
  grocery: ["Rice", "Milk", "Bread", "Meat", "Fruits", "Vegetables"],
  default: ["General"],
};

export const STORE_CATEGORY_MAP = {
  food: { business_type: "restaurant" },
  restaurant: { business_type: "restaurant" },
  pharmacy: { business_type: "pharmacy" },
  grocery: { business_type: "grocery" },
  shopping: { business_type: "shop" },
  market: { merchant_type: "market" },
  household: { merchant_type: "water_supplier" },
  business: { merchant_type: "business_supplier" },
};

export const ORDER_STATUS_LABELS = {
  new_order: "New Order",
  accepted: "Accepted",
  preparing: "Preparing",
  ready_for_pickup: "Ready for Pickup",
  courier_assigned: "Courier Assigned",
  picked_up: "Picked Up",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
