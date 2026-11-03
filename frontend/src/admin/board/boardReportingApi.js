import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

const BASE = `${API_URL}/operations/board-reports`;

export async function fetchBoardReportingSuite(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/${suffix}`);
  return response.data;
}

export async function fetchBoardExecutiveSummary(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/executive-summary/${suffix}`);
  return response.data;
}

export async function fetchBoardBusinessKpis(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/business-kpis/${suffix}`);
  return response.data;
}

export async function fetchBoardFinancialReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/financial/${suffix}`);
  return response.data;
}

export async function fetchBoardOperationalReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/operational/${suffix}`);
  return response.data;
}

export async function fetchBoardGrowthReport(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/growth/${suffix}`);
  return response.data;
}

export async function fetchBoardRiskDashboard(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/risk/${suffix}`);
  return response.data;
}

export async function fetchBoardStrategicPlanning(params = {}) {
  const query = new URLSearchParams(params).toString();
  const suffix = query ? `?${query}` : "";
  const response = await authenticatedApi.get(`${BASE}/strategic/${suffix}`);
  return response.data;
}

export function boardReportExportUrl(reportType, exportFormat = "csv", params = {}) {
  const query = new URLSearchParams({ export_format: exportFormat, ...params }).toString();
  return `${BASE}/${reportType}/export/?${query}`;
}

export const EXPORT_CONTENT_TYPES = {
  csv: ["text/csv"],
  excel: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pdf: ["application/pdf"],
  presentation: ["application/pdf"],
};

export const EXPORT_EXTENSIONS = { csv: "csv", excel: "xlsx", pdf: "pdf", presentation: "pdf" };

/**
 * Download a board report export through the authenticated client.
 *
 * Exports must NOT be triggered with a bare <a href download>. The endpoint is protected
 * by IsBoardOrCeoStaff and the API authenticates with a Bearer token held in localStorage,
 * so a plain link sends no Authorization header at all. Django then answers 401 and, because
 * of the download attribute, the browser saves that 401 JSON body as the "report" file -
 * the download appears to succeed while containing no report. Fetching the bytes here
 * attaches the token, and lets a real failure surface as an error instead of a fake file.
 *
 * The response is requested as a blob, so an error body arrives as a blob too; it is
 * sniffed and converted back into a throwable error.
 */
export async function downloadBoardReport(reportType, exportFormat = "csv", params = {}) {
  const query = new URLSearchParams({ export_format: exportFormat, ...params }).toString();
  const response = await authenticatedApi.get(`${BASE}/${reportType}/export/?${query}`, {
    responseType: "blob",
  });

  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  const blob = response.data;

  // A JSON body means the server refused or failed: never hand that back as a report.
  if (contentType.includes("application/json") || contentType.includes("text/html")) {
    let detail = "The server did not return a report file.";
    try {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      detail = parsed?.detail || parsed?.message || detail;
    } catch {
      /* not JSON after all - keep the default message */
    }
    const error = new Error(detail);
    error.response = { status: response.status, data: { detail } };
    throw error;
  }

  return {
    blob,
    contentType,
    filename: filenameFromDisposition(response.headers?.["content-disposition"], reportType, exportFormat, params),
  };
}

function filenameFromDisposition(disposition, reportType, exportFormat, params = {}) {
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition || "");
  if (match) return decodeURIComponent(match[1].replace(/"/g, "").trim());
  const period = params.period || "weekly";
  return `yala-board-${reportType}-${period}.${EXPORT_EXTENSIONS[exportFormat] || "csv"}`;
}

/** Trigger a browser save for an already-fetched blob. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick so the click has been consumed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
