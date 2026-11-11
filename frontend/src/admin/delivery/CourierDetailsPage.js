import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import AdminActionGuard from "../components/guards/AdminActionGuard";
import { InlineError, KPICard, StatusChip } from "../components/library";
import {
  DOCUMENT_STATE_LABELS,
  DOCUMENT_STATE_TONES,
  approveCourier,
  fetchAdminCourierDetail,
  fetchCourierAuditTrail,
  fetchCourierDeliveries,
  fetchCourierDocumentBlob,
  fetchCourierRequirements,
  fetchCourierSignatureBlob,
  reactivateCourier,
  rejectCourier,
  suspendCourier,
} from "./deliveryApi";
import {
  COURIER_DETAIL_TABS,
  citiesMismatch,
  formatMru,
  formatTimestamp,
  initialsFromName,
  naOr,
  statusTone,
} from "./courierDetailUtils";

const INITIAL_SECTION = { loading: false, error: null, data: null };
const HISTORY_PAGE_SIZE = 10;

function Field({ label, children }) {
  return (
    <div className="courier-dash-field">
      <dt>{label}</dt>
      <dd>{children ?? "N/A"}</dd>
    </div>
  );
}

function AsyncBlock({ state, isEmpty, emptyLabel, children }) {
  if (state.loading) return <p className="courier-dash-muted">Loading…</p>;
  if (state.error) return <p className="courier-dash-alert courier-dash-alert--danger">{state.error}</p>;
  if (isEmpty) return <p className="courier-dash-muted">{emptyLabel}</p>;
  return children;
}

function SectionCard({ title, children, actions = null }) {
  return (
    <section className="courier-dash-card">
      <header className="courier-dash-card__head">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="courier-dash-card__body">{children}</div>
    </section>
  );
}

/**
 * Full-width Courier Details dashboard (Admin Delivery).
 * Replaces the narrow right-side drawer as the primary courier detail surface.
 */
