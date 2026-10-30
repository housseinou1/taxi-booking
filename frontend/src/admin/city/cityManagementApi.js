import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

/**
 * Dynamic City Management API (CEO Command Center → City Management).
 *
 * Backed by /cities/management/ — read access for executive/operations roles,
 * write access for the Founder/CEO and authorized administrators. Opening live
 * operations and activating live pricing are Founder/CEO-only on the server,
 * so the UI never assumes it may perform them.
 */
const BASE = `${API_URL}/cities`;

export const SERVICE_LABELS = {
  rider: "YALA RIDER",
  driver: "YALA DRIVER",
  delivery: "YALA DELIVERY",
};

export const SERVICE_CATALOG = {
  rider: [
    { category: "standard", label: "Standard rides" },
    { category: "shared", label: "Shared rides" },
  ],
  driver: [
    { category: "registration", label: "Driver registration" },
    { category: "availability", label: "Driver availability" },
    { category: "matching", label: "Driver matching" },
  ],
  delivery: [
    { category: "food", label: "Food delivery" },
    { category: "grocery", label: "Grocery delivery" },
    { category: "pharmacy", label: "Pharmacy delivery" },
    { category: "parcel", label: "Parcel delivery" },
    { category: "document", label: "Document delivery" },
    { category: "shopping", label: "Shopping delivery" },
  ],
};

export const STATUS_LABELS = {
  inactive: "Inactive",
  registered: "Registered — not live",
  live: "Live",
};

export function fetchCities(params = {}) {
  return authenticatedApi.get(`${BASE}/management/`, { params });
}

export function fetchCity(cityId) {
  return authenticatedApi.get(`${BASE}/management/${cityId}/`);
}

export function createCity(payload) {
  return authenticatedApi.post(`${BASE}/management/`, payload);
}

export function updateCity(cityId, payload) {
  return authenticatedApi.patch(`${BASE}/management/${cityId}/`, payload);
}

export function activateCity(cityId, payload = {}) {
  return authenticatedApi.post(`${BASE}/management/${cityId}/activate/`, payload);
}

export function deactivateCity(cityId, payload = {}) {
  return authenticatedApi.post(`${BASE}/management/${cityId}/deactivate/`, payload);
}

export function setCityLive(cityId, isLive, payload = {}) {
  return authenticatedApi.post(`${BASE}/management/${cityId}/live/`, {
    is_live: isLive,
    ...payload,
  });
}

export function fetchCityServices(cityId) {
  return authenticatedApi.get(`${BASE}/management/${cityId}/services/`);
}

export function setCityService(cityId, payload) {
  return authenticatedApi.post(`${BASE}/management/${cityId}/services/`, payload);
}

export function fetchCityPricing(cityId) {
  return authenticatedApi.get(`${BASE}/management/${cityId}/pricing/`);
}

export function updateCityPricing(cityId, payload) {
  return authenticatedApi.post(`${BASE}/management/${cityId}/pricing/`, payload);
}

export function fetchCityPerformance(cityId) {
  return authenticatedApi.get(`${BASE}/management/${cityId}/performance/`);
}

export function fetchCityPeople(cityId) {
  return authenticatedApi.get(`${BASE}/management/${cityId}/people/`);
}

export function fetchCityCoverage(cityId, latitude, longitude) {
  return authenticatedApi.get(`${BASE}/management/${cityId}/coverage/`, {
    params: { latitude, longitude },
  });
}

export function saveCityServiceArea(cityId, payload) {
  return authenticatedApi.post(`${BASE}/management/${cityId}/service-areas/`, payload);
}

export function fetchCityAudit(params = {}) {
  return authenticatedApi.get(`${BASE}/management/audit/`, { params });
}

export function fetchDuplicateCities() {
  return authenticatedApi.get(`${BASE}/management/duplicates/`);
}
