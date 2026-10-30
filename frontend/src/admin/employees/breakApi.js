import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

/**
 * Automatic break notifications + clock-out reminders (Phase 4).
 *
 * BREAKFAST  09:55 reminder · 10:00 begins · 10:25 five-minute warning · 10:30 ends
 * LUNCH      12:55 reminder · 13:00 begins · 13:55 five-minute warning · 14:00 ends
 * CLOCK-OUT  16:55 prepare · 17:00 normal clock-out · 17:05 deadline
 *
 * Notifications never create or modify an actual break record, and never clock anyone out.
 */
const BASE = `${API_URL}/employees/attendance`;

/** Pending notifications for the signed-in employee (popup + sound) plus the schedule. */
export const fetchBreakNotifications = () =>
  authenticatedApi.get(`${BASE}/break-notifications/`);

/** Acknowledge a notification so it appears exactly once. */
export const acknowledgeBreakNotification = (id) =>
  authenticatedApi.post(`${BASE}/break-notifications/${id}/ack/`, {});

/** Supervisor break status (HR Staff): who is on a break, who is overdue. */
export const fetchBreakStatus = (params = {}) =>
  authenticatedApi.get(`${BASE}/break-status/`, { params });

/** Force the automatic dispatch sweep now (HR Staff, for testing). */
export const runBreakDispatch = () => authenticatedApi.post(`${BASE}/break-notifications/run/`, {});

/** The approved working schedule shown in the UI (mirrors the backend policy). */
export const WORK_SCHEDULE = [
  { time: "08:00", label: "Work begins" },
  { time: "08:15", label: "Latest normal clock-in" },
  { time: "09:55", label: "Breakfast reminder" },
  { time: "10:00", label: "Breakfast begins" },
  { time: "10:25", label: "Breakfast five-minute warning" },
  { time: "10:30", label: "Breakfast ends" },
  { time: "12:55", label: "Lunch reminder" },
  { time: "13:00", label: "Lunch begins" },
  { time: "13:55", label: "Lunch five-minute warning" },
  { time: "14:00", label: "Lunch ends" },
  { time: "16:55", label: "Prepare to clock out" },
  { time: "17:00", label: "Normal clock-out time" },
  { time: "17:05", label: "Expected clock-out deadline" },
];

/** The three clock-out reminders, called out explicitly. */
export const CLOCK_OUT_REMINDERS = [
  { time: "16:55", label: "Prepare to clock out" },
  { time: "17:00", label: "Normal clock-out time" },
  { time: "17:05", label: "Expected clock-out deadline" },
];
