import axios from "axios";

import { API_URL } from "../../apiConfig";
import { clearAuthSession } from "../../auth/session";

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export async function fetchActiveDeviceSessions(token) {
  const response = await axios.get(`${API_URL}/auth/devices/`, authHeaders(token));
  return Array.isArray(response.data) ? response.data : [];
}

export async function logoutAllDevices(token) {
  await axios.post(`${API_URL}/auth/logout-all-devices/`, {}, authHeaders(token));
  clearAuthSession();
}

export async function fetchRewardsDashboard(token) {
  const response = await axios.get(
    `${API_URL}/drivers/me/rewards/dashboard/`,
    authHeaders(token)
  );
  return response.data || {};
}

export const CAR_TYPE_SEATING = {
  regular: 4,
  xl: 6,
  comfort: 4,
  share: 4,
};

export function getSeatingCapacity(carType) {
  if (!carType) return null;
  return CAR_TYPE_SEATING[String(carType).toLowerCase()] || null;
}

export function formatMemberSince(dateJoined) {
  if (!dateJoined) return null;
  const date = new Date(dateJoined);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function getAccountStatusLabel({ status, isActive }) {
  if (isActive === false) return "Suspended";
  const normalized = String(status || "pending").toLowerCase();
  if (normalized === "approved") return "Active";
  if (normalized === "rejected") return "Suspended";
  return "Pending";
}

export function getAccountStatusClass({ status, isActive }) {
  const label = getAccountStatusLabel({ status, isActive });
  if (label === "Active") return "active";
  if (label === "Suspended") return "suspended";
  return "pending";
}

const VEHICLE_DOC_TYPES = ["carte_grise", "vehicle_registration", "insurance", "vignette", "plate_number_photo"];

export function getVehicleVerificationStatus(documents = []) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return { status: "missing", label: "Documents required" };
  }

  const vehicleDocs = documents.filter((doc) =>
    VEHICLE_DOC_TYPES.includes(doc.document_type)
  );
  if (vehicleDocs.length === 0) {
    return { status: "missing", label: "Documents required" };
  }

  const hasRejected = vehicleDocs.some((doc) => doc.status === "rejected");
  if (hasRejected) {
    return { status: "rejected", label: "Action required" };
  }

  const pending = vehicleDocs.some(
    (doc) => !doc.file || ["pending", "pending_review", "submitted"].includes(doc.status)
  );
  if (pending) {
    return { status: "pending", label: "Under review" };
  }

  const approved = vehicleDocs.filter(
    (doc) => doc.file && (doc.status === "approved" || doc.status === "valid")
  );
  if (approved.length >= 2) {
    return { status: "verified", label: "Verified" };
  }

  return { status: "pending", label: "Under review" };
}
