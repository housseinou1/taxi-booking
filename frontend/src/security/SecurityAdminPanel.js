import React, { useCallback, useEffect, useState } from "react";

import {
  courierAdminAction,
  courierDocumentReview,
  getAuditLogs,
  getFraudFlags,
  getPendingCouriers,
  getPendingMerchants,
  merchantAdminAction,
  merchantDocumentReview,
  reviewFraudFlag,
} from "./securityApi";
import { fetchComplianceLogs, fetchSignedAgreements } from "../legal/legalApi";

const MERCHANT_DOC_LABELS = {
  business_license: "Business License",
  owner_id: "Owner ID",
  logo: "Store Logo",
  store_photo: "Store Photo",
};

const COURIER_QUEUES = [
  { key: "review", label: "Pending review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Suspended" },
  { key: "expired", label: "Expired docs" },
];

const STATUS_LABELS = {
  pending: "Pending",
  pending_review: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  expired: "Expired",
  uploaded: "Uploaded",
  missing: "Not uploaded",
};

function statusClassName(status) {
  if (status === "approved") return "is-approved";
  if (status === "rejected" || status === "expired") return "is-danger";
  if (status === "suspended") return "is-warning";
  if (status === "pending_review" || status === "uploaded") return "is-review";
  return "";
}

function CourierRejectForm({ onSubmit, onCancel, label = "Rejection reason" }) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="delivery-admin__reject-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(reason);
      }}
    >
      <label>
        {label}
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Explain what needs to be fixed (min 5 characters)"
          required
          minLength={5}
        />
      </label>
      <div className="delivery-admin__actions">
        <button type="submit">Confirm</button>
        <button type="button" className="is-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function LegalRiderTermsBlock({ rider, label = "Ride terms acceptance" }) {
  if (!rider) return null;
  const signedAtRaw = rider.last_acceptance_at || rider.ride_terms_accepted_at;
  const signedAt = signedAtRaw ? new Date(signedAtRaw).toLocaleString() : "—";
  const privacyAt = rider.privacy_accepted_at
    ? new Date(rider.privacy_accepted_at).toLocaleString()
    : "—";

  return (
    <div className="delivery-admin__doc-section">
      <strong>{label}</strong>
      {!rider.ride_terms_accepted || !rider.privacy_accepted ? (
        <p className="delivery-admin__danger-text">Terms or privacy not accepted.</p>
      ) : null}
      {rider.requires_resign || (rider.terms_version && !rider.compliance_current) ? (
        <p className="delivery-admin__danger-text">
          Terms version mismatch ({rider.terms_version || "none"} vs {rider.current_terms_version}). Re-accept required.
        </p>
      ) : null}
      <p>Ride terms: {rider.ride_terms_accepted ? "Accepted" : "Not accepted"}</p>
      <p>Privacy policy: {rider.privacy_accepted ? "Accepted" : "Not accepted"}</p>
      <p>Terms version: {rider.terms_version || "—"}</p>
      <p>Privacy version: {rider.privacy_version || "—"}</p>
      <p>Privacy accepted at: {privacyAt}</p>
      <p>Signed at: {signedAt}</p>
      <p>IP: {rider.last_acceptance_ip || "—"}</p>
      <p>Device: {rider.last_acceptance_device || "—"}</p>
      {rider.signed_app_version ? <p>App: {rider.signed_app_version}</p> : null}
    </div>
  );
}

function LegalSignatureBlock({ signature, label = "Electronic signature" }) {
  if (!signature) return null;
  const signedAt = signature.terms_accepted_at
    ? new Date(signature.terms_accepted_at).toLocaleString()
    : "—";

  return (
    <div className="delivery-admin__doc-section">
      <strong>{label}</strong>
      {!signature.signature_complete ? (
        <p className="delivery-admin__danger-text">Signature incomplete — cannot approve until signed.</p>
      ) : null}
      {signature.requires_resign || (signature.terms_version && !signature.terms_version_current) ? (
        <p className="delivery-admin__danger-text">
          Terms version mismatch ({signature.terms_version || "none"} vs {signature.current_terms_version}). Re-sign required.
        </p>
      ) : null}
      {signature.signature_image_url ? (
        <img
          src={signature.signature_image_url}
          alt="Signature"
          className="delivery-admin__doc-thumb"
          style={{ maxHeight: 80, objectFit: "contain", background: "#fff" }}
        />
      ) : (
        <p className="delivery-admin__muted">No signature on file.</p>
      )}
      <p>Signed name: {signature.signed_full_name || "—"}</p>
      <p>Signed at: {signedAt}</p>
      <p>Terms version: {signature.terms_version || "—"}</p>
      <p>IP: {signature.signed_ip_address || "—"}</p>
      <p>Device: {signature.signed_device_info || "—"}</p>
      {signature.signed_app_version ? <p>App: {signature.signed_app_version}</p> : null}
    </div>
  );
}

