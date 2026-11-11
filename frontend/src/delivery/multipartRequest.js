/**
 * Leave multipart Content-Type unset so the browser or WebView adds the boundary.
 * A manual "multipart/form-data" header has no boundary and Django rejects it.
 */
export function headersForFormData(headers = {}) {
  const next = { ...headers };
  delete next["Content-Type"];
  delete next["content-type"];
  return next;
}
