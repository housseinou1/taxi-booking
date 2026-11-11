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
  if (value === "approved" || value === "delivered" || value === "complete" || value === "active") {
    return "success";
  }
  if (
    value === "rejected" ||
    value === "suspended" ||
    value === "cancelled" ||
    value === "failed"
  ) {
    return "danger";
  }
  if (
    value === "pending_review" ||
    value === "pending review" ||
    value === "uploaded" ||
    value === "inactive"
  ) {
    return value === "inactive" ? "neutral" : "warning";
  }
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

function initialsFromName(name, email) {
  const source = String(name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function Field({ label, children }) {
  return (
    <div className="courier-panel-field">
      <span className="courier-panel-field__label">{label}</span>
      <span className="courier-panel-field__value">{children ?? "N/A"}</span>
    </div>
  );
}

function AsyncSection({ state, isEmpty, emptyLabel, children }) {
  if (state.loading) return <p className="courier-panel-state">Loading…</p>;
  if (state.error) return <p className="courier-panel-alert courier-panel-alert--danger">{state.error}</p>;
  if (isEmpty) return <p className="courier-panel-empty">{emptyLabel}</p>;
  return children;
}

function PanelSection({ id, title, icon, defaultOpen = true, badge = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`courier-panel-block${open ? " is-open" : ""}`} data-section={id}>
      <button
        type="button"
        className="courier-panel-block__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="courier-panel-block__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="courier-panel-block__title">{title}</span>
        {badge}
        <span className="courier-panel-block__chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>
      <div className="courier-panel-block__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

/**
 * Courier details panel for Admin Delivery → Courier Management.
 *
 * Theme-safe class names intentionally avoid BEM fragments targeted by
 * adminThemeEnforcement (`__section`, `__card`, `__panel`) so the reading
 * surface stays light and professional.
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
  const [showSignatureTech, setShowSignatureTech] = useState(false);
  const [action, setAction] = useState({ kind: null, reason: "", submitting: false, error: null });
  const [notice, setNotice] = useState(null);

  const courierId = courier?.id;
  const userId = courier?.user_id;
  const closeRef = useRef(null);
  const [requirements, setRequirements] = useState(INITIAL_SECTION);

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
    setShowSignatureTech(false);
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
      try {
        const blob = await fetchCourierDocumentBlob(courierId, documentId);
        const url = window.URL.createObjectURL(blob);
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

  const openAction = (kind) => setAction({ kind, reason: "", submitting: false, error: null });

  const openSignature = useCallback(async () => {
    if (!courierId) return;
    setSignatureState({ loading: true, error: null });
    try {
      const blob = await fetchCourierSignatureBlob(courierId);
      const url = window.URL.createObjectURL(blob);
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

  const closeAction = () => setAction({ kind: null, reason: "", submitting: false, error: null });

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
  const accountTone = courier?.is_active ? "success" : "neutral";
  const accountLabel = courier?.is_active ? "Active" : "Inactive";

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
    <div className="courier-detail-overlay" role="presentation" onClick={onClose}>
      <div
        className="courier-detail-drawer courier-panel"
        role="dialog"
        aria-modal="true"
        aria-label={courier ? `Courier ${courier.name} details` : "Courier details"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="courier-panel-head">
          <div className="courier-panel-head__identity">
            <div className="courier-panel-avatar" aria-hidden="true">
              {initialsFromName(courier?.name, courier?.email)}
            </div>
            <div>
              <h2 className="courier-panel-head__title">
                {courier ? courier.name || courier.email : "Courier details"}
              </h2>
              <div className="courier-panel-head__meta">
                {courier?.courier_status ? (
                  <StatusChip
                    label={courier.courier_status_label || courier.courier_status}
                    tone={statusTone(courier.courier_status)}
                  />
                ) : null}
                {courier ? <StatusChip label={accountLabel} tone={accountTone} /> : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            ref={closeRef}
            className="admin-lib-btn admin-lib-btn--ghost courier-panel-close"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="courier-panel-body">
          {loading ? <p className="courier-panel-state">Loading courier details…</p> : null}

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
                notice.tone === "success"
                  ? "courier-panel-alert courier-panel-alert--success"
                  : "courier-panel-alert courier-panel-alert--danger"
              }
            >
              {notice.message}
            </p>
          ) : null}

          {courier && !loading && !error ? (
            <>
              {(cityMismatch || approvedWithPendingDocs) && (
                <div className="courier-panel-alerts" role="region" aria-label="Consistency warnings">
                  {cityMismatch ? (
                    <p className="courier-panel-alert courier-panel-alert--warning" role="status">
                      Account city is {accountCity}, but delivery service cities are{" "}
                      {deliveryCities.join(", ") || "N/A"}. For an approved courier this is not
                      changed automatically — a CEO operating-city transfer is required before the
                      service cities can be updated.
                    </p>
                  ) : null}
                  {approvedWithPendingDocs ? (
                    <p className="courier-panel-alert courier-panel-alert--danger" role="status">
                      Account status is Approved while {pendingReviewDocs.length} document
                      {pendingReviewDocs.length === 1 ? " is" : "s are"} still Pending Review.
                      Review the replacement file before treating onboarding as complete. Approval
                      is not changed automatically.
                    </p>
                  ) : null}
                </div>
              )}

              <PanelSection id="profile" title="Courier Profile" icon="👤" defaultOpen>
                <Field label="Courier ID">{naOr(courier.id)}</Field>
                <Field label="Email">{naOr(courier.email)}</Field>
                <Field label="Phone">
                  {naOr(courier.phone_number)}
                  {courier.phone_verified ? " (verified)" : " (unverified)"}
                </Field>
                <Field label="Account status">
                  <StatusChip label={accountLabel} tone={accountTone} />
                </Field>
                <Field label="Application status">
                  <StatusChip
                    label={courier.status_label || courier.status}
                    tone={statusTone(courier.status)}
                  />
                </Field>
                <Field label="Joined">{formatTimestamp(courier.date_joined)}</Field>
                {courier.rejection_reason ? (
                  <Field label="Rejection reason">{courier.rejection_reason}</Field>
                ) : null}
              </PanelSection>

              <PanelSection id="location" title="Location & Operating Cities" icon="📍" defaultOpen>
                <Field label="Account city">{naOr(accountCity)}</Field>
                <Field label="Delivery service cities">
                  {deliveryCities.join(", ") || "N/A"}
                </Field>
                <Field label="City transfer">
                  {cityMismatch
                    ? "CEO operating-city transfer required"
                    : "Account city and service cities are aligned"}
                </Field>
              </PanelSection>

              <PanelSection id="vehicle" title="Vehicle Information" icon="🛵" defaultOpen>
                {requirements.loading ? (
                  <p className="courier-panel-state">Loading requirements…</p>
                ) : null}
                {requirements.error ? <InlineError message={requirements.error} /> : null}
                <Field label="Vehicle type">
                  {naOr(
                    requirements.data?.vehicle_label ||
                      requirements.data?.vehicle_type ||
                      settings.vehicle_type ||
                      courier.vehicle_type
                  )}
                </Field>
                <Field label="Plate">{naOr(courier.plate_number)}</Field>
                <Field label="Max package">{naOr(settings.max_package_size)}</Field>
              </PanelSection>

              <PanelSection id="documents" title="Documents & Verification" icon="📄" defaultOpen>
                {requirements.data ? (
                  <>
                    <Field label="Approval readiness">
                      {requirements.data.approval_blockers?.blocked ? (
                        <StatusChip label="requirements incomplete" tone="danger" />
                      ) : (
                        <StatusChip label="ready for approval" tone="success" />
                      )}
                    </Field>
                    {(requirements.data.approval_blockers?.reasons || []).map((reason) => (
                      <p key={reason} className="courier-panel-alert courier-panel-alert--danger">
                        {reason}
                      </p>
                    ))}
                    <ul className="courier-panel-req">
                      {(requirements.data.documents?.requirements || []).map((row) => (
                        <li key={row.document_type}>
                          <span className="courier-panel-req__label">{row.label}</span>
                          <StatusChip
                            label={DOCUMENT_STATE_LABELS[row.state] || row.state}
                            tone={DOCUMENT_STATE_TONES[row.state] || "neutral"}
                          />
                          {row.expires_at ? (
                            <span className="courier-panel-hint">
                              expires {String(row.expires_at).slice(0, 10)}
                            </span>
                          ) : null}
                          {row.rejection_reason ? (
                            <span className="courier-panel-hint">{row.rejection_reason}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {documents.length === 0 ? (
                  <p className="courier-panel-empty">No documents uploaded.</p>
                ) : (
                  <div className="courier-panel-table-wrap">
                    <table className="courier-panel-table">
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
                  <p className="courier-panel-alert courier-panel-alert--danger">
                    {documentState.error}
                  </p>
                ) : null}
                <p className="courier-panel-hint">
                  Documents are streamed through the authenticated admin endpoint — never from a
                  public media URL.
                </p>
              </PanelSection>

              <PanelSection id="settings" title="Delivery Settings" icon="⚙️" defaultOpen={false}>
                <Field label="Delivery mode">
                  {settings.delivery_mode_enabled ? "Enabled" : "Disabled"}
                </Field>
                <Field label="Online now">{courier.courier_online ? "Yes" : "No"}</Field>
                <Field label="Accepts">
                  {[
                    settings.accepts_food ? "Food" : null,
                    settings.accepts_pharmacy ? "Pharmacy" : null,
                    settings.accepts_fragile ? "Fragile" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "N/A"}
                </Field>
                <Field label="Service cities">{deliveryCities.join(", ") || "N/A"}</Field>
                <Field label="Completed deliveries">
                  {naOr(courier.total_deliveries_completed)}
                </Field>
                <Field label="Delivery rating">{naOr(courier.delivery_rating)}</Field>
                <Field label="Chat warnings">{naOr(settings.chat_warnings)}</Field>
                {settings.is_suspended ? (
                  <Field label="Suspension reason">{naOr(settings.suspension_reason)}</Field>
                ) : null}
              </PanelSection>

              <PanelSection id="signature" title="Electronic Agreement" icon="✍️" defaultOpen>
                <Field label="Signature complete">
                  {signature.signature_complete ? "Yes" : "No"}
                </Field>
                <Field label="Signed name">{naOr(signature.signed_full_name)}</Field>
                <Field label="Agreement version">
                  {naOr(signature.terms_version)}
                  {signature.terms_version_current === false ? " (outdated)" : ""}
                </Field>
                <Field label="Accepted at">{formatTimestamp(signature.terms_accepted_at)}</Field>
                <Field label="Legal declaration">
                  {signature.legal_declaration_accepted ? "Accepted" : "Not accepted"}
                </Field>
                {signature.requires_resign ? (
                  <p className="courier-panel-alert courier-panel-alert--warning">
                    This courier must re-sign the current courier agreement before approval.
                  </p>
                ) : null}
                {!signature.signature_complete ? (
                  <p className="courier-panel-alert courier-panel-alert--warning">
                    Approval is blocked until the courier completes the electronic signature.
                  </p>
                ) : null}
                <div className="courier-panel-actions">
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    disabled={!signature.signature_image_available || signatureState.loading}
                    onClick={openSignature}
                  >
                    {signatureState.loading ? "Opening…" : "View signature image"}
                  </button>
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => setShowSignatureTech((value) => !value)}
                  >
                    {showSignatureTech ? "Hide technical details" : "Show technical details"}
                  </button>
                </div>
                {showSignatureTech ? (
                  <>
                    <Field label="Signed IP">{naOr(signature.signed_ip_address)}</Field>
                    <Field label="Signed device">{naOr(signature.signed_device_info)}</Field>
                  </>
                ) : null}
                {signatureState.error ? (
                  <p className="courier-panel-alert courier-panel-alert--danger">
                    {signatureState.error}
                  </p>
                ) : null}
                <p className="courier-panel-hint">
                  The signature image is streamed through the authenticated admin endpoint — the
                  public media URL is never exposed to the admin UI.
                </p>
              </PanelSection>

              <PanelSection id="onboarding" title="Onboarding Checklist" icon="✅" defaultOpen={false}>
                <p className="courier-panel-hint">{naOr(courier.onboarding?.message)}</p>
                {steps.length === 0 ? (
                  <p className="courier-panel-empty">No onboarding steps reported.</p>
                ) : (
                  <ul className="courier-panel-steps">
                    {steps.map((step) => (
                      <li key={step.id}>
                        <span
                          className={
                            step.complete
                              ? "courier-panel-step courier-panel-step--done"
                              : "courier-panel-step"
                          }
                        >
                          {step.complete ? "Done" : naOr(step.status)}
                        </span>
                        <span>
                          <strong>{naOr(step.title)}</strong>
                          <br />
                          <span className="courier-panel-hint">{naOr(step.description)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </PanelSection>

              <PanelSection id="earnings" title="Earnings & Wallet" icon="💰" defaultOpen={false}>
                {earnings ? (
                  <div className="courier-panel-table-wrap">
                    <table className="courier-panel-table">
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
                  <p className="courier-panel-empty">No earnings data available.</p>
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
                <p className="courier-panel-hint">
                  Read-only summary. Payouts and withdrawals are handled in the payments /
                  withdrawals modules.
                </p>
              </PanelSection>

              <PanelSection id="history" title="Delivery History" icon="📦" defaultOpen={false}>
                {historySummary ? (
                  <p className="courier-panel-hint">
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
                  <div className="courier-panel-table-wrap">
                    <table className="courier-panel-table">
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
                              <StatusChip label={naOr(row.status)} tone={statusTone(row.status)} />
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
                    <div className="courier-panel-pager">
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
              </PanelSection>

              <PanelSection id="audit" title="Approval & Audit History" icon="🗂️" defaultOpen={false}>
                <AsyncSection
                  state={audit}
                  isEmpty={auditRows.length === 0}
                  emptyLabel="No administrative actions recorded yet."
                >
                  <ul className="courier-panel-audit">
                    {auditRows.map((row) => (
                      <li key={row.id}>
                        <strong>{naOr(row.action)}</strong> — {naOr(row.summary)}
                        <br />
                        <span className="courier-panel-hint">
                          {formatTimestamp(row.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </AsyncSection>
              </PanelSection>

              <PanelSection id="actions" title="Administrative Actions" icon="🛡️" defaultOpen>
                <div className="courier-panel-actions">
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
                <p className="courier-panel-hint">
                  Approve / reject go through the approval center (signature gate enforced on the
                  backend). Suspend / reactivate affect delivery mode only — the account, wallet and
                  payouts are untouched. Sensitive actions require confirmation.
                </p>
              </PanelSection>
            </>
          ) : null}
        </div>

        {action.kind ? (
          <div className="courier-panel-dialog" role="dialog" aria-label={actionLabels[action.kind]}>
            <h4>{actionLabels[action.kind]}</h4>
            {action.kind === "approve" ? (
              <p className="courier-panel-hint">
                The courier&apos;s electronic signature is complete. Approving activates the courier
                account.
              </p>
            ) : (
              <label className="courier-panel-dialog__field">
                Reason{" "}
                {action.kind === "suspend" || action.kind === "reject"
                  ? "(required)"
                  : "(optional)"}
                <textarea
                  rows={3}
                  value={action.reason}
                  onChange={(event) =>
                    setAction((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </label>
            )}
            {action.error ? (
              <p className="courier-panel-alert courier-panel-alert--danger">{action.error}</p>
            ) : null}
            <div className="courier-panel-dialog__actions">
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