function resolveInitialTab(defaultTab) {
  if (typeof window === "undefined") return defaultTab;
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "legal") return "legal";
  return defaultTab;
}

export default function SecurityAdminPanel({ defaultTab = "couriers", title = "Security & Verification" }) {
  const [tab, setTab] = useState(() => resolveInitialTab(defaultTab));
  const [courierQueue, setCourierQueue] = useState("review");
  const [couriers, setCouriers] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [flags, setFlags] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [merchantRejectTarget, setMerchantRejectTarget] = useState(null);
  const [docRejectTarget, setDocRejectTarget] = useState(null);
  const [complianceLogs, setComplianceLogs] = useState([]);
  const [agreements, setAgreements] = useState({
    riders: [],
    drivers: [],
    couriers: [],
    merchants: [],
    versions: {},
  });
  const [legalLoading, setLegalLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [c, m, f, l] = await Promise.all([
        getPendingCouriers(courierQueue).catch(() => []),
        getPendingMerchants().catch(() => []),
        getFraudFlags(true).catch(() => []),
        getAuditLogs({ limit: 50 }).catch(() => []),
      ]);
      setCouriers(c);
      setMerchants(m);
      setFlags(f);
      setLogs(l);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }, [courierQueue]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "legal") return undefined;
    let cancelled = false;
    (async () => {
      setLegalLoading(true);
      try {
        const [logs, signed] = await Promise.all([
          fetchComplianceLogs().catch(() => ({ results: [] })),
          fetchSignedAgreements().catch(() => ({
            riders: [],
            drivers: [],
            couriers: [],
            merchants: [],
            versions: {},
          })),
        ]);
        if (!cancelled) {
          setComplianceLogs(logs.results || []);
          setAgreements(signed);
        }
      } catch (err) {
        if (!cancelled) setMessage(err.message);
      } finally {
        if (!cancelled) setLegalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const handleCourier = async (driverId, action, reason = "") => {
    try {
      await courierAdminAction(driverId, action, reason);
      setMessage(`Courier ${action} successful.`);
      setRejectTarget(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleCourierDocument = async (documentId, action, reason = "") => {
    try {
      await courierDocumentReview(documentId, action, reason);
      setMessage(`Document ${action} successful.`);
      setDocRejectTarget(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleMerchantDoc = async (merchantId, document, status) => {
    try {
      await merchantDocumentReview(merchantId, document, status);
      setMessage(`${MERCHANT_DOC_LABELS[document]} marked ${status}.`);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleMerchant = async (merchantId, action, reason = "") => {
    try {
      await merchantAdminAction(merchantId, action, reason);
      setMessage(`Merchant ${action} successful.`);
      setMerchantRejectTarget(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleFlag = async (flagId, status) => {
    try {
      await reviewFraudFlag(flagId, status);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (loading) return <p>Loading security dashboard...</p>;

  return (
    <div className="delivery-admin__panel">
      <h2>{title}</h2>
      {message ? <p className="delivery-admin__message">{message}</p> : null}

      <div className="delivery-admin__tabs">
        {["couriers", "merchants", "fraud", "audit", "legal"].map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "is-active" : ""}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === "couriers" ? (
        <>
          <div className="delivery-admin__tabs delivery-admin__tabs--sub">
            {COURIER_QUEUES.map((queue) => (
              <button
                key={queue.key}
                type="button"
                className={courierQueue === queue.key ? "is-active" : ""}
                onClick={() => setCourierQueue(queue.key)}
              >
                {queue.label}
              </button>
            ))}
          </div>

          <div className="delivery-admin__list">
            {couriers.length === 0 ? (
              <p>No couriers in this queue.</p>
            ) : null}
            {couriers.map((item) => {
              const courierStatus = item.courier_status || item.status;
              const requiredTypes = new Set(item.required_document_types || []);
              const visibleDocuments = (item.documents || []).filter(
                (doc) => requiredTypes.size === 0 || requiredTypes.has(doc.type)
              );
              const rejectOpen =
                rejectTarget?.driverId === item.driver_id ? rejectTarget.action : null;

              return (
                <article key={item.driver_id} className="delivery-admin__card">
                  <div className="delivery-admin__card-head">
                    <h4>{item.name || "Courier"}</h4>
                    <span className={`delivery-admin__status-pill ${statusClassName(courierStatus)}`}>
                      {STATUS_LABELS[courierStatus] || courierStatus}
                    </span>
                  </div>
                  <p>
                    {item.email} · {item.phone || "No phone"} · {item.vehicle_type}
                  </p>
                  <p>Phone verified: {item.phone_verified ? "Yes" : "No"}</p>
                  {item.rejection_reason ? (
                    <p className="delivery-admin__danger-text">Rejection: {item.rejection_reason}</p>
                  ) : null}
                  {item.suspension_reason ? (
                    <p className="delivery-admin__danger-text">Suspended: {item.suspension_reason}</p>
                  ) : null}
                  {item.expired_document_alerts?.length ? (
                    <div className="delivery-admin__alert-box">
                      <strong>Expired documents</strong>
                      <ul>
                        {item.expired_document_alerts.map((alert) => (
                          <li key={`${item.driver_id}-${alert.document_type}`}>
                            <span className="delivery-admin__dot delivery-admin__dot--danger" aria-hidden />
                            {alert.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <LegalSignatureBlock signature={item.legal_signature} />

                  <div className="delivery-admin__doc-section">
                    <strong>Documents</strong>
                    {visibleDocuments.length === 0 ? (
                      <p>No documents uploaded yet.</p>
                    ) : (
                      visibleDocuments.map((doc) => {
                        const displayStatus = doc.display_status || doc.status || "uploaded";
                        const docRejectOpen = docRejectTarget === doc.id;
                        return (
                          <div key={doc.id} className="delivery-admin__doc-row">
                            <div className="delivery-admin__doc-meta">
                              {doc.file_url ? (
                                <img
                                  src={doc.file_url}
                                  alt={doc.label || doc.type}
                                  className="delivery-admin__doc-thumb"
                                  onError={(e) => { e.target.style.display = "none"; }}
                                />
                              ) : null}
                              {displayStatus === "expired" ? (
                                <span className="delivery-admin__dot delivery-admin__dot--danger" aria-hidden />
                              ) : null}
                              <span>
                                {doc.label || doc.type}:{" "}
                                <span className={`delivery-admin__status-pill ${statusClassName(displayStatus)}`}>
                                  {STATUS_LABELS[displayStatus] || displayStatus}
                                </span>
                              </span>
                              {doc.expires_at ? (
                                <small className={displayStatus === "expired" ? "delivery-admin__danger-text" : ""}>
                                  Expires: {doc.expires_at}
                                </small>
                              ) : null}
                              {doc.rejection_reason ? (
                                <small className="delivery-admin__danger-text">Reason: {doc.rejection_reason}</small>
                              ) : null}
                              {doc.file_url ? (
                                <a href={doc.file_url} target="_blank" rel="noreferrer">
                                  View file
                                </a>
                              ) : null}
                            </div>
                            <div className="delivery-admin__actions">
                              <button
                                type="button"
                                onClick={() => handleCourierDocument(doc.id, "approve")}
                              >
                                Approve doc
                              </button>
                              <button
                                type="button"
                                onClick={() => setDocRejectTarget(doc.id)}
                              >
                                Reject doc
                              </button>
                            </div>
                            {docRejectOpen ? (
                              <CourierRejectForm
                                label="Document rejection reason"
                                onCancel={() => setDocRejectTarget(null)}
                                onSubmit={(reason) => handleCourierDocument(doc.id, "reject", reason)}
                              />
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <p className="delivery-admin__muted">{item.onboarding?.message}</p>

                  <div className="delivery-admin__actions">
                    <button
                      type="button"
                      disabled={!item.legal_signature?.signature_complete}
                      onClick={() => handleCourier(item.driver_id, "approve")}
                    >
                      Approve courier
                    </button>
                    <button type="button" onClick={() => setRejectTarget({ driverId: item.driver_id, action: "reject" })}>
                      Reject courier
                    </button>
                    {item.is_suspended ? (
                      <button type="button" onClick={() => handleCourier(item.driver_id, "unsuspend")}>
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRejectTarget({ driverId: item.driver_id, action: "suspend" })}
                      >
                        Suspend
                      </button>
                    )}
                  </div>

                  {rejectOpen ? (
                    <CourierRejectForm
                      label={rejectOpen === "suspend" ? "Suspension reason" : "Courier rejection reason"}
                      onCancel={() => setRejectTarget(null)}
                      onSubmit={(reason) => handleCourier(item.driver_id, rejectOpen, reason)}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {tab === "merchants" ? (
        <div className="delivery-admin__list">
          {merchants.map(({ merchant, document_review: review, legal_signature: legalSignature }) => {
            const merchantRejectOpen =
              merchantRejectTarget?.merchantId === merchant.id ? merchantRejectTarget.action : null;

            return (
            <article key={merchant.id} className="delivery-admin__card">
              <h4>{merchant.business_name}</h4>
              <p>{merchant.email} · {merchant.address}</p>
              <LegalSignatureBlock signature={legalSignature} label="Merchant electronic signature" />
              {Object.entries(MERCHANT_DOC_LABELS).map(([key, label]) => {
                const fieldMap = {
                  business_license: "business_license_status",
                  owner_id: "owner_id_status",
                  logo: "logo_status",
                  store_photo: "store_photo_status",
                };
                const docStatus = review?.[fieldMap[key]] || "pending";
                return (
                  <div key={key} className="delivery-admin__doc-row">
                    <span>{label}: {docStatus}</span>
                    <button type="button" onClick={() => handleMerchantDoc(merchant.id, key, "approved")}>✓</button>
                    <button type="button" onClick={() => handleMerchantDoc(merchant.id, key, "rejected")}>✕</button>
                  </div>
                );
              })}
              <div className="delivery-admin__actions">
                <button
                  type="button"
                  disabled={!legalSignature?.signature_complete}
                  onClick={() => handleMerchant(merchant.id, "approve")}
                >
                  Approve store
                </button>
                <button type="button" onClick={() => setMerchantRejectTarget({ merchantId: merchant.id, action: "reject" })}>
                  Reject
                </button>
                <button type="button" onClick={() => setMerchantRejectTarget({ merchantId: merchant.id, action: "suspend" })}>
                  Suspend
                </button>
              </div>

              {merchantRejectOpen ? (
                <CourierRejectForm
                  label={merchantRejectOpen === "suspend" ? "Suspension reason" : "Merchant rejection reason"}
                  onCancel={() => setMerchantRejectTarget(null)}
                  onSubmit={(reason) => handleMerchant(merchant.id, merchantRejectOpen, reason)}
                />
              ) : null}
            </article>
            );
          })}
        </div>
      ) : null}

      {tab === "fraud" ? (
        <div className="delivery-admin__list">
          {flags.map((flag) => (
            <article key={flag.id} className="delivery-admin__card">
              <h4>{flag.reason_display}</h4>
              <p>{flag.user_email} · {flag.severity} · {flag.status}</p>
              <p>{flag.description}</p>
              <div className="delivery-admin__actions">
                <button type="button" onClick={() => handleFlag(flag.id, "reviewed")}>Reviewed</button>
                <button type="button" onClick={() => handleFlag(flag.id, "dismissed")}>Dismiss</button>
                <button type="button" onClick={() => handleFlag(flag.id, "action_taken")}>Action taken</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="delivery-admin__list">
          {logs.map((log) => (
            <article key={log.id} className="delivery-admin__card">
              <strong>{log.summary}</strong>
              <p>{log.action} · {log.entity_type} #{log.entity_id}</p>
              <small>{log.actor_email} · {new Date(log.created_at).toLocaleString()}</small>
            </article>
          ))}
        </div>
      ) : null}

      {tab === "legal" ? (
        <div className="delivery-admin__list">
          {legalLoading ? <p>Loading compliance data…</p> : null}
          <section className="delivery-admin__card">
            <h4>Current legal versions</h4>
            <p className="delivery-admin__muted">
              Rider {agreements.versions?.rider_terms_version || "—"}
              {" · "}
              Driver {agreements.versions?.driver_terms_version || "—"}
              {" · "}
              Courier {agreements.versions?.courier_terms_version || "—"}
              {" · "}
              Merchant {agreements.versions?.merchant_terms_version || "—"}
            </p>
          </section>

          <section className="delivery-admin__card">
            <h4>Rider ride terms ({agreements.riders?.length || 0})</h4>
            {(agreements.riders || []).length === 0 ? (
              <p className="delivery-admin__muted">No rider acceptances on file.</p>
            ) : null}
            {(agreements.riders || []).map((item) => (
              <article key={`r-${item.user_id}`} className="delivery-admin__card">
                <strong>{item.name || item.email}</strong>
                <p className="delivery-admin__muted">{item.email}</p>
                <LegalRiderTermsBlock rider={item} />
              </article>
            ))}
          </section>

          <section className="delivery-admin__card">
            <h4>Driver signatures ({agreements.drivers?.length || 0})</h4>
            {(agreements.drivers || []).length === 0 ? (
              <p className="delivery-admin__muted">No driver signatures on file.</p>
            ) : null}
            {(agreements.drivers || []).map((item) => (
              <article key={`d-${item.driver_id}`} className="delivery-admin__card">
                <strong>{item.name || item.email}</strong>
                <p className="delivery-admin__muted">{item.email}</p>
                <LegalSignatureBlock signature={item} label="Driver electronic signature" />
              </article>
            ))}
          </section>

          <section className="delivery-admin__card">
            <h4>Courier signatures ({agreements.couriers?.length || 0})</h4>
            {(agreements.couriers || []).length === 0 ? (
              <p className="delivery-admin__muted">No courier signatures on file.</p>
            ) : null}
            {(agreements.couriers || []).map((item) => (
              <article key={`c-${item.driver_id}`} className="delivery-admin__card">
                <strong>{item.name || item.email}</strong>
                <p className="delivery-admin__muted">{item.email}</p>
                <LegalSignatureBlock signature={item} label="Courier electronic signature" />
              </article>
            ))}
          </section>

          <section className="delivery-admin__card">
            <h4>Merchant signatures ({agreements.merchants?.length || 0})</h4>
            {(agreements.merchants || []).length === 0 ? (
              <p className="delivery-admin__muted">No merchant signatures on file.</p>
            ) : null}
            {(agreements.merchants || []).map((item) => (
              <article key={`m-${item.merchant_id}`} className="delivery-admin__card">
                <strong>{item.business_name}</strong>
                <p className="delivery-admin__muted">{item.email}</p>
                <LegalSignatureBlock signature={item} label="Merchant electronic signature" />
              </article>
            ))}
          </section>

          <section>
            <h4>Compliance audit trail</h4>
            {complianceLogs.length === 0 && !legalLoading ? <p>No compliance events yet.</p> : null}
            {complianceLogs.map((log) => (
              <article key={log.id} className="delivery-admin__card">
                <strong>{log.agreement_type} · {log.action}</strong>
                <p>{log.user_email} · v{log.terms_version}</p>
                {log.signed_full_name ? <p>Signed as: {log.signed_full_name}</p> : null}
                <p>IP: {log.ip_address || "—"} · {log.device_info || "—"}</p>
                <small>{new Date(log.created_at).toLocaleString()}</small>
                {log.signature_image_url ? (
                  <img
                    src={log.signature_image_url}
                    alt="Signature"
                    className="delivery-admin__doc-thumb"
                    style={{ display: "block", marginTop: 8, maxHeight: 60 }}
                  />
                ) : null}
              </article>
            ))}
          </section>
        </div>
      ) : null}
    </div>
  );
}
