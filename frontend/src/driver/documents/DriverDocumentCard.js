import React, { useState } from "react";
import DocumentReviewTimeline from "./DocumentReviewTimeline";
import { getDocumentDashboardStatus, getDocumentDaysUntilExpiration } from "../utils/documentReview";

const STATUS_LABELS = {
  valid: "Approved",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  pending_review: "Pending Review",
  rejected: "Rejected",
  missing: "Not Uploaded",
  uploaded: "Pending Review",
  approved: "Approved",
};

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function DriverDocumentCard({
  docType,
  document: doc,
  isUploading,
  uploadProgress,
  onUpload,
}) {
  const [expanded, setExpanded] = useState(false);
  const dashboardStatus = getDocumentDashboardStatus(doc, docType);
  const daysRemaining = doc ? getDocumentDaysUntilExpiration(doc) : null;
  const statusLabel = STATUS_LABELS[dashboardStatus] || dashboardStatus;
  const lastUpdated = doc?.reviewed_at || doc?.uploaded_at;

  const uploadLabel = !doc
    ? "Upload"
    : dashboardStatus === "rejected" || dashboardStatus === "expired" || dashboardStatus === "expiring_soon"
      ? "Renew"
      : "Replace";

  return (
    <article
      className={`driver-doc-card driver-doc-card--${dashboardStatus}`}
      aria-label={`${docType.label} document`}
    >
      <header className="driver-doc-card__header">
        <div className="driver-doc-card__title-row">
          <span className="driver-doc-card__icon" aria-hidden="true">
            {docType.icon}
          </span>
          <div>
            <h3 className="driver-doc-card__name">{docType.label}</h3>
            {docType.required === false ? (
              <span className="driver-doc-card__optional">Optional</span>
            ) : null}
          </div>
        </div>
        <span className={`driver-doc-card__badge driver-doc-card__badge--${dashboardStatus}`}>
          {statusLabel}
        </span>
      </header>

      <dl className="driver-doc-card__meta">
        <div>
          <dt>Expiration</dt>
          <dd>{doc?.expires_at ? formatDate(doc.expires_at) : "No expiry date"}</dd>
        </div>
        <div>
          <dt>Days remaining</dt>
          <dd>
            {daysRemaining == null
              ? "—"
              : daysRemaining < 0
                ? "Expired"
                : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`}
          </dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{doc?.status ? STATUS_LABELS[doc.status] || doc.status : "Not uploaded"}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{lastUpdated ? formatDate(lastUpdated) : "—"}</dd>
        </div>
      </dl>

      {dashboardStatus === "expiring_soon" && daysRemaining != null ? (
        <p className="driver-doc-card__warning" role="status">
          Expires in {daysRemaining} day{daysRemaining === 1 ? "" : "s"}
        </p>
      ) : null}

      {dashboardStatus === "expired" ? (
        <p className="driver-doc-card__alert" role="alert">
          This document has expired. Renew before going online.
        </p>
      ) : null}

      {doc?.rejection_reason && dashboardStatus === "rejected" ? (
        <p className="driver-doc-card__rejection">
          <strong>Reason:</strong> {doc.rejection_reason}
        </p>
      ) : null}

      {doc ? (
        <button
          type="button"
          className="driver-doc-card__timeline-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide review status" : "View review status"}
        </button>
      ) : null}

      {expanded && doc ? (
        <DocumentReviewTimeline document={doc} docType={docType} />
      ) : null}

      {isUploading ? (
        <div className="driver-doc-card__progress" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="driver-doc-card__progress-bar" style={{ width: `${uploadProgress}%` }} />
          <span>Uploading… {uploadProgress}%</span>
        </div>
      ) : (
        <button
          type="button"
          className="driver-doc-card__upload"
          onClick={() => onUpload(docType.key)}
          disabled={isUploading}
          aria-label={`${uploadLabel} ${docType.label}`}
        >
          {uploadLabel}
        </button>
      )}
    </article>
  );
}
