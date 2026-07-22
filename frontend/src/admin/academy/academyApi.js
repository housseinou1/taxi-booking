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
