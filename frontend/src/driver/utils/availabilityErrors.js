export function formatAvailabilityApiError(error) {
  const status = error?.response?.status;
  const data = error?.response?.data;

  if (!data) {
    if (error?.code === "ECONNABORTED") {
      return "Request timed out. Check your connection and try again.";
    }
    return error?.message || "Network error. Check your connection and try again.";
  }

  const messages = [];
  if (data.detail) messages.push(String(data.detail));
  if (data.error && data.error !== data.detail) messages.push(String(data.error));
  if (data.code) messages.push(`[${data.code}]`);
  if (Array.isArray(data.expired_documents) && data.expired_documents.length) {
    messages.push(`Expired documents: ${data.expired_documents.join(", ")}`);
  }
  if (data.status && data.status !== "approved") {
    messages.push(`Driver status: ${data.status}`);
  }

  if (messages.length) {
    return messages.join(" ");
  }

  return status ? `Request failed (HTTP ${status}).` : "Could not toggle availability.";
}
