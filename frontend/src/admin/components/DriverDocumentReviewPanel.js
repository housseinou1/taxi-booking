import React, { useState } from "react";

import { courierDocumentReview } from "../../security/securityApi";

const DOCUMENT_LABELS = {
  license: "Driver License",
  national_id: "National ID",
  insurance: "Insurance",
  carte_grise: "Vehicle Registration",
  vignette: "Vehicle Inspection",
  vehicle_registration: "Vehicle Registration",
  plate_number_photo: "Plate Number",
  profile_photo: "Profile Photo",
  driver_permit: "Driver Permit",
};

function documentLabel(documentType) {
  return DOCUMENT_LABELS[documentType] || String(documentType || "").replace(/_/g, " ");
}

function statusTone(status) {
  if (status === "approved") return "approved";
  if (status === "rejected" || status === "expired") return "danger";
  if (status === "pending_review" || status === "uploaded") return "pending";
  return "";
}

export default function DriverDocumentReviewPanel({
  documents = [],
  onReviewComplete,
  compact = false,
}) {
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");

  const visibleDocuments = (documents || []).filter((doc) => doc?.id);

  if (!visibleDocuments.length) {
    return compact ? null : <p style={{ margin: 0, color: "#64748b" }}>No uploaded documents yet.</p>;
  }

  const handleReview = async (documentId, action, reason = "") => {
    setError("");
    setLoadingId(documentId);
    try {
      await courierDocumentReview(documentId, action, reason);
      setRejectTarget(null);
      setRejectReason("");
      onReviewComplete?.();
    } catch (err) {
      setError(err.message || "Document review failed");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div style={{ marginTop: compact ? 8 : 16 }}>
      {!compact ? <h4 style={{ margin: "0 0 8px" }}>Document review</h4> : null}
      {error ? (
        <p style={{ color: "#dc2626", margin: "0 0 8px" }} role="alert">
          {error}
        </p>
      ) : null}
      <div style={{ display: "grid", gap: 10 }}>
        {visibleDocuments.map((doc) => {
          const status = doc.display_status || doc.status;
          const canReview = status === "pending_review" || status === "uploaded";
          const rejectOpen = rejectTarget === doc.id;

          return (
            <div
              key={doc.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: 12,
                background: "#f8fafc",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <strong>{documentLabel(doc.document_type)}</strong>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    {doc.expires_at ? `Expires ${doc.expires_at}` : "No expiry date"}
                    {doc.uploaded_at ? ` · Uploaded ${new Date(doc.uploaded_at).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background:
                      statusTone(status) === "approved"
                        ? "#dcfce7"
                        : statusTone(status) === "danger"
                          ? "#fee2e2"
                          : "#e2e8f0",
                    color:
                      statusTone(status) === "approved"
                        ? "#166534"
                        : statusTone(status) === "danger"
                          ? "#991b1b"
                          : "#334155",
                  }}
                >
                  {status || "unknown"}
                </span>
              </div>

              {doc.rejection_reason ? (
                <p style={{ margin: "8px 0 0", color: "#b91c1c", fontSize: 13 }}>
                  Rejection reason: {doc.rejection_reason}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {doc.file ? (
                  <a href={doc.file} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                    View file
                  </a>
                ) : null}
                {canReview ? (
                  <>
                    <button
                      type="button"
                      disabled={loadingId === doc.id}
                      onClick={() => handleReview(doc.id, "approve")}
                      style={{
                        background: "#16a34a",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={loadingId === doc.id}
                      onClick={() => setRejectTarget(doc.id)}
                      style={{
                        background: "#dc2626",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </div>

              {rejectOpen ? (
                <div style={{ marginTop: 10 }}>
                  <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
                    Rejection reason (min 5 characters)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={2}
                    style={{ width: "100%", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      disabled={loadingId === doc.id || rejectReason.trim().length < 5}
                      onClick={() => handleReview(doc.id, "reject", rejectReason.trim())}
                    >
                      Confirm reject
                    </button>
                    <button type="button" onClick={() => setRejectTarget(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
