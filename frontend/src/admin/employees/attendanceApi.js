import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

/**
 * Employee attendance & time tracking API (office + remote).
 *
 * Every call is authenticated; all timestamps are produced server-side. Clock-in supports the
 * three approved methods: the employee portal (default), an authorized office tablet, and an
 * employee ID-card QR scan — a scan alone never authenticates the employee, because the
 * endpoint still requires an authorized staff session.
 */
const BASE = `${API_URL}/employees/attendance`;

export const WORK_MODES = [
  { value: "office", label: "Office-based" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

export const SCHEDULE_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "flexible", label: "Flexible shifts" },
];

export const LEAVE_TYPES = [
  { value: "annual", label: "Annual leave" },
  { value: "sick", label: "Sick leave" },
  { value: "unpaid", label: "Unpaid leave" },
  { value: "parental", label: "Parental leave" },
  { value: "other", label: "Other approved leave" },
];

export function fetchAttendanceStatus() {
  return authenticatedApi.get(`${BASE}/status/`);
}

/**
 * Probe whether the signed-in account has an employee profile.
 *
 * The self-service endpoints below (status, my-attendance) can only work for an account
 * linked to a StaffEmployee. An administrator usually is NOT an employee, so calling them
 * would always return 403 "No employee record is linked to this account." We check first so
 * the admin UI does not generate avoidable failed requests.
 */
export function fetchEmployeeLinkage() {
  return authenticatedApi.get(`${API_URL}/employees/me/linkage/`);
}

export function fetchMyAttendance(params = {}) {
  return authenticatedApi.get(`${BASE}/me/`, { params });
}

/** Portal clock-in (office or remote) — the signed-in employee's own record. */
export function clockIn({ workMode, workLocation } = {}) {
  return authenticatedApi.post(`${BASE}/clock-in/`, {
    source: "portal",
    work_mode: workMode,
    work_location: workLocation,
  });
}

/** Authorized office tablet clock-in for a named employee. */
export function clockInByTablet(employeeNumber, { workMode, workLocation } = {}) {
  return authenticatedApi.post(`${BASE}/clock-in/`, {
    source: "tablet",
    employee_number: employeeNumber,
    work_mode: workMode,
    work_location: workLocation,
  });
}

/** ID-card QR clock-in. The card value is verified server-side under a staff session. */
export function clockInByQr(cardQr) {
  return authenticatedApi.post(`${BASE}/clock-in/`, { source: "qr", card_qr: cardQr });
}

export function clockOut() {
  return authenticatedApi.post(`${BASE}/clock-out/`, {});
}

export function startBreak() {
  return authenticatedApi.post(`${BASE}/break/start/`, {});
}

export function endBreak() {
  return authenticatedApi.post(`${BASE}/break/end/`, {});
}

export function fetchDashboard(params = {}) {
  return authenticatedApi.get(`${BASE}/daily/`, { params });
}

export function fetchIssues(params = {}) {
  return authenticatedApi.get(`${BASE}/issues/`, { params });
}

export function fetchCorrections(params = {}) {
  return authenticatedApi.get(`${BASE}/corrections/`, { params });
}

export function requestCorrection(body) {
  return authenticatedApi.post(`${BASE}/corrections/`, body);
}

export function reviewCorrection(id, decision, note = "") {
  return authenticatedApi.post(`${BASE}/corrections/${id}/${decision}/`, { note });
}

export function fetchWorkSchedules(params = {}) {
  return authenticatedApi.get(`${BASE}/work-schedules/`, { params });
}

export function saveWorkSchedule(body) {
  return authenticatedApi.post(`${BASE}/work-schedules/`, body);
}

export function fetchLeave(params = {}) {
  return authenticatedApi.get(`${BASE}/leave/`, { params });
}

export function createLeave(body) {
  return authenticatedApi.post(`${BASE}/leave/`, body);
}

export function fetchHolidays(params = {}) {
  return authenticatedApi.get(`${BASE}/holidays/`, { params });
}

export function createHoliday(body) {
  return authenticatedApi.post(`${BASE}/holidays/`, body);
}

export function fetchCeoAttendance(params = {}) {
  return authenticatedApi.get(`${BASE}/ceo-overview/`, { params });
}

/** Authorised CSV/PDF export (returns a blob). */
export function exportAttendance(params = {}) {
  return authenticatedApi.get(`${BASE}/export/`, { params, responseType: "blob" });
}
