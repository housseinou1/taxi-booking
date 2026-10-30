import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/academy`;

export async function fetchLearningDashboard() {
  const response = await authenticatedApi.get(`${BASE}/learning-dashboard/`);
  return response.data;
}

export async function fetchAcademyDashboard() {
  const response = await authenticatedApi.get(`${BASE}/dashboard/`);
  return response.data;
}

export async function fetchMyEnrollments() {
  const response = await authenticatedApi.get(`${BASE}/my-enrollments/`);
  return response.data;
}

export async function fetchAvailableCourses() {
  const response = await authenticatedApi.get(`${BASE}/courses/available/`);
  return response.data;
}

export async function fetchCourseDetail(pk) {
  const response = await authenticatedApi.get(`${BASE}/courses/${pk}/`);
  return response.data;
}

export async function completeModule(moduleId) {
  const response = await authenticatedApi.post(`${BASE}/modules/${moduleId}/complete/`);
  return response.data;
}

export async function startAssessment(courseId) {
  const response = await authenticatedApi.post(`${BASE}/courses/${courseId}/start-assessment/`);
  return response.data;
}

export async function submitAssessment(attemptId, answers) {
  const response = await authenticatedApi.post(`${BASE}/assessments/${attemptId}/submit/`, { answers });
  return response.data;
}

export async function fetchMyCertificates() {
  const response = await authenticatedApi.get(`${BASE}/my-certificates/`);
  return response.data;
}

export async function fetchAdminCourses() {
  const response = await authenticatedApi.get(`${BASE}/admin/courses/`);
  return response.data;
}

export async function createCourse(payload) {
  const response = await authenticatedApi.post(`${BASE}/admin/courses/`, payload);
  return response.data;
}

/**
 * PATCH /academy/admin/courses/<id>/ - CourseDetailView is a
 * RetrieveUpdateDestroyAPIView, so update and delete are existing backend
 * capabilities that simply had no client wrapper. Used by the Admin Portal to
 * publish/unpublish and remove courses.
 */
export async function updateCourse(pk, payload) {
  const response = await authenticatedApi.patch(`${BASE}/admin/courses/${pk}/`, payload);
  return response.data;
}

export async function deleteCourse(pk) {
  const response = await authenticatedApi.delete(`${BASE}/admin/courses/${pk}/`);
  return response.data;
}

export async function createModule(payload) {
  const response = await authenticatedApi.post(`${BASE}/admin/modules/`, payload);
  return response.data;
}

export async function createQuestion(payload) {
  const response = await authenticatedApi.post(`${BASE}/admin/questions/`, payload);
  return response.data;
}

export async function fetchAdminEnrollments() {
  const response = await authenticatedApi.get(`${BASE}/admin/enrollments/`);
  return response.data;
}

export async function assignCourse(payload) {
  const response = await authenticatedApi.post(`${BASE}/admin/assign-course/`, payload);
  return response.data;
}

export async function bulkAssignCourse(payload) {
  const response = await authenticatedApi.post(`${BASE}/admin/bulk-assign/`, payload);
  return response.data;
}

export async function issueCertificate(enrollmentId) {
  const response = await authenticatedApi.post(`${BASE}/admin/issue-certificate/${enrollmentId}/`);
  return response.data;
}

export async function suspendCertificate(certId) {
  const response = await authenticatedApi.post(`${BASE}/admin/suspend-certificate/${certId}/`);
  return response.data;
}

export async function fetchAdminCertificates() {
  const response = await authenticatedApi.get(`${BASE}/admin/certificates/`);
  return response.data;
}

export async function fetchAcademyResults() {
  const response = await authenticatedApi.get(`${BASE}/admin/results/`);
  return response.data;
}

export async function fetchTrainingReport() {
  const response = await authenticatedApi.get(`${BASE}/reports/training/`);
  return response.data;
}

export async function exportTrainingReportCsv() {
  const response = await authenticatedApi.get(`${BASE}/reports/training/?export_format=csv`, {
    responseType: "blob",
  });
  return response.data;
}

export async function fetchCertificationReport() {
  const response = await authenticatedApi.get(`${BASE}/reports/certifications/`);
  return response.data;
}

export async function fetchExpiredCertificationsReport() {
  const response = await authenticatedApi.get(`${BASE}/reports/expired-certifications/`);
  return response.data;
}

export async function fetchDepartmentProgressReport() {
  const response = await authenticatedApi.get(`${BASE}/reports/department-progress/`);
  return response.data;
}

export async function safeFetch(fn, fallback = null) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * Capability probe for the Academy admin/report surfaces.
 *
 * The Academy API enforces RBAC server-side (`IsAcademyAdmin` /
 * `IsAcademyReportStaff` in `taxi/academy/permissions.py`) but the admin
 * permissions payload exposes no academy-specific action key, so there is nothing
 * to read client-side. Instead of guessing from the user's role, ask the API the
 * real question and interpret its answer:
 *
 *   200        -> granted
 *   401 / 403  -> denied   (the authoritative RBAC decision)
 *   anything else (offline, 5xx, throttle) -> unknown, so the UI keeps the surface
 *              visible and shows a retryable error rather than silently hiding it
 *
 * This can only ever REMOVE UI a user cannot use - it never grants access, and the
 * server remains the sole authority.
 */
export async function probeAcademyAccess(fn) {
  try {
    const data = await fn();
    return { access: "granted", data, status: 200 };
  } catch (error) {
    const status = error?.response?.status ?? null;
    if (status === 401 || status === 403) {
      return { access: "denied", data: null, status };
    }
    return {
      access: "unknown",
      data: null,
      status,
      message: error?.response?.data?.detail || error?.message || "Request failed",
    };
  }
}