export default function CourierDetailsPage({
  courierId,
  pathname = "/admin/delivery/couriers",
}) {
  const [courier, setCourier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [history, setHistory] = useState(INITIAL_SECTION);
  const [audit, setAudit] = useState(INITIAL_SECTION);
  const [historyPage, setHistoryPage] = useState(1);
  const [requirements, setRequirements] = useState(INITIAL_SECTION);
  const [documentState, setDocumentState] = useState({ loadingId: null, error: null });
  const [signatureState, setSignatureState] = useState({ loading: false, error: null });
  const [showSignatureTech, setShowSignatureTech] = useState(false);
  const [action, setAction] = useState({ kind: null, reason: "", submitting: false, error: null });
  const [notice, setNotice] = useState(null);

  const loadCourier = useCallback(async () => {
    if (!courierId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminCourierDetail(courierId);
      setCourier(data);
    } catch (err) {
      setCourier(null);
      setError(err?.response?.data?.detail || "Could not load courier details.");
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    loadCourier();
  }, [loadCourier]);

  useEffect(() => {
    setHistoryPage(1);
    setNotice(null);
    setAction({ kind: null, reason: "", submitting: false, error: null });
    setShowSignatureTech(false);
    setTab("overview");
  }, [courierId]);

  useEffect(() => {
    if (!courierId) return undefined;
    let cancelled = false;
    setRequirements({ loading: true, error: null, data: null });
    fetchCourierRequirements(courierId)
      .then((data) => {
        if (!cancelled) setRequirements({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) {
          setRequirements({
            loading: false,
            error: err?.response?.data?.detail || "Could not load courier requirements.",
            data: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
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

  const userId = courier?.user_id;
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

  const openAction = (kind) => setAction({ kind, reason: "", submitting: false, error: null });
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
      await loadCourier();
    } catch (err) {
      setAction((prev) => ({
        ...prev,
        submitting: false,
        error:
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.message ||
          "The action could not be completed.",
      }));
    }
  }, [action, courierId, loadCourier]);

  const settings = courier?.delivery_settings || {};
  const signature = courier?.legal_signature || {};
  const documents = courier?.documents || [];
  const steps = courier?.onboarding?.steps || [];
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
  const historyRows = history.data?.results || [];
  const historySummary = history.data?.summary || null;
  const auditRows = Array.isArray(audit.data) ? audit.data : audit.data?.results || [];

  const actionLabels = useMemo(
    () => ({
      approve: "Approve courier",
      reject: "Reject application",
      suspend: "Suspend courier",
      reactivate: "Reactivate courier",
    }),
    []
  );

  const pagePath = pathname || `/admin/delivery/couriers/${courierId}`;
  const title = courier?.name ? `Courier · ${courier.name}` : "Courier Details";

  return (
    <AdminShellPage pathname={pagePath} title={title}>
      <div className="courier-dash">
        <div className="courier-dash-toolbar">
          <a className="courier-dash-back" href="/admin/delivery/couriers">
            ← Back to Courier Management
          </a>
        </div>

        {loading ? <p className="courier-dash-muted">Loading courier details…</p> : null}
        {error ? (
          <InlineError message={error}>
            <button type="button" className="admin-lib-btn" onClick={loadCourier}>
              Retry
            </button>
          </InlineError>
        ) : null}
        {notice ? (
          <p
            className={
              notice.tone === "success"
                ? "courier-dash-alert courier-dash-alert--success"
                : "courier-dash-alert courier-dash-alert--danger"
            }
          >
            {notice.message}
          </p>
        ) : null}

        {courier && !loading && !error ? (
          <>
            <header className="courier-dash-hero">
              <div className="courier-dash-hero__identity">
                <div className="courier-dash-avatar" aria-hidden="true">
                  {initialsFromName(courier.name, courier.email)}
                </div>
                <div>
                  <h1 className="courier-dash-hero__title">{naOr(courier.name || courier.email)}</h1>
                  <div className="courier-dash-hero__meta">
                    <span className="courier-dash-id">ID {naOr(courier.id)}</span>
                    <StatusChip
                      label={courier.courier_status_label || courier.courier_status}
                      tone={statusTone(courier.courier_status)}
                    />
                    <StatusChip
                      label={courier.is_active ? "Active" : "Inactive"}
                      tone={courier.is_active ? "success" : "neutral"}
                    />
                    <StatusChip
                      label={courier.courier_online ? "Online" : "Offline"}
                      tone={courier.courier_online ? "success" : "neutral"}
                    />
                    <StatusChip
                      label={naOr(accountCity)}
                      tone={cityMismatch ? "warning" : "neutral"}
                    />
                  </div>
                  <p className="courier-dash-hero__sub">
                    {naOr(courier.email)} · {naOr(courier.phone_number)}
                    {courier.phone_verified ? " (verified)" : " (unverified)"}
                  </p>
                </div>
              </div>

              <AdminActionGuard module="delivery" mode="disable">
                <div className="courier-dash-hero__actions">
                  <button
                    type="button"
                    className="admin-lib-btn"
                    disabled={!canApprove}
                    title={
                      canApprove
                        ? "Approve this courier application"
                        : "Blocked until the electronic signature is complete"
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
                      Reactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-lib-btn admin-lib-btn--danger"
                      onClick={() => openAction("suspend")}
                    >
                      Suspend
                    </button>
                  )}
                  <a
                    className="admin-lib-btn admin-lib-btn--ghost"
                    href="/admin/administration/city-transfers"
                  >
                    City transfer
                  </a>
                </div>
              </AdminActionGuard>
            </header>

            {(cityMismatch || approvedWithPendingDocs) && (
              <div className="courier-dash-alerts" role="region" aria-label="Consistency warnings">
                {cityMismatch ? (
                  <p className="courier-dash-alert courier-dash-alert--warning" role="status">
                    Account city is {accountCity}, but delivery service cities are{" "}
                    {deliveryCities.join(", ") || "N/A"}. For an approved courier this is not changed
                    automatically — a CEO operating-city transfer is required before the service
                    cities can be updated.
                  </p>
                ) : null}
                {approvedWithPendingDocs ? (
                  <p className="courier-dash-alert courier-dash-alert--danger" role="status">
                    Account status is Approved while {pendingReviewDocs.length} document
                    {pendingReviewDocs.length === 1 ? " is" : "s are"} still Pending Review. Review
                    the replacement file before treating onboarding as complete. Approval is not
                    changed automatically.
                  </p>
                ) : null}
              </div>
            )}

            <div className="admin-kpi-row courier-dash-kpis">
              <KPICard label="Completed deliveries" value={courier.total_deliveries_completed} />
              <KPICard label="Active deliveries" value={historySummary?.active} />
              <KPICard
                label="Total earnings"
                value={earnings?.total?.earnings != null ? formatMru(earnings.total.earnings) : null}
              />
              <KPICard label="Rating" value={courier.delivery_rating} />
              <KPICard
                label="Documents pending review"
                value={pendingReviewDocs.length}
              />
            </div>

            <div className="courier-dash-tabs" role="tablist" aria-label="Courier detail sections">
              {COURIER_DETAIL_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`courier-dash-tab${tab === item.id ? " is-active" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="courier-dash-tabpanel" role="tabpanel">
              {tab === "overview" ? (
                <div className="courier-dash-grid">
                  <SectionCard title="Profile summary">
                    <dl className="courier-dash-fields">
                      <Field label="Application status">
                        <StatusChip
                          label={courier.status_label || courier.status}
                          tone={statusTone(courier.status)}
                        />
                      </Field>
                      <Field label="Vehicle">
                        {naOr(settings.vehicle_type || courier.vehicle_type)}
                      </Field>
                      <Field label="Account city">{naOr(accountCity)}</Field>
                      <Field label="Service cities">
                        {deliveryCities.join(", ") || "N/A"}
                      </Field>
                      <Field label="Signature">
                        {signature.signature_complete ? "Complete" : "Incomplete"}
                      </Field>
                      <Field label="Joined">{formatTimestamp(courier.date_joined)}</Field>
                    </dl>
                  </SectionCard>
                  <SectionCard title="Operational snapshot">
                    <dl className="courier-dash-fields">
                      <Field label="Delivery mode">
                        {settings.delivery_mode_enabled ? "Enabled" : "Disabled"}
                      </Field>
                      <Field label="Online now">{courier.courier_online ? "Yes" : "No"}</Field>
                      <Field label="Plate">{naOr(courier.plate_number)}</Field>
                      <Field label="Chat warnings">{naOr(settings.chat_warnings)}</Field>
                    </dl>
                  </SectionCard>
                </div>
              ) : null}

              {tab === "personal" ? (
                <SectionCard title="Personal Information">
                  <dl className="courier-dash-fields">
                    <Field label="Courier ID">{naOr(courier.id)}</Field>
                    <Field label="Email">{naOr(courier.email)}</Field>
                    <Field label="Phone">
                      {naOr(courier.phone_number)}
                      {courier.phone_verified ? " (verified)" : " (unverified)"}
                    </Field>
                    <Field label="Account">
                      <StatusChip
                        label={courier.is_active ? "Active" : "Inactive"}
                        tone={courier.is_active ? "success" : "neutral"}
                      />
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
                  </dl>
                </SectionCard>
              ) : null}

              {tab === "vehicle" ? (
                <SectionCard title="Vehicle & Delivery Settings">
                  {requirements.loading ? <p className="courier-dash-muted">Loading requirements…</p> : null}
                  {requirements.error ? <InlineError message={requirements.error} /> : null}
                  <dl className="courier-dash-fields">
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
                    {settings.is_suspended ? (
                      <Field label="Suspension reason">{naOr(settings.suspension_reason)}</Field>
                    ) : null}
                  </dl>
                </SectionCard>
              ) : null}

              {tab === "documents" ? (
                <SectionCard title="Documents & Verification">
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
                        <p key={reason} className="courier-dash-alert courier-dash-alert--danger">
                          {reason}
                        </p>
                      ))}
                      <ul className="courier-dash-req">
                        {(requirements.data.documents?.requirements || []).map((row) => (
                          <li key={row.document_type}>
                            <span>{row.label}</span>
                            <StatusChip
                              label={DOCUMENT_STATE_LABELS[row.state] || row.state}
                              tone={DOCUMENT_STATE_TONES[row.state] || "neutral"}
                            />
                            {row.expires_at ? (
                              <span className="courier-dash-muted">
                                expires {String(row.expires_at).slice(0, 10)}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {documents.length === 0 ? (
                    <p className="courier-dash-muted">No documents uploaded.</p>
                  ) : (
                    <div className="courier-dash-table-wrap">
                      <table className="courier-dash-table">
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
                    <p className="courier-dash-alert courier-dash-alert--danger">
                      {documentState.error}
                    </p>
                  ) : null}
                  <p className="courier-dash-muted">
                    Documents are streamed through the authenticated admin endpoint — never from a
                    public media URL.
                  </p>
                </SectionCard>
              ) : null}

              {tab === "cities" ? (
                <SectionCard
                  title="Operating Cities"
                  actions={
                    <a
                      className="admin-lib-btn admin-lib-btn--ghost"
                      href="/admin/administration/city-transfers"
                    >
                      Open CEO city transfer
                    </a>
                  }
                >
                  <dl className="courier-dash-fields">
                    <Field label="Account city">{naOr(accountCity)}</Field>
                    <Field label="Delivery service cities">
                      {deliveryCities.join(", ") || "N/A"}
                    </Field>
                    <Field label="Transfer requirement">
                      {cityMismatch
                        ? "CEO operating-city transfer required"
                        : "Account city and service cities are aligned"}
                    </Field>
                  </dl>
                  {cityMismatch ? (
                    <p className="courier-dash-alert courier-dash-alert--warning" role="status">
                      Account city is {accountCity}, but delivery service cities are{" "}
                      {deliveryCities.join(", ") || "N/A"}. Records are not changed automatically.
                    </p>
                  ) : null}
                </SectionCard>
              ) : null}

              {tab === "agreement" ? (
                <SectionCard title="Electronic Agreement">
                  <dl className="courier-dash-fields">
                    <Field label="Signature complete">
                      {signature.signature_complete ? "Yes" : "No"}
                    </Field>
                    <Field label="Signed name">{naOr(signature.signed_full_name)}</Field>
                    <Field label="Agreement version">
                      {naOr(signature.terms_version)}
                      {signature.terms_version_current === false ? " (outdated)" : ""}
                    </Field>
                    <Field label="Accepted at">
                      {formatTimestamp(signature.terms_accepted_at)}
                    </Field>
                    <Field label="Legal declaration">
                      {signature.legal_declaration_accepted ? "Accepted" : "Not accepted"}
                    </Field>
                  </dl>
                  {!signature.signature_complete ? (
                    <p className="courier-dash-alert courier-dash-alert--warning">
                      Approval is blocked until the courier completes the electronic signature.
                    </p>
                  ) : null}
                  <div className="courier-dash-inline-actions">
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
                    <dl className="courier-dash-fields">
                      <Field label="Signed IP">{naOr(signature.signed_ip_address)}</Field>
                      <Field label="Signed device">{naOr(signature.signed_device_info)}</Field>
                    </dl>
                  ) : null}
                  {signatureState.error ? (
                    <p className="courier-dash-alert courier-dash-alert--danger">
                      {signatureState.error}
                    </p>
                  ) : null}
                  <p className="courier-dash-muted">
                    The signature image is streamed through the authenticated admin endpoint — the
                    public media URL is never exposed.
                  </p>
                </SectionCard>
              ) : null}

              {tab === "onboarding" ? (
                <SectionCard title="Onboarding Checklist">
                  <p className="courier-dash-muted">{naOr(courier.onboarding?.message)}</p>
                  {steps.length === 0 ? (
                    <p className="courier-dash-muted">No onboarding steps reported.</p>
                  ) : (
                    <ul className="courier-dash-steps">
                      {steps.map((step) => (
                        <li key={step.id}>
                          <StatusChip
                            label={step.complete ? "Done" : naOr(step.status)}
                            tone={step.complete ? "success" : "warning"}
                          />
                          <div>
                            <strong>{naOr(step.title)}</strong>
                            <p className="courier-dash-muted">{naOr(step.description)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              ) : null}

              {tab === "deliveries" ? (
                <SectionCard title="Deliveries & Performance">
                  {historySummary ? (
                    <p className="courier-dash-muted">
                      {historySummary.total} total · {historySummary.delivered} delivered ·{" "}
                      {historySummary.active} active · {historySummary.cancelled} cancelled ·{" "}
                      {historySummary.exceptions} exceptions
                    </p>
                  ) : null}
                  <AsyncBlock
                    state={history}
                    isEmpty={historyRows.length === 0}
                    emptyLabel="No deliveries for this courier yet."
                  >
                    <div className="courier-dash-table-wrap">
                      <table className="courier-dash-table">
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
                      <div className="courier-dash-inline-actions">
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
                  </AsyncBlock>
                </SectionCard>
              ) : null}

              {tab === "earnings" ? (
                <SectionCard title="Earnings & Wallet">
                  {earnings ? (
                    <div className="courier-dash-table-wrap">
                      <table className="courier-dash-table">
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
                    <p className="courier-dash-muted">No earnings data available.</p>
                  )}
                  {wallet ? (
                    <dl className="courier-dash-fields">
                      <Field label="Available balance">{formatMru(wallet.available_balance)}</Field>
                      <Field label="Pending balance">{formatMru(wallet.pending_balance)}</Field>
                      <Field label="Wallet balance">{formatMru(wallet.wallet_balance)}</Field>
                      <Field label="Total earned">{formatMru(wallet.total_earned)}</Field>
                      <Field label="Paid deliveries">{naOr(wallet.completed_deliveries)}</Field>
                    </dl>
                  ) : null}
                  <p className="courier-dash-muted">
                    Read-only summary. Payouts and withdrawals are handled in payments modules.
                  </p>
                </SectionCard>
              ) : null}

              {tab === "audit" ? (
                <SectionCard title="Approval & Audit History">
                  <AsyncBlock
                    state={audit}
                    isEmpty={auditRows.length === 0}
                    emptyLabel="No administrative actions recorded yet."
                  >
                    <ul className="courier-dash-audit">
                      {auditRows.map((row) => (
                        <li key={row.id}>
                          <strong>{naOr(row.action)}</strong> — {naOr(row.summary)}
                          <br />
                          <span className="courier-dash-muted">
                            {formatTimestamp(row.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AsyncBlock>
                </SectionCard>
              ) : null}
            </div>
          </>
        ) : null}

        {action.kind ? (
          <div className="courier-dash-dialog" role="dialog" aria-label={actionLabels[action.kind]}>
            <h4>{actionLabels[action.kind]}</h4>
            {action.kind === "approve" ? (
              <p className="courier-dash-muted">
                The courier&apos;s electronic signature is complete. Approving activates the courier
                account.
              </p>
            ) : (
              <label className="courier-dash-dialog__field">
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
              <p className="courier-dash-alert courier-dash-alert--danger">{action.error}</p>
            ) : null}
            <div className="courier-dash-inline-actions">
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
    </AdminShellPage>
  );
}
