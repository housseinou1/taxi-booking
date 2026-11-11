import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InlineError, StatusChip } from "../components/library";
import {
  DOCUMENT_STATE_LABELS,
  DOCUMENT_STATE_TONES,
  approveCourier,
  fetchCourierAuditTrail,
  fetchCourierDeliveries,
  fetchCourierDocumentBlob,
  fetchCourierRequirements,
  fetchCourierSignatureBlob,
  reactivateCourier,
  rejectCourier,
  suspendCourier,
} from "./deliveryApi";

const INITIAL_SECTION = { loading: false, error: null, data: null };
const HISTORY_PAGE_SIZE = 10;

function naOr(value) {
  if (value === null || value === undefined) return "N/A";
  const text = String(value).trim();
  return text === "" ? "N/A" : text;
}

function formatTimestamp(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "N/A" : parsed.toLocaleString();
}

function formatMru(value, currency = "MRU") {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value} ${currency}`;
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved" || value === "delivered" || value === "complete") return "success";
  if (value === "rejected" || value === "suspended" || value === "cancelled") return "danger";
  if (value === "pending_review" || value === "pending review" || value === "uploaded") return "warning";
  if (["pending", "requested", "accepted", "in_transit", "picked_up"].includes(value)) {
    return "warning";
  }
  return "neutral";
}

function normalizeCityLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function citiesMismatch(accountCity, deliveryCities) {
  const account = normalizeCityLabel(accountCity);
  const cities = (Array.isArray(deliveryCities) ? deliveryCities : [])
    .map(normalizeCityLabel)
    .filter(Boolean);
  if (!account || !cities.length) return false;
  return !cities.includes(account);
}

function Field({ label, children }) {
  return (
    <div className="admin-drawer__field">
      <span className="admin-drawer__field-label">{label}</span>
      <span className="admin-drawer__field-value">{children ?? "N/A"}</span>
    </div>
  );
}

function AsyncSection({ state, isEmpty, emptyLabel, children }) {
  if (state.loading) return <p className="admin-drawer__state">Loading…</p>;
  if (state.error) return <p className="delivery-detail__error">{state.error}</p>;
  if (isEmpty) return <p className="delivery-detail__empty">{emptyLabel}</p>;
  return children;
}

/**
 * Courier details drawer (Phase 5).
 *
 * Sections: profile, delivery settings, electronic signature, onboarding
 * checklist, documents (streamed through the authenticated admin endpoint),
 * earnings, delivery history, audit trail and administrative actions.
 *
 * Approve / reject call the existing approval-center endpoint so the courier
 * e-signature gate stays authoritative on the backend; suspend / reactivate use
 * the Phase 5 delivery endpoints (mandatory reason, audited, delivery-mode only).
 */
export default function CourierDetailsDrawer({
  courier,
  loading,
  error,
  onClose,
  onRetry,
  onActionComplete,
}) {
  const [history, setHistory] = useState(INITIAL_SECTION);
  const [audit, setAudit] = useState(INITIAL_SECTION);
  const [historyPage, setHistoryPage] = useState(1);
  const [documentState, setDocumentState] = useState({ loadingId: null, error: null });
  const [signatureState, setSignatureState] = useState({ loading: false, error: null });
  const [action, setAction] = useState({ kind: null, reason: "", submitting: false, error: null });
  const [notice, setNotice] = useState(null);

  const courierId = courier?.id;
  const userId = courier?.user_id;
  const closeRef = useRef(null);
  const [requirements, setRequirements] = useState(INITIAL_SECTION);

  // Vehicle-type document requirements + the server-computed approval verdict.
  // The verdict is authoritative: the API refuses approval while it is blocked.
  const loadRequirements = useCallback(async () => {
    if (!courierId) return;
    setRequirements({ loading: true, error: null, data: null });
    try {
      const data = await fetchCourierRequirements(courierId);
      setRequirements({ loading: false, error: null, data });
    } catch (err) {
      setRequirements({
        loading: false,
        error: err?.response?.data?.detail || "Could not load courier requirements.",
        data: null,
      });
    }
  }, [courierId]);

  useEffect(() => {
    loadRequirements();
  }, [loadRequirements]);

  useEffect(() => {
    setHistoryPage(1);
    setNotice(null);
    setAction({ kind: null, reason: "", submitting: false, error: null });
    setSignatureState({ loading: false, error: null });
    setDocumentState({ loadingId: null, error: null });
  }, [courierId]);

  useEffect(() => {
    if (!courierId) return undefined;
    let cancelled = false;

    setHistory((prev) => ({ ...prev, loading: true, error: null }));
    fetchCourierDeliveries(courierId, { page: historyPage, page_size: HISTORY_PAGE_SIZE })
      .then((data) => {
        if (!cancelled) setHistory({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setHistory({
            loading: false,
            error: err?.response?.data?.detail || "Failed to load delivery history.",
            data: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [courierId, historyPage]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    setAudit((prev) => ({ ...prev, loading: true, error: null }));
    fetchCourierAuditTrail(userId)
      .then((data) => {
        if (!cancelled) setAudit({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setAudit({
            loading: false,
            error: err?.response?.data?.detail || "Failed to load account activity.",
            data: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);


  const openDocument = useCallback(
    async (documentId) => {
      if (!courierId || !documentId) return;
      setDocumentState({ loadingId: documentId, error: null });
      let url = null;
      try {
        // Courier documents are NOT public: fetch through the authenticated
        // admin endpoint and render from a short-lived object URL.
        const blob = await fetchCourierDocumentBlob(courierId, documentId);
        url = window.URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setDocumentState({ loadingId: null, error: null });
      } catch (err) {
        setDocumentState({
          loadingId: null,
          error: err?.response?.data?.detail || err?.message || "Could not open the document.",
        });
      }
    },
    [courierId]
  );

  const openAction = (kind) =>
    setAction({ kind, reason: "", submitting: false, error: null });

  const openSignature = useCallback(async () => {
    if (!courierId) return;
    setSignatureState({ loading: true, error: null });
    let url = null;
    try {
      // The admin payload deliberately carries no public signature URL: the image
      // is streamed by the authenticated endpoint and rendered from a short-lived
      // object URL.
      const blob = await fetchCourierSignatureBlob(courierId);
      url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setSignatureState({ loading: false, error: null });
    } catch (err) {
      setSignatureState({
        loading: false,
        error:
          err?.response?.data?.detail ||
          err?.message ||
          "Could not open the signature image.",
      });
    }
  }, [courierId]);

  const closeAction = () =>
    setAction({ kind: null, reason: "", submitting: false, error: null });

  const submitAction = useCallback(async () => {
    if (!courierId || !action.kind) return;
    const { kind, reason } = action;

    if (kind === "reject" && reason.trim().length < 5) {
      setAction((prev) => ({ ...prev, error: "A rejection reason is required (5+ characters)." }));
      return;
    }
    if (kind === "suspend" && reason.trim().length < 5) {
      setAction((prev) => ({ ...prev, error: "A suspension reason is required (5+ characters)." }));
      return;
    }

    setAction((prev) => ({ ...prev, submitting: true, error: null }));
    try {
      let result;
      if (kind === "approve") result = await approveCourier(courierId);
      else if (kind === "reject") result = await rejectCourier(courierId, reason.trim());
      else if (kind === "suspend") result = await suspendCourier(courierId, reason.trim());
      else result = await reactivateCourier(courierId, reason.trim());

      setNotice({
        tone: "success",
        message:
          result?.message ||
          result?.detail ||
          `Courier ${kind === "reactivate" ? "reactivated" : `${kind}d`}.`,
      });
      setAction({ kind: null, reason: "", submitting: false, error: null });
      if (onActionComplete) onActionComplete();
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        "The action could not be completed.";
      setAction((prev) => ({ ...prev, submitting: false, error: detail }));
    }
  }, [action, courierId, onActionComplete]);

  const historyRows = history.data?.results || [];
  const historySummary = history.data?.summary || null;
  const auditRows = Array.isArray(audit.data) ? audit.data : audit.data?.results || [];
  const documents = courier?.documents || [];
  const steps = courier?.onboarding?.steps || [];
  const signature = courier?.legal_signature || {};
  const settings = courier?.delivery_settings || {};
  const earnings = courier?.earnings || null;
  const wallet = courier?.wallet || null;
  const deliveryCities = settings.delivery_cities || [];
  const accountCity = courier?.city_name || "";
  const cityMismatch = citiesMismatch(accountCity, deliveryCities);
  const pendingReviewDocs = documents.filter(
    (doc) => String(doc.status || "").toLowerCase() === "pending_review"
  );
  const approvedWithPendingDocs =
    String(courier?.status || "").toLowerCase() === "approved" && pendingReviewDocs.length > 0;
  const canApprove = Boolean(courier) && courier.status !== "approved" && courier.signature_complete;
  const canReject = Boolean(courier) && courier.status !== "rejected";

  const actionLabels = useMemo(
    () => ({
      approve: "Approve courier",
      reject: "Reject application",
      suspend: "Suspend courier",
      reactivate: "Reactivate courier",
    }),
    []
  );

  if (!courier && !loading && !error) return null;


  return (
    <div className="admin-drawer__overlay courier-detail-overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-drawer courier-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={courier ? `Courier ${courier.name} details` : "Courier details"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">
              {courier ? courier.name || courier.email : "Courier details"}
            </h2>
            {courier?.courier_status ? (
              <StatusChip
                label={courier.courier_status_label || courier.courier_status}
                tone={statusTone(courier.courier_status)}
              />
            ) : null}
          </div>
          <button
            type="button"
            ref={closeRef}
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="admin-drawer__body">
          {loading ? <p className="admin-drawer__state">Loading courier details…</p> : null}

          {error ? (
            <InlineError message={error}>
              {onRetry ? (
                <button type="button" className="admin-lib-btn" onClick={onRetry}>
                  Retry
                </button>
              ) : null}
            </InlineError>
          ) : null}

          {notice ? (
            <p
              className={
                notice.tone === "success" ? "delivery-detail__notice" : "delivery-detail__error"
              }
            >
              {notice.message}
            </p>
          ) : null}

          {courier && !loading && !error ? (
            <>
              <section className="admin-drawer__section">
                <h3>Personal Information</h3>
                <Field label="Courier ID">{naOr(courier.id)}</Field>
                <Field label="Email">{naOr(courier.email)}</Field>
                <Field label="Phone">
                  {naOr(courier.phone_number)}
                  {courier.phone_verified ? " (verified)" : " (unverified)"}
                </Field>
                <Field label="Account">{courier.is_active ? "Active" : "Inactive"}</Field>
                <Field label="Application status">
                  <StatusChip
                    label={courier.status_label || courier.status}
                    tone={statusTone(courier.status)}
                  />
                </Field>
                <Field label="Account city">{naOr(courier.city_name)}</Field>
                <Field label="Plate">{naOr(courier.plate_number)}</Field>
                <Field label="Joined">{formatTimestamp(courier.date_joined)}</Field>
                {courier.rejection_reason ? (
                  <Field label="Rejection reason">{courier.rejection_reason}</Field>
                ) : null}
                {cityMismatch ? (
                  <p className="delivery-detail__city-mismatch" role="status">
                    Account city is {accountCity}, but delivery service cities are{" "}
                    {deliveryCities.join(", ") || "N/A"}. For an approved courier this is not
                    changed automatically — a CEO operating-city transfer is required before the
                    service cities can be updated.
                  </p>
                ) : null}
                {approvedWithPendingDocs ? (
                  <p className="delivery-detail__doc-consistency" role="status">
                    Account status is Approved while {pendingReviewDocs.length} document
                    {pendingReviewDocs.length === 1 ? " is" : "s are"} still Pending Review.
                    Review the replacement file before treating onboarding as complete. Approval
                    is not changed automatically.
                  </p>
                ) : null}
              </section>

              <section className="admin-drawer__section">
                <h3>Vehicle &amp; Documents</h3>
                {requirements.loading ? (
                  <p className="admin-drawer__state">Loading requirements…</p>
                ) : null}
                {requirements.error ? <InlineError message={requirements.error} /> : null}
                {requirements.data ? (
                  <>
                    <Field label="Vehicle type">
                      {requirements.data.vehicle_label || requirements.data.vehicle_type}
                    </Field>
                    <Field label="Approval readiness">
                      {requirements.data.approval_blockers?.blocked ? (
                        <StatusChip label="requirements incomplete" tone="danger" />
                      ) : (
                        <StatusChip label="ready for approval" tone="success" />
                      )}
                    </Field>
                    {(requirements.data.approval_blockers?.reasons || []).map((reason) => (
                      <p key={reason} className="delivery-detail__error">
                        {reason}
                      </p>
                    ))}
                    <ul className="delivery-requirements">
                      {(requirements.data.documents?.requirements || []).map((row) => (
                        <li key={row.document_type}>
                          <span className="delivery-requirements__label">{row.label}</span>
                          <StatusChip
                            label={DOCUMENT_STATE_LABELS[row.state] || row.state}
                            tone={DOCUMENT_STATE_TONES[row.state] || "neutral"}
                          />
                          {row.expires_at ? (
                            <span className="delivery-requirements__meta">
                              expires {String(row.expires_at).slice(0, 10)}
                            </span>
                          ) : null}
                          {row.rejection_reason ? (
                            <span className="delivery-requirements__meta">{row.rejection_reason}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {(requirements.data.documents?.not_required || []).length ? (
                      <Field label="Not required for this vehicle">
                        {requirements.data.documents.not_required
                          .map(
                            (row) =>
                              `${row.label} (${
                                DOCUMENT_STATE_LABELS[row.state] || row.state
                              })`
                          )
                          .join(", ")}
                      </Field>
                    ) : null}
                  </>
                ) : null}
              </section>


              <section className="admin-drawer__section">
                <h3>Delivery Settings</h3>
                <Field label="Delivery mode">
                  {settings.delivery_mode_enabled ? "Enabled" : "Disabled"}
                </Field>
                <Field label="Online now">{courier.courier_online ? "Yes" : "No"}</Field>
                <Field label="Vehicle">{naOr(settings.vehicle_type || courier.vehicle_type)}</Field>
                <Field label="Max package">{naOr(settings.max_package_size)}</Field>
                <Field label="Accepts">
                  {[
                    settings.accepts_food ? "Food" : null,
                    settings.accepts_pharmacy ? "Pharmacy" : null,
                    settings.accepts_fragile ? "Fragile" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "N/A"}
                </Field>
                <Field label="Delivery service cities">
                  {deliveryCities.join(", ") || "N/A"}
                </Field>
                <Field label="Account city">{naOr(accountCity)}</Field>
                <Field label="Completed deliveries">
                  {naOr(courier.total_deliveries_completed)}
                </Field>
                <Field label="Delivery rating">{naOr(courier.delivery_rating)}</Field>
                <Field label="Chat warnings">{naOr(settings.chat_warnings)}</Field>
                {settings.is_suspended ? (
                  <Field label="Suspension reason">{naOr(settings.suspension_reason)}</Field>
                ) : null}
              </section>

              <section className="admin-drawer__section">
                <h3>Electronic Signature</h3>
                <Field label="Signature complete">{signature.signature_complete ? "Yes" : "No"}</Field>
                <Field label="Signed name">{naOr(signature.signed_full_name)}</Field>
                <Field label="Terms version">
                  {naOr(signature.terms_version)}
                  {signature.terms_version_current === false ? " (outdated)" : ""}
                </Field>
                <Field label="Accepted at">{formatTimestamp(signature.terms_accepted_at)}</Field>
                <Field label="Legal declaration">
                  {signature.legal_declaration_accepted ? "Accepted" : "Not accepted"}
                </Field>
                <Field label="Signed IP">{naOr(signature.signed_ip_address)}</Field>
                <Field label="Signed device">{naOr(signature.signed_device_info)}</Field>
                {signature.requires_resign ? (
                  <p className="delivery-detail__warning">
                    This courier must re-sign the current courier agreement before approval.
                  </p>
                ) : null}
                {!signature.signature_complete ? (
                  <p className="delivery-detail__warning">
                    Approval is blocked until the courier completes the electronic signature.
                  </p>
                ) : null}
                <div className="delivery-detail__actions">
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    disabled={!signature.signature_image_available || signatureState.loading}
                    onClick={openSignature}
                  >
                    {signatureState.loading ? "Opening…" : "View signature image"}
                  </button>
                </div>
                {signatureState.error ? (
                  <p className="delivery-detail__error">{signatureState.error}</p>
                ) : null}
                <p className="delivery-cell-hint">
                  The signature image is streamed through the authenticated admin endpoint —
                  the public media URL is never exposed to the admin UI.
                </p>
              </section>

              <section className="admin-drawer__section">
                <h3>Onboarding checklist</h3>
                <p className="delivery-cell-hint">{naOr(courier.onboarding?.message)}</p>
                {steps.length === 0 ? (
                  <p className="delivery-detail__empty">No onboarding steps reported.</p>
                ) : (
                  <ul className="delivery-detail__steps">
                    {steps.map((step) => (
                      <li key={step.id}>
                        <span
                          className={
                            step.complete
                              ? "delivery-detail__step delivery-detail__step--done"
                              : "delivery-detail__step"
                          }
                        >
                          {step.complete ? "Done" : naOr(step.status)}
                        </span>
                        <span>
                          <strong>{naOr(step.title)}</strong>
                          <br />
                          <span className="delivery-cell-hint">{naOr(step.description)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>


              <section className="admin-drawer__section">
                <h3>Documents</h3>
                {documents.length === 0 ? (
                  <p className="delivery-detail__empty">No documents uploaded.</p>
                ) : (
                  <div className="delivery-detail__table-wrap">
                    <table className="delivery-detail__table">
                      <thead>
                        <tr>
                          <th scope="col">Document</th>
                          <th scope="col">Status</th>
                          <th scope="col">Uploaded</th>
                          <th scope="col">Expires</th>
                          <th scope="col">File</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc) => (
                          <tr key={doc.id}>
                            <td>{naOr(doc.label || doc.type)}</td>
                            <td>
                              <StatusChip
                                label={
                                  DOCUMENT_STATE_LABELS[doc.status] ||
                                  naOr(doc.display_status || doc.status)
                                }
                                tone={DOCUMENT_STATE_TONES[doc.status] || statusTone(doc.status)}
                              />
                            </td>
                            <td>{formatTimestamp(doc.uploaded_at)}</td>
                            <td>{doc.expires_at ? String(doc.expires_at) : "N/A"}</td>
                            <td>
                              <button
                                type="button"
                                className="admin-lib-btn admin-lib-btn--ghost"
                                disabled={!doc.is_uploaded || documentState.loadingId === doc.id}
                                onClick={() => openDocument(doc.id)}
                              >
                                {documentState.loadingId === doc.id ? "Opening…" : "View"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {documentState.error ? (
                  <p className="delivery-detail__error">{documentState.error}</p>
                ) : null}
                <p className="delivery-cell-hint">
                  Documents are streamed through the authenticated admin endpoint — never from a
                  public media URL.
                </p>
              </section>

              <section className="admin-drawer__section">
                <h3>Earnings</h3>
                {earnings ? (
                  <div className="delivery-detail__table-wrap">
                    <table className="delivery-detail__table">
                      <thead>
                        <tr>
                          <th scope="col">Period</th>
                          <th scope="col">Deliveries</th>
                          <th scope="col">Earnings</th>
                          <th scope="col">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {["today", "week", "month", "total"].map((key) => (
                          <tr key={key}>
                            <td>{key.charAt(0).toUpperCase() + key.slice(1)}</td>
                            <td>{naOr(earnings[key]?.count)}</td>
                            <td>{formatMru(earnings[key]?.earnings)}</td>
                            <td>{formatMru(earnings[key]?.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="delivery-detail__empty">No earnings data available.</p>
                )}
                {wallet ? (
                  <>
                    <Field label="Available balance">{formatMru(wallet.available_balance)}</Field>
                    <Field label="Pending balance">{formatMru(wallet.pending_balance)}</Field>
                    <Field label="Wallet balance">{formatMru(wallet.wallet_balance)}</Field>
                    <Field label="Total earned">{formatMru(wallet.total_earned)}</Field>
                    <Field label="Paid deliveries">{naOr(wallet.completed_deliveries)}</Field>
                  </>
                ) : null}
                <p className="delivery-cell-hint">
                  Read-only summary. Payouts and withdrawals are handled in the payments /
                  withdrawals modules.
                </p>
              </section>


              <section className="admin-drawer__section">
                <h3>Delivery history</h3>
                {historySummary ? (
                  <p className="delivery-cell-hint">
                    {historySummary.total} total · {historySummary.delivered} delivered ·{" "}
                    {historySummary.active} active · {historySummary.cancelled} cancelled ·{" "}
                    {historySummary.exceptions} exceptions
                  </p>
                ) : null}
                <AsyncSection
                  state={history}
                  isEmpty={historyRows.length === 0}
                  emptyLabel="No deliveries for this courier yet."
                >
                  <div className="delivery-detail__table-wrap">
                    <table className="delivery-detail__table">
                      <thead>
                        <tr>
                          <th scope="col">ID</th>
                          <th scope="col">Status</th>
                          <th scope="col">Route</th>
                          <th scope="col">Fare</th>
                          <th scope="col">Earning</th>
                          <th scope="col">Delivered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyRows.map((row) => (
                          <tr key={row.id}>
                            <td>#{row.id}</td>
                            <td>
                              <StatusChip
                                label={naOr(row.status)}
                                tone={statusTone(row.status)}
                              />
                            </td>
                            <td>
                              {naOr(row.pickup)} → {naOr(row.destination)}
                            </td>
                            <td>{formatMru(row.fare)}</td>
                            <td>{formatMru(row.driver_earning)}</td>
                            <td>{formatTimestamp(row.delivered_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {history.data?.total_pages > 1 ? (
                    <div className="delivery-detail__pager">
                      <button
                        type="button"
                        className="admin-lib-btn admin-lib-btn--ghost"
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                      >
                        Previous
                      </button>
                      <span>
                        Page {naOr(history.data?.page)} of {naOr(history.data?.total_pages)}
                      </span>
                      <button
                        type="button"
                        className="admin-lib-btn admin-lib-btn--ghost"
                        disabled={historyPage >= (history.data?.total_pages || 1)}
                        onClick={() => setHistoryPage((page) => page + 1)}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </AsyncSection>
              </section>

              <section className="admin-drawer__section">
                <h3>Approval History</h3>
                <AsyncSection
                  state={audit}
                  isEmpty={auditRows.length === 0}
                  emptyLabel="No administrative actions recorded yet."
                >
                  <ul className="delivery-detail__audit">
                    {auditRows.map((row) => (
                      <li key={row.id}>
                        <strong>{naOr(row.action)}</strong> — {naOr(row.summary)}
                        <br />
                        <span className="delivery-cell-hint">
                          {formatTimestamp(row.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </AsyncSection>
              </section>


              <section className="admin-drawer__section">
                <h3>Administrative actions</h3>
                <div className="delivery-detail__actions">
                  <button
                    type="button"
                    className="admin-lib-btn"
                    disabled={!canApprove}
                    title={
                      canApprove
                        ? "Approve this courier application"
                        : "Blocked: the courier must complete the electronic signature first"
                    }
                    onClick={() => openAction("approve")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    disabled={!canReject}
                    onClick={() => openAction("reject")}
                  >
                    Reject
                  </button>
                  {courier.is_suspended ? (
                    <button
                      type="button"
                      className="admin-lib-btn"
                      onClick={() => openAction("reactivate")}
                    >
                      Reactivate courier
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--danger"
                      onClick={() => openAction("suspend")}
                    >
                      Suspend courier
                    </button>
                  )}
                </div>
                <p className="delivery-cell-hint">
                  Approve / reject go through the approval center (signature gate enforced on the
                  backend). Suspend / reactivate affect delivery mode only — the account, wallet and
                  payouts are untouched.
                </p>
              </section>
            </>
          ) : null}
        </div>

        {action.kind ? (
          <div className="delivery-detail__dialog" role="dialog" aria-label={actionLabels[action.kind]}>
            <h4>{actionLabels[action.kind]}</h4>
            {action.kind === "approve" ? (
              <p className="delivery-cell-hint">
                The courier&apos;s electronic signature is complete. Approving activates the courier
                account.
              </p>
            ) : (
              <label className="delivery-detail__dialog-field">
                Reason {action.kind === "suspend" || action.kind === "reject" ? "(required)" : "(optional)"}
                <textarea
                  rows={3}
                  value={action.reason}
                  onChange={(event) =>
                    setAction((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </label>
            )}
            {action.error ? <p className="delivery-detail__error">{action.error}</p> : null}
            <div className="delivery-detail__dialog-actions">
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={closeAction}
                disabled={action.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-lib-btn"
                onClick={submitAction}
                disabled={action.submitting}
              >
                {action.submitting ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

