import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

/**
 * Employee HR management API (Phase 3).
 *
 * Covers exit permission, absence notification, discipline, performance, training,
 * recognition and policy acknowledgment. Every call is authenticated; the backend is the
 * authoritative RBAC boundary. Nothing here approves, disciplines, scores or pays
 * automatically — every state change requires a named human action and is audited.
 */
const BASE = `${API_URL}/employees/hr`;

/* ── Exit permission ─────────────────────────────────────────────────────── */
export const fetchExitPermissions = (params = {}) =>
  authenticatedApi.get(`${BASE}/exit-permissions/`, { params });

export const requestExitPermission = (body) =>
  authenticatedApi.post(`${BASE}/exit-permissions/`, body);

export const exitPermissionAction = (id, action, body = {}) =>
  authenticatedApi.post(`${BASE}/exit-permissions/${id}/${action}/`, body);

export const documentUnauthorizedDeparture = (body) =>
  authenticatedApi.post(`${BASE}/exit-permissions/document-unauthorized/`, body);

/* ── Emergency absence ───────────────────────────────────────────────────── */
export const fetchAbsences = (params = {}) => authenticatedApi.get(`${BASE}/absences/`, { params });

export const reportAbsence = (body) => authenticatedApi.post(`${BASE}/absences/`, body);

export const absenceAction = (id, action, body = {}) =>
  authenticatedApi.post(`${BASE}/absences/${id}/${action}/`, body);

/* ── Discipline ──────────────────────────────────────────────────────────── */
export const fetchDisciplineCases = (params = {}) =>
  authenticatedApi.get(`${BASE}/discipline/`, { params });

export const openDisciplineCase = (body) => authenticatedApi.post(`${BASE}/discipline/`, body);

export const disciplineAction = (id, action, body = {}) =>
  authenticatedApi.post(`${BASE}/discipline/${id}/${action}/`, body);

/* ── Performance ─────────────────────────────────────────────────────────── */
export const fetchPerformanceTasks = (params = {}) =>
  authenticatedApi.get(`${BASE}/performance/tasks/`, { params });

export const assignPerformanceTask = (body) =>
  authenticatedApi.post(`${BASE}/performance/tasks/`, body);

export const performanceTaskAction = (id, action, body = {}) =>
  authenticatedApi.post(`${BASE}/performance/tasks/${id}/${action}/`, body);

export const fetchPerformanceReviews = (params = {}) =>
  authenticatedApi.get(`${BASE}/performance/reviews/`, { params });

export const writePerformanceReview = (body) =>
  authenticatedApi.post(`${BASE}/performance/reviews/`, body);

/* ── Training ────────────────────────────────────────────────────────────── */
export const fetchTraining = (params = {}) => authenticatedApi.get(`${BASE}/training/`, { params });

export const assignTraining = (body) => authenticatedApi.post(`${BASE}/training/`, body);

export const completeTraining = (id, body = {}) =>
  authenticatedApi.post(`${BASE}/training/${id}/complete/`, body);

/* ── Recognition (strictly non-monetary) ─────────────────────────────────── */
export const fetchRecognition = (params = {}) =>
  authenticatedApi.get(`${BASE}/recognition/`, { params });

export const awardRecognition = (body) => authenticatedApi.post(`${BASE}/recognition/`, body);

/* ── Policy acknowledgment ───────────────────────────────────────────────── */
export const fetchPolicyAcknowledgments = (params = {}) =>
  authenticatedApi.get(`${BASE}/policy-acknowledgments/`, { params });

export const acknowledgePolicy = (body) =>
  authenticatedApi.post(`${BASE}/policy-acknowledgments/`, body);

/* ── Option sets (mirror the backend choices) ────────────────────────────── */
export const ABSENCE_CATEGORIES = [
  { value: "illness", label: "Illness" },
  { value: "family_emergency", label: "Family emergency" },
  { value: "accident", label: "Accident" },
  { value: "transportation", label: "Transportation emergency" },
  { value: "approved_leave", label: "Approved personal leave" },
  { value: "other", label: "Other legitimate circumstances" },
];

export const VIOLATION_TYPES = [
  { value: "attendance_falsification", label: "Attendance falsification" },
  { value: "clocking_for_another", label: "Clocking in for another employee" },
  { value: "unauthorized_departure", label: "Unauthorized workplace departure" },
  { value: "repeated_lateness", label: "Repeated unexcused lateness" },
  { value: "hours_misrepresentation", label: "Misrepresentation of working hours" },
  { value: "refusal_of_duties", label: "Deliberate refusal to perform duties" },
  { value: "resource_misuse", label: "Misuse of company resources" },
  { value: "misconduct", label: "Serious professional misconduct" },
  { value: "other", label: "Other documented violation" },
];

export const DISCIPLINE_STAGES = [
  { value: "coaching", label: "Coaching" },
  { value: "verbal_warning", label: "Verbal warning (documented)" },
  { value: "written_warning", label: "Written warning" },
  { value: "improvement_plan", label: "Performance improvement plan" },
  { value: "further_action", label: "Further lawful disciplinary action" },
  { value: "termination", label: "Termination (when legally justified)" },
];

export const DISCIPLINE_STATUSES = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "awaiting_response", label: "Awaiting employee response" },
  { value: "action_taken", label: "Action taken" },
  { value: "closed", label: "Closed" },
  { value: "dismissed", label: "Dismissed" },
];

export const TASK_PERIODS = [
  { value: "daily", label: "Daily objective" },
  { value: "weekly", label: "Weekly objective" },
  { value: "monthly", label: "Monthly objective" },
];

export const TASK_STATUSES = [
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export const RECOGNITION_CATEGORIES = [
  { value: "performance", label: "Excellent performance" },
  { value: "teamwork", label: "Outstanding teamwork" },
  { value: "reliability", label: "Reliability" },
  { value: "innovation", label: "Innovation" },
  { value: "development", label: "Professional development" },
  { value: "customer_service", label: "Customer service" },
  { value: "contribution", label: "Exceptional contribution" },
];


