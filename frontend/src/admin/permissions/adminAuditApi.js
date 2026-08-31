import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

export async function logAdminClientEvent(event, details = {}) {
  const url = `${API_URL}/operations/admin/audit/client-event/`;
  await authenticatedApi.post(url, { event, details }, { suppressAuthRedirect: true });
}

export async function logAdminPermissionDenied({ pathname, requiredModule, requiredAction }) {
  try {
    await logAdminClientEvent("permission_denied", {
      pathname,
      required_module: requiredModule || null,
      required_action: requiredAction || null,
    });
  } catch (error) {
    // Audit must not block UX.
  }
}

export async function logAdminLogin(details = {}) {
  try {
    await logAdminClientEvent("admin_login", details);
  } catch (error) {
    // ignore
  }
}

export async function logAdminLogout(details = {}) {
  try {
    await logAdminClientEvent("admin_logout", details);
  } catch (error) {
    // ignore
  }
}

export async function logAdminSessionTimeout(details = {}) {
  try {
    await logAdminClientEvent("session_timeout", details);
  } catch (error) {
    // ignore
  }
}
