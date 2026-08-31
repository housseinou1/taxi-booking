import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { fetchCeoMasterDashboard, postCeoBroadcast, postCeoFreeze } from "../ceo/ceoMasterApi";
import { postAccountAction } from "../executive/executiveApi";
import { fetchFleetDashboard, fetchFleetDocuments } from "../fleet/fleetApi";
import { fetchIncidents, fetchLaunchChecklist } from "../launch/launchApi";
import { createCommandIncident, postCommandIncidentAction } from "../command/launchCommandApi";
import { fetchSupportList } from "../beta/supportApi";
import { createGrowthPromo } from "../customer-growth/customerGrowthApi";
import {
  fetchOperationsCenter,
  postCancelRide,
  postForceAssign,
  postIncidentAction,
  postPauseDriver,
  postReassignRide,
} from "./operationsCenterApi";

export {
  postCancelRide,
  postForceAssign,
  postIncidentAction,
  postPauseDriver,
  postReassignRide,
  postCommandIncidentAction,
  createCommandIncident,
  postCeoBroadcast,
  postCeoFreeze,
  postAccountAction,
  createGrowthPromo,
};

export async function fetchOperationsControlBundle() {
  const results = await Promise.allSettled([
    fetchOperationsCenter(),
    fetchFleetDashboard().then((r) => r.data),
    fetchFleetDocuments().then((r) => r.data),
    fetchIncidents().then((r) => r.data),
    fetchSupportList({ queue: "open" }).then((r) => r.data),
    fetchSupportList({ queue: "assigned" }).then((r) => r.data),
    fetchLaunchChecklist().then((r) => r.data),
    fetchCeoMasterDashboard(),
  ]);

  const pick = (index, fallback = null) =>
    results[index].status === "fulfilled" ? results[index].value : fallback;

  return {
    ops: pick(0, {}),
    fleetDashboard: pick(1, {}),
    fleetDocuments: pick(2, {}),
    opsIncidents: pick(3, { incidents: [] }),
    supportOpen: pick(4, { reports: [], dashboard: null }),
    supportAssigned: pick(5, { reports: [] }),
    checklist: pick(6, { sections: {}, progress: {} }),
    ceo: pick(7, {}),
    errors: results
      .map((r, i) => (r.status === "rejected" ? { index: i, message: r.reason?.message } : null))
      .filter(Boolean),
  };
}

export async function fetchRefundQueue() {
  const response = await authenticatedApi.get(`${API_URL}/payments/admin/refunds/`);
  return Array.isArray(response.data) ? response.data : response.data?.refunds || [];
}

export async function approveRefund(refundId, adminNote = "") {
  const response = await authenticatedApi.post(
    `${API_URL}/payments/admin/refunds/${refundId}/approve/`,
    { admin_note: adminNote }
  );
  return response.data;
}

export async function rejectRefund(refundId, adminNote = "") {
  const response = await authenticatedApi.post(
    `${API_URL}/payments/admin/refunds/${refundId}/reject/`,
    { admin_note: adminNote }
  );
  return response.data;
}

export async function searchSupportTickets(query) {
  const response = await fetchSupportList({});
  const reports = response.data?.reports || [];
  const q = query.trim().toLowerCase();
  if (!q) return reports.slice(0, 50);
  return reports.filter((row) => {
    const haystack = [
      row.reference,
      row.user_email,
      row.user_name,
      row.subject,
      row.description,
      row.category,
      String(row.id),
      JSON.stringify(row.metadata || {}),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
