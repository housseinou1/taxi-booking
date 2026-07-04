import { API_URL } from "../apiConfig";
import { apiRequest } from "./DeliveryShared";

export async function fetchCustomerDeliveryTermsStatus() {
  return apiRequest(`${API_URL}/deliveries/customer/terms/`);
}

export async function acceptCustomerDeliveryTerms() {
  return apiRequest(`${API_URL}/deliveries/customer/terms/`, {
    method: "POST",
    body: JSON.stringify({
      delivery_terms_accepted: true,
      privacy_accepted: true,
    }),
  });
}

export function readCustomerPrivacySessionFlag() {
  try {
    return sessionStorage.getItem("yala_delivery_customer_privacy_read") === "1";
  } catch {
    return false;
  }
}

export function readCustomerTermsSessionFlag() {
  try {
    return sessionStorage.getItem("yala_delivery_customer_terms_read") === "1";
  } catch {
    return false;
  }
}

export function readCourierTermsSessionFlag() {
  try {
    return sessionStorage.getItem("yala_delivery_courier_terms_read") === "1";
  } catch {
    return false;
  }
}
